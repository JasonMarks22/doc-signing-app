import { useState } from 'react';
import { useAction, useApp } from '../app/AppContext';
import { findSourceDocument } from '../domain/catalog';
import { canEditField, canFill, partyFor, problemsFor } from '../domain/rules';
import type { FieldDefinition, SigningDocument } from '../domain/types';
import { USERS, findUser, findUserByEmail } from '../domain/users';
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
  const { services, currentUser, switchUser } = useApp();
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

  /** Incomplete fields are listed in the sidebar, so take the user to the first one. */
  function submit(action: () => void) {
    setAttempted(true);
    if (problems.length > 0) focusField(problems[0].fieldId);
    else run(action);
  }

  // The person on the other side, when they are one of the demo accounts.
  const otherUser =
    party === 'sender' ? findUserByEmail(doc.recipient?.email ?? '') : findUser(doc.senderId);
  const recipientName = doc.recipient?.name;

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
                    className={`field ${editable ? 'mine' : 'theirs'} ${
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
            <h3>{party === 'sender' ? 'Sign and send' : 'Fill in and sign'}</h3>
            <p className="hint">
              Complete the highlighted fields on the document.
              {mine.some((f) => f.type === 'signerName' || f.autoFillSigningDate) &&
                ' Name and date fields fill in automatically when you sign.'}
            </p>
            {problems.length > 0 ? (
              <>
                <h4>Still needed ({problems.length})</h4>
                <ul className="problems">
                  {problems.map((p) => (
                    <li key={p.fieldId}>
                      <button className="link" onClick={() => focusField(p.fieldId)}>
                        {p.label}
                      </button>
                      {(attempted || touched.has(p.fieldId)) && p.message !== 'Required'
                        ? `: ${p.message}`
                        : ''}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="ok">✓ All your fields are complete.</p>
            )}
            {party === 'sender' ? (
              <SendForm
                onSend={(recipient) =>
                  submit(() => services.documents.send(doc.id, currentUser, recipient))
                }
              />
            ) : (
              <button
                className="primary wide"
                onClick={() => submit(() => services.documents.complete(doc.id, currentUser))}
              >
                Finish & sign
              </button>
            )}
            {error && <p className="error">{error}</p>}
          </section>
        ) : (
          <section>
            <h3>{doc.status === 'completed' ? '✓ Completed' : `Waiting for ${recipientName}`}</h3>
            <p className="hint">
              {doc.status === 'completed'
                ? 'Both people have signed. The document is locked.'
                : `Delivered to ${recipientName}'s documents in this demo${
                    doc.viewedAt ? ', and they have opened it' : ''
                  }. Your fields and the layout are locked.`}
            </p>
            {otherUser && (
              <button
                className={`wide ${doc.status === 'sent' ? 'primary' : 'secondary'}`}
                onClick={() => switchUser(otherUser.id)}
              >
                {doc.status === 'sent'
                  ? `Switch to ${otherUser.name} to sign`
                  : `View as ${otherUser.name}`}
              </button>
            )}
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
  // Recipients are chosen from the demo accounts so a sent document always reaches someone
  // who can open it. With real email, this would be a free-form address.
  const others = USERS.filter((u) => u.id !== currentUser.id);
  const [recipientId, setRecipientId] = useState(others[0].id);
  const recipient = others.find((u) => u.id === recipientId) ?? others[0];
  return (
    <form
      className="send-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSend({ name: recipient.name, email: recipient.email });
      }}
    >
      <label className="row">
        Send to
        <select value={recipient.id} onChange={(e) => setRecipientId(e.target.value)}>
          {others.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
      </label>
      <button className="primary wide" type="submit">
        Sign & send to {recipient.name}
      </button>
    </form>
  );
}
