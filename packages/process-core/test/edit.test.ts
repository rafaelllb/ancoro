// [2026-10-14] Criado: testes das operações de edição (Fase 2) + reprodução de processos reais só com operações — Rafael Brito
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addFlow, addLane, addNode, addNodeAfter, whyCannotAddAfter, resizePool, addParticipant, canConnect, canonicalize, deleteElements, fromBpmnXml, importBizagi, moveNodes, newProcess,
  parseModel, removeLane, resizeLane, toBpmnXml, updateFlow, updateNode, validateModel, setNodeLane, changeNodeKind,
  type ProcessModel,
} from '../src/index.js';
import { billingSample } from '../src/samples/billing.js';

const flowOf = (m: ProcessModel, id: string) => m.flows.find((f) => f.id === id)!;
const nodeOf = (m: ProcessModel, id: string) => m.nodes.find((n) => n.id === id)!;
const integrity = (m: ProcessModel) =>
  validateModel(m).filter((i) => ['DUPLICATE_ID', 'FLOW_DANGLING', 'LANE_UNKNOWN', 'BOUNDARY_NO_HOST', 'BOUNDARY_BAD_HOST'].includes(i.code));

describe('addNode / moveNodes / addFlow', () => {
  it('cria nó na grade, com lane pelo centro vertical e id único', () => {
    const m = billingSample();
    const a = addNode(m, { kind: 'task', variant: 'user', name: 'Nova', at: { x: 703, y: 262 } });
    const n = nodeOf(a.model, a.id);
    expect(n.bounds!.x % 10).toBe(0);
    expect(n.laneId).toBe('Lane_B'); // y=262 está na faixa 170..340
    // nó criado pela edição tem TODOS os defaults do schema (regressão: attributes/listas vinham undefined e quebravam a UI)
    expect(n.attributes).toEqual([]);
    expect(n.consulted).toEqual([]);
    expect(n.loop).toBe('none');
    expect(() => parseModel(a.model)).not.toThrow();
    const b = addNode(a.model, { kind: 'task', at: { x: 10, y: 10 } });
    expect(b.id).not.toBe(a.id);
  });

  it('mover religa só os fluxos do nó, atualiza a lane e mantém ortogonalidade', () => {
    const m = billingSample();
    const before = flowOf(m, 'f1').waypoints; // fora do nó movido
    const moved = moveNodes(m, ['t3'], 0, 170); // Lane_B -> Lane_C
    expect(nodeOf(moved, 't3').laneId).toBe('Lane_C');
    expect(flowOf(moved, 'f1').waypoints).toEqual(before);
    expect(flowOf(moved, 'f6').waypoints).not.toEqual(flowOf(m, 'f6').waypoints);
    for (const f of moved.flows.filter((x) => x.sourceId === 't3' || x.targetId === 't3')) {
      f.waypoints!.slice(1).forEach(([x, y], i) => expect(f.waypoints![i]![0] === x || f.waypoints![i]![1] === y).toBe(true));
    }
    expect(integrity(moved)).toEqual([]);
  });

  it('mover para fora da borda direita alarga lanes e pool', () => {
    const m = billingSample();
    const moved = moveNodes(m, ['e2'], 600, 0);
    expect(moved.pool!.w).toBeGreaterThan(m.pool!.w);
    expect(moved.lanes.every((l) => l.bounds!.x + l.bounds!.w === moved.pool!.x + moved.pool!.w)).toBe(true);
  });

  it('boundary acompanha a hospedeira e não se move sozinho', () => {
    let m = billingSample();
    const b = addNode(m, { kind: 'boundary', variant: 'error', attachedToId: 't1', at: { x: 0, y: 0 } });
    m = b.model;
    const host0 = nodeOf(m, 't1').bounds!, bd0 = nodeOf(m, b.id).bounds!;
    const moved = moveNodes(m, ['t1'], 30, 20);
    expect(nodeOf(moved, b.id).bounds!.x - bd0.x).toBe(30);
    expect(nodeOf(moved, 't1').bounds!.y - host0.y).toBe(20);
    const alone = moveNodes(m, [b.id], 100, 100);
    expect(nodeOf(alone, b.id).bounds).toEqual(bd0);
  });

  it('addFlow infere o tipo, roteia e recusa conexões inválidas com motivo', () => {
    let m = billingSample();
    const seq = addFlow(m, { sourceId: 't4', targetId: 'e2' });
    expect(flowOf(seq.model, seq.id).kind).toBe('sequence');
    expect(flowOf(seq.model, seq.id).waypoints!.length).toBeGreaterThanOrEqual(2);
    expect(canConnect(m, 't1', 't1')).toBe('self');
    expect(canConnect(m, 't1', 'g1')).toBe('duplicate');
    expect(canConnect(m, 'e1', 't1')).toBe('end-no-outgoing');
    expect(canConnect(m, 't1', 's1')).toBe('start-no-incoming');
    expect(canConnect(m, 't1', 'n1')).toBeNull(); // anotação -> associação
    expect(canConnect(m, 't1', 't2', 'association')).toBe('association-needs-satellite');
    expect(() => addFlow(m, { sourceId: 'e1', targetId: 't1' })).toThrow(/end-no-outgoing/);
    // mensagem: nó -> participante externo
    const p = addParticipant(m, 'Sistema externo');
    m = p.model;
    expect(canConnect(m, 't4', p.id)).toBeNull();
    expect(canConnect(m, 't1', 't4', 'message')).toBe('message-same-pool');
    const msg = addFlow(m, { sourceId: 't4', targetId: p.id });
    expect(flowOf(msg.model, msg.id).kind).toBe('message');
    expect(canConnect(msg.model, p.id, 't4')).toBeNull(); // volta
  });
});

describe('deleteElements e lanes', () => {
  it('apagar nó remove fluxos ligados e boundaries anexados', () => {
    let m = billingSample();
    const b = addNode(m, { kind: 'boundary', variant: 'timer', attachedToId: 't2', at: { x: 0, y: 0 } });
    m = deleteElements(b.model, ['t2']);
    expect(m.nodes.some((n) => n.id === 't2' || n.id === b.id)).toBe(false);
    expect(m.flows.some((f) => f.sourceId === 't2' || f.targetId === 't2')).toBe(false);
    expect(integrity(m)).toEqual([]);
  });

  it('redimensionar lane empurra o que está abaixo e o pool acompanha', () => {
    const m = billingSample();
    const r = resizeLane(m, 'Lane_A', 250); // era 170 (+80)
    const dy = r.lanes[0]!.bounds!.h - m.lanes[0]!.bounds!.h;
    expect(dy).toBe(80);
    expect(r.lanes[1]!.bounds!.y).toBe(m.lanes[1]!.bounds!.y + 80);
    expect(nodeOf(r, 't3').bounds!.y).toBe(nodeOf(m, 't3').bounds!.y + 80);
    expect(nodeOf(r, 't1').bounds!.y).toBe(nodeOf(m, 't1').bounds!.y);
    expect(r.pool!.h).toBe(m.pool!.h + 80);
    expect(resizeLane(m, 'Lane_A', 10).lanes[0]!.bounds!.h).toBe(80); // mínimo
  });

  it('remover lane apaga seus nós, fecha o vão e mantém o modelo consistente', () => {
    const m = billingSample();
    const r = removeLane(m, 'Lane_B');
    expect(r.lanes.map((l) => l.id)).toEqual(['Lane_A', 'Lane_C']);
    expect(r.nodes.some((n) => n.laneId === 'Lane_B')).toBe(false);
    expect(r.lanes[1]!.bounds!.y).toBe(r.lanes[0]!.bounds!.y + r.lanes[0]!.bounds!.h);
    expect(r.pool!.h).toBe(m.pool!.h - m.lanes[1]!.bounds!.h);
    expect(integrity(r)).toEqual([]);
  });

  it('addLane acrescenta abaixo; a primeira lane de um processo sem lanes adota todo o conteúdo', () => {
    const m = addLane(billingSample(), 'Nova').model;
    expect(m.lanes).toHaveLength(4);
    expect(m.lanes[3]!.bounds!.y).toBe(m.lanes[2]!.bounds!.y + m.lanes[2]!.bounds!.h);
    const bare = newProcess([], 'P');
    const withLane = addLane(bare, 'Única').model;
    expect(withLane.lanes).toHaveLength(1);
    expect(nodeOf(withLane, 'Start_1').laneId).toBe(withLane.lanes[0]!.id);
    expect(laneContains(withLane)).toBe(true);
  });

  it('setNodeLane move o nó para o centro da lane de destino', () => {
    const m = setNodeLane(billingSample(), 't1', 'Lane_C');
    expect(nodeOf(m, 't1').laneId).toBe('Lane_C');
  });
});

const laneContains = (m: ProcessModel) => m.nodes.every((n) => {
  const l = m.lanes.find((x) => x.id === n.laneId)!;
  return n.bounds!.y >= l.bounds!.y && n.bounds!.y + n.bounds!.h <= l.bounds!.y + l.bounds!.h;
});

describe('trocar tipo: tarefa <-> subprocesso (campo Variante)', () => {
  it('tarefa vira subprocesso mantendo o centro, as propriedades e re-roteando os fluxos', () => {
    let m = updateNode(billingSample(), 't3', { performer: 'Sistema', sapTransaction: 'EA00', requirementRefs: ['REQ-8'], description: 'desc' });
    const before = nodeOf(m, 't3').bounds!;
    const bd = addNode(m, { kind: 'boundary', variant: 'error', attachedToId: 't3', at: { x: 0, y: 0 } });
    m = bd.model;
    const r = changeNodeKind(m, 't3', 'subprocess');
    const n = nodeOf(r, 't3');
    expect(n.kind).toBe('subprocess');
    expect(n.variant).toBeUndefined();
    expect([n.performer, n.sapTransaction, n.requirementRefs, n.description, n.laneId]).toEqual(['Sistema', 'EA00', ['REQ-8'], 'desc', 'Lane_B']);
    expect([n.bounds!.w, n.bounds!.h]).toEqual([140, 80]);
    expect(n.bounds!.x + n.bounds!.w / 2).toBeCloseTo(before.x + before.w / 2, 0); // mesmo centro
    // boundary acompanha a nova borda inferior; fluxos ligados saem da nova borda
    const b = nodeOf(r, bd.id).bounds!;
    expect(b.y + b.h / 2).toBeCloseTo(n.bounds!.y + n.bounds!.h, 0);
    const out = r.flows.find((f) => f.sourceId === 't3')!;
    expect(out.waypoints![0]![0]).toBe(n.bounds!.x + n.bounds!.w);
    expect(integrity(r)).toEqual([]);
  });

  it('subprocesso vira tarefa (variante escolhida), descartando o vínculo com outro processo', () => {
    let m = updateNode(billingSample(), 'sub1', { calledProcessId: 'Process_Outro', loop: 'sequential' });
    const r = changeNodeKind(m, 'sub1', 'task', 'user');
    const n = nodeOf(r, 'sub1');
    expect([n.kind, n.variant, n.calledProcessId, n.loop]).toEqual(['task', 'user', undefined, 'sequential']);
    expect([n.bounds!.w, n.bounds!.h]).toEqual([120, 70]);
    expect(nodeOf(changeNodeKind(m, 'sub1', 'task'), 'sub1').variant).toBe('generic');
  });

  it('mesmo tipo é no-op (ou só muda a variante); outros pares são recusados', async () => {
    const m = billingSample();
    expect(changeNodeKind(m, 't1', 'task')).toBe(m);
    expect(nodeOf(changeNodeKind(m, 't1', 'task', 'manual'), 't1').variant).toBe('manual');
    expect(() => changeNodeKind(m, 'g1', 'task')).toThrow(/intercambiáveis/);
    expect(() => changeNodeKind(m, 'inexistente', 'task')).toThrow();
    // o resultado exporta para BPMN como o elemento certo
    const xml = await toBpmnXml(changeNodeKind(m, 't1', 'subprocess'));
    expect(xml).toContain('<bpmn:subProcess id="t1"');
    expect(await toBpmnXml(changeNodeKind(changeNodeKind(m, 't1', 'subprocess'), 't1', 'task', 'user'))).toContain('<bpmn:userTask id="t1"');
  });
});

describe('propriedades', () => {
  it('updateNode valida variant x kind e limpa opcionais com string vazia', () => {
    const m = billingSample();
    expect(nodeOf(updateNode(m, 't1', { variant: 'user', sla: '' }), 't1')).toMatchObject({ variant: 'user' });
    expect(nodeOf(updateNode(m, 't1', { sla: '' }), 't1').sla).toBeUndefined();
    expect(() => updateNode(m, 't1', { variant: 'timer' })).toThrow(/variant/);
    expect(nodeOf(updateNode(m, 't1', { requirementRefs: ['REQ-1', 'REQ-2'] }), 't1').requirementRefs).toEqual(['REQ-1', 'REQ-2']);
  });

  it('fluxo padrão: só em gateway exclusivo/inclusivo e único por gateway', () => {
    const m = billingSample();
    const r = updateFlow(m, 'f3', { isDefault: true }); // f4 era o padrão de g1
    expect(flowOf(r, 'f3').isDefault).toBe(true);
    expect(flowOf(r, 'f4').isDefault).toBe(false);
    expect(() => updateFlow(m, 'f1', { isDefault: true })).toThrow(/gateway/);
  });
});

describe('modelo editado continua válido no BPMN', () => {
  it('sequência de edições -> XML -> modelo (sem perda)', async () => {
    let m = billingSample();
    m = addNode(m, { kind: 'task', variant: 'service', name: 'Extra', at: { x: 700, y: 440 } }).model;
    m = moveNodes(m, ['t6'], 20, 0);
    m = resizeLane(m, 'Lane_C', 260);
    const p = addParticipant(m, 'Externo');
    m = addFlow(p.model, { sourceId: 't5', targetId: p.id }).model;
    const back = await fromBpmnXml(await toBpmnXml(m));
    expect(back.warnings).toEqual([]);
    expect(canonicalize(back.model)).toEqual(canonicalize(parseModel(m)));
  });
});

// ---------------------------------------------------------------------------------------------
// Critério de pronto da Fase 2: "reproduzir o processo Billing de referência" — aqui provado sem UI:
// cada diagrama real do corpus é RECONSTRUÍDO do zero usando apenas as operações públicas do editor.
const BPM = process.env.BIIN_BPM ??
  'C:/Users/rafae/OneDrive/Documentos/Profissional-Rafael/SAP/ISU/BIIN Process/Processo geral Billing - EN.bpm';

describe.skipIf(!existsSync(BPM))('reprodução do corpus real apenas com operações de edição', () => {
  const { processes } = importBizagi(new Uint8Array(readFileSync(BPM)));

  /** assinatura independente de posição/ids gerados: usa ids ORIGINAIS via mapa reverso */
  const sig = (m: ProcessModel, toOld: (id: string) => string) => ({
    nodes: m.nodes.map((n) => JSON.stringify({
      id: toOld(n.id), kind: n.kind, variant: n.variant ?? null, name: n.name, lane: m.lanes.find((l) => l.id === n.laneId)?.name ?? null,
      performer: n.performer ?? null, sla: n.sla ?? null, tx: n.sapTransaction ?? null, reqs: n.requirementRefs, doc: n.documentation ?? null,
      thr: n.throw, cancel: n.cancelActivity, called: n.calledProcessId ?? null, host: n.attachedToId ? toOld(n.attachedToId) : null,
    })).sort(),
    flows: m.flows.map((f) => `${f.kind}|${toOld(f.sourceId)}|${toOld(f.targetId)}|${f.name ?? ''}|${f.isDefault}`).sort(),
    participants: m.participants.map((p) => p.name).sort(),
  });

  it.each(processes.map((p) => [p.name, p] as const))('%s', async (_name, target) => {
    // 1) projeto vazio com o mesmo id/nome
    let m: ProcessModel = { id: target.id, name: target.name, lanes: [], participants: [], nodes: [], flows: [], meta: { tags: [] }, attributeDefs: [] };
    const idMap = new Map<string, string>([[target.id, target.id]]); // original -> novo
    const laneMap = new Map<string, string>();
    const reverse = () => new Map([...idMap].map(([o, n]) => [n, o]));

    // 2) lanes
    for (const l of target.lanes) { const r = addLane(m, l.name); m = r.model; laneMap.set(l.id, r.id); }
    // 3) participantes externos
    for (const p of target.participants) { const r = addParticipant(m, p.name); m = r.model; idMap.set(p.id, r.id); }
    // 4) nós: hospedeiros antes de boundaries; cada nó é criado no centro da sua lane
    const order = [...target.nodes].sort((a, b) => Number(a.kind === 'boundary') - Number(b.kind === 'boundary'));
    for (const n of order) {
      const laneBounds = n.laneId ? m.lanes.find((l) => l.id === laneMap.get(n.laneId!))!.bounds! : undefined;
      const cx = n.bounds!.x + n.bounds!.w / 2;
      const cy = laneBounds ? laneBounds.y + laneBounds.h / 2 : n.bounds!.y + n.bounds!.h / 2;
      const r = addNode(m, {
        kind: n.kind, variant: n.variant, name: n.name, at: { x: cx, y: cy }, throw: n.throw,
        ...(n.kind === 'boundary' && { attachedToId: idMap.get(n.attachedToId!)! }),
      });
      idMap.set(n.id, r.id);
      m = updateNode(r.model, r.id, {
        name: n.name, performer: n.performer, sla: n.sla, sapTransaction: n.sapTransaction, requirementRefs: n.requirementRefs,
        documentation: n.documentation, source: n.source, cancelActivity: n.cancelActivity, throw: n.throw, calledProcessId: n.calledProcessId,
      });
    }
    // 5) fluxos (o tipo precisa ser o inferido pelas regras — se não for, as regras divergem do uso real)
    for (const f of target.flows) {
      const s = idMap.get(f.sourceId)!, t = idMap.get(f.targetId)!;
      expect(canConnect(m, s, t), `${f.id}: ${f.sourceId} -> ${f.targetId}`).toBeNull();
      const r = addFlow(m, { sourceId: s, targetId: t, kind: f.kind, name: f.name });
      m = f.isDefault ? updateFlow(r.model, r.id, { isDefault: true }) : r.model;
      idMap.set(f.id, r.id);
    }

    const back = reverse();
    const toOld = (id: string) => back.get(id) ?? id;
    expect(sig(m, toOld)).toEqual(sig(target, (id) => id));
    expect(integrity(m)).toEqual([]);
    // 6) e o resultado sai como BPMN válido, idempotente
    const xml = await toBpmnXml(m);
    const rt = await fromBpmnXml(xml);
    expect(rt.warnings).toEqual([]);
    expect(await toBpmnXml(rt.model)).toBe(xml);
  });
});

// [2026-10-27] Criado: adicionar a partir de um elemento existente — Rafael Brito
describe('addNodeAfter', () => {
  it('cria nó à direita já ligado por fluxo de sequência, sem sobrepor ninguém', () => {
    const m = billingSample();
    const src = m.nodes.find((n) => n.kind === 'task' && n.bounds)!;
    const r = addNodeAfter(m, src.id, { kind: 'task', variant: 'user', name: 'Nova' });
    const n = nodeOf(r.model, r.id);
    expect(n.bounds!.x).toBeGreaterThan(src.bounds!.x + src.bounds!.w);
    const f = flowOf(r.model, r.flowId);
    expect([f.kind, f.sourceId, f.targetId]).toEqual(['sequence', src.id, r.id]);
    for (const o of r.model.nodes) {
      if (o.id === n.id || !o.bounds || o.kind === 'boundary') continue;
      const ov = n.bounds!.x < o.bounds.x + o.bounds.w && n.bounds!.x + n.bounds!.w > o.bounds.x && n.bounds!.y < o.bounds.y + o.bounds.h && n.bounds!.y + n.bounds!.h > o.bounds.y;
      expect(ov).toBe(false);
    }
    expect(integrity(r.model)).toEqual([]);
  });
  it('satélite entra abaixo com associação; recusa o que canConnect recusa', () => {
    const m = billingSample();
    const src = m.nodes.find((n) => n.kind === 'task' && n.bounds)!;
    const r = addNodeAfter(m, src.id, { kind: 'dataObject' });
    expect(flowOf(r.model, r.flowId).kind).toBe('association');
    expect(nodeOf(r.model, r.id).bounds!.y).toBeGreaterThan(src.bounds!.y + src.bounds!.h);
    const end = m.nodes.find((n) => n.kind === 'end')!;
    expect(whyCannotAddAfter(m, end.id, 'task')).toBe('end-no-outgoing');
    expect(() => addNodeAfter(m, end.id, { kind: 'task' })).toThrow();
    expect(whyCannotAddAfter(m, src.id, 'task')).toBeNull();
    expect(whyCannotAddAfter(m, src.id, 'boundary')).not.toBeNull();
  });
});

// [2026-10-27] Criado: redimensionar o pool por qualquer lado — Rafael Brito
describe('resizePool', () => {
  const m0 = billingSample();
  const P = m0.pool!;
  it('cresce nos 4 lados mantendo lanes/pool coerentes e sem mover nós', () => {
    for (const [h, dx, dy] of [['e', 120, 0], ['w', -120, 0], ['n', 0, -80], ['s', 0, 80]] as const) {
      const r = resizePool(m0, h, dx, dy);
      expect(r.nodes.map((n) => n.bounds)).toEqual(m0.nodes.map((n) => n.bounds));
      const sum = r.lanes.reduce((a, l) => a + l.bounds!.h, 0);
      expect(r.pool!.h).toBe(sum);
      for (const l of r.lanes) { expect(l.bounds!.x).toBe(r.pool!.x + 36); expect(l.bounds!.x + l.bounds!.w).toBe(r.pool!.x + r.pool!.w); }
      expect(integrity(r)).toEqual([]);
    }
    expect(resizePool(m0, 'e', 120, 0).pool!.w).toBe(P.w + 120);
    expect(resizePool(m0, 'w', -120, 0).pool!.x).toBe(P.x - 120);
    expect(resizePool(m0, 'n', 0, -80).pool!.y).toBe(P.y - 80);
    expect(resizePool(m0, 's', 0, 80).pool!.h).toBe(P.h + 80);
  });
  it('nunca corta o conteúdo ao encolher', () => {
    const r = resizePool(m0, 'se', -5000, -5000);
    const maxR = Math.max(...m0.nodes.map((n) => n.bounds!.x + n.bounds!.w));
    expect(r.pool!.x + r.pool!.w).toBeGreaterThanOrEqual(maxR);
    const lastLane = r.lanes[r.lanes.length - 1]!.bounds!;
    expect(lastLane.y + lastLane.h).toBeGreaterThanOrEqual(Math.max(...m0.nodes.filter((n) => n.laneId === r.lanes[r.lanes.length - 1]!.id).map((n) => n.bounds!.y + n.bounds!.h)));
  });
});
