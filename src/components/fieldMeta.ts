import type { FieldType } from '../domain/types';

export const FIELD_TYPES: { type: FieldType; label: string; size: [number, number] }[] = [
  // size = default [width, height] as page fractions when placed by clicking
  { type: 'text', label: 'Text', size: [0.25, 0.02] },
  { type: 'email', label: 'Email', size: [0.25, 0.02] },
  { type: 'phone', label: 'Phone', size: [0.2, 0.02] },
  { type: 'date', label: 'Date', size: [0.12, 0.022] },
  { type: 'signature', label: 'Signature', size: [0.3, 0.04] },
  { type: 'signerName', label: 'Signer name', size: [0.22, 0.022] },
];

export function typeLabel(type: FieldType): string {
  return FIELD_TYPES.find((t) => t.type === type)?.label ?? type;
}
