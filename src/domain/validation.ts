import type { FieldDefinition, FieldValue } from './types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS_RE = /^[0-9+().\-\s]+$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

/** Lenient on formatting ("(817) 555-0142", "+1 817.555.0142"), strict on digit count. */
export function isValidPhone(v: string): boolean {
  if (!PHONE_CHARS_RE.test(v)) return false;
  const digits = v.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

export function isValidIsoDate(v: string): boolean {
  if (!ISO_DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Fields the system fills in at signing time; nobody types into these. */
export function isAutoFilled(field: FieldDefinition): boolean {
  return field.type === 'signerName' || (field.type === 'date' && field.autoFillSigningDate);
}

export function isEmpty(value: FieldValue | undefined): boolean {
  if (value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return value.kind === 'typed' ? value.text.trim() === '' : value.dataUrl === '';
}

/** Returns an error message, or null if the value is acceptable for this field. */
export function validateValue(field: FieldDefinition, value: FieldValue | undefined): string | null {
  if (isEmpty(value)) return field.required ? 'Required' : null;

  if (field.type === 'signature') {
    return typeof value === 'string' ? 'Invalid signature' : null;
  }
  if (typeof value !== 'string') return 'Invalid value';

  switch (field.type) {
    case 'email':
      return isValidEmail(value) ? null : 'Enter a valid email address';
    case 'phone':
      return isValidPhone(value) ? null : 'Enter a valid phone number (7–15 digits)';
    case 'date':
      return isValidIsoDate(value) ? null : 'Enter a valid date';
    case 'text':
    case 'signerName':
      return value.length > 500 ? 'Too long (max 500 characters)' : null;
  }
}
