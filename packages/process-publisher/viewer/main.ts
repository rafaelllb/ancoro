/**
 * Viewer do portal publicado — SPA enxuta em TypeScript puro (sem jQuery/React), que abre por file:// e hospedado.
 *
 * [2026-10-14] Criado: Fase 3 — navegação em árvore, diagrama com pan/zoom, painel do elemento, tabela de elementos, matriz RACI,
 * busca instantânea, deep link por elemento, PT/EN, tema claro/escuro/auto, impressão — Rafael Brito
 * Decisões:
 * - Dados por <script> injetado (PS.d / PS.s), não fetch: fetch() não funciona em file://. Cada processo carrega sob demanda.
 * - O roteador é a ÚNICA fonte de verdade: toda ação muda o hash e `route()` renderiza. Voltar/avançar/compartilhar link funcionam de graça.
 * - Todo texto entra por textContent (ver dom.ts). O único HTML injetado é o SVG gerado pelo publisher (nomes já escapados).
 *
 * TODO [ESTIGMERGIA]: gestos de pinça no celular
 * - Pan por toque e botões +/- funcionam; pinch-zoom não foi implementado. Próximo passo: rastrear 2 pointers e escalar pela distância.
 */
import type { ElementInfo, ProcessPayload, SearchIndex } from '../src/payload';
import type { ProcessChange, VersionEntry } from '../src/versions';
import { clear, h } from './dom';
import { getLang, setLang, t, type Lang } from './i18n';
import { renderPanel, wireDownloads } from './panel';
import { decryptText, deriveKey, restoreSession, type LockedInfo, type Sealed } from './unlock';

export interface ProcessRef { id: string; name: string; file: string; page: string; parent?: string; children: string[]; nodes: number; description?: string }
export interface Manifest {
  v: 1; title: string; subtitle?: string; lang: Lang; logo?: string; footer?: string; publishedAt?: string; ga4?: string;
  /** em portal protegido estes campos vêm em `sealed` e só existem depois de desbloquear */
  processes: ProcessRef[]; roots: string[]; search: string;
  /** presente a partir da 2ª publicação: módulo de dados com o diff "o que mudou" */
  changes?: { file: string; version: number };
  /** presente quando o conteúdo está criptografado (senha) — ver unlock.ts */
  locked?: LockedInfo;
  sealed?: Sealed;
}

declare global { interface Window { PS: { d: (id: string, p: unknown) => void; s: (i: unknown) => void; c: (c: unknown) => void } } }
interface ChangesData { history: Array<Pick<VersionEntry, 'version' | 'label' | 'publishedAt' | 'summary'>>; latest: VersionEntry }
let changesData: ChangesData | null = null;
let changesWaiters: Array<(c: ChangesData) => void> = [];

// ------------------------------------------------------------------------------------------------ carregamento de dados
const manifest = JSON.parse(document.getElementById('ps-manifest')!.textContent ?? '{}') as Manifest;
const refs = new Map<string, ProcessRef>();
function indexManifest(): void {
  manifest.processes ??= []; manifest.roots ??= [];
  refs.clear();
  for (const p of manifest.processes) refs.set(p.id, p);
}
indexManifest();
const payloads = new Map<string, ProcessPayload>();
const waiters = new Map<string, Array<(p: ProcessPayload) => void>>();
let searchIndex: SearchIndex | null = null;
let searchWaiters: Array<(i: SearchIndex) => void> = [];

/** Decodificador dos módulos de dados (identidade; o unlock.ts troca por AES-GCM quando o portal tem senha). */
export const hooks: { decode: (raw: unknown) => Promise<unknown> } = { decode: async (raw) => raw };

window.PS = {
  d: (id, raw) => { void hooks.decode(raw).then((p) => { const pl = p as ProcessPayload; payloads.set(id, pl); (waiters.get(id) ?? []).forEach((w) => w(pl)); waiters.delete(id); }); },
  c: (raw) => { void hooks.decode(raw).then((c) => { changesData = c as ChangesData; changesWaiters.forEach((w) => w(changesData!)); changesWaiters = []; }); },
  s: (raw) => { void hooks.decode(raw).then((i) => { searchIndex = i as SearchIndex; searchWaiters.forEach((w) => w(searchIndex!)); searchWaiters = []; }); },
};

function injectScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`falha ao carregar ${src}`));
    document.head.appendChild(s);
  });
}

function loadProcess(id: string): Promise<ProcessPayload> {
  const have = payloads.get(id);
  if (have) return Promise.resolve(have);
  const ref = refs.get(id);
  if (!ref) return Promise.reject(new Error('processo desconhecido'));
  return new Promise((resolve, reject) => {
    waiters.set(id, [...(waiters.get(id) ?? []), resolve]);
    if ((waiters.get(id)?.length ?? 0) === 1) injectScript(ref.file).catch(reject);
  });
}

function loadSearch(): Promise<SearchIndex> {
  if (searchIndex) return Promise.resolve(searchIndex);
  return new Promise((resolve, reject) => {
    searchWaiters.push(resolve);
    if (searchWaiters.length === 1) injectScript(manifest.search).catch(reject);
  });
}

// ------------------------------------------------------------------------------------------------ estado e roteamento
type View = 'diagram' | 'elements' | 'people' | 'changes';
interface Route { pid: string | null; eid: string | null; view: View }

function parseHash(): Route {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
  const [path = '', query = ''] = raw.split('?');
  if (path === '/changes') return { pid: null, eid: null, view: 'changes' };
  const m = /^\/p\/([^/]+)(?:\/e\/(.+))?$/.exec(path);
  const view = (new URLSearchParams(query).get('view') as View | null) ?? 'diagram';
  return { pid: m?.[1] ?? null, eid: m?.[2] ?? null, view: ['diagram', 'elements', 'people'].includes(view) ? view : 'diagram' };
}
function hashFor(r: Route): string {
  if (r.view === 'changes') return '#/changes';
  if (!r.pid) return '#/';
  return `#/p/${encodeURIComponent(r.pid)}${r.eid ? `/e/${encodeURIComponent(r.eid)}` : ''}${r.view !== 'diagram' ? `?view=${r.view}` : ''}`;
}
const go = (r: Partial<Route> & { pid: string }): void => {
  const cur = parseHash();
  location.hash = hashFor({ pid: r.pid, eid: r.eid ?? null, view: r.view ?? (r.pid === cur.pid ? cur.view : 'diagram') });
};

let shown: { pid: string; payload: ProcessPayload } | null = null;
const cam = { x: 0, y: 0, k: 1 };

// ------------------------------------------------------------------------------------------------ shell
const ui: { tree?: HTMLElement; main?: HTMLElement; panel?: HTMLElement; stage?: HTMLElement; canvas?: HTMLElement; crumbs?: HTMLElement; tabs?: HTMLElement; viewEls?: Record<View, HTMLElement>; results?: HTMLElement; search?: HTMLInputElement; status?: HTMLElement } = {};

function buildShell(): void {
  const tr = t();
  const app = document.getElementById('app')!;
  clear(app);
  document.title = manifest.title;
  document.documentElement.lang = getLang();

  const search = h('input', { type: 'search', class: 'search', placeholder: tr.search, 'aria-label': tr.search, autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false' }) as HTMLInputElement;
  const results = h('div', { class: 'results', role: 'listbox', hidden: true });
  ui.search = search; ui.results = results;
  search.addEventListener('input', () => void doSearch(search.value));
  search.addEventListener('keydown', onSearchKey);
  search.addEventListener('focus', () => void loadSearch());
  document.addEventListener('click', (e) => { if (!(e.target as Element).closest('.searchbox')) closeResults(); });

  const header = h('header', { class: 'top' },
    h('button', { class: 'icon', 'aria-label': tr.showTree, title: tr.showTree, onClick: () => document.body.classList.toggle('tree-open') }, '☰'),
    manifest.logo ? h('img', { class: 'logo', src: manifest.logo, alt: '' }) : null,
    h('div', { class: 'brand' }, h('strong', null, manifest.title), manifest.subtitle ? h('span', null, manifest.subtitle) : null),
    h('div', { class: 'searchbox' }, search, results),
    h('div', { class: 'tools' },
      manifest.changes ? h('button', { class: 'news', title: tr.newsTitle, onClick: () => { location.hash = '#/changes'; } }, `★ ${tr.news}`) : null,
      h('button', { class: 'icon', 'aria-label': tr.lang, title: tr.lang, onClick: () => { setLang(getLang() === 'pt' ? 'en' : 'pt'); remember('ps-lang', getLang()); rerender(); } }, getLang() === 'pt' ? 'EN' : 'PT'),
      h('button', { class: 'icon', 'aria-label': tr.theme, title: tr.theme, onClick: cycleTheme }, '◐'),
      h('button', { class: 'icon', 'aria-label': tr.print, title: tr.print, onClick: () => window.print() }, '⎙'),
      h('button', { class: 'icon', 'aria-label': tr.showPanel, title: tr.showPanel, onClick: () => document.body.classList.toggle('panel-open') }, 'ⓘ')));

  const tree = h('nav', { class: 'tree', 'aria-label': tr.processes });
  const crumbs = h('div', { class: 'crumbs' });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const stage = h('div', { class: 'stage', tabindex: '0', 'aria-label': tr.diagram });
  const canvas = h('div', { class: 'canvas' });
  stage.append(canvas, h('div', { class: 'zoom' },
    h('button', { 'aria-label': tr.zoomIn, title: tr.zoomIn, onClick: () => zoomBy(1.25) }, '+'),
    h('button', { 'aria-label': tr.zoomOut, title: tr.zoomOut, onClick: () => zoomBy(0.8) }, '−'),
    h('button', { 'aria-label': tr.fit, title: tr.fit, onClick: fit }, '⤢')));
  const vDiagram = h('section', { class: 'view', 'data-view': 'diagram' }, stage);
  const vElements = h('section', { class: 'view', 'data-view': 'elements', hidden: true });
  const vPeople = h('section', { class: 'view', 'data-view': 'people', hidden: true });
  const vChanges = h('section', { class: 'view', 'data-view': 'changes', hidden: true });
  const main = h('main', null, crumbs, tabs, vDiagram, vElements, vPeople, vChanges);
  const panel = h('aside', { class: 'panel', 'aria-label': tr.showPanel });
  const status = h('div', { class: 'status', role: 'status' });
  const footer = h('footer', null, manifest.footer ?? '', manifest.publishedAt ? ` · ${tr.published} ${new Date(manifest.publishedAt).toLocaleDateString()}` : '');

  app.append(header, h('div', { class: 'body' }, tree, main, panel), footer, status);
  Object.assign(ui, { tree, main, panel, stage, canvas, crumbs, tabs, results, search, status, viewEls: { diagram: vDiagram, elements: vElements, people: vPeople, changes: vChanges } });
  wireStage(stage);
  renderTree();
}

function remember(k: string, v: string): void { try { localStorage.setItem(k, v); } catch { /* storage bloqueado: preferência só vale na sessão */ } }
function recall(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }

function cycleTheme(): void {
  const order = ['auto', 'light', 'dark'];
  const next = order[(order.indexOf(recall('ps-theme') ?? 'auto') + 1) % 3]!;
  remember('ps-theme', next);
  applyTheme();
}
function applyTheme(): void {
  const th = recall('ps-theme') ?? 'auto';
  if (th === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', th);
}

// ------------------------------------------------------------------------------------------------ árvore
function renderTree(): void {
  const tr = t();
  const cur = parseHash().pid;
  const item = (id: string): HTMLElement => {
    const ref = refs.get(id)!;
    const a = h('a', { href: hashFor({ pid: id, eid: null, view: 'diagram' }), class: id === cur ? 'cur' : '', 'aria-current': id === cur ? 'page' : null }, ref.name);
    a.addEventListener('click', () => document.body.classList.remove('tree-open'));
    const li = h('li', null, a);
    if (ref.children.length) li.append(h('ul', null, ...ref.children.map(item)));
    return li;
  };
  clear(ui.tree!);
  ui.tree!.append(h('h2', null, tr.processes), manifest.roots.length ? h('ul', null, ...manifest.roots.map(item)) : h('p', { class: 'hint' }, tr.empty));
}

// ------------------------------------------------------------------------------------------------ diagrama: câmera
const svgEl = (): SVGSVGElement | null => ui.canvas?.querySelector('svg') ?? null;
function applyCam(): void { if (ui.canvas) ui.canvas.style.transform = `translate(${cam.x}px,${cam.y}px) scale(${cam.k})`; }

function fit(): void {
  const svg = svgEl(), stage = ui.stage;
  if (!svg || !stage || !shown) return;
  const { width, height } = stage.getBoundingClientRect();
  const { w, h: hh } = shown.payload.size;
  if (!width || !height) return;
  cam.k = Math.min(width / w, height / hh, 1.4);
  cam.x = (width - w * cam.k) / 2; cam.y = (height - hh * cam.k) / 2;
  applyCam();
}
function zoomBy(f: number, cx?: number, cy?: number): void {
  const stage = ui.stage; if (!stage) return;
  const r = stage.getBoundingClientRect();
  const px = cx ?? r.width / 2, py = cy ?? r.height / 2;
  const k = Math.min(4, Math.max(0.1, cam.k * f)), ratio = k / cam.k;
  cam.x = px - (px - cam.x) * ratio; cam.y = py - (py - cam.y) * ratio; cam.k = k;
  applyCam();
}
function focusElement(id: string): void {
  const svg = svgEl(), stage = ui.stage;
  const g = svg?.querySelector<SVGGraphicsElement>(`[data-id="${CSS.escape(id)}"]`);
  if (!svg || !stage || !g || !shown) return;
  const bb = g.getBBox();
  const vb = svg.viewBox.baseVal; // o canvas é o SVG em px com origem em (viewBox.x, viewBox.y)
  const cx = bb.x + bb.width / 2 - vb.x, cy = bb.y + bb.height / 2 - vb.y;
  const r = stage.getBoundingClientRect();
  // só recentraliza se o elemento estiver fora da área visível (evita "pular" a cada clique)
  const sx = cx * cam.k + cam.x, sy = cy * cam.k + cam.y;
  if (sx < 40 || sy < 40 || sx > r.width - 40 || sy > r.height - 40) { cam.x = r.width / 2 - cx * cam.k; cam.y = r.height / 2 - cy * cam.k; applyCam(); }
}

function wireStage(stage: HTMLElement): void {
  let drag: { sx: number; sy: number; cx: number; cy: number; moved: boolean } | null = null;
  stage.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('.zoom')) return;
    drag = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, moved: false };
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; stage.classList.add('panning'); }
    if (drag.moved) { cam.x = drag.cx + dx; cam.y = drag.cy + dy; applyCam(); }
  });
  stage.addEventListener('pointerup', (e) => {
    const d = drag; drag = null; stage.classList.remove('panning');
    if (!d || d.moved || !shown) return;
    const hit = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)?.closest('#app svg [data-id]');
    const id = hit?.getAttribute('data-id') ?? null;
    go({ pid: shown.pid, eid: id && id !== shown.pid ? id : null });
  });
  stage.addEventListener('dblclick', (e) => {
    const hit = (document.elementFromPoint(e.clientX, e.clientY) as Element | null)?.closest('#app svg [data-id]');
    const el = hit && shown ? shown.payload.elements[hit.getAttribute('data-id')!] : null;
    if (el?.called) go({ pid: el.called.id });
  });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  stage.addEventListener('keydown', (e) => {
    const step = 60;
    if (e.key === '+' || e.key === '=') zoomBy(1.2); else if (e.key === '-') zoomBy(0.83); else if (e.key === '0') fit();
    else if (e.key === 'ArrowLeft') { cam.x += step; applyCam(); } else if (e.key === 'ArrowRight') { cam.x -= step; applyCam(); }
    else if (e.key === 'ArrowUp') { cam.y += step; applyCam(); } else if (e.key === 'ArrowDown') { cam.y -= step; applyCam(); }
    else return;
    e.preventDefault();
  });
  window.addEventListener('resize', () => { if (parseHash().view === 'diagram') fit(); });
}

// ------------------------------------------------------------------------------------------------ views
function highlight(id: string | null): void {
  svgEl()?.querySelectorAll('.sel').forEach((n) => n.classList.remove('sel'));
  if (id) svgEl()?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.classList.add('sel');
}

function renderCrumbs(pid: string): void {
  const tr = t();
  const chain: string[] = [];
  for (let c: string | undefined = pid; c; c = refs.get(c)?.parent) chain.unshift(c);
  clear(ui.crumbs!);
  ui.crumbs!.append(...chain.flatMap((id, i): Node[] => [
    ...(i ? [h('span', { class: 'sep' }, '›')] : []),
    id === pid ? h('strong', null, refs.get(id)!.name) : h('a', { href: hashFor({ pid: id, eid: null, view: 'diagram' }) }, refs.get(id)!.name),
  ]));
  clear(ui.tabs!);
  const cur = parseHash().view;
  for (const [v, label] of [['diagram', tr.diagram], ['elements', tr.elements], ['people', tr.people]] as const) {
    ui.tabs!.append(h('button', { role: 'tab', 'aria-selected': v === cur ? 'true' : 'false', class: v === cur ? 'on' : '', onClick: () => go({ pid, eid: parseHash().eid, view: v }) }, label));
  }
}

function renderElements(p: ProcessPayload): void {
  const tr = t();
  const host = ui.viewEls!.elements;
  clear(host);
  const kinds = [...new Set(p.order.map((id) => p.elements[id]!.kind))].sort();
  const q = h('input', { type: 'search', placeholder: tr.filter, 'aria-label': tr.filter }) as HTMLInputElement;
  const sel = h('select', { 'aria-label': tr.type }, h('option', { value: '' }, tr.allTypes), ...kinds.map((k) => h('option', { value: k }, tr.kind[k] ?? k))) as HTMLSelectElement;
  const body = h('tbody');
  const draw = () => {
    clear(body);
    const needle = q.value.trim().toLowerCase();
    for (const id of p.order) {
      const e = p.elements[id]!;
      if (sel.value && e.kind !== sel.value) continue;
      if (needle && ![e.name, e.performer, e.description, e.lane, e.sapTransaction].some((s) => s?.toLowerCase().includes(needle))) continue;
      const row = h('tr', { tabindex: '0', onClick: () => go({ pid: p.id, eid: id, view: 'diagram' }) },
        h('td', null, e.name || id), h('td', null, tr.kind[e.kind] ?? e.kind), h('td', null, e.lane ?? ''), h('td', null, e.performer ?? ''), h('td', null, e.sla ?? ''),
        h('td', { class: 'trunc' }, (e.description ?? '').slice(0, 125)));
      row.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') go({ pid: p.id, eid: id, view: 'diagram' }); });
      body.append(row);
    }
  };
  q.addEventListener('input', draw); sel.addEventListener('change', draw);
  host.append(h('div', { class: 'filters' }, q, sel),
    h('div', { class: 'tblwrap' }, h('table', { class: 'grid' },
      h('thead', null, h('tr', null, ...[tr.name, tr.type, tr.lane, tr.responsible, tr.sla, tr.description].map((c) => h('th', null, c)))), body)));
  draw();
}

function renderPeople(p: ProcessPayload): void {
  const tr = t();
  const host = ui.viewEls!.people;
  clear(host);
  type Role = 'R' | 'A' | 'C' | 'I';
  const byRole = new Map<string, Map<string, Set<Role>>>();
  const put = (who: string | undefined, id: string, r: Role) => { if (!who) return; const m = byRole.get(who) ?? new Map<string, Set<Role>>(); (m.get(id) ?? m.set(id, new Set()).get(id)!).add(r); byRole.set(who, m); };
  for (const id of p.order) {
    const e: ElementInfo = p.elements[id]!;
    put(e.performer, id, 'R'); put(e.accountable, id, 'A'); (e.consulted ?? []).forEach((w) => put(w, id, 'C')); (e.informed ?? []).forEach((w) => put(w, id, 'I'));
  }
  const roles = [...byRole.keys()].sort((a, b) => a.localeCompare(b));
  if (!roles.length) { host.append(h('p', { class: 'hint' }, tr.none)); return; }
  const rows = p.order.filter((id) => roles.some((r) => byRole.get(r)!.has(id)));
  host.append(h('h3', null, tr.raci),
    h('div', { class: 'tblwrap' }, h('table', { class: 'grid raci' },
      h('thead', null, h('tr', null, h('th', null, tr.name), ...roles.map((r) => h('th', { class: 'role', title: r }, r)))),
      h('tbody', null, ...rows.map((id) => h('tr', { tabindex: '0', onClick: () => go({ pid: p.id, eid: id, view: 'diagram' }) },
        h('td', null, p.elements[id]!.name || id),
        ...roles.map((r) => h('td', { class: 'cell' }, [...(byRole.get(r)!.get(id) ?? [])].sort().join('')))))))));
}

// ------------------------------------------------------------------------------------------------ novidades (diff entre publicações)
function loadChanges(): Promise<ChangesData> {
  if (changesData) return Promise.resolve(changesData);
  return new Promise((resolve, reject) => {
    changesWaiters.push(resolve);
    if (changesWaiters.length === 1 && manifest.changes) injectScript(manifest.changes.file).catch(reject);
  });
}

async function showChanges(): Promise<void> {
  const tr = t();
  const host = ui.viewEls!.changes;
  for (const v of ['diagram', 'elements', 'people', 'changes'] as const) ui.viewEls![v].hidden = v !== 'changes';
  clear(ui.crumbs!); ui.crumbs!.append(h('strong', null, tr.newsTitle));
  clear(ui.tabs!); ui.tabs!.hidden = true;
  clear(host);
  if (!manifest.changes) { host.append(h('p', { class: 'hint' }, tr.noChanges)); return; }
  const data = await loadChanges();
  const date = (iso?: string) => (iso ? ` · ${new Date(iso).toLocaleDateString()}` : '');
  const latest = data.latest;
  const proc = (c: ProcessChange): HTMLElement => {
    const known = refs.has(c.id);
    const title = known ? h('a', { href: hashFor({ pid: c.id, eid: null, view: 'diagram' }) }, c.name) : h('span', null, c.name);
    const items = (label: string, list: Array<{ id: string; name: string; kind: string }>, link: boolean) => list.length
      ? h('div', { class: 'chg-group' }, h('strong', null, `${label} (${list.length})`), h('ul', { class: 'bullets' }, ...list.map((e) => h('li', null,
        link && known ? h('a', { href: hashFor({ pid: c.id, eid: e.id, view: 'diagram' }) }, e.name || e.id) : (e.name || e.id), h('span', { class: 'lab' }, ` · ${tr.kind[e.kind] ?? e.kind}`))))) : null;
    return h('section', { class: 'psec' },
      h('h3', null, c.status === 'added' ? `${tr.chg.addedProcess}: ` : c.status === 'removed' ? `${tr.chg.removedProcess}: ` : '', title),
      items(tr.chg.added, c.added, true), items(tr.chg.removed, c.removed, false),
      c.changed.length ? h('div', { class: 'chg-group' }, h('strong', null, `${tr.chg.changed} (${c.changed.length})`), h('ul', { class: 'bullets' }, ...c.changed.map((e) => h('li', null,
        known ? h('a', { href: hashFor({ pid: c.id, eid: e.id, view: 'diagram' }) }, e.name || e.id) : (e.name || e.id),
        h('span', { class: 'lab' }, ` · ${e.fields.map((f) => tr.fieldLabel[f] ?? f).join(', ')}`))))) : null);
  };
  host.append(
    h('h2', null, `${tr.version} ${latest.version}${latest.label ? ` — ${latest.label}` : ''}${date(latest.publishedAt)}`),
    latest.changes.length ? h('div', null, ...latest.changes.map(proc)) : h('p', { class: 'hint' }, tr.noChanges),
    h('h3', null, tr.versionsHistory),
    h('ul', { class: 'bullets' }, ...[...data.history].reverse().map((v) => h('li', null,
      `${tr.version} ${v.version}${v.label ? ` — ${v.label}` : ''}${date(v.publishedAt)}: +${v.summary.elementsAdded} / -${v.summary.elementsRemoved} / ~${v.summary.elementsChanged}`))));
  clear(ui.panel!);
  document.title = `${tr.newsTitle} · ${manifest.title}`;
}

// ------------------------------------------------------------------------------------------------ roteador
async function route(): Promise<void> {
  const r = parseHash();
  if (r.view === 'changes') { await showChanges(); return; }
  const pid = r.pid && refs.has(r.pid) ? r.pid : manifest.roots[0] ?? null;
  if (!pid) { ui.main!.replaceChildren(h('p', { class: 'hint' }, t().empty)); return; }
  if (r.pid && !refs.has(r.pid)) { ui.status!.textContent = t().notFound; }
  if (!r.pid) { location.replace(hashFor({ pid, eid: null, view: 'diagram' })); return; }
  renderTree();
  renderCrumbs(pid);

  if (shown?.pid !== pid) {
    ui.status!.textContent = t().loading;
    try {
      const payload = await loadProcess(pid);
      shown = { pid, payload };
      ui.canvas!.innerHTML = payload.svg; // SVG gerado pelo publisher (nomes escapados na origem)
      const svg = svgEl()!;
      svg.removeAttribute('width'); svg.removeAttribute('height');
      svg.style.width = `${payload.size.w}px`; svg.style.height = `${payload.size.h}px`;
      renderElements(payload); renderPeople(payload);
      document.title = `${payload.name} · ${manifest.title}`;
      requestAnimationFrame(fit);
      ui.status!.textContent = '';
    } catch {
      ui.status!.textContent = t().loadError; return;
    }
  }
  const p = shown!.payload;
  for (const v of ['diagram', 'elements', 'people', 'changes'] as const) ui.viewEls![v].hidden = v !== r.view;
  ui.tabs!.hidden = false;
  if (r.view === 'diagram') requestAnimationFrame(() => { if (!r.eid) return; focusElement(r.eid); });
  const info = r.eid ? p.elements[r.eid] ?? null : null;
  highlight(info ? r.eid : null);
  renderPanel(ui.panel!, info, { payload: p, select: (id) => go({ pid, eid: id, view: 'diagram' }), openProcess: (id) => go({ pid: id }) });
  wireDownloads(ui.panel!);
  // gaveta de detalhes (celular): abre ao selecionar um elemento e fecha ao limpar a seleção (senão cobriria os botões de zoom)
  document.body.classList.toggle('panel-open', !!r.eid);
}

// ------------------------------------------------------------------------------------------------ busca
interface Hit { doc: SearchIndex['docs'][number]; score: number }
let active = -1;
let hits: Hit[] = [];

function closeResults(): void { ui.results!.hidden = true; ui.search?.setAttribute('aria-expanded', 'false'); active = -1; }

function query(idx: SearchIndex, text: string): Hit[] {
  const tokens = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length >= 1);
  if (!tokens.length) return [];
  const termKeys = Object.keys(idx.terms);
  let acc = null as Map<number, number> | null;
  for (const tok of tokens) {
    const per = new Map<number, number>();
    for (const k of termKeys) {
      if (!k.startsWith(tok)) continue;
      const bonus = k === tok ? 1 : 0; // palavra exata vale um pouco mais que prefixo
      for (const [doc, w] of idx.terms[k]!) per.set(doc, Math.max(per.get(doc) ?? 0, w + bonus));
    }
    const prev: Map<number, number> | null = acc;
    acc = prev === null ? per : new Map([...prev].filter(([d]) => per.has(d)).map(([d, sc]): [number, number] => [d, sc + per.get(d)!]));
    if (!acc.size) return [];
  }
  return [...acc!].map(([d, score]) => ({ doc: idx.docs[d]!, score })).sort((a, b) => b.score - a.score || a.doc[2].length - b.doc[2].length || a.doc[2].localeCompare(b.doc[2])).slice(0, 40); // empate: título mais curto = correspondência mais específica
}

async function doSearch(text: string): Promise<void> {
  const tr = t();
  if (!text.trim()) { closeResults(); return; }
  const idx = await loadSearch();
  hits = query(idx, text);
  active = hits.length ? 0 : -1;
  clear(ui.results!);
  if (!hits.length) ui.results!.append(h('div', { class: 'none' }, tr.noResults));
  hits.forEach((hit, i) => {
    const [pid, eid, title, kind, snip] = hit.doc;
    ui.results!.append(h('div', { class: `hit${i === active ? ' on' : ''}`, role: 'option', 'data-i': i, onClick: () => open(hit) },
      h('div', { class: 'ht' }, title, h('span', { class: 'chip' }, tr.kind[kind] ?? kind)),
      h('div', { class: 'hs' }, `${refs.get(pid)?.name ?? pid}${snip ? ` — ${snip}` : ''}`), eid ? null : null));
  });
  ui.results!.hidden = false;
  ui.search!.setAttribute('aria-expanded', 'true');
}
function open(hit: Hit): void {
  const [pid, eid] = hit.doc;
  closeResults();
  go({ pid, eid: eid || null, view: 'diagram' });
}
function onSearchKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') { closeResults(); return; }
  if (!hits.length || ui.results!.hidden) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
    ui.results!.querySelectorAll('.hit').forEach((n, i) => n.classList.toggle('on', i === active));
    ui.results!.querySelector('.hit.on')?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); open(hits[active]!); }
}

// ------------------------------------------------------------------------------------------------ boot
function rerender(): void { buildShell(); shown = null; void route(); }

/** Tela de senha (portal protegido). Resolve quando a senha confere e o conteúdo foi decifrado. */
async function unlockFlow(): Promise<boolean> {
  const locked = manifest.locked!;
  const finish = async (key: CryptoKey): Promise<void> => {
    hooks.decode = async (raw) => {
      const r = raw as Partial<Sealed> | null;
      return r && r.e === 1 && r.iv && r.ct ? JSON.parse(await decryptText(key, r as Sealed)) : raw;
    };
    if (manifest.sealed) Object.assign(manifest, JSON.parse(await decryptText(key, manifest.sealed)));
    indexManifest();
  };
  const saved = await restoreSession(locked).catch(() => null);
  if (saved) { await finish(saved); return true; }
  const tr = t();
  const app = document.getElementById('app')!;
  clear(app);
  document.title = manifest.title;
  return new Promise((resolve) => {
    const input = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': tr.locked.password, placeholder: tr.locked.password }) as HTMLInputElement;
    const err = h('p', { class: 'lock-err', role: 'alert' });
    const btn = h('button', { class: 'btn primary', type: 'submit' }, tr.locked.unlock);
    const form = h('form', { class: 'lock' },
      manifest.logo ? h('img', { class: 'logo', src: manifest.logo, alt: '' }) : null,
      h('h1', null, manifest.title), h('h2', null, tr.locked.title), h('p', { class: 'hint' }, tr.locked.hint), input, btn, err);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      btn.disabled = true; err.textContent = '';
      deriveKey(locked, input.value).then(async (key) => {
        if (!key) { err.textContent = tr.locked.wrong; btn.disabled = false; input.select(); return; }
        await finish(key); resolve(true);
      }).catch((ex: Error) => { err.textContent = ex.message; btn.disabled = false; });
    });
    app.append(h('div', { class: 'lockwrap' }, form));
    input.focus();
  });
}

async function boot(): Promise<void> {
  const saved = recall('ps-lang') as Lang | null;
  setLang(saved === 'pt' || saved === 'en' ? saved : manifest.lang);
  applyTheme();
  if (manifest.locked && !(await unlockFlow())) return;
  buildShell();
  window.addEventListener('hashchange', () => void route());
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !(e.target as Element).closest('input,textarea,select')) { e.preventDefault(); ui.search?.focus(); }
  });
  if (manifest.ga4 && navigator.doNotTrack !== '1') { // analytics opt-in (brand.json) e respeita Do-Not-Track
    void injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(manifest.ga4)}`).then(() => {
      const w = window as unknown as { dataLayer: unknown[] };
      w.dataLayer = w.dataLayer || [];
      const gtag = (...a: unknown[]) => { w.dataLayer.push(a); };
      gtag('js', new Date()); gtag('config', manifest.ga4);
    }).catch(() => { /* sem rede: o portal funciona igual */ });
  }
  void route();
}

void boot();
