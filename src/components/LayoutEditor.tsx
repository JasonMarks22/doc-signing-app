import { useRef, useState } from 'react';
import { useAction, useApp } from '../app/AppContext';
import { findSourceDocument } from '../domain/catalog';
import { PRESETS } from '../domain/presets';
import type { FieldDefinition, FieldRect, FieldType, Party, SigningDocument } from '../domain/types';
import { PageView, rectStyle } from './PageView';
import { FIELD_TYPES, typeLabel } from './fieldMeta';

type Drag = {
  fieldId: string;
  mode: 'move' | 'resize';
  startX: number;
  startY: number;
  start: FieldRect;
  pageBox: DOMRect;
};

/**
 * Sender, step 1: place fields. Click a field type, then click the page.
 * Drag a field to move it; drag its corner to resize.
 *
 * While dragging, the in-progress rectangle lives in LOCAL state (`preview`) and is only
 * saved once, on pointer-up. That keeps the repository (and the localStorage write) out of
 * the 60-times-a-second mouse-move loop.
 */
export function LayoutEditor({ doc, onContinue }: { doc: SigningDocument; onContinue: () => void }) {
  const { services, currentUser } = useApp();
  const { error, run } = useAction();
  const source = findSourceDocument(doc.sourceDocumentId)!;

  const [placing, setPlacing] = useState<FieldType | null>(null);
  const [assignee, setAssignee] = useState<Party>('recipient');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; rect: FieldRect } | null>(null);
  const [confirmPreset, setConfirmPreset] = useState(false);
  const drag = useRef<Drag | null>(null);

  const selected = doc.fields.find((f) => f.id === selectedId) ?? null;
  const svc = services.documents;

  function placeAt(e: React.PointerEvent<HTMLDivElement>, pageIndex: number) {
    if (!placing || e.target !== e.currentTarget.querySelector('img')) return;
    const box = e.currentTarget.getBoundingClientRect();
    const [w, h] = FIELD_TYPES.find((t) => t.type === placing)!.size;
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height - h / 2;
    const count = doc.fields.filter((f) => f.type === placing).length + 1;
    run(() => {
      const f = svc.addField(doc.id, currentUser, {
        type: placing,
        label: `${typeLabel(placing)} ${count}`,
        required: true,
        assignee,
        autoFillSigningDate: placing === 'date',
        rect: { page: pageIndex, x, y, width: w, height: h },
      });
      setSelectedId(f.id);
    });
    setPlacing(null);
  }

  function startDrag(e: React.PointerEvent, field: FieldDefinition, mode: Drag['mode']) {
    e.stopPropagation();
    setSelectedId(field.id);
    const pageEl = (e.currentTarget as HTMLElement).closest('.page')!;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      fieldId: field.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      start: field.rect,
      pageBox: pageEl.getBoundingClientRect(),
    };
  }

  function onDragMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.pageBox.width;
    const dy = (e.clientY - d.startY) / d.pageBox.height;
    const rect =
      d.mode === 'move'
        ? { ...d.start, x: d.start.x + dx, y: d.start.y + dy }
        : { ...d.start, width: d.start.width + dx, height: d.start.height + dy };
    setPreview({ id: d.fieldId, rect });
  }

  function endDrag() {
    const d = drag.current;
    drag.current = null;
    if (d && preview && preview.id === d.fieldId) {
      // The service clamps the rect to the page, so we don't have to here.
      run(() => svc.updateField(doc.id, currentUser, d.fieldId, { rect: preview.rect }));
    }
    setPreview(null);
  }

  const update = (patch: Partial<FieldDefinition>) =>
    selected && run(() => svc.updateField(doc.id, currentUser, selected.id, patch));

  function loadPreset() {
    if (doc.fields.length && !confirmPreset) return setConfirmPreset(true);
    run(() => svc.applyPreset(doc.id, currentUser));
    setConfirmPreset(false);
    setSelectedId(null);
  }

  return (
    <div className="workspace">
      <div className="pages">
        {source.pages.map((page, i) => (
          <PageView
            key={i}
            page={page}
            index={i}
            className={placing ? 'placing' : ''}
            onPointerDown={(e) => (placing ? placeAt(e, i) : setSelectedId(null))}
          >
            {doc.fields
              .filter((f) => f.rect.page === i)
              .map((f) => {
                const rect = preview?.id === f.id ? preview.rect : f.rect;
                return (
                  <div
                    key={f.id}
                    className={`field edit ${f.assignee} ${f.id === selectedId ? 'selected' : ''}`}
                    style={rectStyle(rect)}
                    onPointerDown={(e) => startDrag(e, f, 'move')}
                    onPointerMove={onDragMove}
                    onPointerUp={endDrag}
                    title={`${f.label} (${typeLabel(f.type)}, ${f.assignee})`}
                  >
                    <span className="field-label">
                      {f.label}
                      {f.required ? ' *' : ''}
                    </span>
                    <span
                      className="resize-handle"
                      onPointerDown={(e) => startDrag(e, f, 'resize')}
                      onPointerMove={onDragMove}
                      onPointerUp={endDrag}
                    />
                  </div>
                );
              })}
          </PageView>
        ))}
      </div>

      <aside className="sidebar">
        <section>
          {doc.fields.length === 0 ? (
            <>
              <h3>Add the fields to complete</h3>
              {PRESETS[doc.sourceDocumentId] ? (
                <>
                  <p className="hint">Quickest: add all the usual fields for this agreement.</p>
                  <button className="primary wide" onClick={loadPreset}>
                    Use standard layout
                  </button>
                </>
              ) : (
                <p className="hint">Add at least one field below.</p>
              )}
            </>
          ) : (
            <>
              <FieldSummary fields={doc.fields} />
              <button className="primary wide" onClick={onContinue}>
                Next: sign & send →
              </button>
            </>
          )}
        </section>

        <section>
          <h3>Add a field</h3>
          <label className="row">
            Assign to
            <select value={assignee} onChange={(e) => setAssignee(e.target.value as Party)}>
              <option value="recipient">Recipient</option>
              <option value="sender">Me (sender)</option>
            </select>
          </label>
          <div className="palette">
            {FIELD_TYPES.map((t) => (
              <button
                key={t.type}
                className={placing === t.type ? 'active' : ''}
                onClick={() => setPlacing(placing === t.type ? null : t.type)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="hint">
            {placing
              ? `Click on the page to place a ${typeLabel(placing)} field.`
              : 'Pick a type, then click the page. Click a field to edit it, drag to move it, or drag its corner to resize.'}
          </p>
          {PRESETS[doc.sourceDocumentId] && doc.fields.length > 0 && (
            <button className="link" onClick={loadPreset}>
              {confirmPreset ? 'Click again to replace all fields' : 'Reset to standard layout'}
            </button>
          )}
        </section>

        {selected && (
          <section>
            <h3>Edit field</h3>
            <label className="row">
              Label
              <input value={selected.label} onChange={(e) => update({ label: e.target.value })} />
            </label>
            <label className="row">
              Type
              <select
                value={selected.type}
                onChange={(e) => update({ type: e.target.value as FieldType })}
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="row">
              Assignee
              <select
                value={selected.assignee}
                onChange={(e) => update({ assignee: e.target.value as Party })}
              >
                <option value="recipient">Recipient</option>
                <option value="sender">Sender</option>
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={selected.required}
                onChange={(e) => update({ required: e.target.checked })}
              />
              Required
            </label>
            {selected.type === 'date' && (
              <label className="check">
                <input
                  type="checkbox"
                  checked={selected.autoFillSigningDate}
                  onChange={(e) => update({ autoFillSigningDate: e.target.checked })}
                />
                Auto-fill with signing date
              </label>
            )}
            <button
              className="danger"
              onClick={() => {
                run(() => svc.removeField(doc.id, currentUser, selected.id));
                setSelectedId(null);
              }}
            >
              Delete field
            </button>
          </section>
        )}
        {error && <p className="error">{error}</p>}
      </aside>
    </div>
  );
}

/** Doubles as the colour key for the fields on the page. */
function FieldSummary({ fields }: { fields: FieldDefinition[] }) {
  const count = (party: Party) => fields.filter((f) => f.assignee === party).length;
  return (
    <ul className="field-key">
      <li className="sender">Your fields: {count('sender')}</li>
      <li className="recipient">Recipient's fields: {count('recipient')}</li>
    </ul>
  );
}
