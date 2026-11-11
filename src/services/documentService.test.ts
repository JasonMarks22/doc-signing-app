import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../data/storage';
import { USERS } from '../domain/users';
import { AUDIT_KEY, type AuditEntry } from './auditTrail';
import { createServices, type Services } from './container';
import { DomainError } from './documentService';

const [alex, dana, sam] = USERS; // alex = sender, dana = recipient, sam = outsider

let s: Services;

/** Draft with the standard layout and the sender's own fields filled. */
function readyDraft() {
  const doc = s.documents.createDraft(alex, 'master-agreement');
  s.documents.applyPreset(doc.id, alex);
  const fields = s.repo.get(doc.id)!.fields;
  const byLabel = (l: string) => fields.find((f) => f.label === l)!.id;
  s.documents.setValue(doc.id, alex, byLabel('Sender Signature'), { kind: 'typed', text: 'Alex Rivera' });
  s.documents.setValue(doc.id, alex, byLabel('Sender Title'), 'Contracts Manager');
  return { id: doc.id, byLabel };
}

function fillRecipient(id: string, byLabel: (l: string) => string) {
  const set = (l: string, v: string) => s.documents.setValue(id, dana, byLabel(l), v);
  set('Customer Legal Name', 'Acme Freight Co.');
  set('Purchasing Agent', 'Dana Whitfield');
  set('Email', 'dana@acmefreight.example');
  set('Address', '1 Main St');
  set('City', 'Fort Worth');
  set('State', 'TX');
  set('Zip', '76140');
  set('Phone', '(817) 555-0100');
  set('Customer Title', 'Purchasing Director');
  s.documents.setValue(id, dana, byLabel('Customer Signature'), { kind: 'typed', text: 'Dana W' });
}

const toDana = { name: dana.name, email: dana.email };

beforeEach(() => {
  s = createServices(new MemoryStore());
});

describe('visibility', () => {
  it('recipient cannot see a draft; outsiders never see it', () => {
    const { id } = readyDraft();
    expect(s.documents.listFor(dana)).toHaveLength(0);
    s.documents.send(id, alex, toDana);
    expect(s.documents.listFor(dana)).toHaveLength(1);
    expect(s.documents.listFor(sam)).toHaveLength(0);
    expect(() => s.documents.setValue(id, sam, 'x', 'y')).toThrow(DomainError);
  });
});

describe('sending', () => {
  it('requires the sender’s required fields', () => {
    const doc = s.documents.createDraft(alex, 'master-agreement');
    s.documents.applyPreset(doc.id, alex);
    expect(() => s.documents.send(doc.id, alex, toDana)).toThrow(/Sender Signature/);
  });

  it('auto-fills sender name/date and locks the layout', () => {
    const { id, byLabel } = readyDraft();
    s.documents.send(id, alex, toDana);
    const doc = s.repo.get(id)!;
    expect(doc.status).toBe('sent');
    expect(doc.values[byLabel('Sender Print Name')]).toBe('Alex Rivera');
    expect(doc.values[byLabel('Sender Date')]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(() => s.documents.removeField(id, alex, byLabel('Email'))).toThrow(/locked/);
    expect(() => s.documents.setValue(id, alex, byLabel('Sender Title'), 'CEO')).toThrow();
  });

  it('rejects an invalid recipient email', () => {
    const { id } = readyDraft();
    expect(() => s.documents.send(id, alex, { name: 'X', email: 'nope' })).toThrow(/email/);
  });
});

describe('recipient signing', () => {
  it('can only edit their own fields', () => {
    const { id, byLabel } = readyDraft();
    s.documents.send(id, alex, toDana);
    expect(() => s.documents.setValue(id, dana, byLabel('Sender Title'), 'hacked')).toThrow();
    expect(() => s.documents.setValue(id, dana, byLabel('Customer Print Name'), 'x')).toThrow();
  });

  it('validates before completing, then locks everything', () => {
    const { id, byLabel } = readyDraft();
    s.documents.send(id, alex, toDana);
    s.documents.setValue(id, dana, byLabel('Email'), 'not-an-email');
    expect(() => s.documents.complete(id, dana)).toThrow(/Email/);

    fillRecipient(id, byLabel);
    s.documents.complete(id, dana);
    const doc = s.repo.get(id)!;
    expect(doc.status).toBe('completed');
    expect(doc.values[byLabel('Customer Print Name')]).toBe('Dana Whitfield');
    expect(() => s.documents.setValue(id, dana, byLabel('City'), 'Austin')).toThrow(/locked/);
  });

  it('sender cannot complete on the recipient’s behalf', () => {
    const { id } = readyDraft();
    s.documents.send(id, alex, toDana);
    expect(() => s.documents.complete(id, alex)).toThrow(/recipient/);
  });
});

describe('audit trail', () => {
  it('records the lifecycle and detects tampering', async () => {
    const { id, byLabel } = readyDraft();
    s.documents.send(id, alex, toDana);
    s.documents.markViewed(id, dana);
    s.documents.markViewed(id, dana); // idempotent
    fillRecipient(id, byLabel);
    s.documents.complete(id, dana);
    await s.audit.whenIdle();

    const entries = s.audit.entriesFor(id);
    expect(entries.map((e) => e.type)).toEqual([
      'document.created',
      'document.sent',
      'document.viewed',
      'document.completed',
    ]);
    const doc = s.repo.get(id)!;
    expect(await s.audit.verify(doc)).toEqual({
      chainIntact: true,
      brokenAtSeq: null,
      missing: [],
      contentMatchesSigned: true,
    });

    // Tamper: rewrite history directly in storage, bypassing the API.
    const raw = JSON.parse(s.store.get(AUDIT_KEY)!) as AuditEntry[];
    raw[1].summary = 'Nothing to see here';
    s.store.set(AUDIT_KEY, JSON.stringify(raw));
    const fresh = createServices(s.store);
    expect((await fresh.audit.verify(doc)).brokenAtSeq).toBe(2);
  });

  it('detects entries deleted from the end of the chain', async () => {
    const { id, byLabel } = readyDraft();
    s.documents.send(id, alex, toDana);
    fillRecipient(id, byLabel);
    s.documents.complete(id, dana);
    await s.audit.whenIdle();
    const doc = s.repo.get(id)!;

    // Deleting the last entry leaves a chain whose remaining hashes all still check out.
    const raw = JSON.parse(s.store.get(AUDIT_KEY)!) as AuditEntry[];
    s.store.set(AUDIT_KEY, JSON.stringify(raw.slice(0, -1)));
    const result = await createServices(s.store).audit.verify(doc);
    expect(result.chainIntact).toBe(false);
    expect(result.missing).toEqual(['document.completed']);

    // Wiping the whole trail is caught the same way.
    s.store.set(AUDIT_KEY, '[]');
    expect((await createServices(s.store).audit.verify(doc)).missing).toEqual([
      'document.created',
      'document.sent',
      'document.completed',
    ]);
  });
});
