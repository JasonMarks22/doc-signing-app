import { useEffect, useState } from 'react';
import { useApp, useDocument } from '../app/AppContext';
import { navigate } from '../app/useHashRoute';
import { formatDateTime } from '../domain/dates';
import { partyFor } from '../domain/rules';
import { findUser } from '../domain/users';
import { AuditPanel } from './AuditPanel';
import { FillView } from './FillView';
import { LayoutEditor } from './LayoutEditor';
import { StatusBadge } from './StatusBadge';

/** Picks the right view for (this document, this user, this status). */
export function DocumentScreen({ id }: { id: string }) {
  const { services, currentUser } = useApp();
  const doc = useDocument(id);
  const [step, setStep] = useState<'layout' | 'fill'>('layout');
  const party = doc ? partyFor(doc, currentUser) : null;

  // Opening a sent document as the recipient counts as "viewed" (recorded once).
  useEffect(() => {
    if (doc && party === 'recipient' && doc.status === 'sent') {
      services.documents.markViewed(doc.id, currentUser);
    }
  }, [doc, party, services, currentUser]);

  if (!doc || !party) {
    return (
      <div className="empty">
        <p>This document doesn't exist or isn't shared with {currentUser.name}.</p>
        <button onClick={() => navigate({ name: 'list' })}>Back to documents</button>
      </div>
    );
  }

  const sender = findUser(doc.senderId);
  const isDraftSender = party === 'sender' && doc.status === 'draft';

  return (
    <div>
      <div className="doc-header">
        <button className="link" onClick={() => navigate({ name: 'list' })}>
          ← Documents
        </button>
        <h2>{doc.title}</h2>
        <StatusBadge doc={doc} />
        <span className="meta">
          From {sender?.name ?? 'unknown'}
          {doc.recipient && ` to ${doc.recipient.name}`}
          {doc.sentAt && ` · sent ${formatDateTime(doc.sentAt)}`}
          {doc.completedAt && ` · completed ${formatDateTime(doc.completedAt)}`}
        </span>
      </div>

      {isDraftSender && (
        <div className="steps">
          <button className={step === 'layout' ? 'active' : ''} onClick={() => setStep('layout')}>
            1. Place fields
          </button>
          <button className={step === 'fill' ? 'active' : ''} onClick={() => setStep('fill')}>
            2. Fill your fields & send
          </button>
        </div>
      )}

      {isDraftSender && step === 'layout' ? <LayoutEditor doc={doc} /> : <FillView doc={doc} />}

      <AuditPanel doc={doc} />
    </div>
  );
}
