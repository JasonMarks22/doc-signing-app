import { findSourceDocument } from '../domain/catalog';
import { toLocalIsoDate } from '../domain/dates';
import { PRESETS } from '../domain/presets';
import {
  canEditField,
  canEditLayout,
  canView,
  partyFor,
  problemsFor,
  visibleTo,
} from '../domain/rules';
import type {
  FieldDefinition,
  FieldValue,
  Party,
  Recipient,
  SigningDocument,
  User,
} from '../domain/types';
import { isAutoFilled, isValidEmail, validateValue } from '../domain/validation';
import type { DocumentRepository } from '../data/documentRepository';
import type { ContentSnapshot, DomainEvent, EventBus } from './eventBus';

export class DomainError extends Error {}

export interface ServiceDeps {
  repo: DocumentRepository;
  bus: EventBus;
  now?: () => Date;
  newId?: () => string;
}

export type NewField = Omit<FieldDefinition, 'id'>;
export type FieldPatch = Partial<Omit<FieldDefinition, 'id'>>;

/**
 * The ONLY place that changes documents. Every method takes the acting user and checks the
 * rules itself, so the guarantees ("locked means locked", "recipients only edit their own
 * fields") hold no matter what the UI does. The UI hiding a button is a convenience; this
 * is the enforcement.
 */
export class DocumentService {
  private repo: DocumentRepository;
  private bus: EventBus;
  private now: () => Date;
  private newId: () => string;

  constructor(deps: ServiceDeps) {
    this.repo = deps.repo;
    this.bus = deps.bus;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  // ---------- reads ----------

  /** Documents this user sent or received, newest activity first. */
  listFor(user: User): SigningDocument[] {
    return visibleTo(this.repo.list(), user);
  }

  getFor(id: string, user: User): SigningDocument | undefined {
    const doc = this.repo.get(id);
    return doc && canView(doc, user) ? doc : undefined;
  }

  // ---------- sender: drafting ----------

  createDraft(actor: User, sourceDocumentId: string, title?: string): SigningDocument {
    const source = findSourceDocument(sourceDocumentId);
    if (!source) throw new DomainError(`Unknown source document: ${sourceDocumentId}`);
    const at = this.stamp();
    const doc: SigningDocument = {
      id: this.newId(),
      title: title?.trim() || source.name,
      sourceDocumentId,
      senderId: actor.id,
      recipient: null,
      status: 'draft',
      fields: [],
      values: {},
      createdAt: at,
      updatedAt: at,
      sentAt: null,
      viewedAt: null,
      completedAt: null,
    };
    this.repo.save(doc);
    this.publish(doc, actor, { type: 'document.created', title: doc.title });
    return doc;
  }

  addField(docId: string, actor: User, field: NewField): FieldDefinition {
    const doc = this.requireLayoutEditable(docId, actor);
    const created: FieldDefinition = { ...field, rect: clampRect(field.rect), id: this.newId() };
    this.save({ ...doc, fields: [...doc.fields, created] });
    return created;
  }

  updateField(docId: string, actor: User, fieldId: string, patch: FieldPatch): void {
    const doc = this.requireLayoutEditable(docId, actor);
    const existing = doc.fields.find((f) => f.id === fieldId);
    if (!existing) throw new DomainError('Field not found');
    const updated: FieldDefinition = {
      ...existing,
      ...patch,
      rect: clampRect(patch.rect ?? existing.rect),
    };
    // If the field changed hands or type, any value typed for the old version is stale.
    const values = { ...doc.values };
    if (patch.assignee !== undefined || patch.type !== undefined) delete values[fieldId];
    this.save({ ...doc, fields: doc.fields.map((f) => (f.id === fieldId ? updated : f)), values });
  }

  removeField(docId: string, actor: User, fieldId: string): void {
    const doc = this.requireLayoutEditable(docId, actor);
    const values = { ...doc.values };
    delete values[fieldId];
    this.save({ ...doc, fields: doc.fields.filter((f) => f.id !== fieldId), values });
  }

  /** Replace the whole layout with a saved preset (e.g. "Master Agreement – standard"). */
  applyPreset(docId: string, actor: User): void {
    const doc = this.requireLayoutEditable(docId, actor);
    const preset = PRESETS[doc.sourceDocumentId];
    if (!preset) throw new DomainError('No preset layout for this document');
    const fields = preset.map((f) => ({ ...f, id: this.newId() }));
    this.save({ ...doc, fields, values: {} });
  }

  // ---------- filling (either party) ----------

  setValue(docId: string, actor: User, fieldId: string, value: FieldValue): void {
    const doc = this.require(docId, actor);
    const field = doc.fields.find((f) => f.id === fieldId);
    if (!field) throw new DomainError('Field not found');
    if (!canEditField(doc, actor, field)) {
      throw new DomainError(
        doc.status === 'completed'
          ? 'Document is completed and locked'
          : 'You cannot edit this field',
      );
    }
    this.save({ ...doc, values: { ...doc.values, [fieldId]: value } });
  }

  // ---------- sender: issue ----------

  send(docId: string, actor: User, recipient: Recipient): void {
    const doc = this.require(docId, actor);
    if (partyFor(doc, actor) !== 'sender') throw new DomainError('Only the sender can send');
    if (doc.status !== 'draft') throw new DomainError('Document was already sent');

    const to: Recipient = { name: recipient.name.trim(), email: recipient.email.trim() };
    if (!to.name) throw new DomainError('Recipient name is required');
    if (!isValidEmail(to.email)) throw new DomainError('Recipient email is invalid');
    if (to.email.toLowerCase() === actor.email.toLowerCase()) {
      throw new DomainError('You cannot send a document to yourself');
    }
    if (!doc.fields.some((f) => f.assignee === 'recipient')) {
      throw new DomainError('Add at least one field for the recipient');
    }
    const problems = problemsFor(doc, 'sender');
    if (problems.length) throw new DomainError(`Fix your fields first: ${summarize(problems)}`);

    const at = this.stamp();
    const sent: SigningDocument = {
      ...doc,
      recipient: to,
      status: 'sent',
      sentAt: at,
      values: this.withAutoFills(doc, 'sender', actor.name),
    };
    this.save(sent);
    this.publish(sent, actor, { type: 'document.sent', recipient: to, snapshot: snapshot(sent) });
  }

  // ---------- recipient ----------

  /** Records the first time the recipient opens a sent document. Idempotent. */
  markViewed(docId: string, actor: User): void {
    const doc = this.repo.get(docId);
    if (!doc || partyFor(doc, actor) !== 'recipient' || doc.viewedAt) return;
    const viewed = { ...doc, viewedAt: this.stamp() };
    this.save(viewed);
    this.publish(viewed, actor, { type: 'document.viewed' });
  }

  complete(docId: string, actor: User): void {
    const doc = this.require(docId, actor);
    if (partyFor(doc, actor) !== 'recipient') throw new DomainError('Only the recipient can sign');
    if (doc.status !== 'sent') throw new DomainError('Document is not awaiting signature');
    const problems = problemsFor(doc, 'recipient');
    if (problems.length) throw new DomainError(`Fix your fields first: ${summarize(problems)}`);

    const done: SigningDocument = {
      ...doc,
      status: 'completed',
      completedAt: this.stamp(),
      values: this.withAutoFills(doc, 'recipient', actor.name),
    };
    this.save(done);
    this.publish(done, actor, { type: 'document.completed', snapshot: snapshot(done) });
  }

  // ---------- helpers ----------

  /** Fill signer-name and auto-date fields for one party at the moment they sign. */
  private withAutoFills(doc: SigningDocument, party: Party, signerName: string) {
    const values = { ...doc.values };
    const today = toLocalIsoDate(this.now());
    for (const f of doc.fields) {
      if (f.assignee !== party || !isAutoFilled(f)) continue;
      values[f.id] = f.type === 'signerName' ? signerName : today;
    }
    // Defensive: auto values must themselves be valid.
    for (const f of doc.fields) {
      if (f.assignee === party && isAutoFilled(f) && validateValue(f, values[f.id])) {
        throw new DomainError(`Could not auto-fill ${f.label}`);
      }
    }
    return values;
  }

  private require(docId: string, actor: User): SigningDocument {
    const doc = this.getFor(docId, actor);
    if (!doc) throw new DomainError('Document not found');
    return doc;
  }

  private requireLayoutEditable(docId: string, actor: User): SigningDocument {
    const doc = this.require(docId, actor);
    if (!canEditLayout(doc, actor)) throw new DomainError('Field layout is locked');
    return doc;
  }

  private save(doc: SigningDocument) {
    this.repo.save({ ...doc, updatedAt: this.stamp() });
  }

  private stamp() {
    return this.now().toISOString();
  }

  private publish(
    doc: SigningDocument,
    actor: User,
    // Distributive Omit so each event variant keeps its own extra fields.
    event: DistributiveOmit<DomainEvent, keyof EventMeta>,
  ) {
    this.bus.publish({
      ...event,
      documentId: doc.id,
      actorId: actor.id,
      actorName: actor.name,
      at: this.stamp(),
    } as DomainEvent);
  }
}

type EventMeta = { documentId: string; actorId: string; actorName: string; at: string };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function snapshot(doc: SigningDocument): ContentSnapshot {
  return { fields: doc.fields, values: doc.values };
}

function summarize(problems: { label: string; message: string }[]) {
  return problems.map((p) => `${p.label} (${p.message})`).join(', ');
}

/** Keep fields on the page and at least a few pixels big. */
function clampRect(r: FieldDefinition['rect']): FieldDefinition['rect'] {
  const width = clamp(r.width, 0.02, 1);
  const height = clamp(r.height, 0.01, 1);
  return {
    page: r.page,
    width,
    height,
    x: clamp(r.x, 0, 1 - width),
    y: clamp(r.y, 0, 1 - height),
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}
