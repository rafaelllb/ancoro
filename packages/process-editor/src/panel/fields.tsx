/**
 * Campos reutilizáveis do painel de propriedades (texto, seleção, checkbox, chips).
 * [2026-10-14] Criado: extraído do PropertiesPanel para ser compartilhado com a aba de atributos estendidos — Rafael Brito
 * Campos de texto são NÃO-controlados e confirmam em blur/Enter (1 entrada de histórico por edição); `key` = id+valor remonta o campo
 * quando o valor externo muda (desfazer/refazer).
 */
import type { ReactNode } from 'react';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="lab">{label}</span>{children}{hint && <span className="fhint">{hint}</span>}</label>;
}

export function TextField({ id, value, onCommit, multiline, rows = 3, mono, label, placeholder, type }: {
  id: string; value: string; onCommit: (v: string) => void; multiline?: boolean; rows?: number; mono?: boolean; label: string; placeholder?: string; type?: string;
}) {
  const common = {
    defaultValue: value, 'aria-label': label, placeholder, className: mono ? 'mono' : undefined,
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !multiline) (e.target as HTMLElement).blur();
      if (e.key === 'Escape') { (e.target as HTMLInputElement).value = value; (e.target as HTMLElement).blur(); }
    },
  };
  // trimEnd: Enter/espaços finais acidentais não viram parte do texto salvo
  const commit = (raw: string) => { const v = raw.trimEnd(); if (v !== value) onCommit(v); };
  return multiline
    ? <textarea key={`${id}:${value}`} {...common} rows={rows} onBlur={(e) => commit(e.currentTarget.value)} />
    : <input key={`${id}:${value}`} {...common} type={type ?? 'text'} onBlur={(e) => commit(e.currentTarget.value)} />;
}

export function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.stopPropagation()}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="check"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}</label>;
}

/** Lista de textos como chips: Enter ou vírgula adiciona; × remove. Usada em RACI, sistemas, dados, regras, requisitos, tags. */
export function ChipsField({ label, values, onChange, placeholder, mono }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string; mono?: boolean }) {
  const add = (raw: string, input: HTMLInputElement) => {
    const parts = raw.split(',').map((x) => x.trim()).filter((x) => x && !values.includes(x));
    if (parts.length) onChange([...values, ...parts]);
    input.value = '';
  };
  return (
    <div className="tags">
      {values.map((r) => (
        <span key={r} className={`tag${mono ? ' mono' : ''}`}>{r}<button aria-label={`remove ${r}`} onClick={() => onChange(values.filter((x) => x !== r))}>×</button></span>
      ))}
      <input className="tag-input" placeholder={placeholder} aria-label={label}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(e.currentTarget.value, e.currentTarget); } }}
        onBlur={(e) => { if (e.currentTarget.value.trim()) add(e.currentTarget.value, e.currentTarget); }} />
    </div>
  );
}

