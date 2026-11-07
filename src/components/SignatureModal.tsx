import { useEffect, useRef, useState } from 'react';
import type { SignatureValue } from '../domain/types';

/** Type a name (rendered in a script font) or draw on a canvas. */
export function SignatureModal({
  defaultName,
  onSave,
  onClose,
}: {
  defaultName: string;
  onSave: (v: SignatureValue) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'typed' | 'drawn'>('typed');
  const [text, setText] = useState(defaultName);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1a237e';
  }, [mode]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    // Canvas pixels vs. CSS pixels can differ; scale into canvas coordinates.
    return [((e.clientX - r.left) * c.width) / r.width, ((e.clientY - r.top) * c.height) / r.height];
  }

  function clear() {
    const c = canvasRef.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  }

  const canSave = mode === 'typed' ? text.trim() !== '' : hasInk;

  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal" onPointerDown={(e) => e.stopPropagation()}>
        <h3>Add your signature</h3>
        <div className="tabs">
          <button className={mode === 'typed' ? 'active' : ''} onClick={() => setMode('typed')}>
            Type
          </button>
          <button className={mode === 'drawn' ? 'active' : ''} onClick={() => setMode('drawn')}>
            Draw
          </button>
        </div>
        {mode === 'typed' ? (
          <>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} />
            <div className="signature-preview script">{text || ' '}</div>
          </>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              width={600}
              height={180}
              className="sig-canvas"
              onPointerDown={(e) => {
                drawing.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                const ctx = e.currentTarget.getContext('2d')!;
                const [x, y] = point(e);
                ctx.beginPath();
                ctx.moveTo(x, y);
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                const ctx = e.currentTarget.getContext('2d')!;
                const [x, y] = point(e);
                ctx.lineTo(x, y);
                ctx.stroke();
                setHasInk(true);
              }}
              onPointerUp={() => (drawing.current = false)}
            />
            <button className="link" onClick={clear}>
              Clear
            </button>
          </>
        )}
        <div className="modal-actions">
          <button className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={() =>
              onSave(
                mode === 'typed'
                  ? { kind: 'typed', text: text.trim() }
                  : { kind: 'drawn', dataUrl: canvasRef.current!.toDataURL('image/png') },
              )
            }
          >
            Apply signature
          </button>
        </div>
      </div>
    </div>
  );
}
