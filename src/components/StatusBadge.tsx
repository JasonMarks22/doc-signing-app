import type { SigningDocument } from '../domain/types';

export function StatusBadge({ doc }: { doc: SigningDocument }) {
  const label =
    doc.status === 'sent' && doc.viewedAt ? 'sent · viewed' : doc.status;
  return <span className={`badge ${doc.status}`}>{label}</span>;
}
