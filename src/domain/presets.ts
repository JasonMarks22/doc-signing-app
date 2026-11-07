import type { FieldDefinition, FieldType, Party } from './types';

/**
 * "Master Agreement – standard" layout: the target layout from the README.
 *
 * Coordinates were measured from the PDF itself (label and table-line positions read with
 * pdfplumber) in PDF points, then converted to page fractions by `pt()`. Writing them in
 * points keeps them checkable against the PDF; storing fractions keeps them size-independent.
 */
const PAGE_W = 612;
const PAGE_H = 792;

type PresetField = Omit<FieldDefinition, 'id'>;

function pt(
  page: number,
  type: FieldType,
  label: string,
  assignee: Party,
  [x0, top, x1, bottom]: [number, number, number, number],
  opts: { required?: boolean; autoFillSigningDate?: boolean } = {},
): PresetField {
  return {
    type,
    label,
    assignee,
    required: opts.required ?? true,
    autoFillSigningDate: opts.autoFillSigningDate ?? false,
    rect: {
      page,
      x: x0 / PAGE_W,
      y: top / PAGE_H,
      width: (x1 - x0) / PAGE_W,
      height: (bottom - top) / PAGE_H,
    },
  };
}

export const MASTER_AGREEMENT_STANDARD: PresetField[] = [
  // Page 1 – Customer Information (recipient)
  pt(0, 'text', 'Customer Legal Name', 'recipient', [121, 119, 556, 134]),
  pt(0, 'text', 'Purchasing Agent', 'recipient', [108, 139, 253, 154]),
  pt(0, 'email', 'Email', 'recipient', [277, 139, 556, 154]),
  pt(0, 'text', 'Address', 'recipient', [83, 159, 253, 174]),
  pt(0, 'text', 'City', 'recipient', [272, 159, 404, 174]),
  pt(0, 'text', 'State', 'recipient', [427, 159, 480, 174]),
  pt(0, 'text', 'Zip', 'recipient', [497, 159, 556, 174]),
  pt(0, 'phone', 'Phone', 'recipient', [78, 179, 253, 194]),
  pt(0, 'phone', 'Fax', 'recipient', [272, 179, 556, 194], { required: false }),

  // Page 2 – Lone Star Fleet Services (sender, left column)
  pt(1, 'signature', 'Sender Signature', 'sender', [86, 395, 304, 425]),
  pt(1, 'signerName', 'Sender Print Name', 'sender', [89, 429, 216, 447]),
  pt(1, 'date', 'Sender Date', 'sender', [236, 429, 304, 447], { autoFillSigningDate: true }),
  pt(1, 'text', 'Sender Title', 'sender', [106, 451, 304, 469]),

  // Page 2 – Customer (recipient, right column)
  pt(1, 'signature', 'Customer Signature', 'recipient', [338, 395, 556, 425]),
  pt(1, 'signerName', 'Customer Print Name', 'recipient', [341, 429, 468, 447]),
  pt(1, 'date', 'Customer Date', 'recipient', [488, 429, 556, 447], { autoFillSigningDate: true }),
  pt(1, 'text', 'Customer Title', 'recipient', [358, 451, 556, 469]),
];

export const PRESETS: Record<string, PresetField[]> = {
  'master-agreement': MASTER_AGREEMENT_STANDARD,
};
