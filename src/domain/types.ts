/**
 * The data model. Three things are deliberately kept apart:
 *
 *   1. SourceDocument  – the original pages (read-only, shared by many signing documents)
 *   2. FieldDefinition – the layout: WHERE a field is and WHAT it is (owned by the sender)
 *   3. values          – what people typed / signed, keyed by field id
 *
 * A SigningDocument ties one SourceDocument to one layout + one set of values + a status.
 */

export type UserId = string;

export interface User {
  id: UserId;
  name: string;
  email: string;
  title: string;
  company: string;
}

/** One page of an original document. Width/height are in PDF points (1/72 inch). */
export interface SourcePage {
  imageUrl: string;
  width: number;
  height: number;
}

export interface SourceDocument {
  id: string;
  name: string;
  pdfUrl: string;
  pages: SourcePage[];
}

export type DocumentStatus = 'draft' | 'sent' | 'completed';

export type FieldType = 'text' | 'email' | 'phone' | 'date' | 'signature' | 'signerName';

/** Which side of the agreement fills a field. */
export type Party = 'sender' | 'recipient';

/**
 * Position of a field. `page` is 0-based. x / y / width / height are FRACTIONS (0..1)
 * of the page's width and height, so the same numbers work at any rendered size.
 */
export interface FieldRect {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FieldDefinition {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  assignee: Party;
  /** Only meaningful for `date` fields: fill with the signing date instead of asking. */
  autoFillSigningDate: boolean;
  rect: FieldRect;
}

export type SignatureValue =
  | { kind: 'typed'; text: string }
  | { kind: 'drawn'; dataUrl: string };

export type FieldValue = string | SignatureValue;

export interface Recipient {
  name: string;
  email: string;
}

export interface SigningDocument {
  id: string;
  title: string;
  sourceDocumentId: string;
  senderId: UserId;
  recipient: Recipient | null;
  status: DocumentStatus;
  fields: FieldDefinition[];
  values: Record<string, FieldValue>;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  viewedAt: string | null;
  completedAt: string | null;
}
