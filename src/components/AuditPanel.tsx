import { useEffect, useState } from 'react';
import { useApp, useAuditEntries } from '../app/AppContext';
import { formatDateTime } from '../domain/dates';
import type { SigningDocument } from '../domain/types';
import type { VerifyResult } from '../services/auditTrail';

/** Shows the hash-chained history of a document and whether it verifies. */
export function AuditPanel({ doc }: { doc: SigningDocument }) {
  const { audit } = useApp().services;
  const entries = useAuditEntries(doc.id);
  const [result, setResult] = useState<VerifyResult | null>(null);

  // Re-verify whenever the entries or the document change.
  useEffect(() => {
    let cancelled = false;
    audit.verify(doc).then((r) => !cancelled && setResult(r));
    return () => {
      cancelled = true;
    };
  }, [audit, doc, entries]);

  const verified = result !== null && result.chainIntact && result.contentMatchesSigned !== false;

  return (
    // Collapsed by default to keep the screen simple; opens itself if tampering is found.
    <details className="audit" open={result && !verified ? true : undefined}>
      <summary>
        <strong>Audit trail</strong>{' '}
        {result && (
          <span className={verified ? 'ok' : 'error'}>
            {!result.chainIntact
              ? `⚠ Tampering detected at entry #${result.brokenAtSeq}`
              : result.contentMatchesSigned === false
                ? '⚠ Document content no longer matches what was signed'
                : `✓ ${entries.length} entries, hash chain verified`}
          </span>
        )}
      </summary>
      <ol>
        {entries.map((e) => (
          <li key={e.id}>
            <div>{e.summary}</div>
            <small>
              {formatDateTime(e.at)} · <code title={e.hash}>{e.hash.slice(0, 10)}…</code>
            </small>
          </li>
        ))}
      </ol>
    </details>
  );
}
