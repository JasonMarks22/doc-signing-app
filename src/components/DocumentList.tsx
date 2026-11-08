import { useState } from 'react';
import { useAction, useApp, useMyDocuments } from '../app/AppContext';
import { navigate } from '../app/useHashRoute';
import { SOURCE_DOCUMENTS } from '../domain/catalog';
import { nextActionFor, partyFor } from '../domain/rules';
import type { SigningDocument, User } from '../domain/types';
import { findUser } from '../domain/users';
import { StatusBadge } from './StatusBadge';

export function DocumentList() {
  const { services, currentUser } = useApp();
  const docs = useMyDocuments();
  const { error, run } = useAction();
  const [sourceId, setSourceId] = useState(SOURCE_DOCUMENTS[0].id);

  return (
    <div className="list-screen">
      <section className="intro">
        <h2>Send an agreement for signature</h2>
        <ol className="how-steps">
          <li>
            <strong>Prepare</strong>
            <span>Start an agreement and add the fields each person completes.</span>
          </li>
          <li>
            <strong>Sign and send</strong>
            <span>Complete your own fields, sign, and choose the recipient.</span>
          </li>
          <li>
            <strong>Recipient signs</strong>
            <span>Switch to the recipient at the top right to fill in and sign.</span>
          </li>
        </ol>
        <p className="hint">
          This is a demo with three sample people. Documents stay in this browser and no real
          email is sent: sending puts the document in the recipient's list below.
        </p>
        <form
          className="new-doc"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => {
              const doc = services.documents.createDraft(currentUser, sourceId);
              navigate({ name: 'doc', id: doc.id });
            });
          }}
        >
          <label>
            Document
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              {SOURCE_DOCUMENTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" type="submit">
            Start new agreement
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section>
        <h3>{currentUser.name}'s documents</h3>
        {docs.length === 0 ? (
          <p className="hint">
            No documents yet. Anything {currentUser.name} starts or receives appears here.
          </p>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>With</th>
                <th>Status</th>
                <th>Next step</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const action = nextActionFor(d, currentUser);
                return (
                  <tr key={d.id} onClick={() => navigate({ name: 'doc', id: d.id })}>
                    <td>
                      <button className="link" onClick={() => navigate({ name: 'doc', id: d.id })}>
                        {d.title}
                      </button>
                    </td>
                    <td>{otherParty(d, currentUser)}</td>
                    <td>
                      <StatusBadge doc={d} />
                    </td>
                    <td>
                      {action ? (
                        <span className="action">{action} →</span>
                      ) : (
                        <span className="hint">{waitingText(d)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function otherParty(doc: SigningDocument, user: User): string {
  if (partyFor(doc, user) === 'recipient') {
    return `From ${findUser(doc.senderId)?.name ?? 'unknown'}`;
  }
  return doc.recipient ? `To ${doc.recipient.name}` : 'Not sent yet';
}

function waitingText(doc: SigningDocument): string {
  return doc.status === 'completed' ? 'Signed by both' : `Waiting for ${doc.recipient?.name}`;
}
