import type { SigningDocument } from '../domain/types';
import type { KeyValueStore } from '../data/storage';
import type { ContentSnapshot, DomainEvent, EventBus } from './eventBus';

/**
 * PART 2 FEATURE: tamper-evident audit trail.
 *
 * - It is a SUBSCRIBER on the event bus. The document service never calls it directly.
 * - It is append-only: there is no update/delete method.
 * - Each entry stores the SHA-256 hash of the previous entry for the same document, plus its
 *   own hash. Editing any past entry changes its hash and breaks every link after it, which
 *   `verify()` detects.
 * - "sent" and "completed" entries also store a fingerprint (contentHash) of the fields and
 *   values at that moment, so we can prove the signed content hasn't changed since.
 */

export interface AuditEntry {
  id: string;
  documentId: string;
  seq: number;
  type: DomainEvent['type'];
  actorId: string;
  actorName: string;
  at: string;
  summary: string;
  contentHash: string | null;
  prevHash: string;
  hash: string;
}

export interface VerifyResult {
  chainIntact: boolean;
  /** seq of the first entry whose hash doesn't check out. */
  brokenAtSeq: number | null;
  /** For completed docs: does the stored document still match what was signed? */
  contentMatchesSigned: boolean | null;
}

export const AUDIT_KEY = 'docsign:audit:v1';
const GENESIS = '0'.repeat(64);

export class AuditTrail {
  private cache: AuditEntry[] | null = null;
  private byDoc = new Map<string, AuditEntry[]>();
  private listeners = new Set<() => void>();
  /** Hashing is async, so appends are queued to keep the chain in order. */
  private queue: Promise<void> = Promise.resolve();

  private store: KeyValueStore;

  constructor(store: KeyValueStore, bus: EventBus) {
    this.store = store;
    bus.subscribe((event) => {
      this.queue = this.queue
        .then(() => this.append(event))
        .catch((err) => console.error('[AuditTrail] append failed', err));
    });
    store.onExternalChange((key) => {
      if (key === AUDIT_KEY) this.invalidate();
    });
  }

  /** Resolves once every queued event has been written (handy in tests). */
  whenIdle(): Promise<void> {
    return this.queue;
  }

  entriesFor(documentId: string): AuditEntry[] {
    let list = this.byDoc.get(documentId);
    if (!list) {
      list = this.all().filter((e) => e.documentId === documentId);
      this.byDoc.set(documentId, list);
    }
    return list;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async verify(doc: SigningDocument): Promise<VerifyResult> {
    const entries = this.entriesFor(doc.id);
    let prev = GENESIS;
    for (const entry of entries) {
      const expected = await hashEntry({ ...entry, prevHash: prev });
      if (entry.prevHash !== prev || entry.hash !== expected) {
        return { chainIntact: false, brokenAtSeq: entry.seq, contentMatchesSigned: null };
      }
      prev = entry.hash;
    }
    const signed = [...entries].reverse().find((e) => e.type === 'document.completed');
    const contentMatchesSigned = signed
      ? signed.contentHash === (await hashContent({ fields: doc.fields, values: doc.values }))
      : null;
    return { chainIntact: true, brokenAtSeq: null, contentMatchesSigned };
  }

  // ---------- internals ----------

  private async append(event: DomainEvent) {
    // Re-read storage first so we chain onto entries another tab may have written.
    this.invalidate(false);
    const existing = this.entriesFor(event.documentId);
    const last = existing[existing.length - 1];
    const contentHash = 'snapshot' in event ? await hashContent(event.snapshot) : null;
    const draft: Omit<AuditEntry, 'hash'> = {
      id: crypto.randomUUID(),
      documentId: event.documentId,
      seq: (last?.seq ?? 0) + 1,
      type: event.type,
      actorId: event.actorId,
      actorName: event.actorName,
      at: event.at,
      summary: summarize(event),
      contentHash,
      prevHash: last?.hash ?? GENESIS,
    };
    const entry: AuditEntry = { ...draft, hash: await hashEntry(draft) };
    this.store.set(AUDIT_KEY, JSON.stringify([...this.all(), entry]));
    this.invalidate();
  }

  private all(): AuditEntry[] {
    if (this.cache === null) {
      const raw = this.store.get(AUDIT_KEY);
      this.cache = raw ? (JSON.parse(raw) as AuditEntry[]) : [];
    }
    return this.cache;
  }

  private invalidate(notify = true) {
    this.cache = null;
    this.byDoc.clear();
    if (notify) this.listeners.forEach((l) => l());
  }
}

function summarize(event: DomainEvent): string {
  switch (event.type) {
    case 'document.created':
      return `${event.actorName} created "${event.title}"`;
    case 'document.sent':
      return `${event.actorName} signed and sent to ${event.recipient.name} <${event.recipient.email}>`;
    case 'document.viewed':
      return `${event.actorName} opened the document`;
    case 'document.completed':
      return `${event.actorName} signed; document completed`;
  }
}

// ---------- hashing ----------

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** JSON with sorted keys, so the same data always hashes the same way. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Hash every property except `hash` itself. */
function hashEntry(entry: Omit<AuditEntry, 'hash'>): Promise<string> {
  const rest: Partial<AuditEntry> = { ...entry };
  delete rest.hash;
  return sha256(canonicalJson(rest));
}

function hashContent(snapshot: ContentSnapshot): Promise<string> {
  return sha256(canonicalJson(snapshot));
}
