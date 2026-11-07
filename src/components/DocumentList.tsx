import { useState } from 'react';
import { useAction, useApp, useMyDocuments } from '../app/AppContext';
import { navigate } from '../app/useHashRoute';
import { SOURCE_DOCUMENTS } from '../domain/catalog';
import { formatDateTime } from '../domain/dates';
import { nextActionFor, partyFor } from '../domain/rules';
import { findUser } from '../domain/users';
import { StatusBadge } from './StatusBadge';

export function DocumentList() {
  const { services, currentUser } = useApp();
  const docs = useMyDocuments();
  const { error, run } = useAction();
  const [sourceId, setSourceId] = useState(SOURCE_DOCUMENTS[0].id);
  const [title, setTitle] = useState('');

  return (
    <div className="list-screen">
      <section className="new-doc">
        <h3>New document</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(() => {
              const doc = services.documents.createDraft(currentUser, sourceId, title);
              setTitle('');
              navigate({ name: 'doc', id: doc.id });
            });
          }}
        >
          <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            {SOURCE_DOCUMENTS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Title (optional), e.g. MA – Acme Freight"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="primary" type="submit">
            Create draft
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section>
        <h3>My documents</h3>
        {docs.length === 0 ? (
          <p className="hint">Nothing here yet for {currentUser.name}.</p>
        ) : (
          <table className="doc-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Role</th>
                <th>Other party</th>
                <th>Status</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const party = partyFor(d, currentUser);
                const action = nextActionFor(d, currentUser);
                const other =
                  party === 'sender'
                    ? (d.recipient?.name ?? '—')
                    : (findUser(d.senderId)?.name ?? 'unknown');
                return (
                  <tr key={d.id} onClick={() => navigate({ name: 'doc', id: d.id })}>
                    <td>{d.title}</td>
                    <td>{party === 'sender' ? 'Sent by me' : 'Sent to me'}</td>
                    <td>{other}</td>
                    <td>
                      <StatusBadge doc={d} />
                    </td>
                    <td>{formatDateTime(d.updatedAt)}</td>
                    <td>{action && <span className="action">{action} →</span>}</td>
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
