import { useId, useState, type ReactNode } from 'react';
import { useSiteData } from '@/app/SiteContext';
import { LANG_NAMES, type Lang, type LocalizedText } from '@/content/schema';
import { useFieldErrors } from './feedback';

/* ---------------------------- page scaffolding ------------------------- */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="a-pagehead">
      <div>
        <h1 className="a-title">{title}</h1>
        {subtitle && <p className="a-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="a-pagehead__actions">{actions}</div>}
    </div>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode }) {
  return (
    <div className={`a-notice a-notice--${kind}`} role={kind === 'error' ? 'alert' : 'note'}>
      {children}
    </div>
  );
}

export function Panel({ title, hint, children }: { title?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="a-panel">
      {title && (
        <header className="a-panel__head">
          <h2>{title}</h2>
          {hint && <p>{hint}</p>}
        </header>
      )}
      <div className="a-panel__body">{children}</div>
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="a-empty">
      <p className="a-empty__title">{title}</p>
      {children && <div>{children}</div>}
    </div>
  );
}

/* ------------------------------- inputs -------------------------------- */

interface BaseFieldProps {
  label: string;
  name?: string;
  hint?: ReactNode;
  required?: boolean;
}

function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  children,
}: BaseFieldProps & { id: string; error?: string | undefined; children: ReactNode }) {
  return (
    <div className={`a-field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id} className="a-label">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="a-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="a-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps extends BaseFieldProps {
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'email' | 'url';
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  lang?: string;
  errorKey?: string;
}

export function TextField({
  label,
  name,
  hint,
  required,
  value,
  onChange,
  type = 'text',
  multiline,
  rows = 4,
  maxLength,
  placeholder,
  disabled,
  lang,
  errorKey,
}: TextFieldProps) {
  const id = useId();
  const errors = useFieldErrors();
  const error = errors[errorKey ?? name ?? ''];
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    name,
    value,
    lang,
    placeholder,
    disabled,
    required,
    maxLength: undefined as number | undefined,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    className: 'a-input',
  };
  void maxLength; // limits are enforced by validation so over-long text can be reported, not silently cut
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      {multiline ? (
        <textarea {...common} rows={rows} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type={type} onChange={(e) => onChange(e.target.value)} />
      )}
    </FieldShell>
  );
}

export function SelectField<T extends string>({
  label,
  name,
  hint,
  value,
  onChange,
  options,
}: BaseFieldProps & { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const id = useId();
  const errors = useFieldErrors();
  const error = errors[name ?? ''];
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <select id={id} name={name} className="a-input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="a-toggle">
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="a-toggle__text">
        <label htmlFor={id} className="a-toggle__label">
          {label}
        </label>
        {hint && (
          <span id={`${id}-hint`} className="a-hint">
            {hint}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ localization --------------------------- */

/** Which language the form is currently editing. Only enabled languages are offered. */
export function useEditLang() {
  const data = useSiteData();
  const languages = data?.settings?.languages ?? ['en'];
  const def = data?.settings?.defaultLanguage ?? 'en';
  const [chosen, setChosen] = useState<Lang>(def);
  const lang: Lang = languages.includes(chosen) ? chosen : def;
  return { lang, setLang: setChosen, languages, defaultLanguage: def };
}

export function LangTabs({ languages, lang, onChange }: { languages: Lang[]; lang: Lang; onChange: (l: Lang) => void }) {
  if (languages.length < 2) return null;
  return (
    <div className="a-langtabs" role="group" aria-label="Editing language">
      <span className="a-langtabs__label mono">Editing</span>
      {languages.map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => onChange(l)}>
          {LANG_NAMES[l]}
        </button>
      ))}
    </div>
  );
}

export function LocalizedField({
  label,
  name,
  value,
  onChange,
  lang,
  defaultLanguage,
  ...rest
}: Omit<TextFieldProps, 'value' | 'onChange' | 'lang' | 'errorKey'> & {
  value: LocalizedText;
  onChange: (v: LocalizedText) => void;
  lang: Lang;
  defaultLanguage: Lang;
}) {
  const multi = (useSiteData()?.settings?.languages.length ?? 1) > 1;
  const fallback = lang !== defaultLanguage ? value[defaultLanguage] : undefined;
  return (
    <TextField
      {...rest}
      name={name}
      errorKey={name ? `${name}.${lang}` : undefined}
      label={multi ? `${label} (${LANG_NAMES[lang]})` : label}
      lang={lang}
      value={value[lang] ?? ''}
      placeholder={fallback || rest.placeholder}
      onChange={(v) => onChange({ ...value, [lang]: v })}
    />
  );
}

/* ------------------------------- tag input ----------------------------- */

export function TagInput({
  label,
  value,
  onChange,
  max = 12,
  hint,
  name,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  max?: number;
  hint?: ReactNode;
  name?: string;
}) {
  const id = useId();
  const errors = useFieldErrors();
  const [text, setText] = useState('');
  const error = Object.entries(errors).find(([k]) => name && (k === name || k.startsWith(`${name}.`)))?.[1];

  const add = () => {
    const parts = text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    onChange([...new Set([...value, ...parts])].slice(0, max));
    setText('');
  };

  return (
    <FieldShell id={id} label={label} hint={hint ?? `Up to ${max}. Press Enter or comma to add.`} error={error}>
      <div className="a-tags">
        <ul className="a-tags__list" aria-label={label}>
          {value.map((t) => (
            <li key={t} className="a-tag">
              {t}
              <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="a-tags__add">
          <input
            id={id}
            className="a-input"
            value={text}
            disabled={value.length >= max}
            onChange={(e) => {
              const v = e.target.value;
              if (v.includes(',')) {
                const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
                onChange([...new Set([...value, ...parts])].slice(0, max));
                setText('');
              } else setText(v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            onBlur={add}
            aria-describedby={`${id}-hint`}
          />
          <button type="button" className="a-btn a-btn--small" onClick={add} disabled={!text.trim() || value.length >= max}>
            Add
          </button>
        </div>
      </div>
    </FieldShell>
  );
}

/* -------------------------------- save bar ----------------------------- */

export function SaveBar({
  dirty,
  saving,
  error,
  onDiscard,
  saveLabel = 'Save changes',
  extra,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null | undefined;
  onDiscard: () => void;
  saveLabel?: string;
  extra?: ReactNode;
}) {
  const status = saving ? 'Saving…' : error ? 'Not saved' : dirty ? 'Unsaved changes' : 'All changes saved';
  return (
    <div className={`a-savebar ${dirty ? 'is-dirty' : ''}`}>
      <div className="a-savebar__status" role="status" aria-live="polite">
        <span className={`a-dot ${saving ? 'a-dot--busy' : error ? 'a-dot--err' : dirty ? 'a-dot--dirty' : 'a-dot--ok'}`} aria-hidden="true" />
        {status}
        {error && !saving && <span className="a-savebar__error">{error}</span>}
      </div>
      <div className="a-savebar__actions">
        {extra}
        {dirty && !saving && (
          <button type="button" className="a-btn" onClick={onDiscard}>
            Discard
          </button>
        )}
        <button type="submit" className="a-btn a-btn--primary" disabled={!dirty || saving}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}

/** Reorder buttons: keyboard accessible, no drag-and-drop dependency. */
export function MoveButtons({
  index,
  count,
  onMove,
  disabled,
  label,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <span className="a-move">
      <button type="button" className="a-iconbtn" aria-label={`Move ${label} up`} disabled={disabled || index === 0} onClick={() => onMove(index, index - 1)}>
        ↑
      </button>
      <button
        type="button"
        className="a-iconbtn"
        aria-label={`Move ${label} down`}
        disabled={disabled || index === count - 1}
        onClick={() => onMove(index, index + 1)}
      >
        ↓
      </button>
    </span>
  );
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item === undefined) return list;
  next.splice(to, 0, item);
  return next;
}

/* ------------------------------ list editor ---------------------------- */

export function ListEditor<T>({
  title,
  items,
  onChange,
  render,
  blank,
  max,
  addLabel,
  hideAdd,
}: {
  title: string;
  items: T[];
  onChange: (items: T[]) => void;
  render: (item: T, index: number, set: (v: T) => void) => ReactNode;
  blank: T;
  max: number;
  addLabel?: string;
  hideAdd?: boolean;
}) {
  return (
    <div className="a-list-editor">
      <p className="a-label">
        {title} <span className="a-hint">({items.length}/{max})</span>
      </p>
      {items.length === 0 && <p className="a-hint">Nothing here yet.</p>}
      <ol className="a-list-editor__items">
        {items.map((item, i) => (
          <li key={i} className="a-list-editor__item">
            <div className="a-list-editor__body">{render(item, i, (v) => onChange(items.map((x, j) => (j === i ? v : x))))}</div>
            <div className="a-list-editor__tools">
              <MoveButtons index={i} count={items.length} label={`${title} ${i + 1}`} onMove={(a, b) => onChange(moveItem(items, a, b))} />
              <button type="button" className="a-btn a-btn--small a-btn--danger-quiet" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label={`Remove ${title} ${i + 1}`}>
                Remove
              </button>
            </div>
          </li>
        ))}
      </ol>
      {!hideAdd && (
        <button type="button" className="a-btn a-btn--small" disabled={items.length >= max} onClick={() => onChange([...items, structuredClone(blank)])}>
          {addLabel ?? 'Add'}
        </button>
      )}
    </div>
  );
}
