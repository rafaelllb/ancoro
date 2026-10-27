/**
 * Estado global do editor (zustand): processos, seleção, edição com histórico (undo/redo), ferramenta armada, autosave.
 *
 * [2026-10-14] Criado: Fase 2 / etapa 1 — visualizador — Rafael Brito
 * [2026-10-14] Alterado: Fase 2 etapas 2-4 — todas as mutações passam por `edit()` (única porta de escrita) — Rafael Brito
 *
 * Decisões:
 * - Histórico por SNAPSHOT do modelo (imutável => compartilhamento estrutural barato), não por patches: simples e à prova de bugs.
 *   Cada entrada guarda o id do processo, então desfazer funciona mesmo depois de trocar de processo via drill-down.
 * - Arrastos (mover elemento, redimensionar lane) são UMA entrada de histórico: `beginDrag` guarda a base,
 *   `dragEdit` recalcula SEMPRE a partir da base (sem acumular erro de arredondamento), `endDrag` empilha.
 * - Autosave em localStorage (debounce): o trabalho sobrevive a F5. O formato de verdade é o .bpmn exportado.
 *
 * TODO [ESTIGMERGIA]: histórico ilimitado em memória
 * - Capado em 100 snapshots. Para modelos muito grandes (>1k nós) trocar por patches (immer/ jsondiffpatch).
 * TODO [ESTIGMERGIA]: autosave só local
 * - Sem sincronização entre abas/dispositivos. Na Fase 4 a persistência real vem do PersistencePort do core.
 */
import { create } from 'zustand';
import {
  addFlow, addLane, addNode, addNodeAfter, addParticipant, canConnect, deleteElements, billingSample, layoutModel, moveNodes, newProcess, nodeAt,
  parseModel, renameProcess, resizeLane, setNodeLane, snap, updateFlow, updateLane, updateMeta, updateNode, updateParticipant,
  addAttributeDef, autoRouteFlow, changeNodeKind, deleteAttributeDef, setLabelOffset, setNodeAttribute, updateAttributeDef,
  type AttributeDefSpec, type AttrValue, type FlowPatch, type NodePatch, type Point, type ProcessMeta, type ProcessModel,
} from '@ancoro/process-core';
import { currentT } from './i18n';
import type { ToolSpec } from './tools';

const MAX_HISTORY = 100;
const AUTOSAVE_KEY = 'ps-autosave-v1';
// [2026-10-15] Criado: embutido no Ancoro (iframe ?host=1) a fonte da verdade é o servidor — sem autosave local — Rafael Brito
const EMBEDDED = new URLSearchParams(location.search).get('host') === '1';

interface Snap { id: string; model: ProcessModel }

interface EditorState {
  processes: ProcessModel[];
  currentId: string | null;
  /** pilha de processos visitados via drill-down (para "Voltar") */
  trail: string[];
  selectedId: string | null;
  warnings: string[];
  error: string | null;
  toast: string | null;
  fitSignal: number;
  /** ferramenta de inserção armada (clique no diagrama para soltar) */
  armed: ToolSpec | null;
  /** id do elemento cujo nome está sendo editado inline */
  editing: string | null;
  past: Snap[];
  future: Snap[];
  dirty: string[];
  drag: { base: ProcessModel } | null;
  /** [2026-10-15] modo somente leitura (CLIENT no Ancoro): nenhuma edição passa por edit()/arrasto */
  readOnly: boolean;
  /** substitui TUDO pelo processo vindo do servidor (modo host) e zera histórico/dirty */
  replaceAll: (model: ProcessModel, readOnly: boolean) => void;
  markClean: () => void;
  /**
   * [2026-10-19] Criado: "restaurar versão" = carregar o conteúdo da versão como RASCUNHO não salvo (dirty + desfazível).
   * Nada é gravado no servidor: só o botão Salvar cria uma nova versão — Rafael Brito
   */
  loadDraft: (model: ProcessModel) => boolean;

  addProcesses: (models: ProcessModel[], warnings?: string[]) => void;
  loadSample: () => void;
  createProcess: () => void;
  openProcess: (id: string, viaDrill?: boolean) => void;
  back: () => void;
  select: (id: string | null) => void;
  setError: (msg: string | null) => void;
  showToast: (msg: string) => void;
  requestFit: () => void;
  arm: (tool: ToolSpec | null) => void;
  startEditing: (id: string | null) => void;

  placeTool: (tool: ToolSpec, at: Point) => void;
  connect: (sourceId: string, targetId: string) => boolean;
  /** [2026-10-27] cria um nó da paleta já ligado ao elemento `sourceId` que está no canvas */
  addAfter: (sourceId: string, tool: ToolSpec) => boolean;
  deleteSelected: () => void;
  rename: (id: string, text: string) => void;
  patchNode: (id: string, patch: NodePatch) => void;
  patchFlow: (id: string, patch: FlowPatch) => void;
  patchLane: (id: string, patch: { name?: string; description?: string; fill?: string }) => void;
  patchParticipant: (id: string, patch: { name?: string; description?: string }) => void;
  patchMeta: (patch: Partial<ProcessMeta>) => void;
  resetLabel: (id: string) => void;
  /** volta uma linha ao roteamento automático (descarta o traçado manual) */
  autoRoute: (flowId: string) => void;
  /** tarefa <-> subprocesso (campo Variante); `variant` só vale para tarefa */
  changeKind: (id: string, kind: 'task' | 'subprocess', variant?: string) => void;
  /** atributos estendidos: devolvem a mensagem de erro (para o diálogo mostrar inline) ou null se deu certo; addAttrDef devolve o id criado em `id` */
  addAttrDef: (spec: AttributeDefSpec) => { id?: string; error?: string };
  updateAttrDef: (id: string, patch: Partial<AttributeDefSpec>) => string | null;
  deleteAttrDef: (id: string) => void;
  setAttr: (nodeId: string, defId: string, value: AttrValue) => void;
  assignLane: (nodeId: string, laneId: string) => void;
  nudge: (dx: number, dy: number) => void;
  setProcessName: (name: string) => void;

  beginDrag: () => void;
  dragEdit: (fn: (base: ProcessModel) => ProcessModel) => void;
  endDrag: () => void;
  undo: () => void;
  redo: () => void;
}

/** Modelos sem nenhuma geometria (ex.: gerados por IA) passam pelo auto-layout antes de desenhar. */
export function ensureGeometry(m: ProcessModel): ProcessModel {
  return m.nodes.length > 0 && m.nodes.every((n) => !n.bounds) ? layoutModel(m) : m;
}

// ---- autosave ------------------------------------------------------------------------------------
function loadAutosave(): Pick<EditorState, 'processes' | 'currentId' | 'dirty'> {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return { processes: [], currentId: null, dirty: [] };
    const data = JSON.parse(raw) as { processes: unknown[]; currentId: string | null; dirty?: string[] };
    const processes = data.processes.map((p) => parseModel(p)); // revalida: dado corrompido não derruba o editor
    return { processes, currentId: processes.some((p) => p.id === data.currentId) ? data.currentId : processes[0]?.id ?? null, dirty: data.dirty ?? [] };
  } catch {
    return { processes: [], currentId: null, dirty: [] };
  }
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
const stamp = (m: ProcessModel): ProcessModel => ({ ...m, meta: { ...m.meta, modifiedAt: new Date().toISOString() } });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const useEditor = create<EditorState>((set, get) => {
  const current = (): ProcessModel | null => {
    const s = get();
    return s.processes.find((p) => p.id === s.currentId) ?? null;
  };
  const toast = (msg: string) => {
    set({ toast: msg });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toast: null }), 4500);
  };
  const withDirty = (s: EditorState, id: string) => (s.dirty.includes(id) ? s.dirty : [...s.dirty, id]);

  /** ÚNICA porta de escrita no modelo. `fn` pura; erros viram toast e nada muda. Devolve true se algo mudou. */
  const edit = (fn: (m: ProcessModel) => ProcessModel, opts: { select?: string | null; rename?: boolean } = {}): boolean => {
    const m = current();
    if (!m || get().readOnly) return false;
    let next: ProcessModel;
    try {
      next = fn(m);
    } catch (e) {
      toast(`${currentT().toast['invalid-edit']}: ${errMsg(e)}`);
      return false;
    }
    if (next === m) return false;
    next = stamp(next); // [2026-10-14] Criado: carimbo de modificação (metadado do processo) — Rafael Brito
    set((s) => ({
      processes: s.processes.map((p) => (p.id === m.id ? next : p)),
      past: [...s.past.slice(-(MAX_HISTORY - 1)), { id: m.id, model: m }],
      future: [],
      dirty: withDirty(s, m.id),
      ...(opts.select !== undefined && { selectedId: opts.select }),
      ...(opts.rename && opts.select ? { editing: opts.select } : {}),
    }));
    return true;
  };

  const initial = EMBEDDED ? { processes: [] as ProcessModel[], currentId: null, dirty: [] as string[] } : loadAutosave();

  return {
    ...initial,
    trail: [], selectedId: null, warnings: [], error: null, toast: null, fitSignal: 0, armed: null, editing: null,
    past: [], future: [], drag: null, readOnly: false,
    replaceAll: (model, readOnly) => {
      set({ processes: [model], currentId: model.id, trail: [], selectedId: null, editing: null, armed: null, past: [], future: [], dirty: [], drag: null, readOnly, error: null, warnings: [] });
      get().requestFit();
    },
    markClean: () => set({ dirty: [] }),
    // passa por edit(): entra no histórico (Ctrl+Z volta ao estado anterior), marca dirty e respeita readOnly.
    // O id do processo atual é mantido (a versão antiga pode ter sido criada com outro id de modelo).
    loadDraft: (model) => {
      const incoming = ensureGeometry(model);
      return edit((m) => ({ ...incoming, id: m.id }), { select: null });
    },

    addProcesses: (models, warnings = []) => {
      if (!models.length) return;
      const incoming = models.map(ensureGeometry);
      const ids = new Set(incoming.map((m) => m.id));
      set((s) => ({
        // reabrir o mesmo arquivo substitui os processos de mesmo id em vez de duplicar
        processes: [...s.processes.filter((p) => !ids.has(p.id)), ...incoming],
        currentId: incoming[0]!.id, trail: [], selectedId: null, warnings, error: null, editing: null,
        past: s.past.filter((x) => !ids.has(x.id)), future: s.future.filter((x) => !ids.has(x.id)),
        dirty: s.dirty.filter((d) => !ids.has(d)),
      }));
    },
    loadSample: () => get().addProcesses([billingSample()]),
    createProcess: () => {
      const t = currentT();
      const m = newProcess(get().processes.map((p) => p.id), t.newProcessName);
      set((s) => ({ processes: [...s.processes, m], currentId: m.id, trail: [], selectedId: null, dirty: [...s.dirty, m.id], warnings: [], error: null }));
      get().requestFit();
    },
    openProcess: (id, viaDrill = false) =>
      set((s) => ({ trail: viaDrill && s.currentId ? [...s.trail, s.currentId] : [], currentId: id, selectedId: null, editing: null, armed: null })),
    back: () => set((s) => {
      const prev = s.trail[s.trail.length - 1];
      return prev ? { currentId: prev, trail: s.trail.slice(0, -1), selectedId: null, editing: null } : {};
    }),
    select: (id) => set({ selectedId: id }),
    setError: (error) => set({ error }),
    showToast: toast,
    requestFit: () => set((s) => ({ fitSignal: s.fitSignal + 1 })),
    arm: (armed) => set({ armed, selectedId: armed ? null : get().selectedId }),
    startEditing: (id) => set({ editing: get().readOnly ? null : id }),

    placeTool: (tool, at) => {
      const t = currentT();
      if (tool.type === 'lane') {
        edit((m) => addLane(m, t.defaults.lane).model, { select: undefined });
        const m = current();
        set({ selectedId: m?.lanes[m.lanes.length - 1]?.id ?? null, armed: null });
        return;
      }
      if (tool.type === 'participant') {
        edit((m) => addParticipant(m, t.defaults.participant).model);
        const m = current();
        set({ selectedId: m?.participants[m.participants.length - 1]?.id ?? null, armed: null });
        return;
      }
      const kind = tool.kind!;
      let hostId: string | undefined;
      if (kind === 'boundary') {
        const m = current();
        const host = m ? nodeAt(m, at) : undefined;
        if (!host || (host.kind !== 'task' && host.kind !== 'subprocess')) { toast(t.toast['boundary-needs-host']); return; }
        hostId = host.id;
      }
      const name = kind === 'task' ? t.defaults.task : kind === 'subprocess' ? t.defaults.subprocess : kind === 'annotation' ? t.defaults.annotation
        : kind === 'dataStore' ? t.defaults.dataStore : kind === 'dataObject' ? t.defaults.dataObject : '';
      let newId = '';
      const ok = edit((m) => {
        const r = addNode(m, { kind, variant: tool.variant, throw: tool.throw, name, at, attachedToId: hostId });
        newId = r.id;
        return r.model;
      });
      if (ok) set({ selectedId: newId, armed: null, editing: ['task', 'subprocess', 'annotation', 'dataStore', 'dataObject', 'gateway'].includes(kind) ? newId : null });
    },

    connect: (sourceId, targetId) => {
      const m = current();
      if (!m) return false;
      const why = canConnect(m, sourceId, targetId);
      if (why) { toast((currentT().toast as Record<string, string>)[why] ?? why); return false; }
      let id = '';
      const ok = edit((x) => { const r = addFlow(x, { sourceId, targetId }); id = r.id; return r.model; });
      if (ok) set({ selectedId: id });
      return ok;
    },

    // [2026-10-27] Criado: criar a partir de um objeto já no canvas (menu "+" do elemento selecionado) — Rafael Brito
    addAfter: (sourceId, tool) => {
      if (tool.type !== 'node' || !tool.kind) return false;
      const kind = tool.kind;
      const t = currentT();
      const name = kind === 'task' ? t.defaults.task : kind === 'subprocess' ? t.defaults.subprocess : kind === 'annotation' ? t.defaults.annotation
        : kind === 'dataStore' ? t.defaults.dataStore : kind === 'dataObject' ? t.defaults.dataObject : '';
      let newId = '';
      const ok = edit((m) => {
        const r = addNodeAfter(m, sourceId, { kind, variant: tool.variant, throw: tool.throw, name });
        newId = r.id;
        return r.model;
      });
      if (ok) set({ selectedId: newId, armed: null, editing: ['task', 'subprocess', 'annotation', 'dataStore', 'dataObject', 'gateway'].includes(kind) ? newId : null });
      return ok;
    },

    deleteSelected: () => {
      const { selectedId } = get();
      const m = current();
      if (!selectedId || !m) return;
      if (selectedId === m.id) { toast(currentT().toast['cannot-delete-pool']); return; }
      edit((x) => deleteElements(x, [selectedId]), { select: null });
    },

    rename: (id, text) => {
      set({ editing: null });
      const name = text.trim();
      edit((m) => {
        if (id === m.id) return renameProcess(m, name || m.name);
        if (m.nodes.some((n) => n.id === id)) return updateNode(m, id, { name });
        if (m.flows.some((f) => f.id === id)) return updateFlow(m, id, { name });
        if (m.lanes.some((l) => l.id === id)) return updateLane(m, id, { name });
        if (m.participants.some((p) => p.id === id)) return updateParticipant(m, id, { name });
        return m;
      });
    },

    patchNode: (id, patch) => { edit((m) => updateNode(m, id, patch)); },
    patchFlow: (id, patch) => { edit((m) => updateFlow(m, id, patch)); },
    patchLane: (id, patch) => { edit((m) => updateLane(m, id, patch)); },
    patchParticipant: (id, patch) => { edit((m) => updateParticipant(m, id, patch)); },
    patchMeta: (patch) => { edit((m) => updateMeta(m, patch)); },
    resetLabel: (id) => { edit((m) => setLabelOffset(m, id, undefined)); },
    autoRoute: (flowId) => { edit((m) => autoRouteFlow(m, flowId)); },
    changeKind: (id, kind, variant) => { edit((m) => changeNodeKind(m, id, kind, variant)); },
    // Valida numa cópia ANTES de gravar: o diálogo precisa do motivo exato (nome repetido, sem opções...), não de um toast genérico.
    addAttrDef: (spec) => {
      const m = current();
      if (!m) return { error: '—' };
      let id = '';
      try { id = addAttributeDef(m, spec).id; } catch (e) { return { error: errMsg(e) }; }
      edit((x) => addAttributeDef(x, spec).model);
      return { id };
    },
    updateAttrDef: (id, patch) => {
      const m = current();
      if (!m) return '—';
      try { updateAttributeDef(m, id, patch); } catch (e) { return errMsg(e); }
      edit((x) => updateAttributeDef(x, id, patch));
      return null;
    },
    deleteAttrDef: (id) => { edit((m) => deleteAttributeDef(m, id)); },
    setAttr: (nodeId, defId, value) => { edit((m) => setNodeAttribute(m, nodeId, defId, value)); },
    assignLane: (nodeId, laneId) => { edit((m) => setNodeLane(m, nodeId, laneId)); },
    nudge: (dx, dy) => {
      const { selectedId } = get();
      if (selectedId) edit((m) => (m.nodes.some((n) => n.id === selectedId && n.kind !== 'boundary') ? moveNodes(m, [selectedId], dx, dy) : m));
    },
    setProcessName: (name) => { edit((m) => renameProcess(m, name.trim() || m.name)); },

    beginDrag: () => { const m = current(); if (m && !get().readOnly) set({ drag: { base: m } }); },
    dragEdit: (fn) => {
      const { drag } = get();
      if (!drag) return;
      let next: ProcessModel;
      try { next = fn(drag.base); } catch (e) { toast(errMsg(e)); return; }
      set((s) => ({ processes: s.processes.map((p) => (p.id === drag.base.id ? next : p)) }));
    },
    endDrag: () => {
      const { drag } = get();
      if (!drag) return;
      const now = get().processes.find((p) => p.id === drag.base.id);
      if (now && now !== drag.base) set((s) => ({ processes: s.processes.map((p) => (p.id === now.id ? stamp(now) : p)) }));
      set((s) => now && now !== drag.base
        ? { drag: null, past: [...s.past.slice(-(MAX_HISTORY - 1)), { id: drag.base.id, model: drag.base }], future: [], dirty: withDirty(s, drag.base.id) }
        : { drag: null });
    },

    undo: () => set((s) => {
      const last = s.past[s.past.length - 1];
      if (!last) return {};
      const now = s.processes.find((p) => p.id === last.id);
      return {
        processes: s.processes.map((p) => (p.id === last.id ? last.model : p)), currentId: last.id,
        past: s.past.slice(0, -1), future: now ? [...s.future, { id: last.id, model: now }] : s.future, editing: null,
        dirty: withDirty(s, last.id), // desfazer depois de salvar volta a diferir do servidor
      };
    }),
    redo: () => set((s) => {
      const next = s.future[s.future.length - 1];
      if (!next) return {};
      const now = s.processes.find((p) => p.id === next.id);
      return {
        processes: s.processes.map((p) => (p.id === next.id ? next.model : p)), currentId: next.id,
        future: s.future.slice(0, -1), past: now ? [...s.past, { id: next.id, model: now }] : s.past, editing: null,
        dirty: withDirty(s, next.id),
      };
    }),
  };
});

// ---- autosave (debounce) -------------------------------------------------------------------------
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useEditor.subscribe((s, prev) => {
  if (EMBEDDED) return;
  if (s.processes === prev.processes && s.currentId === prev.currentId && s.dirty === prev.dirty) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ processes: s.processes, currentId: s.currentId, dirty: s.dirty }));
    } catch { /* cota cheia/storage bloqueado: segue sem persistir; exportar .bpmn continua funcionando */ }
  }, 400);
});

export { snap };
