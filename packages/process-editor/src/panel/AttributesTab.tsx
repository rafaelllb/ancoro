/**
 * Aba "Atributos": atributos estendidos TIPADOS (estilo Bizagi) — editor de valores por tipo + diálogo de definições.
 *
 * [2026-10-14] Criado: 12 tipos (área de texto, caixa de texto, número, data, imagem, seleção única lista/opções, seleção múltipla,
 * arquivo embutido, arquivo vinculado, URL, tabela) — Rafael Brito
 * Fluxo (igual ao Bizagi): "Adicionar novo atributo estendido" abre o diálogo (nome, descrição, tipo, opções/colunas, a quais elementos
 * se aplica); depois o atributo aparece, com o editor do seu tipo, em todo elemento aplicável. Valores são gravados por `defId`.
 *
 * TODO [ESTIGMERGIA]: imagem/arquivo embutidos como data-URL
 * - Limite de 400 KB por valor (vai dentro do .bpmn). Na Fase 3/4, trocar por referência a um asset store.
 * TODO [ESTIGMERGIA]: reordenar definições e valor padrão
 * - Bizagi permite ordenar os atributos e definir valor padrão; aqui a ordem é a de criação.
 */
import { useEffect, useState } from 'react';
import type { AttributeDef, AttrValue, NodeKind, ProcessModel, ProcessNode } from '@ancoro/process-core';
import { ATTR_TYPES, COLUMN_TYPES, OPTION_TYPES, emptyAttrValue, isEmptyAttrValue } from '@ancoro/process-core';
import { useT } from '../i18n';
import { useEditor } from '../store';
import { Field, SelectField, TextField } from './fields';

const MAX_EMBED = 400 * 1024;

/** "…/Apps('F2186')/…" -> "F2186"; senão o host. Mostra algo legível no lugar de uma URL de 300 caracteres. */
export function friendlyUrl(url: string): string {
  const m = /Apps\('([^']+)'\)/.exec(url);
  if (m) return m[1]!;
  try { return new URL(url).host || url; } catch { return url.length > 28 ? `${url.slice(0, 27)}…` : url; }
}
const isHttp = (u: string) => /^https?:\/\//i.test(u);

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

// ------------------------------------------------------------------------------------------------------------------ valor por tipo
function ValueEditor({ id, def, value, onChange }: { id: string; def: AttributeDef; value: AttrValue; onChange: (v: AttrValue) => void }) {
  const t = useT();
  const showToast = useEditor((s) => s.showToast);
  const str = typeof value === 'string' ? value : '';

  switch (def.type) {
    case 'textarea': return <TextField id={id} multiline rows={7} value={str} label={def.name} onCommit={onChange} />;
    case 'text': return <TextField id={id} value={str} label={def.name} onCommit={onChange} />;
    case 'number': return <TextField id={id} type="number" value={str} label={def.name} onCommit={onChange} />;
    case 'date': return <TextField id={id} type="date" value={str} label={def.name} onCommit={onChange} />;
    case 'url':
    case 'fileLink':
      return (
        <div className="urlrow">
          <TextField id={id} value={str} label={def.name} placeholder={def.type === 'url' ? 'https://' : 'C:\\… | https://…'} onCommit={onChange} />
          {isHttp(str) && <a className="ext" href={str} target="_blank" rel="noopener noreferrer" title={str}>{friendlyUrl(str)} ↗</a>}
        </div>
      );
    case 'select':
      return <SelectField label={def.name} value={str} onChange={onChange}
        options={[['', t.attrs.choose], ...def.options.map((o): [string, string] => [o, o]), ...(str && !def.options.includes(str) ? [[str, `${str} ⚠`] as [string, string]] : [])]} />;
    case 'radio':
      return (
        <div className="radios" role="radiogroup" aria-label={def.name}>
          {def.options.map((o) => <label key={o} className="check"><input type="radio" name={id} checked={str === o} onChange={() => onChange(o)} /> {o}</label>)}
        </div>
      );
    case 'multiselect': {
      const sel = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="radios" aria-label={def.name}>
          {def.options.map((o) => (
            <label key={o} className="check">
              <input type="checkbox" checked={sel.includes(o)} onChange={(e) => onChange(e.target.checked ? [...sel, o] : sel.filter((x) => x !== o))} /> {o}
            </label>
          ))}
        </div>
      );
    }
    case 'image':
      return (
        <div className="filebox">
          {str.startsWith('data:image') && <img src={str} alt={def.name} />}
          <input type="file" accept="image/*" aria-label={def.name} onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (f.size > MAX_EMBED) { showToast(t.attrs.tooBig); return; }
            onChange(await readAsDataUrl(f));
          }} />
        </div>
      );
    case 'file': {
      let meta: { name: string; data: string } | null = null;
      try { meta = str ? (JSON.parse(str) as { name: string; data: string }) : null; } catch { meta = null; }
      return (
        <div className="filebox">
          {meta && <a className="ext" href={meta.data} download={meta.name}>{meta.name} ⤓ {t.attrs.download}</a>}
          <input type="file" aria-label={def.name} onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (f.size > MAX_EMBED) { showToast(t.attrs.tooBig); return; }
            onChange(JSON.stringify({ name: f.name, mime: f.type, data: await readAsDataUrl(f) }));
          }} />
        </div>
      );
    }
    case 'table': return <TableEditor id={id} def={def} rows={Array.isArray(value) && value.every(Array.isArray) ? (value as string[][]) : []} onChange={onChange} />;
  }
}

/**
 * Tabela: um "cartão" por linha, com as colunas empilhadas. No painel estreito (340px) uma grade real ficaria ilegível
 * (URLs longas, rolagem horizontal); o cartão mostra cada coluna com seu nome e o link amigável (ex.: F2186).
 * [2026-10-14] Alterado: de <table> para cartões por linha — Rafael Brito
 */
function TableEditor({ id, def, rows, onChange }: { id: string; def: AttributeDef; rows: string[][]; onChange: (v: string[][]) => void }) {
  const t = useT();
  const setCell = (r: number, c: number, v: string) => onChange(rows.map((row, i) => (i === r ? def.columns.map((_, j) => (j === c ? v : row[j] ?? '')) : row)));
  const move = (r: number, d: -1 | 1) => {
    const to = r + d;
    if (to < 0 || to >= rows.length) return;
    const next = [...rows];
    [next[r], next[to]] = [next[to]!, next[r]!];
    onChange(next);
  };
  return (
    <div className="tablerows">
      {rows.map((row, r) => (
        <div key={r} className="rowcard" data-row={r}>
          <div className="rowctl">
            <span className="rownum">#{r + 1}</span>
            <button aria-label={t.attrs.rowUp} title={t.attrs.rowUp} onClick={() => move(r, -1)} disabled={r === 0}>↑</button>
            <button aria-label={t.attrs.rowDown} title={t.attrs.rowDown} onClick={() => move(r, 1)} disabled={r === rows.length - 1}>↓</button>
            <button aria-label={t.attrs.removeRow} title={t.attrs.removeRow} onClick={() => onChange(rows.filter((_, i) => i !== r))}>×</button>
          </div>
          {def.columns.map((c, ci) => (
            <label key={c.id} className="cell">
              <span className="lab">{c.name}</span>
              <TextField id={`${id}:${r}:${ci}`} type={c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'} value={row[ci] ?? ''} label={`${c.name} ${r + 1}`} onCommit={(v) => setCell(r, ci, v)} />
              {c.type === 'url' && isHttp(row[ci] ?? '') && <a className="ext" href={row[ci]} target="_blank" rel="noopener noreferrer" title={row[ci]}>{friendlyUrl(row[ci]!)} ↗</a>}
            </label>
          ))}
        </div>
      ))}
      <button data-action="add-row" onClick={() => onChange([...rows, def.columns.map(() => '')])}>+ {t.attrs.addRow}</button>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ aba
export function AttributesTab({ node, model }: { node: ProcessNode; model: ProcessModel }) {
  const t = useT();
  const { setAttr, patchNode } = useEditor();
  const [dialog, setDialog] = useState<{ editId?: string } | null>(null);

  const valueOf = (defId: string): AttrValue | undefined => node.attributes.find((a) => a.defId === defId)?.value;
  const applicable = model.attributeDefs.filter((d) => !d.appliesTo || d.appliesTo.includes(node.kind) || valueOf(d.id) !== undefined);
  const free = node.attributes.filter((a) => !a.defId);

  return (
    <div className="attrs" data-attrs>
      <div className="attrbar">
        <button className="link" data-action="add-attr-def" onClick={() => setDialog({})}>+ {t.attrs.addNew}</button>
        {model.attributeDefs.length > 0 && <button data-action="manage-attrs" onClick={() => setDialog({ editId: model.attributeDefs[0]!.id })}>{t.attrs.manage}</button>}
      </div>

      {applicable.length === 0 && <p className="fhint">{t.attrs.empty}</p>}
      {applicable.map((d) => {
        const v = valueOf(d.id) ?? emptyAttrValue(d);
        return (
          <section key={d.id} className="attrdef" data-def={d.name}>
            <header>
              <strong>{d.name}</strong>
              <span className="typebadge">{t.attrType[d.type]}</span>
              {!isEmptyAttrValue(v) && <button aria-label={`${t.attrs.clear} ${d.name}`} title={t.attrs.clear} onClick={() => setAttr(node.id, d.id, emptyAttrValue(d))}>×</button>}
            </header>
            {d.description && <p className="fhint">{d.description}</p>}
            <ValueEditor id={`${node.id}:${d.id}`} def={d} value={v} onChange={(nv) => setAttr(node.id, d.id, nv)} />
          </section>
        );
      })}

      {free.length > 0 && (
        <section className="attrdef">
          <header><strong>{t.attrs.free}</strong></header>
          {free.map((a) => (
            <div key={a.name} className="attrrow">
              <strong title={a.name}>{a.name}</strong>
              <TextField id={`free:${a.name}`} value={typeof a.value === 'string' ? a.value : JSON.stringify(a.value)} label={a.name}
                onCommit={(v) => patchNode(node.id, { attributes: node.attributes.map((x) => (x === a ? { ...x, value: v } : x)) })} />
              <button aria-label={`remove ${a.name}`} onClick={() => patchNode(node.id, { attributes: node.attributes.filter((x) => x !== a) })}>×</button>
            </div>
          ))}
        </section>
      )}

      {dialog && <AttributeDefDialog model={model} initialEditId={dialog.editId} onClose={() => setDialog(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------------------------ diálogo de definições
const KIND_GROUPS: Array<{ key: 'activities' | 'events' | 'gateways' | 'data' | 'annotations'; kinds: NodeKind[] }> = [
  { key: 'activities', kinds: ['task', 'subprocess'] },
  { key: 'events', kinds: ['start', 'end', 'intermediate', 'boundary'] },
  { key: 'gateways', kinds: ['gateway'] },
  { key: 'data', kinds: ['dataObject', 'dataStore'] },
  { key: 'annotations', kinds: ['annotation'] },
];

interface Draft { name: string; description: string; type: AttributeDef['type']; options: string; columns: Array<{ id?: string; name: string; type: 'text' | 'number' | 'date' | 'url' }>; all: boolean; groups: string[] }
const emptyDraft = (): Draft => ({ name: '', description: '', type: 'textarea', options: '', columns: [{ name: '', type: 'text' }], all: true, groups: ['activities'] });
const draftOf = (d: AttributeDef): Draft => ({
  name: d.name, description: d.description ?? '', type: d.type, options: d.options.join('\n'),
  columns: d.columns.length ? d.columns.map((c) => ({ id: c.id, name: c.name, type: c.type })) : [{ name: '', type: 'text' }],
  all: !d.appliesTo, groups: d.appliesTo ? KIND_GROUPS.filter((g) => g.kinds.some((k) => d.appliesTo!.includes(k))).map((g) => g.key) : ['activities'],
});

function AttributeDefDialog({ model, initialEditId, onClose }: { model: ProcessModel; initialEditId?: string; onClose: () => void }) {
  const t = useT();
  const { addAttrDef, updateAttrDef, deleteAttrDef } = useEditor();
  const [editId, setEditId] = useState<string | undefined>(initialEditId);
  const current = model.attributeDefs.find((d) => d.id === editId);
  const [draft, setDraft] = useState<Draft>(() => (current ? draftOf(current) : emptyDraft()));
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => { setDraft((d) => ({ ...d, ...p })); setError(null); };

  const pick = (id?: string) => {
    setEditId(id);
    const d = model.attributeDefs.find((x) => x.id === id);
    setDraft(d ? draftOf(d) : emptyDraft());
    setError(null);
  };

  const save = () => {
    const spec = {
      name: draft.name, description: draft.description || undefined, type: draft.type,
      options: OPTION_TYPES.has(draft.type) ? draft.options.split('\n') : [],
      columns: draft.type === 'table' ? draft.columns.filter((c) => c.name.trim()) : [],
      appliesTo: draft.all ? [] : KIND_GROUPS.filter((g) => draft.groups.includes(g.key)).flatMap((g) => g.kinds),
    };
    if (!spec.name.trim()) { setError('—'); return; }
    if (editId) {
      const err = updateAttrDef(editId, spec);
      if (err) setError(err); else onClose();
    } else {
      const r = addAttrDef(spec);
      if (r.error) setError(r.error); else onClose();
    }
  };

  const typeChanged = !!current && current.type !== draft.type;

  // Esc fecha o diálogo mesmo se o foco se perdeu (ex.: o botão clicado foi removido do DOM) — e NÃO vaza para o atalho global
  // (que desmarcaria o elemento selecionado atrás do diálogo).
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); } };
    window.addEventListener('keydown', onEsc, true);
    return () => window.removeEventListener('keydown', onEsc, true);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={t.attrs.dialogTitle} data-dialog="attr-def">
        <header><h2>{t.attrs.dialogTitle}</h2><button aria-label={t.attrs.close} onClick={onClose}>×</button></header>
        <div className="modal-body">
          <nav className="deflist" aria-label={t.attrs.existing}>
            <h3>{t.attrs.existing}</h3>
            {model.attributeDefs.length === 0 && <p className="fhint">{t.attrs.noDefs}</p>}
            {model.attributeDefs.map((d) => (
              <button key={d.id} className={d.id === editId ? 'on' : ''} onClick={() => pick(d.id)}>{d.name}<span className="typebadge">{t.attrType[d.type]}</span></button>
            ))}
            <button className={!editId ? 'on' : ''} data-action="new-def" onClick={() => pick(undefined)}>+ {t.attrs.newDef}</button>
          </nav>

          <div className="defform">
            <Field label={t.attrs.defName}>
              <input aria-label={t.attrs.defName} value={draft.name} autoFocus onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label={t.attrs.defDescription}>
              <textarea aria-label={t.attrs.defDescription} rows={3} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
            </Field>
            <Field label={t.attrs.defType}>
              <select aria-label={t.attrs.defType} value={draft.type} onChange={(e) => set({ type: e.target.value as AttributeDef['type'] })}>
                {ATTR_TYPES.map((k) => <option key={k} value={k}>{t.attrType[k]}</option>)}
              </select>
            </Field>
            {typeChanged && <p className="fhint warn">{t.attrs.typeChangeWarn}</p>}

            {OPTION_TYPES.has(draft.type) && (
              <Field label={t.attrs.defOptions}>
                <textarea aria-label={t.attrs.defOptions} rows={4} value={draft.options} onChange={(e) => set({ options: e.target.value })} />
              </Field>
            )}

            {draft.type === 'table' && (
              <div className="field">
                <span className="lab">{t.attrs.defColumns}</span>
                {draft.columns.map((c, i) => (
                  <div key={i} className="colrow">
                    <input aria-label={t.attrs.columnName} placeholder={t.attrs.columnName} value={c.name}
                      onChange={(e) => set({ columns: draft.columns.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                    <select aria-label={t.attrs.defType} value={c.type} onChange={(e) => set({ columns: draft.columns.map((x, j) => (j === i ? { ...x, type: e.target.value as 'text' } : x)) })}>
                      {COLUMN_TYPES.map((k) => <option key={k} value={k}>{t.colType[k]}</option>)}
                    </select>
                    <button aria-label="remove column" disabled={draft.columns.length <= 1} onClick={() => set({ columns: draft.columns.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                <button data-action="add-column" onClick={() => set({ columns: [...draft.columns, { name: '', type: 'text' }] })}>+ {t.attrs.addColumn}</button>
              </div>
            )}

            <div className="field">
              <span className="lab">{t.attrs.appliesTo}</span>
              <label className="check"><input type="checkbox" checked={draft.all} onChange={(e) => set({ all: e.target.checked })} /> {t.attrs.allElements}</label>
              {!draft.all && KIND_GROUPS.map((g) => (
                <label key={g.key} className="check">
                  <input type="checkbox" checked={draft.groups.includes(g.key)} onChange={(e) => set({ groups: e.target.checked ? [...draft.groups, g.key] : draft.groups.filter((x) => x !== g.key) })} /> {t.kindGroups[g.key]}
                </label>
              ))}
            </div>

            {error && error !== '—' && <p className="formerr" role="alert">{error}</p>}
            <div className="modal-actions">
              {editId && <button className="danger" data-action="delete-def" onClick={() => { if (window.confirm(t.attrs.confirmDelete)) { deleteAttrDef(editId); pick(undefined); } }}>{t.attrs.deleteDef}</button>}
              <span className="spacer" />
              <button onClick={onClose}>{t.attrs.close}</button>
              <button className="primary" data-action="save-def" disabled={!draft.name.trim()} onClick={save}>{editId ? t.attrs.save : t.attrs.create}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
