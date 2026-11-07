import type { SourceDocument } from './types';

// BASE_URL is "/" locally and "/doc-signing-app/" on GitHub Pages (see vite.config.ts).
const BASE = `${import.meta.env.BASE_URL}documents/master-agreement`;

/**
 * Source documents the sender can pick from. Pages are pre-rendered PNGs of the PDF
 * (`pdftoppm -r 150`), so the browser just shows images and there is no PDF.js worker to
 * configure. Width/height are the PDF page size in points (US Letter = 612 x 792).
 */
export const SOURCE_DOCUMENTS: SourceDocument[] = [
  {
    id: 'master-agreement',
    name: 'Master Agreement for Products and Services',
    pdfUrl: `${BASE}/master-agreement.pdf`,
    pages: [
      { imageUrl: `${BASE}/page-1.png`, width: 612, height: 792 },
      { imageUrl: `${BASE}/page-2.png`, width: 612, height: 792 },
    ],
  },
];

export function findSourceDocument(id: string): SourceDocument | undefined {
  return SOURCE_DOCUMENTS.find((d) => d.id === id);
}
