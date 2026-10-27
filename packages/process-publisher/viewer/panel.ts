/**
 * Painel de detalhes do elemento (leitura): propriedades, RACI, execução, dados, atributos tipados (tabelas, links, imagens, arquivos), vínculos.
 * [2026-10-14] Criado: Fase 3 — equivalente (e além) do painel de propriedades do portal do Bizagi — Rafael Brito
 * Só mostra o que existe: seção vazia não aparece.
 */
import type { AttrOut, ElementInfo, ProcessPayload } from '../src/payload';
import { append, clear, friendlyUrl, h, type Child } from './dom';
import { t } from './i18n';

export interface PanelCtx {
  payload: ProcessPayload;
  /** seleciona outro elemento do mesmo processo */
  select: (elementId: string) => void;
  /** abre outro processo (drill-down) */
  openProcess: (processId: string) => void;
}

/** append tolerante a null/false (omite o que não existe) */
const put = (root: HTMLElement, ...c: Child[]): void => append(root, c);
const section = (title: string, ...children: Child[]) => h('section', { class: 'psec' }, h('h3', null, title), ...children);
const kv = (label: string, ...value: Child[]) => h('div', { class: 'kv' }, h('span', { class: 'k' }, label), h('span', { class: 'v' }, ...value));
const chips = (values: string[], cls = '') => h('span', { class: `chips ${cls}` }, ...values.map((v) => h('span', { class: 'chip' }, v)));
const has = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

function attrValue(a: AttrOut): Node {
  const v = a.value;
  const link = (u: string, label?: string) => h('a', { href: u }, label ?? friendlyUrl(u));
  switch (a.type) {
    case 'url': case 'fileLink': return typeof v === 'string' && /^https?:\/\//i.test(v) ? link(v) : h('span', { class: 'pre' }, String(v));
    case 'multiselect': return chips(Array.isArray(v) ? (v as string[]) : []);
    case 'image': return typeof v === 'string' && v.startsWith('data:image/') ? h('img', { class: 'attr-img', src: v, alt: a.name }) : h('span', null, t().none);
    case 'file': {
      try {
        const f = JSON.parse(String(v)) as { name: string; data: string };
        return typeof f.data === 'string' && f.data.startsWith('data:') ? h('a', { class: 'dl', href: '#', download: f.name, 'data-file': f.data }, `${f.name} ⤓ ${t().download}`) : h('span', null, f.name);
      } catch { return h('span', null, t().none); }
    }
    case 'table': {
      const rows = Array.isArray(v) && (v as unknown[]).every(Array.isArray) ? (v as string[][]) : [];
      const types = a.columnTypes ?? [];
      return h('div', { class: 'tblwrap' }, h('table', { class: 'attr-table' },
        h('thead', null, h('tr', null, ...(a.columns ?? []).map((c) => h('th', null, c)))),
        h('tbody', null, ...rows.map((r) => h('tr', null, ...(a.columns ?? []).map((_, i) => {
          const cell = r[i] ?? '';
          return h('td', null, types[i] === 'url' && /^https?:\/\//i.test(cell) ? link(cell) : cell);
        }))))));
    }
    default: return h('span', { class: 'pre' }, Array.isArray(v) ? v.flat().join(', ') : String(v));
  }
}

export function renderPanel(root: HTMLElement, info: ElementInfo | null, ctx: PanelCtx): void {
  clear(root);
  const tr = t();
  if (!info) {
    const m = ctx.payload.meta;
    put(root, 
      h('div', { class: 'ptype' }, tr.kind.process!),
      h('h2', null, ctx.payload.name),
      m.description ? h('p', { class: 'pre' }, m.description) : null,
      h('div', { class: 'metas' },
        m.version ? kv(tr.version, m.version) : null, m.author ? kv(tr.author, m.author) : null, m.owner ? kv(tr.owner, m.owner) : null,
        m.modifiedAt ? kv(tr.modified, new Date(m.modifiedAt).toLocaleDateString()) : null, m.tags.length ? kv(tr.tags, chips(m.tags)) : null),
      m.documentation ? section(tr.sections.documentation, h('p', { class: 'pre' }, m.documentation)) : null,
      h('p', { class: 'hint' }, tr.selectHint),
    );
    return;
  }

  const kind = tr.kind[info.kind] ?? info.kind;
  const variant = info.variant ? tr.variant[info.variant] : '';
  put(root, h('div', { class: 'ptype' }, variant ? `${kind} · ${variant}` : kind), h('h2', null, info.name || info.id));

  if (info.called) put(root, h('button', { class: 'btn primary', onClick: () => ctx.openProcess(info.called!.id) }, `↗ ${tr.openProcess}: ${info.called.name}`));

  const isFlow = info.kind === 'sequence' || info.kind === 'association' || info.kind === 'message';
  if (isFlow) {
    put(root, 
      section(tr.sections.flow,
        kv(tr.f.from, info.from ?? ''), kv(tr.f.to, info.to ?? ''),
        info.condition ? kv(tr.sections.condition, h('span', { class: 'pre mono' }, info.condition)) : null,
        has(info.probability) ? kv(tr.f.probability, `${info.probability}%`) : null,
        info.isDefault ? kv(tr.f.default, '✓') : null),
      info.description ? section(tr.sections.about, h('p', { class: 'pre' }, info.description)) : null,
      info.documentation ? section(tr.sections.documentation, h('p', { class: 'pre' }, info.documentation)) : null,
    );
    return;
  }

  if (info.description || info.url || info.lane || info.attached) {
    put(root, section(tr.sections.about,
      info.description ? h('p', { class: 'pre' }, info.description) : null,
      info.lane ? kv(tr.f.lane, info.lane) : null,
      info.attached ? kv(tr.f.attached, info.attached) : null,
      info.url ? kv(tr.f.link, /^https?:\/\//i.test(info.url) ? h('a', { href: info.url }, friendlyUrl(info.url)) : info.url) : null));
  }
  if (info.documentation) put(root, section(tr.sections.documentation, h('p', { class: 'pre' }, info.documentation)));

  if (has(info.performer) || has(info.accountable) || has(info.consulted) || has(info.informed)) {
    put(root, section(tr.sections.raci,
      info.performer ? kv(tr.f.responsible, info.performer) : null,
      info.accountable ? kv(tr.f.accountable, info.accountable) : null,
      has(info.consulted) ? kv(tr.f.consulted, chips(info.consulted!)) : null,
      has(info.informed) ? kv(tr.f.informed, chips(info.informed!)) : null));
  }
  if (has(info.sla) || has(info.duration) || has(info.cost) || has(info.priority) || has(info.loop) || has(info.sapTransaction)) {
    put(root, section(tr.sections.execution,
      info.sla ? kv(tr.f.sla, info.sla) : null, info.duration ? kv(tr.f.duration, info.duration) : null, info.cost ? kv(tr.f.cost, info.cost) : null,
      info.priority ? kv(tr.f.priority, tr.priorityKind[info.priority] ?? info.priority) : null,
      info.loop ? kv(tr.f.loop, tr.loopKind[info.loop] ?? info.loop) : null,
      info.sapTransaction ? kv(tr.f.sap, h('code', null, info.sapTransaction)) : null));
  }
  if (has(info.systems)) put(root, section(tr.sections.systems, chips(info.systems!)));
  if (has(info.inputs) || has(info.outputs) || has(info.rules)) {
    put(root, section(tr.sections.data,
      has(info.inputs) ? kv(tr.f.inputs, chips(info.inputs!)) : null, has(info.outputs) ? kv(tr.f.outputs, chips(info.outputs!)) : null,
      has(info.rules) ? kv(tr.f.rules, h('ul', { class: 'bullets' }, ...info.rules!.map((r) => h('li', null, r)))) : null));
  }
  for (const a of info.attributes ?? []) put(root, h('section', { class: 'psec attr', 'data-attr': a.name }, h('h3', null, a.name), attrValue(a)));
  if (has(info.requirements)) put(root, section(tr.sections.requirements, chips(info.requirements!, 'mono')));

  const links = (title: string, list: Array<{ id: string; name: string; label?: string }>) =>
    section(title, h('ul', { class: 'bullets nav' }, ...list.map((x) => h('li', null,
      h('a', { href: '#', onClick: (e: Event) => { e.preventDefault(); ctx.select(x.id); } }, x.name || x.id), x.label ? h('span', { class: 'lab' }, ` (${x.label})`) : null))));
  if (has(info.in)) put(root, links(tr.sections.incoming, info.in!));
  if (has(info.out)) put(root, links(tr.sections.outgoing, info.out!));
}

/** Os links de download usam data: URLs (não passam pelo filtro de href do `h`): ligados aqui, depois de montado, só para data: confiável. */
export function wireDownloads(root: HTMLElement): void {
  root.querySelectorAll<HTMLAnchorElement>('a.dl[data-file]').forEach((a) => {
    const data = a.getAttribute('data-file') ?? '';
    if (data.startsWith('data:')) a.setAttribute('href', data);
  });
}
