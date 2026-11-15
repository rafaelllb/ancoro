/**
 * Canvas SVG interativo: pan/zoom, seleção, mover (com grade), conectar (arrastando a alça), inserir da paleta,
 * redimensionar lane, renomear inline, drill-down.
 *
 * [2026-10-14] Criado: Fase 2 / etapa 1 (somente leitura) — Rafael Brito
 * [2026-10-14] Alterado: Fase 2 etapas 2-3 — gestos de edição — Rafael Brito
 * Decisões:
 * - Pan/zoom por transform num <g> raiz (não por viewBox): coordenadas do modelo ficam intactas, então
 *   pointer->modelo é uma conta simples (toModel).
 * - UM gesto ativo por vez (ref `gesture`); todo o resto é derivado do modelo. Sem estado de "arrastando" duplicado.
 * - Mover usa o delta TOTAL desde o início do gesto, livre (1px) com ímã de alinhamento, aplicado sobre o modelo-base (ver store.dragEdit).
 * - Wheel com listener nativo não-passivo (React registra wheel como passivo e não deixa preventDefault).
 *
 * [2026-11-10] Alterado: seleção múltipla + redimensionar lanes/pools pela borda inteira — Rafael Brito
 * - Arrastar no fundo (ou sobre lane/pool) desenha um LAÇO: seleciona nós/fluxos/participantes totalmente dentro dele.
 *   Shift/Ctrl soma ao que já estava selecionado; Shift/Ctrl+clique inclui/retira um elemento.
 * - Arrastar um nó que faz parte da seleção move o GRUPO (com ímã sobre a caixa envolvente). Clique sem arrastar volta a seleção a ele.
 * - Pan passou para o botão do meio, botão direito ou Espaço+arrastar (o arrasto esquerdo agora é do laço). Somente leitura mantém pan no esquerdo.
 * - Bordas de lanes (divisórias internas), do pool e dos participantes têm faixas de "pega" invisíveis ao longo de TODO o comprimento
 *   (espessura constante na tela), em vez de uma alça só no meio da linha.
 * TODO [ESTIGMERGIA]: edição de waypoints
 * - Arrastar vértices de fluxos fica para depois (fluxos são auto-roteados; segmentos já se arrastam).
 * TODO [ESTIGMERGIA]: virtualização
 * - Renderiza todos os elementos. Ok para o corpus (≤30 nós); acima de ~500 renderizar só o que intersecta o viewport.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { alignMove, idsInBox, canConnect, canReconnect, flowLabel, isResizable, moveFlowEndpoint, moveFlowSegment, moveNodes, reconnectFlow, whyCannotAddAfter, nodeLabel, resizeLane, resizeNode, resizePool, segmentAxis, setLabelOffset, snap, type AlignGuide, type Bounds, type ProcessModel, type ResizeHandle } from '@ancoro/process-core';
import { useEditor } from '../store';
import { PALETTE, toolById } from '../tools';
import { ToolIcon } from '../panel/Palette';
import { useT } from '../i18n';
import { openCountByElement, useComments, PROCESS_ELEMENT } from '../comments';
import { useUi } from '../ui';
import { DiagramDefs, DiagramLayers, contentBounds } from '@ancoro/process-render';

interface View { x: number; y: number; k: number }
type Gesture =
  | { type: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
  // [2026-11-10] Alterado: move um GRUPO (`ids`); `grab` = nó agarrado; `collapse` = clique sem arrastar reduz a seleção a ele — Rafael Brito
  | { type: 'move'; ids: string[]; grab: string; collapse: boolean; sx: number; sy: number; moved: boolean; last: string }
  // [2026-11-10] Criado: laço de seleção; `base` = seleção anterior mantida (Shift/Ctrl) — Rafael Brito
  | { type: 'marquee'; sx: number; sy: number; additive: boolean; range: boolean; base: string[]; moved: boolean }
  | { type: 'connect'; sourceId: string }
  // [2026-10-27] Criado: clique no "+" do elemento selecionado abre o menu de criação conectada — Rafael Brito
  | { type: 'quick' }
  // [2026-10-15] Criado: redimensionar elemento por qualquer das 8 alças — Rafael Brito
  | { type: 'nresize'; id: string; handle: ResizeHandle; sx: number; sy: number; moved: boolean }
  // [2026-10-27] Criado: redimensionar o pool por qualquer lado/canto — Rafael Brito
  | { type: 'presize'; handle: ResizeHandle; sx: number; sy: number; moved: boolean }
  | { type: 'resize'; laneId: string; startY: number; baseH: number; moved: boolean }
  // [2026-10-14] Criado: arrastar o rótulo (texto) de um elemento/fluxo, independente da forma — Rafael Brito
  // [2026-10-14] Criado: arrastar um segmento da linha de conexão (traçado manual, como no Bizagi) — Rafael Brito
  // [2026-10-14] Criado: arrastar a PONTA da linha: muda o encaixe na borda ou religa a outro elemento — Rafael Brito
  | { type: 'endpoint'; flowId: string; end: 'source' | 'target'; sx: number; sy: number; moved: boolean }
  | { type: 'segment'; flowId: string; index: number; axis: 'h' | 'v'; start: number; moved: boolean }
  | { type: 'label'; id: string; sx: number; sy: number; base: { dx: number; dy: number }; moved: boolean };

export interface ProcessCanvasProps {
  model: ProcessModel;
  /** ids de processos carregados — habilita o drill-down das call activities */
  loadedProcessIds: ReadonlySet<string>;
  onOpenProcess: (processId: string) => void;
}

const MIN_K = 0.1, MAX_K = 4;
const CLICK_SLOP = 4;
/** espessura (px de TELA) da faixa de pega ao longo das bordas de lanes/pools */
const EDGE_HIT = 8;

type EdgePos = ResizeHandle;
const EDGE_CURSOR: Record<EdgePos, string> = { n: 'ns', s: 'ns', e: 'ew', w: 'ew', nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw' };
/** retângulo de pega de uma borda (faixa de espessura `t` ao longo do lado inteiro) ou canto (quadrado 2t) */
function edgeRect(b: Bounds, pos: EdgePos, t: number) {
  if (pos === 'n' || pos === 's') return { x: b.x, y: (pos === 'n' ? b.y : b.y + b.h) - t / 2, width: b.w, height: t };
  if (pos === 'e' || pos === 'w') return { x: (pos === 'w' ? b.x : b.x + b.w) - t / 2, y: b.y, width: t, height: b.h };
  const cx = pos.includes('w') ? b.x : b.x + b.w, cy = pos.includes('n') ? b.y : b.y + b.h;
  return { x: cx - t, y: cy - t, width: 2 * t, height: 2 * t };
}
const ALL_EDGES: EdgePos[] = ['n', 's', 'e', 'w', 'nw', 'ne', 'se', 'sw'];
const isTypingTarget = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, button, [contenteditable]');

export function ProcessCanvas({ model, loadedProcessIds, onOpenProcess }: ProcessCanvasProps) {
  const t = useT();
  const ed = useEditor();
  const { selectedId, selectedIds, armed, editing, fitSignal } = ed;
  const ref = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const gesture = useRef<Gesture | null>(null);
  // guias de alinhamento visíveis durante mover/redimensionar
  const [guides, setGuides] = useState<AlignGuide[]>([]);
  const [quickOpen, setQuickOpen] = useState(false);
  const [rubber, setRubber] = useState<{ x1: number; y1: number; x2: number; y2: number; ok: boolean | null } | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [panning, setPanning] = useState(false);
  // [2026-11-10] balões de comentários em aberto por elemento (só embutido: a lista vem do host) — Rafael Brito
  const commentItems = useComments((s) => s.items);
  const openByEl = useMemo(() => openCountByElement(commentItems), [commentItems]);
  // Espaço pressionado: arrasto esquerdo vira pan (convenção de editores gráficos)
  const space = useRef(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !isTypingTarget(e.target)) { space.current = true; e.preventDefault(); } };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = false; };
    const blur = () => { space.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (!width || !height) return;
    const c = contentBounds(useEditor.getState().processes.find((p) => p.id === model.id) ?? model);
    const k = Math.min(width / c.w, height / c.h, 1.5);
    setView({ k, x: (width - c.w * k) / 2 - c.x * k, y: (height - c.h * k) / 2 - c.y * k });
  }, [model]);

  // enquadra só ao trocar de processo ou sob demanda — nunca a cada edição (o diagrama não pode "pular" enquanto o usuário trabalha)
  useEffect(() => { fit(); }, [model.id, fitSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // zoom ancorado no cursor
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      setView((v) => {
        const k = Math.min(MAX_K, Math.max(MIN_K, v.k * Math.exp(-e.deltaY * 0.0015)));
        const f = k / v.k;
        return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /** modelo-base do arrasto (as guias se calculam sobre os OUTROS elementos, que não se mexem durante o gesto) */
  const model0 = () => useEditor.getState().drag?.base ?? model;

  /** tela -> modelo */
  const toModel = (cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  };
  const idAt = (cx: number, cy: number): string | null => {
    const el = document.elementFromPoint(cx, cy);
    return el?.closest('[data-id]')?.getAttribute('data-id') ?? null;
  };

  /** id de algo ao qual uma linha pode se ligar: nó, participante externo ou o pool do processo */
  const isElement = (id: string) => model.nodes.some((n) => n.id === id) || model.participants.some((x) => x.id === id) || id === model.id;

  const boundsById = useMemo(() => {
    const m = new Map<string, Bounds>();
    model.nodes.forEach((n) => n.bounds && m.set(n.id, n.bounds));
    model.participants.forEach((p) => p.bounds && m.set(p.id, p.bounds));
    if (model.pool) m.set(model.id, model.pool);
    return m;
  }, [model]);

  // ---------------------------------------------------------------- gestos
  /** só nós "normais" se arrastam (boundary acompanha a hospedeira; fluxos/lanes/pool não) */
  const movable = (ids: ReadonlyArray<string>) => {
    const s = new Set(ids);
    return model.nodes.filter((n) => s.has(n.id) && n.kind !== 'boundary').map((n) => n.id);
  };
  const startPan = (e: React.PointerEvent) => {
    gesture.current = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    setPanning(true);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // [2026-11-10] Alterado: botão do meio, direito ou Espaço+esquerdo = pan; esquerdo no fundo = laço de seleção — Rafael Brito
    const panButton = e.button === 1 || e.button === 2 || (e.button === 0 && space.current);
    if (e.button !== 0 && !panButton) return;
    if (e.button === 1) e.preventDefault(); // evita o autoscroll do botão do meio
    const target = e.target as Element;
    // [2026-11-10] protegido: ponteiro sintético/já liberado (ex.: evento de automação) não pode derrubar o canvas
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* segue sem captura */ }
    // [2026-10-15] Criado: somente leitura (CLIENT no Ancoro) — só navegar (pan/zoom/selecionar); nenhuma alça nem arrasto de elementos — Rafael Brito
    // balão de comentários: funciona também em somente leitura (é o caminho do cliente para comentar)
    const bubble = !panButton ? target.closest('[data-handle="comments"]')?.getAttribute('data-for') : null;
    if (bubble) {
      ed.select(bubble === PROCESS_ELEMENT ? null : bubble);
      useUi.setState({ rightOpen: true });
      useUi.getState().setTab('comments');
      gesture.current = null;
      return;
    }
    if (ed.readOnly || panButton) { startPan(e); return; }
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    // [2026-11-10] Shift sozinho = intervalo (da âncora até o clicado); Ctrl/Cmd = incluir/retirar um — Rafael Brito
    const range = e.shiftKey && !e.ctrlKey && !e.metaKey;
    const pick = (id: string) => (range ? ed.selectRange(id) : ed.toggleSelect(id));

    if (target.closest('[data-handle="quick"]')) { gesture.current = { type: 'quick' }; return; }

    const connectFrom = target.closest('[data-handle="connect"]')?.getAttribute('data-for');
    if (connectFrom) { gesture.current = { type: 'connect', sourceId: connectFrom }; return; }

    const endEl = target.closest('[data-handle="endpoint"]');
    if (endEl) {
      gesture.current = { type: 'endpoint', flowId: endEl.getAttribute('data-for')!, end: endEl.getAttribute('data-end') as 'source' | 'target', sx: e.clientX, sy: e.clientY, moved: false };
      return;
    }

    const segEl = target.closest('[data-handle="segment"]');
    if (segEl) {
      const axis = segEl.getAttribute('data-axis') as 'h' | 'v';
      const p0 = toModel(e.clientX, e.clientY);
      gesture.current = { type: 'segment', flowId: segEl.getAttribute('data-for')!, index: Number(segEl.getAttribute('data-index')), axis, start: axis === 'h' ? p0.y : p0.x, moved: false };
      return;
    }

    const ph = target.closest('[data-handle="presize"]');
    if (ph) { gesture.current = { type: 'presize', handle: ph.getAttribute('data-pos') as ResizeHandle, sx: e.clientX, sy: e.clientY, moved: false }; return; }

    const nh = target.closest('[data-handle="nresize"]');
    if (nh) {
      gesture.current = { type: 'nresize', id: nh.getAttribute('data-for')!, handle: nh.getAttribute('data-pos') as ResizeHandle, sx: e.clientX, sy: e.clientY, moved: false };
      return;
    }

    const resizeLaneId = target.closest('[data-handle="resize"]')?.getAttribute('data-for');
    if (resizeLaneId) {
      const lane = model.lanes.find((l) => l.id === resizeLaneId);
      if (lane?.bounds) gesture.current = { type: 'resize', laneId: lane.id, startY: toModel(e.clientX, e.clientY).y, baseH: lane.bounds.h, moved: false };
      return;
    }

    // rótulo (texto fora da forma): seleciona o dono e arrasta SÓ o texto
    const labelEl = !armed ? target.closest('[data-label]') : null;
    const labelOwner = labelEl?.closest('[data-id]')?.getAttribute('data-id');
    if (labelOwner && additive) { pick(labelOwner); gesture.current = null; return; }
    if (labelOwner) {
      ed.select(labelOwner);
      const cur = model.nodes.find((n) => n.id === labelOwner)?.labelOffset ?? model.flows.find((f) => f.id === labelOwner)?.labelOffset;
      gesture.current = { type: 'label', id: labelOwner, sx: e.clientX, sy: e.clientY, base: cur ?? { dx: 0, dy: 0 }, moved: false };
      return;
    }

    // mover: só nós "normais" (boundary acompanha a hospedeira; lanes/pools não se arrastam)
    const nodeEl = !armed ? target.closest('.node') : null;
    const nodeId = nodeEl?.getAttribute('data-id');
    if (nodeId && nodeEl?.getAttribute('data-kind') !== 'boundary') {
      const base = { sx: e.clientX, sy: e.clientY, moved: false, last: '', grab: nodeId };
      if (additive) {
        // Shift+clique: intervalo; Ctrl+clique: inclui/retira. Se ficou selecionado, já dá para arrastar o grupo no mesmo gesto
        pick(nodeId);
        const now = useEditor.getState().selectedIds;
        gesture.current = now.includes(nodeId) ? { type: 'move', ids: movable(now), collapse: false, ...base } : null;
        return;
      }
      const sel = useEditor.getState().selectedIds;
      if (sel.length > 1 && sel.includes(nodeId)) { gesture.current = { type: 'move', ids: movable(sel), collapse: true, ...base }; return; }
      ed.select(nodeId);
      gesture.current = { type: 'move', ids: [nodeId], collapse: false, ...base };
      return;
    }
    // com ferramenta armada o clique solta o elemento; o arrasto continua sendo pan
    if (armed) { startPan(e); return; }
    gesture.current = { type: 'marquee', sx: e.clientX, sy: e.clientY, additive, range, base: additive ? useEditor.getState().selectedIds : [], moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    if (g.type === 'pan') {
      const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
      if (!g.moved && Math.hypot(dx, dy) > CLICK_SLOP) g.moved = true;
      if (g.moved) setView((v) => ({ ...v, x: g.vx + dx, y: g.vy + dy }));
    } else if (g.type === 'move') {
      const dx = (e.clientX - g.sx) / view.k, dy = (e.clientY - g.sy) / view.k;
      if (!g.moved) {
        if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) <= CLICK_SLOP) return;
        g.moved = true;
        ed.beginDrag();
      }
      // [2026-10-15] Alterado: movimento LIVRE (1px) com ímã de alinhamento nas bordas/centros dos outros elementos — antes era grade de 10px.
      // Alt desliga o ímã. O objetivo é poder deixar as conexões retas (centro com centro) sem brigar com a grade.
      const rx = Math.round(dx), ry = Math.round(dy);
      const a = e.altKey ? { dx: rx, dy: ry, guides: [] as AlignGuide[] } : alignMove(model0(), g.ids, rx, ry, 6 / view.k);
      const key = `${a.dx},${a.dy}`;
      if (key === g.last) return; // só recalcula (e re-roteia) quando o deslocamento muda
      g.last = key;
      setGuides(a.guides);
      ed.dragEdit((base) => moveNodes(base, g.ids, a.dx, a.dy));
    } else if (g.type === 'marquee') {
      if (!g.moved) { if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) <= CLICK_SLOP) return; g.moved = true; }
      const a = toModel(g.sx, g.sy), b = toModel(e.clientX, e.clientY);
      const r = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
      setMarquee(r);
      // só entra o que está TODO dentro do laço (convenção de Visio/Bizagi; evita pegar lanes/pool sem querer)
      const hits = idsInBox(model, r);
      ed.selectMany([...g.base, ...hits]);
    } else if (g.type === 'nresize') {
      if (!g.moved) { if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) <= 2) return; g.moved = true; ed.beginDrag(); }
      const dx = Math.round((e.clientX - g.sx) / view.k), dy = Math.round((e.clientY - g.sy) / view.k);
      ed.dragEdit((base) => resizeNode(base, g.id, g.handle, dx, dy));
    } else if (g.type === 'presize') {
      if (!g.moved) { if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) <= 2) return; g.moved = true; ed.beginDrag(); }
      const dx = Math.round((e.clientX - g.sx) / view.k), dy = Math.round((e.clientY - g.sy) / view.k);
      ed.dragEdit((base) => resizePool(base, g.handle, dx, dy));
    } else if (g.type === 'endpoint') {
      const p = toModel(e.clientX, e.clientY);
      if (!g.moved) { if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) <= CLICK_SLOP) return; g.moved = true; ed.beginDrag(); }
      const flow = model.flows.find((f) => f.id === g.flowId);
      if (!flow) return;
      const own = g.end === 'source' ? flow.sourceId : flow.targetId;
      const over = idAt(e.clientX, e.clientY);
      const other = over && over !== own && isElement(over) ? over : null;
      if (other && other !== own) {
        // sobre OUTRO elemento: pré-visualiza o religamento (linha tracejada verde/vermelha) e deixa o traçado como estava
        const fixedPt = g.end === 'source' ? flow.waypoints![flow.waypoints!.length - 1]! : flow.waypoints![0]!;
        setRubber({ x1: fixedPt[0], y1: fixedPt[1], x2: p.x, y2: p.y, ok: canReconnect(model, g.flowId, g.end, other) === null });
        ed.dragEdit((b) => b);
      } else {
        setRubber(null);
        ed.dragEdit((b) => moveFlowEndpoint(b, g.flowId, g.end, p));
      }
    } else if (g.type === 'segment') {
      const p = toModel(e.clientX, e.clientY);
      const d = snap((g.axis === 'h' ? p.y : p.x) - g.start, 5);
      if (!g.moved) { if (Math.abs(d) < 5) return; g.moved = true; ed.beginDrag(); }
      ed.dragEdit((b) => moveFlowSegment(b, g.flowId, g.index, d));
    } else if (g.type === 'label') {
      if (!g.moved) { if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) <= CLICK_SLOP) return; g.moved = true; ed.beginDrag(); }
      const dx = (e.clientX - g.sx) / view.k, dy = (e.clientY - g.sy) / view.k;
      ed.dragEdit((b) => setLabelOffset(b, g.id, { dx: g.base.dx + dx, dy: g.base.dy + dy }));
    } else if (g.type === 'resize') {
      const dy = toModel(e.clientX, e.clientY).y - g.startY;
      if (!g.moved) { if (Math.abs(dy) < 2) return; g.moved = true; ed.beginDrag(); }
      ed.dragEdit((base) => resizeLane(base, g.laneId, g.baseH + dy));
    } else if (g.type === 'connect') {
      const from = boundsById.get(g.sourceId);
      if (!from) return;
      const p = toModel(e.clientX, e.clientY);
      const over = idAt(e.clientX, e.clientY);
      const ok = over && over !== g.sourceId ? canConnect(model, g.sourceId, over) === null : over === g.sourceId ? false : null;
      setRubber({ x1: from.x + from.w / 2, y1: from.y + from.h / 2, x2: p.x, y2: p.y, ok });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.type === 'endpoint') {
      setRubber(null);
      if (!g.moved) return;
      const flow = model.flows.find((f) => f.id === g.flowId);
      const own = flow ? (g.end === 'source' ? flow.sourceId : flow.targetId) : '';
      const over = idAt(e.clientX, e.clientY);
      if (over && over !== own && isElement(over)) {
        const why = canReconnect(model, g.flowId, g.end, over);
        if (why) { ed.showToast((t.toast as Record<string, string>)[why] ?? why); ed.dragEdit((b) => b); } // recusa: o traçado volta ao que era
        else ed.dragEdit((b) => reconnectFlow(b, g.flowId, g.end, over));
      }
      ed.endDrag();
      return;
    }
    if (g.type === 'move' && !g.moved && g.collapse) { ed.select(g.grab); return; }
    if (g.type === 'move' || g.type === 'label' || g.type === 'segment' || g.type === 'nresize' || g.type === 'presize') { setGuides([]); if (g.moved) ed.endDrag(); return; }
    if (g.type === 'quick') { setQuickOpen((v) => !v); return; }
    if (g.type === 'resize') { if (g.moved) ed.endDrag(); ed.select(g.laneId); return; }
    if (g.type === 'connect') {
      setRubber(null);
      const over = idAt(e.clientX, e.clientY);
      if (over && over !== g.sourceId) ed.connect(g.sourceId, over);
      return;
    }
    if (g.type === 'pan') setPanning(false);
    if (g.type === 'marquee') setMarquee(null);
    if (g.moved) return; // arraste de pan/laço não conta como clique
    // clique
    if (armed) {
      const tool = armed;
      ed.placeTool(tool, toModel(e.clientX, e.clientY));
      return;
    }
    const hit = idAt(e.clientX, e.clientY);
    if (g.type === 'marquee' && g.additive) { if (hit) (g.range ? ed.selectRange(hit) : ed.toggleSelect(hit)); return; } // Shift/Ctrl+clique em fluxo/lane/pool
    ed.select(hit);
  };

  // [2026-10-14] Alterado: duplo clique edita o texto de QUALQUER elemento que tenha texto — Rafael Brito
  // Bug anterior: com setPointerCapture no pointerdown, o `dblclick` chega com target=<svg>, então `closest('[data-id]')` não achava nada.
  // Agora resolvemos o alvo por posição (elementFromPoint), que independe do retargeting do capture.
  const onDoubleClick = (e: React.MouseEvent) => {
    // [2026-10-15] Alterado: ignora as alças de redimensionar (8x8) que podem cobrir um elemento vizinho no ponto do clique — Rafael Brito
    const under = (document.elementsFromPoint(e.clientX, e.clientY).find((el) => !el.closest('[data-handle="nresize"]')) ?? null) as Element | null;
    // a alça do segmento fica no MEIO da linha (onde o usuário costuma clicar): duplo clique nela edita o nome do fluxo
    const handleFlow = under?.closest('[data-handle="segment"]')?.getAttribute('data-for');
    const hit = under?.closest('[data-id]');
    const id = handleFlow ?? hit?.getAttribute('data-id');
    if (!id || (!hit && !handleFlow)) return;
    const node = model.nodes.find((n) => n.id === id);
    if (node?.kind === 'subprocess' && node.calledProcessId && loadedProcessIds.has(node.calledProcessId)) { onOpenProcess(node.calledProcessId); return; }
    const p = toModel(e.clientX, e.clientY);
    // lanes e pool são grandes: só o cabeçalho (onde fica o rótulo) abre a edição, para duplo clique no "fundo" não renomear sem querer
    const lane = model.lanes.find((l) => l.id === id);
    if (lane?.bounds && p.x > lane.bounds.x + 24) return;
    if (id === model.id) {
      const first = model.lanes[0]?.bounds;
      const headerRight = first ? first.x : (model.pool?.x ?? 0) + 24;
      if (p.x > headerRight) return;
    }
    ed.select(id);
    ed.startEditing(id);
  };

  // o menu pertence ao elemento selecionado: fecha ao trocar de seleção ou ao armar uma ferramenta
  useEffect(() => { setQuickOpen(false); }, [selectedId, armed, model.id]);
  useEffect(() => {
    if (!quickOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setQuickOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickOpen]);

  const onDragOver = (e: React.DragEvent) => { if (e.dataTransfer.types.includes('application/x-ps-tool')) e.preventDefault(); };
  const onDrop = (e: React.DragEvent) => {
    const toolId = e.dataTransfer.getData('application/x-ps-tool');
    const tool = toolId ? toolById(toolId) : undefined;
    if (!tool) return; // arquivo solto: tratado pelo App
    e.preventDefault();
    e.stopPropagation();
    ed.placeTool(tool, toModel(e.clientX, e.clientY));
  };

  // ---------------------------------------------------------------- render
  const pool = model.pool;
  const selNode = model.nodes.find((n) => n.id === selectedId);
  const selFlow = model.flows.find((f) => f.id === selectedId && f.waypoints && f.waypoints.length >= 2);
  const selPart = model.participants.find((p) => p.id === selectedId);
  // elemento selecionado que aceita redimensionar (tarefa, subprocesso, anotação, dados, participante)
  const selResizable = selectedId && isResizable(model, selectedId) ? (selNode ?? selPart) : undefined;
  // [2026-10-27] Alterado: evento de FIM não tem alça de conectar nem "+": nada parte dele, só recebe — Rafael Brito
  const connectFor = selNode?.kind === 'end' ? null : selNode?.bounds ? { id: selNode.id, x: selNode.bounds.x + selNode.bounds.w + 16, y: selNode.bounds.y + selNode.bounds.h / 2 }
    : selPart?.bounds ? { id: selPart.id, x: selPart.bounds.x + selPart.bounds.w / 2, y: selPart.bounds.y - 16 }
    : selectedId === model.id && pool ? { id: model.id, x: pool.x + pool.w / 2, y: pool.y + pool.h + 16 } : null;

  // [2026-11-10] Criado: faixas de pega ao longo de TODA a borda (antes: uma alça só no meio da linha da lane) — Rafael Brito
  const edgeT = EDGE_HIT / view.k;
  const showEdges = !ed.readOnly && !armed;
  const lanesByY = model.lanes.filter((l) => l.bounds).sort((a, b) => a.bounds!.y - b.bounds!.y);
  const lastLane = lanesByY[lanesByY.length - 1];

  return (
    <div className="canvas-wrap" data-armed={armed ? armed.id : undefined}>
      <svg ref={ref} className={`canvas${armed ? ' armed' : ''}${panning ? ' panning' : ''}`} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick} onDragOver={onDragOver} onDrop={onDrop} onContextMenu={(e) => e.preventDefault()}>
        <DiagramDefs />
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <DiagramLayers model={model} selectedId={selectedId} selectedIds={selectedIds} editingId={editing} loadedProcessIds={loadedProcessIds} />

          {showEdges && pool && lanesByY.length > 0 && (
            <g className="edges">
              {/* divisória entre lanes: arrastar muda a altura da lane DE CIMA (as de baixo acompanham) */}
              {lanesByY.slice(0, -1).map((l) => (
                <rect key={l.id} data-handle="resize" data-for={l.id} className={`handle edge ns${selectedId === l.id ? ' on' : ''}`} {...edgeRect(l.bounds!, 's', edgeT)} />
              ))}
              {/* contorno do pool: qualquer ponto de qualquer lado/canto */}
              {ALL_EDGES.map((pos) => (
                <rect key={pos} data-handle="presize" data-pos={pos} {...edgeRect(pool, pos, edgeT)}
                  className={`handle edge ${EDGE_CURSOR[pos]}${pos === 's' && lastLane && selectedId === lastLane.id ? ' on' : ''}`} />
              ))}
            </g>
          )}
          {showEdges && model.participants.map((p) => p.bounds && (
            <g key={p.id} className="edges">
              {ALL_EDGES.map((pos) => (
                <rect key={pos} data-handle="nresize" data-for={p.id} data-pos={pos} className={`handle edge ${EDGE_CURSOR[pos]}`} {...edgeRect(p.bounds!, pos, edgeT)} />
              ))}
            </g>
          ))}

          {!ed.readOnly && selFlow && (['source', 'target'] as const).map((end) => {
            const pt = end === 'source' ? selFlow.waypoints![0]! : selFlow.waypoints![selFlow.waypoints!.length - 1]!;
            return (
              <g key={end} data-handle="endpoint" data-for={selFlow.id} data-end={end} className="handle end" transform={`translate(${pt[0]},${pt[1]})`}>
                <circle r={6} />
              </g>
            );
          })}
          {!ed.readOnly && selFlow && selFlow.waypoints!.slice(1).map((pt, i) => {
            const a = selFlow.waypoints![i]!;
            const axis = segmentAxis(a, pt);
            if (!axis) return null;
            const len = Math.hypot(pt[0] - a[0], pt[1] - a[1]);
            if (len < 14) return null; // segmento curto demais para ter alça
            const mx = (a[0] + pt[0]) / 2, my = (a[1] + pt[1]) / 2;
            return (
              <g key={i} data-handle="segment" data-for={selFlow.id} data-index={i} data-axis={axis} className={`handle seg ${axis}`}>
                {axis === 'h' ? <rect x={mx - 9} y={my - 4} width={18} height={8} rx={4} /> : <rect x={mx - 4} y={my - 9} width={8} height={18} rx={4} />}
              </g>
            );
          })}
          {!ed.readOnly && selResizable?.bounds && !armed && (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((pos) => {
            const b = selResizable.bounds!;
            const cx = pos.includes('w') ? b.x : pos.includes('e') ? b.x + b.w : b.x + b.w / 2;
            const cy = pos.includes('n') ? b.y : pos.includes('s') ? b.y + b.h : b.y + b.h / 2;
            return <g key={pos} data-handle="nresize" data-for={selResizable.id} data-pos={pos} className={`handle nres ${pos}`}><rect x={cx - 4} y={cy - 4} width={8} height={8} rx={1.5} /></g>;
          })}
          {!ed.readOnly && selectedId === model.id && pool && !armed && (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((pos) => {
            const cx = pos.includes('w') ? pool.x : pos.includes('e') ? pool.x + pool.w : pool.x + pool.w / 2;
            const cy = pos.includes('n') ? pool.y : pos.includes('s') ? pool.y + pool.h : pool.y + pool.h / 2;
            return <g key={pos} data-handle="presize" data-pos={pos} className={`handle nres ${pos}`}><rect x={cx - 5} y={cy - 5} width={10} height={10} rx={2} /></g>;
          })}
          {guides.map((g, i) => (
            <path key={i} className="guide" d={g.axis === 'x' ? `M${g.pos} ${g.from}V${g.to}` : `M${g.from} ${g.pos}H${g.to}`} />
          ))}
          {marquee && <rect className="marquee" x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} />}
          {!ed.readOnly && connectFor && !armed && (
            <g data-handle="connect" data-for={connectFor.id} className="handle connect" transform={`translate(${connectFor.x},${connectFor.y})`}>
              <circle r={10} /><path d="M-4 0H4M1 -3L4 0L1 3" />
            </g>
          )}
          {!ed.readOnly && selNode?.bounds && !armed && selNode.kind !== 'boundary' && selNode.kind !== 'end' && (
            <g data-handle="quick" className={`handle quick${quickOpen ? ' on' : ''}`} transform={`translate(${selNode.bounds.x + selNode.bounds.w + 16},${selNode.bounds.y + selNode.bounds.h / 2 + 28})`}>
              <title>{t.quickAdd}</title><circle r={10} /><path d="M-4 0H4M0 -4V4" />
            </g>
          )}
          {openByEl.size > 0 && (() => {
            // âncora do balão: canto superior direito da forma (nós, participantes, pool) ou topo do cabeçalho (lanes)
            const spots: Array<{ id: string; x: number; y: number }> = [];
            for (const n of model.nodes) if (n.bounds && openByEl.has(n.id)) spots.push({ id: n.id, x: n.bounds.x + n.bounds.w, y: n.bounds.y });
            for (const p of model.participants) if (p.bounds && openByEl.has(p.id)) spots.push({ id: p.id, x: p.bounds.x + p.bounds.w, y: p.bounds.y });
            for (const l of model.lanes) if (l.bounds && openByEl.has(l.id)) spots.push({ id: l.id, x: l.bounds.x + 11, y: l.bounds.y + 4 });
            if (pool && openByEl.has(PROCESS_ELEMENT)) spots.push({ id: PROCESS_ELEMENT, x: pool.x + pool.w, y: pool.y });
            for (const f of model.flows) {
              const wp = f.waypoints;
              if (!wp?.length || !openByEl.has(f.id)) continue;
              const mid = wp[Math.floor((wp.length - 1) / 2)]!;
              spots.push({ id: f.id, x: mid[0], y: mid[1] });
            }
            const k = 1 / view.k;
            return spots.map((b) => {
              const n = openByEl.get(b.id)!;
              return (
                <g key={b.id} data-handle="comments" data-for={b.id} className="handle cbubble" transform={`translate(${b.x},${b.y}) scale(${k})`}>
                  <title>{t.comments.badge.replace('{n}', String(n))}</title>
                  <path d="M-11 -9h22a3 3 0 0 1 3 3v10a3 3 0 0 1 -3 3h-12l-6 5v-5h-4a3 3 0 0 1 -3 -3v-10a3 3 0 0 1 3 -3z" />
                  <text y={3.5} textAnchor="middle">{n > 99 ? '99+' : n}</text>
                </g>
              );
            });
          })()}
          {rubber && (
            <path className={`rubber ${rubber.ok === true ? 'ok' : rubber.ok === false ? 'bad' : ''}`} d={`M${rubber.x1} ${rubber.y1}L${rubber.x2} ${rubber.y2}`} />
          )}
        </g>
      </svg>
      {armed && armed.type === 'node' && <div className="hint-pill">{armed.kind === 'boundary' ? t.placeBoundaryHint : t.placeHint} · Esc</div>}
      {quickOpen && !ed.readOnly && selNode?.bounds && !armed && (
        <div className="quick-menu" role="menu" aria-label={t.quickAdd}
          style={{ left: (selNode.bounds.x + selNode.bounds.w + 34) * view.k + view.x, top: (selNode.bounds.y + selNode.bounds.h / 2 + 28) * view.k + view.y - 14 }}
          onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          {PALETTE.flatMap((g) => g.items).filter((tool) => tool.type === 'node' && tool.kind !== 'boundary' && !whyCannotAddAfter(model, selNode.id, tool.kind!)).map((tool) => (
            <button key={tool.id} data-quick={tool.id} title={t.palette[tool.label]} aria-label={t.palette[tool.label]}
              onClick={() => { setQuickOpen(false); ed.addAfter(selNode.id, tool); }}>
              <ToolIcon tool={tool} />
            </button>
          ))}
        </div>
      )}
      {editing && <InlineEditor model={model} id={editing} view={view} />}
    </div>
  );
}

/**
 * Edição de texto NO PRÓPRIO ELEMENTO.
 *
 * [2026-10-14] Alterado: antes era um <input> com borda azul sobreposto (parecia uma caixa separada, cortava o texto e não
 * quebrava linha). Agora é um editor sem moldura que ocupa exatamente a área onde o texto aparece no elemento, com a mesma fonte,
 * cor, alinhamento e zoom — o usuário digita "dentro" da tarefa/evento/fluxo/lane. O texto estático some enquanto edita (classe `editing`).
 * Decisões:
 * - <div contenteditable="plaintext-only"> (não <input>): quebra linha dentro da forma e cresce com o texto; sem formatação colada.
 * - Enter confirma, Esc cancela, clicar fora confirma. Ao abrir, todo o texto fica selecionado (digitar substitui).
 * - Lanes/pool têm o texto na vertical: o editor gira -90° e fica sobre o cabeçalho.
 */
interface EditArea { cx: number; cy: number; w: number; h: number; align: 'center' | 'left'; size: number; bold?: boolean; rotate?: boolean; color?: string }

function editArea(model: ProcessModel, id: string): EditArea | null {
  const node = model.nodes.find((n) => n.id === id);
  if (node?.bounds) {
    const b = node.bounds;
    const lay = nodeLabel(node.name ? node : { ...node, name: 'xxxxxxxxxxxx' }); // sem nome: abre onde o rótulo ficará
    if (lay) return { cx: lay.box.x + lay.box.w / 2, cy: lay.box.y + lay.box.h / 2, w: Math.max(lay.box.w + 18, 96), h: lay.box.h, align: 'center', size: lay.size };
    if (node.kind === 'annotation') return { cx: b.x + 14 + (b.w - 18) / 2, cy: b.y + b.h / 2, w: b.w - 18, h: b.h - 6, align: 'left', size: 12 };
    if (node.kind === 'subprocess') return { cx: b.x + b.w / 2, cy: b.y + (b.h - 20) / 2, w: b.w - 14, h: b.h - 26, align: 'center', size: 12 };
    return { cx: b.x + b.w / 2, cy: b.y + b.h / 2 + 3, w: b.w - 14, h: b.h - 16, align: 'center', size: 12 }; // tarefa
  }
  const flow = model.flows.find((f) => f.id === id);
  if (flow?.waypoints?.length) {
    const lay = flowLabel({ ...flow, name: flow.name || 'xxxxxxxxxxxx' });
    if (lay) return { cx: lay.box.x + lay.box.w / 2, cy: lay.box.y + lay.box.h / 2, w: Math.max(lay.box.w + 18, 80), h: lay.box.h, align: 'center', size: lay.size, bold: true, color: 'var(--muted)' };
  }
  const lane = model.lanes.find((l) => l.id === id);
  if (lane?.bounds) return { cx: lane.bounds.x + 15, cy: lane.bounds.y + lane.bounds.h / 2, w: Math.max(80, lane.bounds.h - 16), h: 20, align: 'center', size: 12, bold: true, rotate: true, color: 'var(--muted)' };
  const part = model.participants.find((p) => p.id === id);
  if (part?.bounds) return { cx: part.bounds.x + part.bounds.w / 2, cy: part.bounds.y + 20, w: Math.min(part.bounds.w - 20, 320), h: 20, align: 'center', size: 12, bold: true, color: 'var(--muted)' };
  if (id === model.id && model.pool) {
    const header = model.lanes[0]?.bounds ? model.lanes[0].bounds.x - model.pool.x : 0;
    if (header >= 16) return { cx: model.pool.x + header / 2 + 4, cy: model.pool.y + model.pool.h / 2, w: Math.max(120, model.pool.h - 16), h: 20, align: 'center', size: 12, bold: true, rotate: true, color: 'var(--muted)' };
    return { cx: model.pool.x + 130, cy: model.pool.y + 18, w: 240, h: 20, align: 'left', size: 12, bold: true, color: 'var(--muted)' };
  }
  return null;
}

function InlineEditor({ model, id, view }: { model: ProcessModel; id: string; view: View }) {
  const rename = useEditor((s) => s.rename);
  const startEditing = useEditor((s) => s.startEditing);
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(false);

  const node = model.nodes.find((n) => n.id === id);
  const value = node?.name ?? model.flows.find((f) => f.id === id)?.name ?? model.lanes.find((l) => l.id === id)?.name
    ?? model.participants.find((p) => p.id === id)?.name ?? (id === model.id ? model.name : '');
  const area = editArea(model, id);

  // monta o texto inicial, foca e seleciona tudo (uma vez por abertura)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.textContent = value;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- só na abertura: re-render não pode resetar o que o usuário digitou

  if (!area) return null;
  const k = view.k;
  const commit = () => {
    if (done.current) return;
    done.current = true;
    rename(id, (ref.current?.innerText ?? '').replace(/\s*\n\s*/g, ' '));
  };
  const w = area.w * k, h = area.h * k;
  const style: React.CSSProperties = {
    left: area.cx * k + view.x, top: area.cy * k + view.y, width: w, minHeight: h,
    fontSize: area.size * k, lineHeight: `${13 * k}px`, fontWeight: area.bold ? 650 : 400,
    textAlign: area.align, justifyContent: area.align === 'left' ? 'flex-start' : 'center',
    color: area.color ?? 'var(--ink)',
    transform: `translate(-50%, -50%)${area.rotate ? ' rotate(-90deg)' : ''}`,
  };
  return (
    <div ref={ref} className="inline-edit" role="textbox" aria-label="edit text" contentEditable="plaintext-only" suppressContentEditableWarning spellCheck={false} style={style}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); done.current = true; startEditing(null); }
      }}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}
