// [2026-10-14] Criado: ajuste manual do traçado das linhas (arrastar segmentos), adaptação ao mover elementos, reset — Rafael Brito
import { describe, expect, it } from 'vitest';
import {
  autoRouteFlow, canReconnect, canonicalize, fromBpmnXml, moveFlowEndpoint, moveFlowSegment, moveNodes, nearestSide, reconnectFlow, routeDocked, segmentAxis, toBpmnXml,
  type ProcessModel,
} from '../src/index.js';
import { billingSample } from '../src/samples/billing.js';

const flow = (m: ProcessModel, id: string) => m.flows.find((f) => f.id === id)!;
const node = (m: ProcessModel, id: string) => m.nodes.find((n) => n.id === id)!;
const orthogonal = (wp: ReadonlyArray<readonly [number, number]>) => wp.slice(1).every((p, i) => segmentAxis(wp[i]!, p) !== null);
const onBorder = (p: readonly [number, number], b: { x: number; y: number; w: number; h: number }) =>
  p[0] >= b.x - 0.5 && p[0] <= b.x + b.w + 0.5 && p[1] >= b.y - 0.5 && p[1] <= b.y + b.h + 0.5
  && (Math.abs(p[0] - b.x) < 0.5 || Math.abs(p[0] - (b.x + b.w)) < 0.5 || Math.abs(p[1] - b.y) < 0.5 || Math.abs(p[1] - (b.y + b.h)) < 0.5);

describe('moveFlowSegment', () => {
  it('segmento do MEIO desloca só ele (perpendicular) e mantém tudo ortogonal e preso às formas', () => {
    const m = billingSample();
    const before = flow(m, 'f5').waypoints!; // [[560,120],[560,200],[420,200],[420,220]] -> o segmento 1 é horizontal
    expect(segmentAxis(before[1]!, before[2]!)).toBe('h');
    const r = moveFlowSegment(m, 'f5', 1, 20);
    const wp = flow(r, 'f5').waypoints!;
    expect(wp[0]).toEqual(before[0]);                      // pontas intactas
    expect(wp[wp.length - 1]).toEqual(before[before.length - 1]);
    // o último trecho (vertical, 20px até o topo de t3) não pode encolher abaixo de 10px: o segmento do meio só desce 10, não 20
    expect(wp[1]![1]).toBe(210); expect(wp[2]![1]).toBe(210);
    expect(wp[wp.length - 1]![1] - wp[wp.length - 2]![1]).toBeGreaterThanOrEqual(10);
    expect(orthogonal(wp)).toBe(true);
    expect(flow(r, 'f5').manualRoute).toBe(true);
  });

  it('segmento da PONTA de linha reta cria um degrau (Z) sem soltar dos extremos', () => {
    const m = billingSample();
    const s = flow(m, 'f6').waypoints!; // reta horizontal t3 -> g2
    expect(s).toHaveLength(2);
    const r = moveFlowSegment(m, 'f6', 0, 30);
    const wp = flow(r, 'f6').waypoints!;
    expect(wp.length).toBeGreaterThanOrEqual(4);
    expect(wp[0]).toEqual(s[0]);
    expect(wp[wp.length - 1]).toEqual(s[1]);
    expect(orthogonal(wp)).toBe(true);
    expect(Math.max(...wp.map((p) => p[1]))).toBe(s[0]![1] + 30); // o miolo do traçado foi deslocado 30
  });

  it('delta 0 é no-op; segmento inexistente/diagonal lança erro; modelo-base não é mutado', () => {
    const m = billingSample();
    const snapshot = JSON.stringify(m);
    expect(moveFlowSegment(m, 'f5', 1, 0)).toBe(m);
    expect(() => moveFlowSegment(m, 'f5', 9, 10)).toThrow();
    const diag = { ...m, flows: m.flows.map((f) => (f.id === 'f6' ? { ...f, waypoints: [[450, 255], [515, 300]] as Array<[number, number]> } : f)) };
    expect(() => moveFlowSegment(diag, 'f6', 0, 10)).toThrow(/diagonal/);
    moveFlowSegment(m, 'f5', 1, 40);
    expect(JSON.stringify(m)).toBe(snapshot);
  });

  it('limpa pontos duplicados/colineares (arrastar de volta não deixa lixo)', () => {
    const m = billingSample();
    const there = moveFlowSegment(m, 'f5', 1, 10);
    const back = moveFlowSegment(there, 'f5', 1, -10);
    expect(flow(back, 'f5').waypoints).toEqual(flow(m, 'f5').waypoints);
  });
});

describe('traçado manual ao mover elementos', () => {
  it('fluxo MANUAL adapta (mantém a forma que o usuário deu); fluxo automático re-roteia', () => {
    let m = moveFlowSegment(billingSample(), 'f5', 1, 10); // f5: t2 -> t3, manual
    const manualMid = flow(m, 'f5').waypoints![1]![1];
    const moved = moveNodes(m, ['t3'], 20, 0); // move o destino para a direita
    const f5 = flow(moved, 'f5');
    expect(f5.manualRoute).toBe(true);                        // continua manual
    expect(f5.waypoints![1]![1]).toBe(manualMid);             // o "canal" que o usuário escolheu foi mantido
    expect(orthogonal(f5.waypoints!)).toBe(true);
    expect(onBorder(f5.waypoints![f5.waypoints!.length - 1]!, node(moved, 't3').bounds!)).toBe(true); // ponta acompanhou a forma
    // outro fluxo (automático) do mesmo nó foi re-roteado normalmente
    expect(flow(moved, 'f6').manualRoute).toBeUndefined();
    expect(onBorder(flow(moved, 'f6').waypoints![0]!, node(moved, 't3').bounds!)).toBe(true);
  });

  it('se não dá para adaptar (ponta viraria do avesso), volta ao roteamento automático', () => {
    const m = moveFlowSegment(billingSample(), 'f5', 1, 10);
    const moved = moveNodes(m, ['t3'], 0, -150); // sobe o destino acima do canal manual: o trecho final inverteria
    const f5 = flow(moved, 'f5');
    expect(f5.manualRoute).toBeUndefined();
    expect(orthogonal(f5.waypoints!)).toBe(true);
    expect(onBorder(f5.waypoints![f5.waypoints!.length - 1]!, node(moved, 't3').bounds!)).toBe(true);
  });

  it('os dois extremos movidos juntos transladam o traçado inteiro', () => {
    const m = moveFlowSegment(billingSample(), 'f5', 1, 20);
    const before = flow(m, 'f5').waypoints!;
    const moved = moveNodes(m, ['t2', 't3'], 40, 10);
    expect(flow(moved, 'f5').waypoints).toEqual(before.map(([x, y]) => [x + 40, y + 10]));
  });

  it('autoRouteFlow devolve ao automático', () => {
    const m = moveFlowSegment(billingSample(), 'f5', 1, 20);
    const r = autoRouteFlow(m, 'f5');
    expect(flow(r, 'f5').manualRoute).toBeUndefined();
    expect(flow(r, 'f5').waypoints).toEqual(flow(billingSample(), 'f5').waypoints!.length === 4 ? flow(r, 'f5').waypoints : undefined);
    expect(orthogonal(flow(r, 'f5').waypoints!)).toBe(true);
  });
});

describe('persistência', () => {
  it('a marca de traçado manual sobrevive ao round-trip BPMN (e só ela; flows automáticos não ganham ruído)', async () => {
    const m = moveFlowSegment(billingSample(), 'f5', 1, 20);
    const xml = await toBpmnXml(m);
    expect(xml).toContain('manualRoute="true"');
    expect((xml.match(/manualRoute/g) ?? []).length).toBe(1);
    const back = await fromBpmnXml(xml);
    expect(flow(back.model, 'f5').manualRoute).toBe(true);
    expect(canonicalize(back.model)).toEqual(canonicalize(m));
    expect(await toBpmnXml(back.model)).toBe(xml);
  });
});

describe('pontas da linha: mudar o encaixe', () => {
  it('nearestSide escolhe o lado mais próximo do ponto', () => {
    const b = { x: 100, y: 100, w: 120, h: 70 };
    expect([nearestSide(b, { x: 90, y: 130 }), nearestSide(b, { x: 230, y: 130 }), nearestSide(b, { x: 160, y: 90 }), nearestSide(b, { x: 160, y: 180 })]).toEqual(['left', 'right', 'top', 'bottom']);
  });

  it('mover a ponta de DESTINO para outro lado da tarefa: encaixe na borda certa, traçado ortogonal, linha manual', () => {
    const m = billingSample();
    const t3 = node(m, 't3').bounds!; // f6: t3 -> g2 (a ponta de origem é t3)
    const r = moveFlowEndpoint(m, 'f6', 'source', { x: t3.x + 60, y: t3.y + t3.h + 20 }); // puxa a ponta para BAIXO de t3
    const f = flow(r, 'f6');
    expect(f.manualRoute).toBe(true);
    expect(onBorder(f.waypoints![0]!, t3)).toBe(true);
    expect(f.waypoints![0]![1]).toBe(t3.y + t3.h);          // saiu pela borda inferior
    expect(f.waypoints![1]![1]).toBeGreaterThanOrEqual(t3.y + t3.h); // nunca volta para dentro da própria forma
    expect(f.waypoints!.every((q, i) => i === 0 || i === f.waypoints!.length - 1 || !(q[0] > t3.x && q[0] < t3.x + t3.w && q[1] > t3.y && q[1] < t3.y + t3.h))).toBe(true);
    expect(orthogonal(f.waypoints!)).toBe(true);
    expect(onBorder(f.waypoints!.at(-1)!, node(m, 'g2').bounds!)).toBe(true); // a outra ponta não se soltou
  });

  it('tarefa aceita encaixe em qualquer ponto do lado (com margem dos cantos); evento/gateway só no meio', () => {
    const m = billingSample();
    const t1 = node(m, 't1').bounds!;
    const up = moveFlowEndpoint(m, 'f2', 'source', { x: t1.x + t1.w + 30, y: t1.y + 12 }); // f2: t1 -> g1
    expect(flow(up, 'f2').waypoints![0]).toEqual([t1.x + t1.w, t1.y + 10]); // y encaixa em grade de 5 e margem de canto 8
    const g1 = node(m, 'g1').bounds!;
    const gw = moveFlowEndpoint(m, 'f2', 'target', { x: g1.x + 5, y: g1.y - 30 }); // topo do gateway
    expect(flow(gw, 'f2').waypoints!.at(-1)).toEqual([g1.x + g1.w / 2, g1.y]); // sempre o meio do lado
  });

  it('routeDocked: ortogonal, começa e termina nos encaixes e contorna quando o destino está "atrás" da saída', () => {
    const fwd = routeDocked([100, 100], 'right', [300, 200], 'left');
    expect(fwd[0]).toEqual([100, 100]); expect(fwd.at(-1)).toEqual([300, 200]);
    expect(orthogonal(fwd)).toBe(true);
    expect(fwd.every(([x]) => x >= 100 && x <= 300)).toBe(true);        // canal entre as duas pontas
    const L = routeDocked([100, 100], 'bottom', [300, 200], 'left');   // vertical -> horizontal
    expect(orthogonal(L)).toBe(true);
    const back = routeDocked([100, 100], 'bottom', [300, 50], 'left'); // destino ACIMA da saída para baixo
    expect(orthogonal(back)).toBe(true);
    expect(back[1]![1]).toBeGreaterThan(100);                           // desce antes de contornar
    expect(back.some(([, y]) => y < 100 && back.indexOf(back.find((q) => q[1] === y)!) < 1)).toBe(false);
  });

  it('o traçado de uma linha com ponta movida é adaptado (e não jogado fora) ao mover o elemento', () => {
    const m = billingSample();
    const t3 = node(m, 't3').bounds!;
    const r = moveFlowEndpoint(m, 'f6', 'source', { x: t3.x + 60, y: t3.y + t3.h + 20 });
    const moved = moveNodes(r, ['t3'], 0, 10);
    const f = flow(moved, 'f6');
    expect(f.manualRoute).toBe(true);
    expect(onBorder(f.waypoints![0]!, node(moved, 't3').bounds!)).toBe(true);
    expect(f.waypoints![0]![1]).toBe(node(moved, 't3').bounds!.y + node(moved, 't3').bounds!.h); // continua saindo por baixo
  });
});

describe('religar a ponta a outro elemento', () => {
  it('troca o destino, volta ao automático e mantém o modelo íntegro', () => {
    const m = moveFlowSegment(billingSample(), 'f5', 1, 10); // f5: t2 -> t3 (manual)
    expect(canReconnect(m, 'f5', 'target', 'g2')).toBeNull();
    const r = reconnectFlow(m, 'f5', 'target', 'g2');
    const f = flow(r, 'f5');
    expect([f.sourceId, f.targetId]).toEqual(['t2', 'g2']);
    expect(f.manualRoute).toBeUndefined();
    expect(onBorder(f.waypoints!.at(-1)!, node(r, 'g2').bounds!)).toBe(true);
    expect(orthogonal(f.waypoints!)).toBe(true);
  });

  it('recusa as mesmas ligações que canConnect recusa (com o motivo) e não acusa "duplicata" da própria linha', () => {
    const m = billingSample();
    expect(canReconnect(m, 'f2', 'target', 'g1')).toBeNull();            // religar ao mesmo alvo é permitido
    expect(canReconnect(m, 'f2', 'target', 's1')).toBe('start-no-incoming'); // fluxo não entra em evento de início
    expect(canReconnect(m, 'f2', 'source', 'e1')).toBe('end-no-outgoing');
    expect(canReconnect(m, 'f2', 'target', 't1')).toBe('self');
    expect(canReconnect(m, 'f3', 'target', 't3')).toBe('duplicate');     // g1 -> t3 já existe (f4)
    expect(() => reconnectFlow(m, 'f2', 'target', 's1')).toThrow(/start-no-incoming/);
  });

  it('mudar a ORIGEM de um fluxo padrão remove a marca de padrão', () => {
    const m = billingSample(); // f4 é o padrão de g1
    expect(flow(m, 'f4').isDefault).toBe(true);
    const r = reconnectFlow(m, 'f4', 'source', 't1');
    expect(flow(r, 'f4').isDefault).toBe(false);
  });

  it('resultado exporta e reimporta sem perda', async () => {
    const r = reconnectFlow(moveFlowEndpoint(billingSample(), 'f6', 'source', { x: 390, y: 300 }), 'f5', 'target', 'g2');
    const back = await fromBpmnXml(await toBpmnXml(r));
    expect(back.warnings).toEqual([]);
    expect(canonicalize(back.model)).toEqual(canonicalize(r));
  });
});
