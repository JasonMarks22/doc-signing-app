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

  return (
    <section className="audit">
      <h3>Audit trail</h3>
      {result && (
        <p className={result.chainIntact && result.contentMatchesSigned !== false ? 'ok' : 'error'}>
          {!result.chainIntact
            ? `⚠ Tampering detected at entry #${result.brokenAtSeq}`
            : result.contentMatchesSigned === false
              ? '⚠ Document content no longer matches what was signed'
              : `✓ ${entries.length} entries, hash chain verified`}
        </p>
      )}
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
    </section>
  );
}
