import type { FieldDefinition, Party, SigningDocument, User } from './types';
import { isAutoFilled, validateValue } from './validation';

/**
 * Pure rules about who can do what. The service enforces them; the UI only reads them to
 * decide what to render. Keeping them pure makes them trivial to unit test.
 */

/** Which side of this document the user is on, or null if they shouldn't see it at all. */
export function partyFor(doc: SigningDocument, user: User): Party | null {
  if (doc.senderId === user.id) return 'sender';
  // Recipients only see a document once it has been sent – never the sender's draft.
  if (
    doc.status !== 'draft' &&
    doc.recipient !== null &&
    doc.recipient.email.toLowerCase() === user.email.toLowerCase()
  ) {
    return 'recipient';
  }
  return null;
}

export function canView(doc: SigningDocument, user: User): boolean {
  return partyFor(doc, user) !== null;
}

/** The documents a user may see, most recently updated first. */
export function visibleTo(docs: SigningDocument[], user: User): SigningDocument[] {
  return docs
    .filter((d) => canView(d, user))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Layout (adding/moving/removing fields) is only editable by the sender while in draft. */
export function canEditLayout(doc: SigningDocument, user: User): boolean {
  return doc.status === 'draft' && partyFor(doc, user) === 'sender';
}

/**
 * The status in which each party is allowed to fill their own fields:
 * the sender fills while drafting; the recipient fills after it's sent.
 */
const FILL_STATUS: Record<Party, SigningDocument['status']> = {
  sender: 'draft',
  recipient: 'sent',
};

export function canFill(doc: SigningDocument, user: User): boolean {
  const party = partyFor(doc, user);
  return party !== null && doc.status === FILL_STATUS[party];
}

export function canEditField(doc: SigningDocument, user: User, field: FieldDefinition): boolean {
  return canFill(doc, user) && partyFor(doc, user) === field.assignee && !isAutoFilled(field);
}

export interface FieldProblem {
  fieldId: string;
  label: string;
  message: string;
}

/** Problems with one party's fields. Auto-filled fields are skipped (they're filled at signing). */
export function problemsFor(doc: SigningDocument, party: Party): FieldProblem[] {
  const problems: FieldProblem[] = [];
  for (const field of doc.fields) {
    if (field.assignee !== party || isAutoFilled(field)) continue;
    const message = validateValue(field, doc.values[field.id]);
    if (message) problems.push({ fieldId: field.id, label: field.label, message });
  }
  return problems;
}

/** What the user should do next with this document, if anything. Used for the list view. */
export function nextActionFor(doc: SigningDocument, user: User): string | null {
  const party = partyFor(doc, user);
  if (party === 'sender' && doc.status === 'draft') return 'Finish & send';
  if (party === 'recipient' && doc.status === 'sent') return 'Fill & sign';
  return null;
}
