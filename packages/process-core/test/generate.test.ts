// [2026-10-27] Criado: geração automática de processos a partir de requisitos (determinística + montagem/layout) — Rafael Brito
import { describe, expect, it } from 'vitest';
import { buildProcessSet, genFromRequirements, parseGenProcess, validateModel, type GenRequirement, type ProcessModel } from '../src/index.js';

const INTEGRITY = ['DUPLICATE_ID', 'FLOW_DANGLING', 'LANE_UNKNOWN', 'BOUNDARY_NO_HOST', 'BOUNDARY_BAD_HOST'];
const integrity = (m: ProcessModel) => validateModel(m).filter((i) => INTEGRITY.includes(i.code));
const cy = (b: { y: number; h: number }) => b.y + b.h / 2;
const laneMid = (m: ProcessModel, id: string) => { const b = m.lanes.find((l) => l.id === id)!.bounds!; return b.y + b.h / 2; };

const REQ: GenRequirement = {
  reqId: 'REQ-003', shortDesc: 'Criar contrato de fornecimento', who: 'Comercial, Jurídico', what: 'Criar contrato',
  howToBe: [
    '1. Consultar crédito do cliente',
    '2. Se crédito aprovado, Jurídico: elaborar minuta; senão, encerrar proposta',
    '3. Validar documentos',
    '   a) Conferir cadastro',
    '   b) Conferir assinaturas',
    '4. Sistema SAP: criar contrato',
  ].join('\n'),
};

describe('genFromRequirements', () => {
  it('raia = who; decisão vira gateway com ramos Sim/Não; item com sub-itens vira subprocesso; refs rastreáveis', () => {
    const g = genFromRequirements([REQ], 'TO_BE');
    expect(g.name).toBe('Criar contrato de fornecimento');
    const dec = g.steps.find((s) => s.kind === 'decision')!;
    expect(dec.name).toBe('Crédito aprovado?');
    expect(g.edges.filter((e) => e.from === dec.id).map((e) => e.label).sort()).toEqual(['Não', 'Sim']);
    const sub = g.steps.find((s) => s.kind === 'subprocess')!;
    expect(Object.keys(g.children)).toEqual([sub.id]);
    expect(g.children[sub.id]!.steps).toHaveLength(2);
    expect(g.steps.every((s) => s.requirementRefs.includes('REQ-003'))).toBe(true);
    expect(g.steps.find((s) => s.lane === 'Jurídico')).toBeTruthy(); // prefixo "Ator:" troca a raia
    expect(parseGenProcess(g)).toBeTruthy(); // saída respeita o contrato
  });

  it('sem HOW: uma tarefa com o WHAT; AS_IS usa howAsIs', () => {
    const g = genFromRequirements([{ reqId: 'REQ-1', shortDesc: 'x', who: 'Faturamento', what: 'Emitir fatura', howAsIs: 'Digitar no Excel; Enviar por e-mail' }, { reqId: 'REQ-2', shortDesc: 'y', who: 'Cobrança', what: 'Cobrar cliente' }], 'AS_IS');
    expect(g.steps.map((s) => s.name)).toEqual(['Digitar no Excel', 'Enviar por e-mail', 'Cobrar cliente']);
    expect(g.edges).toHaveLength(2); // encadeia requisitos
  });
});

describe('buildProcessSet', () => {
  const set = buildProcessSet(genFromRequirements([REQ], 'TO_BE'), { existingKeys: ['Process_1'] });
  const [main, child] = set;

  it('gera principal + subprocesso detalhado, chaves livres, calledProcessId aponta para o filho', () => {
    expect(set).toHaveLength(2);
    expect(main!.id).toBe('Process_2');
    expect(child!.id).toBe('Process_3');
    expect(main!.nodes.find((n) => n.kind === 'subprocess')!.calledProcessId).toBe('Process_3');
    for (const m of set) expect(integrity(m)).toEqual([]);
  });

  it('um início e um fim, junção antes de quem recebe >1 fluxo, fluxo padrão na decisão', () => {
    expect(main!.nodes.filter((n) => n.kind === 'start')).toHaveLength(1);
    expect(main!.nodes.filter((n) => n.kind === 'end')).toHaveLength(2); // "senão, encerrar proposta" termina; o fluxo principal tem o seu fim
    const gws = main!.nodes.filter((n) => n.kind === 'gateway');
    const decision = gws.find((g) => g.name)!;
    expect(main!.flows.filter((f) => f.sourceId === decision.id && f.isDefault)).toHaveLength(1);
    expect(gws.filter((g) => !g.name)).toHaveLength(0); // ramo "encerrar" não converge: não precisa de junção
    // o ramo terminal não segue para "Validar documentos"
    const encerrar = main!.nodes.find((n) => n.name === 'Encerrar proposta')!;
    expect(main!.flows.filter((f) => f.sourceId === encerrar.id).map((f) => main!.nodes.find((n) => n.id === f.targetId)!.kind)).toEqual(['end']);
  });

  it('ramos que convergem ganham junção NA RAIA do destino (fluxo principal reto, centrado)', () => {
    const g = parseGenProcess({
      name: 'Converge', steps: [
        { id: 'a', kind: 'task', name: 'Receber pedido', lane: 'A' },
        { id: 'd', kind: 'decision', name: 'Urgente?', lane: 'A' },
        { id: 'x', kind: 'task', name: 'Priorizar', lane: 'B' },
        { id: 'y', kind: 'task', name: 'Enfileirar', lane: 'A' },
        { id: 'z', kind: 'task', name: 'Atender pedido', lane: 'A' },
      ],
      edges: [{ from: 'a', to: 'd' }, { from: 'd', to: 'x', label: 'Sim' }, { from: 'd', to: 'y', label: 'Não' }, { from: 'x', to: 'z' }, { from: 'y', to: 'z' }],
    });
    const m = buildProcessSet(g, { existingKeys: [] })[0]!;
    const merge = m.nodes.find((n) => n.kind === 'gateway' && !n.name)!;
    const z = m.nodes.find((n) => n.name === 'Atender pedido')!;
    expect(merge.laneId).toBe(z.laneId);
    expect(cy(merge.bounds!)).toBeCloseTo(cy(z.bounds!), 5);
  });

  it('raias por ator, todo elemento dentro da própria raia e CENTRADO no meio dela quando está sozinho na coluna', () => {
    expect(main!.lanes.map((l) => l.name)).toEqual(['Comercial', 'Jurídico', 'Sistema SAP']);
    for (const n of main!.nodes) {
      const lane = main!.lanes.find((l) => l.id === n.laneId)!.bounds!;
      expect(n.bounds!.y).toBeGreaterThanOrEqual(lane.y);
      expect(n.bounds!.y + n.bounds!.h).toBeLessThanOrEqual(lane.y + lane.h);
    }
    // o laço principal tem uma tarefa por coluna: cada elemento fica exatamente no meio da sua raia
    const task = main!.nodes.find((n) => n.name === 'Consultar crédito do cliente')!;
    expect(cy(task.bounds!)).toBeCloseTo(laneMid(main!, task.laneId!), 5);
    const sap = main!.nodes.find((n) => n.name === 'Criar contrato')!;
    expect(cy(sap.bounds!)).toBeCloseTo(laneMid(main!, sap.laneId!), 5);
  });

  it('ramos da decisão em raias diferentes: cada um no centro da própria raia ("fora"); na mesma raia: simétricos ao centro', () => {
    const g = parseGenProcess({
      name: 'Ramos', steps: [
        { id: 'a', kind: 'task', name: 'Receber pedido', lane: 'A' },
        { id: 'd', kind: 'decision', name: 'Pedido válido?', lane: 'A' },
        { id: 'x', kind: 'task', name: 'Aprovar', lane: 'A' },
        { id: 'y', kind: 'task', name: 'Rejeitar', lane: 'A' },
        { id: 'z', kind: 'task', name: 'Escalar', lane: 'B' },
      ],
      edges: [{ from: 'a', to: 'd' }, { from: 'd', to: 'x', label: 'Sim' }, { from: 'd', to: 'y', label: 'Não' }, { from: 'd', to: 'z', label: 'Talvez' }],
    });
    const m = buildProcessSet(g, { existingKeys: [] })[0]!;
    const dec = m.nodes.find((n) => n.name === 'Pedido válido?')!;
    expect(cy(dec.bounds!)).toBeCloseTo(laneMid(m, dec.laneId!), 5);
    const x = m.nodes.find((n) => n.name === 'Aprovar')!, y = m.nodes.find((n) => n.name === 'Rejeitar')!;
    expect(x.laneId).toBe(y.laneId);
    expect((cy(x.bounds!) + cy(y.bounds!)) / 2).toBeCloseTo(laneMid(m, x.laneId!), 5); // par simétrico ao centro
    const z = m.nodes.find((n) => n.name === 'Escalar')!;
    expect(cy(z.bounds!)).toBeCloseTo(laneMid(m, z.laneId!), 5); // sozinho na outra raia: no centro dela
    expect(integrity(m)).toEqual([]);
  });

  it('é determinístico (mesma entrada => mesmo modelo, ignorando o carimbo de data)', () => {
    const strip = (m: ProcessModel) => JSON.stringify({ ...m, meta: undefined });
    const again = buildProcessSet(genFromRequirements([REQ], 'TO_BE'), { existingKeys: ['Process_1'] });
    expect(again.map(strip)).toEqual(set.map(strip));
  });
});
