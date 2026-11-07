import type { SourceDocument } from './types';

/**
 * Source documents the sender can pick from. Pages are pre-rendered PNGs of the PDF
 * (`pdftoppm -r 150`), so the browser just shows images and there is no PDF.js worker to
 * configure. Width/height are the PDF page size in points (US Letter = 612 x 792).
 */
export const SOURCE_DOCUMENTS: SourceDocument[] = [
  {
    id: 'master-agreement',
    name: 'Master Agreement for Products and Services',
    pdfUrl: '/documents/master-agreement/master-agreement.pdf',
    pages: [
      { imageUrl: '/documents/master-agreement/page-1.png', width: 612, height: 792 },
      { imageUrl: '/documents/master-agreement/page-2.png', width: 612, height: 792 },
    ],
  },
];

export function findSourceDocument(id: string): SourceDocument | undefined {
  return SOURCE_DOCUMENTS.find((d) => d.id === id);
}
