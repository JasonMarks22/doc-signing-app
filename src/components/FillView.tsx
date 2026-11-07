import { useState } from 'react';
import { useAction, useApp } from '../app/AppContext';
import { findSourceDocument } from '../domain/catalog';
import { canEditField, canFill, partyFor, problemsFor } from '../domain/rules';
import type { FieldDefinition, SigningDocument } from '../domain/types';
import { USERS } from '../domain/users';
import { validateValue } from '../domain/validation';
import { FieldInput, FieldValueView } from './FieldView';
import { PageView, rectStyle } from './PageView';
import { SignatureModal } from './SignatureModal';

/**
 * Shows the whole document with every field in place. The current user's own fields are
 * inputs (when the status allows it); everything else is read-only. Used for:
 *   - sender, step 2 (fill own fields, choose recipient, send)
 *   - recipient (fill, sign, finish)
 *   - anyone viewing a sent/completed document
 */
export function FillView({ doc }: { doc: SigningDocument }) {
  const { services, currentUser } = useApp();
  const { error, run } = useAction();
  const source = findSourceDocument(doc.sourceDocumentId)!;
  const party = partyFor(doc, currentUser)!;
  const filling = canFill(doc, currentUser);

  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [signing, setSigning] = useState<FieldDefinition | null>(null);

  const problems = filling ? problemsFor(doc, party) : [];
  const mine = doc.fields.filter((f) => f.assignee === party);

  function showError(f: FieldDefinition) {
    if (!attempted && !touched.has(f.id)) return null;
    return validateValue(f, doc.values[f.id]);
  }

  function setValue(f: FieldDefinition, v: Parameters<typeof services.documents.setValue>[3]) {
    setTouched((t) => new Set(t).add(f.id));
    run(() => services.documents.setValue(doc.id, currentUser, f.id, v));
  }

  function focusField(id: string) {
    document.querySelector<HTMLElement>(`[data-field="${id}"] input, [data-field="${id}"] button`)?.focus();
  }

  return (
    <div className="workspace">
      <div className="pages">
        {source.pages.map((page, i) => (
          <PageView key={i} page={page} index={i}>
            {doc.fields
              .filter((f) => f.rect.page === i)
              .map((f) => {
                const editable = canEditField(doc, currentUser, f);
                const err = editable ? showError(f) : null;
                return (
                  <div
                    key={f.id}
                    data-field={f.id}
                    className={`field ${f.assignee === party && filling ? 'mine' : 'theirs'} ${
                      err ? 'has-error' : ''
                    }`}
                    style={rectStyle(f.rect)}
                    title={err ? `${f.label}: ${err}` : f.label}
                  >
                    {editable ? (
                      <FieldInput
                        field={f}
                        value={doc.values[f.id]}
                        invalid={!!err}
                        onChange={(v) => setValue(f, v)}
                        onOpenSignature={() => setSigning(f)}
                      />
                    ) : (
                      <FieldValueView field={f} value={doc.values[f.id]} />
                    )}
                  </div>
                );
              })}
          </PageView>
        ))}
      </div>

      <aside className="sidebar">
        {filling ? (
          <section>
            <h3>{party === 'sender' ? 'Your fields' : 'Fill & sign'}</h3>
            <p>
              {mine.length - problems.length} of {mine.length} of your fields ready.
              {mine.some((f) => f.type === 'signerName' || f.autoFillSigningDate) &&
                ' Name and date fields fill automatically when you sign.'}
            </p>
            {problems.length > 0 && (attempted || touched.size > 0) && (
              <ul className="problems">
                {problems.map((p) => (
                  <li key={p.fieldId}>
                    <button className="link" onClick={() => focusField(p.fieldId)}>
                      {p.label}
                    </button>
                    : {p.message}
                  </li>
                ))}
              </ul>
            )}
            {party === 'sender' ? (
              <SendForm
                onSend={(recipient) => {
                  setAttempted(true);
                  run(() => services.documents.send(doc.id, currentUser, recipient));
                }}
              />
            ) : (
              <button
                className="primary"
                onClick={() => {
                  setAttempted(true);
                  run(() => services.documents.complete(doc.id, currentUser));
                }}
              >
                Finish & sign
              </button>
            )}
            {error && <p className="error">{error}</p>}
          </section>
        ) : (
          <section>
            <h3>{doc.status === 'completed' ? 'Completed' : 'Waiting on recipient'}</h3>
            <p>
              {doc.status === 'completed'
                ? 'Both parties have signed. The document is locked.'
                : `Sent to ${doc.recipient?.name}. Your fields and the layout are locked.`}
            </p>
          </section>
        )}
      </aside>

      {signing && (
        <SignatureModal
          defaultName={currentUser.name}
          onClose={() => setSigning(null)}
          onSave={(v) => {
            setValue(signing, v);
            setSigning(null);
          }}
        />
      )}
    </div>
  );
}

function SendForm({ onSend }: { onSend: (r: { name: string; email: string }) => void }) {
  const { currentUser } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const others = USERS.filter((u) => u.id !== currentUser.id);
  return (
    <form
      className="send-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSend({ name, email });
      }}
    >
      <h4>Send to</h4>
      <div className="quick-pick">
        {others.map((u) => (
          <button
            type="button"
            key={u.id}
            className="chip"
            onClick={() => {
              setName(u.name);
              setEmail(u.email);
            }}
          >
            {u.name}
          </button>
        ))}
      </div>
      <label className="row">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="row">
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button className="primary" type="submit">
        Sign & send
      </button>
    </form>
  );
}
