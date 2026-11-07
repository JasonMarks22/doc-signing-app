import type { FieldDefinition, FieldValue } from '../domain/types';
import { isAutoFilled } from '../domain/validation';

/** Read-only rendering of a field's value (used for the other party's fields and locked docs). */
export function FieldValueView({ field, value }: { field: FieldDefinition; value: FieldValue | undefined }) {
  if (value === undefined || value === '') {
    const hint = isAutoFilled(field)
      ? field.type === 'signerName'
        ? 'Name fills at signing'
        : 'Date fills at signing'
      : field.label;
    return <span className="placeholder">{hint}</span>;
  }
  if (typeof value !== 'string') {
    return value.kind === 'typed' ? (
      <span className="script">{value.text}</span>
    ) : (
      <img className="sig-img" src={value.dataUrl} alt={`${field.label}`} />
    );
  }
  if (field.type === 'date') {
    const [y, m, d] = value.split('-');
    return <span>{`${m}/${d}/${y}`}</span>;
  }
  return <span>{value}</span>;
}

/** Editable input for one of the current user's own fields. */
export function FieldInput({
  field,
  value,
  invalid,
  onChange,
  onOpenSignature,
}: {
  field: FieldDefinition;
  value: FieldValue | undefined;
  invalid: boolean;
  onChange: (v: string) => void;
  onOpenSignature: () => void;
}) {
  if (field.type === 'signature') {
    return (
      <button
        type="button"
        className={`sig-button ${invalid ? 'invalid' : ''}`}
        onClick={onOpenSignature}
      >
        {value ? <FieldValueView field={field} value={value} /> : 'Click to sign'}
      </button>
    );
  }
  const inputType = { text: 'text', email: 'email', phone: 'tel', date: 'date', signerName: 'text' }[
    field.type
  ];
  return (
    <input
      type={inputType}
      className={invalid ? 'invalid' : ''}
      value={typeof value === 'string' ? value : ''}
      placeholder={field.label + (field.required ? ' *' : '')}
      aria-label={field.label}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
