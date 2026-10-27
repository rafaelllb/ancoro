/**
 * Shell do editor: barra superior, lista de processos + paleta, canvas, painel; atalhos; exportação.
 * [2026-10-14] Criado: Fase 2 / etapa 1 (visualizador) — Rafael Brito
 * [2026-10-14] Alterado: Fase 2 etapas 2-4 — atalhos (undo/redo/delete/F2/setas/Esc), exportar .bpmn, paleta — Rafael Brito
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toBpmnXml } from '@ancoro/process-core';
import { ProcessCanvas } from './canvas/ProcessCanvas';
import { useLang, useT } from './i18n';
import { openFile } from './io';
import { Palette } from './panel/Palette';
import { PropertiesPanel } from './panel/PropertiesPanel';
import { useEditor } from './store';
import { useUi } from './ui';
import { ConflictDialog, HostBar, VersionsDialog } from './HostUi';
import { IS_HOST, notify, saveToHost, useHost } from './host';

/** true quando o foco está num campo de texto: atalhos globais não devem roubar teclas dali */
const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);

export function App() {
  const t = useT();
  const { lang, setLang } = useLang();
  const ed = useEditor();
  const { processes, currentId, trail, error, toast, dirty, past, future, selectedId, armed, editing, readOnly } = ed;
  const hostReady = useHost((s) => s.ready);
  const { rightOpen, leftOpen, toggleRight, toggleLeft } = useUi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const model = processes.find((p) => p.id === currentId) ?? null;
  const loadedIds = useMemo(() => new Set(processes.map((p) => p.id)), [processes]);

  const handleFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const { models, warnings } = await openFile(file);
      if (!models.length) throw new Error('0 processos');
      useEditor.getState().addProcesses(models, warnings);
    } catch (e) {
      useEditor.getState().setError(`${t.loadError}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [t.loadError]);

  const exportBpmn = useCallback(async () => {
    const m = useEditor.getState().processes.find((p) => p.id === useEditor.getState().currentId);
    if (!m) return;
    try {
      const xml = await toBpmnXml(m);
      const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${m.name.replace(/[^\w.-]+/g, '_') || m.id}.bpmn`;
      a.click();
      URL.revokeObjectURL(url);
      useEditor.getState().showToast(t.toast.exported);
    } catch (e) {
      useEditor.getState().setError(e instanceof Error ? e.message : String(e));
    }
  }, [t.toast.exported]);

  // ---- atalhos globais
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !isTyping(e.target)) { e.preventDefault(); e.shiftKey ? s.redo() : s.undo(); return; }
      if (mod && e.key.toLowerCase() === 'y' && !isTyping(e.target)) { e.preventDefault(); s.redo(); return; }
      // [2026-10-15] Alterado: no modo host Ctrl+S SALVA no servidor (exportar .bpmn continua no botão) — Rafael Brito
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (IS_HOST) void saveToHost(); else void exportBpmn(); return; }
      // [2026-10-14] Criado: Ctrl+B oculta/mostra a paleta; Ctrl+Shift+B as propriedades (convenção de IDEs) — Rafael Brito
      if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); e.shiftKey ? useUi.getState().toggleRight() : useUi.getState().toggleLeft(); return; }
      if (isTyping(e.target)) return;
      if (e.key === 'Escape') { if (s.armed) s.arm(null); else s.select(null); return; }
      if (s.readOnly && ['Delete', 'Backspace', 'F2', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); s.deleteSelected(); return; }
      if ((e.key === 'F2' || e.key === 'Enter') && s.selectedId) { e.preventDefault(); s.startEditing(s.selectedId); return; }
      const step = e.shiftKey ? 50 : 10;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const a = arrows[e.key];
      if (a && s.selectedId) { e.preventDefault(); s.nudge(a[0], a[1]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exportBpmn]);

  // aviso ao fechar com alterações não exportadas (o autosave local protege contra F5, não contra perder o arquivo)
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => { if (useEditor.getState().dirty.length) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  return (
    <div className={`app${dragOver ? ' drag' : ''}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { setDragOver(false); if (e.dataTransfer.files.length) { e.preventDefault(); void handleFile(e.dataTransfer.files[0]); } }}>
      <header>
        <strong>{t.app}</strong>
        {trail.length > 0 && <button onClick={ed.back}>← {t.back}</button>}
        {/* modo host: o processo vem do servidor; criar/abrir arquivo/exemplo locais não se aplicam */}
        {!IS_HOST && <button onClick={ed.createProcess} data-action="new">{t.newProcess}</button>}
        {!IS_HOST && <button onClick={() => inputRef.current?.click()} title={t.openHint}>{t.openFile}</button>}
        {!IS_HOST && <button onClick={ed.loadSample} data-action="sample">{t.loadSample}</button>}
        {!IS_HOST && <span className="sep" />}
        {!readOnly && <button onClick={ed.undo} disabled={!past.length} data-action="undo" title="Ctrl+Z">↶ {t.undo}</button>}
        {!readOnly && <button onClick={ed.redo} disabled={!future.length} data-action="redo" title="Ctrl+Y">↷ {t.redo}</button>}
        <span className="spacer" />
        {model && <button onClick={ed.requestFit}>{t.fit}</button>}
        <button className={`toggle${leftOpen ? ' on' : ''}`} onClick={toggleLeft} data-action="toggle-left" aria-pressed={leftOpen} title={`${leftOpen ? t.ui.hideLeft : t.ui.showLeft} (Ctrl+B)`}>◧ {t.ui.showLeft}</button>
        {model && <button className={`toggle${rightOpen ? ' on' : ''}`} onClick={toggleRight} data-action="toggle-right" aria-pressed={rightOpen} title={`${rightOpen ? t.ui.hideRight : t.ui.showRight} (Ctrl+Shift+B)`}>◨ {t.ui.showRight}</button>}
        {model && <button onClick={() => void exportBpmn()} data-action="export" title="Ctrl+S">{t.exportBpmn}</button>}
        {IS_HOST && hostReady && <HostBar />}
        {!IS_HOST && <button onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}>{lang === 'pt' ? 'EN' : 'PT'}</button>}
        <input ref={inputRef} type="file" accept=".bpm,.bpmn,.xml" hidden onChange={(e) => { void handleFile(e.target.files?.[0]); e.target.value = ''; }} />
      </header>
      {error && <div className="error" role="alert" onClick={() => ed.setError(null)}>{error}</div>}
      <div className={`body${leftOpen ? '' : ' left-closed'}${rightOpen && model ? '' : ' right-closed'}`}>
        <nav className="side" aria-label={t.processes}>
          {!IS_HOST && <div className="list">
            <h3>{t.processes}</h3>
            {processes.map((p) => (
              <button key={p.id} className={p.id === currentId ? 'on' : ''} onClick={() => ed.openProcess(p.id)}>
                {p.name}{dirty.includes(p.id) && <span className="dirty" title={t.dirty}> •</span>}
              </button>
            ))}
          </div>}
          {model && !readOnly && <Palette />}
        </nav>
        <main>
          {model ? (
            <ProcessCanvas key={model.id} model={model} loadedProcessIds={loadedIds} onOpenProcess={(id) => (IS_HOST ? notify('navigate', { key: id }) : ed.openProcess(id, true))} />
          ) : (
            IS_HOST ? <div className="empty"><p>{t.host.loading}</p></div> : <div className="empty"><h2>{t.emptyTitle}</h2><p>{t.emptyBody}</p></div>
          )}
          {toast && <div className="toast" role="status">{toast}</div>}
        </main>
        {model && rightOpen && <PropertiesPanel model={model} />}
      </div>
      {IS_HOST && <ConflictDialog />}
      {IS_HOST && <VersionsDialog />}
      <span hidden data-state={JSON.stringify({ selectedId, armed: armed?.id ?? null, editing })} id="ps-state" />
    </div>
  );
}
