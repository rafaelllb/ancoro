/**
 * UI exclusiva do modo host (embutido no Ancoro): barra de salvar/versões, diálogo de conflito, histórico de versões e
 * seletor de requisitos com busca no projeto.
 * [2026-10-15] Criado: Fase 4 / etapa 2 — Rafael Brito
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { parseModel } from '@ancoro/process-core';
import { useT } from './i18n';
import { loadFromHost, notify, rpc, saveToHost, useHost } from './host';
import { useEditor } from './store';

export function HostBar() {
  const t = useT();
  const { saving, canEdit, rev } = useHost();
  const dirty = useEditor((s) => s.dirty.length > 0);
  return (
    <>
      {!canEdit && <span className="badge ro-badge" data-testid="ro-badge">{t.host.readOnly}</span>}
      {canEdit && dirty && <span className="badge dirty-badge" data-testid="dirty-badge" title={t.host.unsaved}>● {t.host.unsaved}</span>}
      <span className="muted" title={t.host.rev}>r{rev}</span>
      {canEdit && <button className="primary" data-action="host-save" disabled={saving || !dirty} onClick={() => void saveToHost()} title="Ctrl+S">{saving ? t.host.saving : t.host.save}</button>}
      <button data-action="host-versions" onClick={() => useHost.setState({ versionsOpen: true })}>{t.host.versions}</button>
    </>
  );
}

export function ConflictDialog() {
  const t = useT();
  const conflict = useHost((s) => s.conflict);
  if (!conflict) return null;
  const saveCopy = async () => {
    const ed = useEditor.getState();
    const model = ed.processes.find((p) => p.id === ed.currentId);
    if (!model) return;
    try {
      const r = await rpc<{ id: string }>('process.saveAs', { name: `${model.name} ${t.host.copySuffix}`, model });
      ed.markClean();
      useHost.setState({ conflict: null });
      notify('navigate', { processId: r.id });
    } catch (e) { ed.setError(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="modal-back" role="dialog" aria-modal="true" data-testid="conflict-dialog">
      <div className="modal">
        <h2>{t.host.conflictTitle}</h2>
        <p>{t.host.conflictBody.replace('{rev}', String(conflict.currentRev ?? '?'))}</p>
        <div className="modal-actions">
          <button className="danger" data-action="conflict-reload" onClick={() => void loadFromHost()}>{t.host.reload}</button>
          <button className="primary" data-action="conflict-copy" onClick={() => void saveCopy()}>{t.host.saveCopy}</button>
          <button onClick={() => useHost.setState({ conflict: null })}>{t.host.cancel}</button>
        </div>
      </div>
    </div>
  );
}

interface VersionRow { version: number; label: string | null; rev?: number | null; createdAt: string }

export function VersionsDialog() {
  const t = useT();
  const open = useHost((s) => s.versionsOpen);
  const canEdit = useHost((s) => s.canEdit);
  const [rows, setRows] = useState<VersionRow[] | null>(null);
  const [label, setLabel] = useState('');
  const refresh = useCallback(() => { rpc<{ versions: VersionRow[] }>('versions.list').then((r) => setRows(r.versions)).catch(() => setRows([])); }, []);
  useEffect(() => { if (open) { setRows(null); refresh(); } }, [open, refresh]);
  if (!open) return null;
  const fail = (e: unknown) => useEditor.getState().setError(e instanceof Error ? e.message : String(e));
  const snapshot = () => {
    // o snapshot é do que está SALVO no servidor: se há alterações locais, salva antes para a versão refletir o que o usuário vê
    void (async () => {
      if (useEditor.getState().dirty.length && !(await saveToHost())) return;
      try { await rpc('versions.snapshot', { label: label.trim() || undefined }); setLabel(''); refresh(); useEditor.getState().showToast(t.host.versionSaved); } catch (e) { fail(e); }
    })();
  };
  // [2026-10-19] Alterado: restaurar NÃO salva mais. Carrega a versão no editor como rascunho (dirty, desfazível) e o
  // usuário decide salvar (botão Salvar / Ctrl+S) — salvar é sempre manual. Antes: POST /versions/:v/restore gravava
  // uma nova versão + um snapshot "Antes de restaurar" automaticamente. Por isso a trava "unsavedFirst" saiu: o rascunho
  // atual fica no histórico de desfazer (Ctrl+Z) — Rafael Brito
  const restore = (v: number) => {
    if (!window.confirm(t.host.restoreConfirm)) return;
    void (async () => {
      try {
        const r = await rpc<{ model: unknown }>('versions.get', { version: v });
        if (!useEditor.getState().loadDraft(parseModel(r.model))) return;
        useHost.setState({ versionsOpen: false });
        useEditor.getState().showToast(t.host.restored.replace('{v}', String(v)));
      } catch (e) { fail(e); }
    })();
  };
  return (
    <div className="modal-back" role="dialog" aria-modal="true" data-testid="versions-dialog" onClick={() => useHost.setState({ versionsOpen: false })}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t.host.versionsTitle}</h2>
        {canEdit && (
          <div className="row">
            <input value={label} placeholder={t.host.versionLabel} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            <button className="primary" data-action="version-snapshot" onClick={snapshot}>{t.host.snapshot}</button>
          </div>
        )}
        {rows && rows.length === 0 && <p className="hint">{t.host.noVersions}</p>}
        <ul className="versions">
          {(rows ?? []).map((v) => (
            <li key={v.version} data-version={v.version}>
              <strong>v{v.version}</strong> {v.rev != null && <em className="muted" title={t.host.rev}>r{v.rev}</em>} <span>{v.label ?? '—'}</span> <time>{new Date(v.createdAt).toLocaleString()}</time>
              {canEdit && <button data-action="version-restore" onClick={() => restore(v.version)}>{t.host.restore}</button>}
            </li>
          ))}
        </ul>
        <div className="modal-actions"><button onClick={() => useHost.setState({ versionsOpen: false })}>{t.host.close}</button></div>
      </div>
    </div>
  );
}

interface ReqRow { id: string; reqId: string; shortDesc: string; module: string }

/** Requisitos vinculados como chips + busca no projeto (RPC). Substitui o campo de texto livre no modo host. */
export function ReqPicker({ values, onChange }: { values: string[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ReqRow[]>([]);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);
  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    const h = setTimeout(() => { rpc<{ requirements: ReqRow[] }>('requirements.search', { q: q.trim() }).then((r) => { if (my === seq.current) setRows(r.requirements); }).catch(() => undefined); }, 200);
    return () => clearTimeout(h);
  }, [q, open]);
  const add = (reqId: string) => { if (!values.includes(reqId)) onChange([...values, reqId]); setQ(''); setOpen(false); };
  return (
    <div className="req-picker">
      <div className="tags">
        {values.map((r) => <span key={r} className="tag mono">{r}<button aria-label={`remove ${r}`} onClick={() => onChange(values.filter((x) => x !== r))}>×</button></span>)}
      </div>
      <input className="tag-input" data-testid="req-search" value={q} placeholder={t.host.reqSearch} aria-label={t.host.reqSearch}
        onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setOpen(false); }} />
      {open && (
        <ul className="req-results" role="listbox">
          {rows.length === 0 && <li className="hint">{t.host.reqNone}</li>}
          {rows.map((r) => (
            <li key={r.id} role="option" aria-selected={values.includes(r.reqId)} data-req={r.reqId} onMouseDown={(e) => { e.preventDefault(); add(r.reqId); }}>
              <code>{r.reqId}</code> <span>{r.shortDesc}</span> <em>{r.module}</em>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
