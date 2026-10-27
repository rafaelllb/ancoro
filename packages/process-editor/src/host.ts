/**
 * Modo "host": o editor roda dentro de um <iframe> da aplicação hospedeira (Ancoro) e NÃO fala com nenhuma API:
 * pede tudo à página-pai por postMessage (RPC). O token de autenticação nunca entra aqui.
 *
 * [2026-10-15] Criado: Fase 4 / etapa 2 — ponte RPC com o Ancoro (README §6.4, decisão 1) — Rafael Brito
 *
 * Protocolo (todas as mensagens têm `ps: 1`):
 *   editor -> host   { ps:1, kind:'req', id, type, payload }      pedido; o host responde com
 *   host   -> editor { ps:1, kind:'res', id, ok, data | error:{ status, message, data } }
 *   editor -> host   { ps:1, kind:'event', type:'ready' | 'dirty' | 'navigate', payload }
 *   host   -> editor { ps:1, kind:'event', type:'lang', payload:{ lang } }
 * Pedidos: process.load · process.save {baseRev,model} · process.saveAs {name,model} · versions.list ·
 *          versions.snapshot {label} · versions.get {version} · requirements.search {q}
 *          [2026-10-19] Removido: versions.restore — gravava versão automaticamente; restaurar agora é versions.get + rascunho local + Salvar manual
 * Segurança: só aceita mensagens de `window.parent` cuja origem é a informada em `?origin=` (e só envia para ela).
 */
import { parseModel, type ProcessModel } from '@ancoro/process-core';
import { create } from 'zustand';
import { useEditor, ensureGeometry } from './store';
import { currentT, useLang, type Lang } from './i18n';

const params = new URLSearchParams(location.search);
const parentOrigin = params.get('origin') ?? '';
/** true só quando embutido E com origem declarada: sem origem não há como enviar mensagens com segurança. */
export const IS_HOST = params.get('host') === '1' && window.parent !== window && !!parentOrigin;

export class HostError extends Error {
  constructor(message: string, public status: number, public data?: Record<string, unknown>) { super(message); }
}

let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
const post = (msg: Record<string, unknown>) => window.parent.postMessage({ ps: 1, ...msg }, parentOrigin);

export function rpc<T = unknown>(type: string, payload?: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new HostError('timeout', 0)); }, 30_000);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    post({ kind: 'req', id, type, payload });
  });
}
export const notify = (type: string, payload?: unknown) => { if (IS_HOST) post({ kind: 'event', type, payload }); };

interface HostState {
  ready: boolean;
  /** identificador do processo no servidor + revisão em que o editor está baseado */
  processId: string | null;
  key: string | null;
  rev: number;
  canEdit: boolean;
  canPublish: boolean;
  saving: boolean;
  conflict: { currentRev?: number } | null;
  versionsOpen: boolean;
}
export const useHost = create<HostState>(() => ({
  ready: false, processId: null, key: null, rev: 0, canEdit: false, canPublish: false, saving: false, conflict: null, versionsOpen: false,
}));

interface LoadedProcess { id: string; key: string; rev: number; model: unknown; permissions: { canEdit: boolean; canPublish: boolean } }

/** (Re)carrega o processo do servidor para o editor, descartando histórico e alterações locais. */
export async function loadFromHost(): Promise<void> {
  const p = await rpc<LoadedProcess>('process.load');
  const model: ProcessModel = ensureGeometry(parseModel(p.model));
  useHost.setState({ ready: true, processId: p.id, key: p.key, rev: p.rev, canEdit: p.permissions.canEdit, canPublish: p.permissions.canPublish, conflict: null });
  useEditor.getState().replaceAll(model, !p.permissions.canEdit);
}

/** Salva no servidor com concorrência otimista. Em conflito (409) abre o diálogo, sem perder o que o usuário fez. */
export async function saveToHost(): Promise<boolean> {
  const ed = useEditor.getState();
  const model = ed.processes.find((p) => p.id === ed.currentId);
  const host = useHost.getState();
  if (!model || host.saving || !host.canEdit) return false;
  useHost.setState({ saving: true });
  try {
    const r = await rpc<{ rev: number; unresolvedRefs: Array<{ ref: string }> }>('process.save', { baseRev: host.rev, model });
    useHost.setState({ rev: r.rev });
    ed.markClean();
    ed.showToast(r.unresolvedRefs.length
      ? `${currentSavedMsg(true)}: ${[...new Set(r.unresolvedRefs.map((u) => u.ref))].join(', ')}`
      : currentSavedMsg(false));
    return true;
  } catch (e) {
    if (e instanceof HostError && e.status === 409) useHost.setState({ conflict: { currentRev: e.data?.currentRev as number | undefined } });
    else ed.setError(e instanceof Error ? e.message : String(e));
    return false;
  } finally {
    useHost.setState({ saving: false });
  }
}
const currentSavedMsg = (unresolved: boolean) => (unresolved ? currentT().host.savedUnresolved : currentT().host.saved);

let started = false;
/** Liga o listener, informa que está pronto e carrega o processo. Idempotente (StrictMode monta duas vezes). */
export function startHost(): void {
  if (!IS_HOST || started) return;
  started = true;
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== window.parent || e.origin !== parentOrigin) return; // nunca confiar em outra origem
    const d = e.data as { ps?: number; kind?: string; id?: number; ok?: boolean; data?: unknown; error?: { status: number; message: string; data?: Record<string, unknown> }; type?: string; payload?: { lang?: Lang } };
    if (d?.ps !== 1) return;
    if (d.kind === 'res' && typeof d.id === 'number') {
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id);
      clearTimeout(p.timer);
      if (d.ok) p.resolve(d.data); else p.reject(new HostError(d.error?.message ?? 'error', d.error?.status ?? 0, d.error?.data));
    } else if (d.kind === 'event' && d.type === 'lang' && d.payload?.lang) useLang.getState().setLang(d.payload.lang);
  });
  // avisa o host sempre que muda o "tem alterações não salvas" (ele bloqueia a navegação do app)
  let last = false;
  useEditor.subscribe((s) => { const dirty = s.dirty.length > 0; if (dirty !== last) { last = dirty; notify('dirty', { dirty }); } });
  const initLang = params.get('lang');
  if (initLang === 'pt' || initLang === 'en') useLang.getState().setLang(initLang);
  notify('ready');
  void loadFromHost().catch((err) => useEditor.getState().setError(err instanceof Error ? err.message : String(err)));
}
