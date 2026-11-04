/**
 * Gerador DETERMINÍSTICO: requisitos (5W2H) -> GenProcess, sem IA e sem rede.
 *
 * [2026-10-27] Criado: caminho "sem chave de LLM" do modo híbrido (e fallback quando o LLM falha) — Rafael Brito
 * Regras (documentadas porque o texto livre é ambíguo — o resultado é um RASCUNHO para revisão humana):
 * - Raia = `who` (primeiro ator antes de "," "/" ";" " e "); um prefixo "Ator: ação" no passo sobrescreve a raia daquele passo.
 * - Passos = linhas/itens do campo HOW da visão escolhida (numeração, "-", "a)" são removidos); sem quebra de linha,
 *   divide por ";" ou por frases. Sem HOW, vira UMA tarefa com o WHAT (ou a descrição curta).
 * - Decisão: passo iniciando por "se/caso/quando <condição>, <ação> [senão <ação>]" -> gateway "<condição>?" com ramos Sim/Não.
 *   Sem "senão", o ramo "Não" segue direto para o próximo passo (a junção é inserida pelo buildProcessSet).
 * - Subprocesso: item com >=2 sub-itens indentados vira subprocesso, com os sub-itens como processo filho.
 * - Vários requisitos: encadeados na ordem do reqId; cada passo guarda o reqId de origem (rastreabilidade).
 */
import type { GenChild, GenEdge, GenProcess, GenStep } from './generate.js';

export type GenView = 'AS_IS' | 'TO_BE';

export interface GenRequirement {
  reqId: string;
  shortDesc: string;
  who?: string | null; what?: string | null; howAsIs?: string | null; howToday?: string | null;
  whoToBe?: string | null; whatToBe?: string | null; howToBe?: string | null;
}

type Tail = { from: string; label?: string };
interface Item { text: string; sub: string[] }

const clean = (s?: string | null) => (s ?? '').replace(/\r/g, '').trim();
const MARK = /^\s*(?:\d+(?:\.\d+)*[.)]|[a-zA-Z][.)]|[-*•–])\s+/;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const short = (s: string, max = 80) => {
  const t = cap(s.replace(/\s+/g, ' ').replace(/[.;:]+$/, '').trim());
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 30)) + '…';
};
/** primeiro ator: "Faturamento e Cobrança" -> "Faturamento" */
const actorOf = (who?: string | null) => short(clean(who).split(/[,/;]| e /i)[0] ?? '', 40) || 'Responsável';

/** Texto do HOW -> itens de 1º nível (cada um com seus sub-itens indentados). */
function toItems(text: string): Item[] {
  const lines = text.split('\n').map((l) => l.replace(/\t/g, '    ')).filter((l) => l.trim());
  if (!lines.length) return [];
  if (lines.length === 1) {
    return lines[0]!.split(/;\s+|(?<=[.!?])\s+(?=[A-ZÀ-Ú])/).map((x) => x.replace(MARK, '').trim()).filter(Boolean).map((t) => ({ text: t, sub: [] }));
  }
  const base = Math.min(...lines.map((l) => l.search(/\S/)));
  const items: Item[] = [];
  for (const l of lines) {
    const t = l.replace(MARK, '').trim();
    if (l.search(/\S/) - base >= 2 && items.length) items[items.length - 1]!.sub.push(t);
    else items.push({ text: t, sub: [] });
  }
  return items;
}

const DECISION = /^(?:se|caso|quando)\s+(.+?)\s*(?:,|:|\bent[aã]o\b)\s*(.+?)(?:\s*[;,]?\s*(?:sen[aã]o|se n[aã]o|caso contr[aá]rio)\s*,?\s*(.+))?$/i;
/** ação que encerra o caminho (o ramo termina em evento de fim e não segue para o próximo passo) */
const TERMINAL = /^(?:encerrar|cancelar|finalizar|arquivar|abortar|recusar|rejeitar|reprovar|descartar)\b/i;
const ACTOR_PREFIX = /^([A-Za-zÀ-ÿ][\wÀ-ÿ ]{1,30}):\s+(.+)$/;

/** Acumulador de passos/arestas; `tails` = pontas soltas que ligam ao PRÓXIMO passo criado. */
class Chain {
  steps: GenStep[] = [];
  edges: GenEdge[] = [];
  tails: Tail[] = [];
  /** passos de ramo que já terminam em fim: não entram nas pontas soltas */
  private terminals = new Set<string>();
  private n = 0;
  constructor(private refs: string[]) {}

  private create(kind: GenStep['kind'], name: string, lane: string): GenStep {
    const s: GenStep = { id: `S${++this.n}`, kind, name: short(name), lane, requirementRefs: this.refs };
    this.steps.push(s);
    return s;
  }
  /** cria um passo e liga as pontas soltas a ele */
  private add(kind: GenStep['kind'], name: string, lane: string): GenStep {
    const s = this.create(kind, name, lane);
    for (const t of this.tails) this.edges.push({ from: t.from, to: s.id, ...(t.label && { label: t.label }) });
    this.tails = [];
    return s;
  }
  /** passo ligado a um pai específico (ramo de decisão), sem mexer nas pontas soltas */
  private branch(parent: string, name: string, lane: string, label: string): GenStep {
    const pref = ACTOR_PREFIX.exec(name); // o ramo também pode trocar de ator ("Se aprovado, Jurídico: elaborar minuta")
    const text = pref ? pref[2]! : name;
    const who = pref ? pref[1]! : lane;
    const s = this.create('task', text, who);
    this.edges.push({ from: parent, to: s.id, label });
    if (TERMINAL.test(text)) { // [2026-10-27] "senão, encerrar proposta" termina aqui — não segue para o passo seguinte
      const end = this.create('end', 'Encerrado', who);
      this.edges.push({ from: s.id, to: end.id });
      this.terminals.add(s.id);
    }
    return s;
  }

  push(item: Item, lane: string): GenStep {
    const pref = ACTOR_PREFIX.exec(item.text);
    const actor = pref ? short(pref[1]!, 40) : lane;
    const text = pref ? pref[2]! : item.text;
    const dec = DECISION.exec(text);
    if (dec) {
      const g = this.add('decision', short(dec[1]!.replace(/\?+$/, '') + '?'), actor);
      const yes = this.branch(g.id, dec[2]!, actor, 'Sim');
      this.tails = this.terminals.has(yes.id) ? [] : [{ from: yes.id }];
      if (dec[3]) {
        const no = this.branch(g.id, dec[3], actor, 'Não');
        if (!this.terminals.has(no.id)) this.tails.push({ from: no.id });
      } else this.tails.push({ from: g.id, label: 'Não' });
      return g;
    }
    const s = this.add(item.sub.length >= 2 ? 'subprocess' : 'task', text, actor);
    this.tails = [{ from: s.id }];
    return s;
  }
}

function chainOf(items: Item[], lane: string, refs: string[], children?: Record<string, GenChild>): Chain {
  const chain = new Chain(refs);
  for (const it of items) {
    const step = chain.push(it, lane);
    if (step.kind === 'subprocess' && children) {
      const sub = chainOf(it.sub.map((t) => ({ text: t, sub: [] })), step.lane ?? lane, refs);
      children[step.id] = { name: step.name, steps: sub.steps, edges: sub.edges };
    }
  }
  return chain;
}

/** Requisitos -> GenProcess (rascunho determinístico). */
export function genFromRequirements(reqs: GenRequirement[], view: GenView, name?: string): GenProcess {
  const sorted = [...reqs].sort((a, b) => a.reqId.localeCompare(b.reqId, undefined, { numeric: true }));
  const children: Record<string, GenChild> = {};
  const steps: GenStep[] = [], edges: GenEdge[] = [];
  let tails: Tail[] = [];

  sorted.forEach((r, idx) => {
    const toBe = view === 'TO_BE';
    const who = toBe ? clean(r.whoToBe) || clean(r.who) : clean(r.who);
    const what = toBe ? clean(r.whatToBe) || clean(r.what) : clean(r.what);
    const how = toBe ? clean(r.howToBe) || clean(r.howAsIs) || clean(r.howToday) : clean(r.howAsIs) || clean(r.howToday) || clean(r.howToBe);
    const lane = actorOf(who);
    const items = toItems(how);
    if (!items.length) items.push({ text: what || r.shortDesc, sub: [] });

    const local: Record<string, GenChild> = {};
    const c = chainOf(items, lane, [r.reqId], local);
    // ids locais (S1..) ficam globais prefixando o índice do requisito; o requisito anterior liga ao 1º passo deste
    const ren = (id: string) => `R${idx}_${id}`;
    const first = c.steps[0]?.id;
    for (const s of c.steps) steps.push({ ...s, id: ren(s.id) });
    for (const e of c.edges) edges.push({ ...e, from: ren(e.from), to: ren(e.to) });
    if (first) for (const t of tails) edges.push({ from: t.from, to: ren(first), ...(t.label && { label: t.label }) });
    for (const [k, v] of Object.entries(local)) children[ren(k)] = v;
    tails = c.tails.map((t) => ({ ...t, from: ren(t.from) }));
  });

  const title = name?.trim() || (sorted.length === 1 ? sorted[0]!.shortDesc : `Processo — ${sorted.slice(0, 3).map((r) => r.reqId).join(', ')}${sorted.length > 3 ? '…' : ''}`);
  return { name: title.slice(0, 200), steps, edges, children };
}
