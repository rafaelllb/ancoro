// [2026-11-07] Criado: testes do motor de simulação (Fase 7) — Rafael Brito
import { describe, expect, it } from 'vitest';
import { billingSample, formatMinutes, parseCost, parseDuration, parseModel, simulate, simulateBatch, type ProcessModel } from '../src/index.js';

const b = (i: number) => ({ x: i * 100, y: 0, w: 40, h: 40 });
const f = (id: string, s: string, t: string, extra: object = {}) => ({ id, sourceId: s, targetId: t, ...extra });

/** s → t1(2h) → g(XOR 70/30) → t2(1h, R$ 10) → e1 ; g → e2 */
const xor = (): ProcessModel => parseModel({
  id: 'P', name: 'xor',
  nodes: [
    { id: 's', kind: 'start', name: 'Início', bounds: b(0) },
    { id: 't1', kind: 'task', name: 'Validar leitura', duration: '2 h', cost: 'R$ 1.250,50', bounds: b(1) },
    { id: 'g', kind: 'gateway', variant: 'exclusive', name: 'Ok?', bounds: b(2) },
    { id: 't2', kind: 'task', name: 'Corrigir leitura', duration: '1 h', sla: '30 min', bounds: b(3) },
    { id: 'e1', kind: 'end', name: 'Fim A', bounds: b(4) },
    { id: 'e2', kind: 'end', name: 'Fim B', bounds: b(5) },
  ],
  flows: [f('f1', 's', 't1'), f('f2', 't1', 'g'), f('f3', 'g', 't2', { probability: 70, name: 'não' }), f('f4', 't2', 'e1'), f('f5', 'g', 'e2', { probability: 30, name: 'sim', isDefault: true })],
});

/** s → AND → (a 3h | b 1h) → AND join → e */
const par = (): ProcessModel => parseModel({
  id: 'P', name: 'par',
  nodes: [
    { id: 's', kind: 'start', name: 'Início', bounds: b(0) },
    { id: 'g1', kind: 'gateway', variant: 'parallel', name: '', bounds: b(1) },
    { id: 'a', kind: 'task', name: 'Tarefa lenta', duration: '3 h', bounds: b(2) },
    { id: 'c', kind: 'task', name: 'Tarefa rápida', duration: '1 h', bounds: b(3) },
    { id: 'g2', kind: 'gateway', variant: 'parallel', name: '', bounds: b(4) },
    { id: 'e', kind: 'end', name: 'Fim', bounds: b(5) },
  ],
  flows: [f('f1', 's', 'g1'), f('f2', 'g1', 'a'), f('f3', 'g1', 'c'), f('f4', 'a', 'g2'), f('f5', 'c', 'g2'), f('f6', 'g2', 'e')],
});

describe('parsers', () => {
  it('duração', () => {
    expect(parseDuration('2 h')).toBe(120);
    expect(parseDuration('1 h 30 min')).toBe(90);
    expect(parseDuration('PT2H30M')).toBe(150);
    expect(parseDuration('P1D')).toBe(1440);
    expect(parseDuration('3 dias')).toBe(4320);
    expect(parseDuration('Diário, 06:00')).toBeUndefined();
    expect(parseDuration(undefined)).toBeUndefined();
  });
  it('custo', () => {
    expect(parseCost('R$ 1.250,50')).toBe(1250.5);
    expect(parseCost('$ 12.5')).toBe(12.5);
    expect(parseCost('R$ 40')).toBe(40);
    expect(parseCost('sem custo')).toBeUndefined();
  });
  it('formatMinutes', () => expect(formatMinutes(1590)).toBe('1 d 2 h 30 min'));
});

describe('simulate', () => {
  it('é determinístico para a mesma semente', () => {
    const a = simulate(xor(), { seed: 7 }), c = simulate(xor(), { seed: 7 });
    expect(a.events).toEqual(c.events);
    expect(a.summary.endKind).toBe('completed');
  });

  it('respeita as probabilidades em lote (~70% passam por Corrigir)', () => {
    const r = simulateBatch(xor(), { runs: 2000, seed: 1 });
    expect(r.ok).toBe(true);
    expect(r.visitRate['t2']).toBeGreaterThan(0.65);
    expect(r.visitRate['t2']).toBeLessThan(0.75);
    expect(r.slaBreachRate['t2']).toBeCloseTo(r.visitRate['t2']!, 5); // 1 h > SLA de 30 min sempre que executa
  });

  it('escolhas de cenário forçam o caminho', () => {
    const r = simulate(xor(), { choices: ['f3'] });
    expect(r.summary.path).toContain('t2');
    expect(r.summary.totalMinutes).toBe(180);
    expect(r.summary.totalCost).toBe(1250.5);
    expect(r.summary.slaBreaches).toHaveLength(1);
    const r2 = simulate(xor(), { choices: ['f5'] });
    expect(r2.summary.path).not.toContain('t2');
    expect(r2.summary.totalMinutes).toBe(120);
  });

  it('modo manual para na decisão e devolve as opções', () => {
    const r = simulate(xor(), { mode: 'manual' });
    expect(r.summary.endKind).toBe('awaiting-choice');
    expect(r.pending?.nodeId).toBe('g');
    expect(r.pending?.options.map((o) => o.flowId)).toEqual(['f3', 'f5']);
    const next = simulate(xor(), { mode: 'manual', choices: ['f5'] });
    expect(next.summary.endKind).toBe('completed');
    // o prefixo do trace é idêntico: a UI pode manter o cursor ao re-simular
    const k = r.events.findIndex((e) => e.type === 'ended');
    expect(next.events.slice(0, k)).toEqual(r.events.slice(0, k));
  });

  it('AND: fork, join espera o ramo mais lento, tempo = max', () => {
    const r = simulate(par());
    expect(r.summary.endKind).toBe('completed');
    expect(r.summary.totalMinutes).toBe(180);
    expect(r.events.some((e) => e.type === 'fork')).toBe(true);
    expect(r.events.some((e) => e.type === 'join-wait')).toBe(true);
    expect(r.events.some((e) => e.type === 'join-fired')).toBe(true);
    expect(r.summary.bottleneck?.nodeId).toBe('a');
  });

  it('recusa-se a rodar com erro de integridade e aponta o elemento', () => {
    const m = xor();
    const bad = { ...m, flows: [...m.flows, f('fx', 't1', 'fantasma')] } as ProcessModel;
    const r = simulate(bad);
    expect(r.ok).toBe(false);
    expect(r.blocking[0]?.elementId).toBe('fx');
  });

  it('loop sem saída é abortado, não trava', () => {
    const m = parseModel({
      id: 'P', name: 'loop',
      nodes: [
        { id: 's', kind: 'start', name: 'Início', bounds: b(0) },
        { id: 't', kind: 'task', name: 'Fazer coisa', duration: '1 h', bounds: b(1) },
        { id: 'g', kind: 'gateway', variant: 'exclusive', name: 'De novo?', bounds: b(2) },
        { id: 'e', kind: 'end', name: 'Fim', bounds: b(3) },
      ],
      flows: [f('f1', 's', 't'), f('f2', 't', 'g'), f('f3', 'g', 't', { probability: 100 }), f('f4', 'g', 'e', { probability: 0 })],
    });
    const r = simulate(m, { maxEvents: 100 });
    expect(r.summary.endKind).toBe('aborted');
  });

  it('roda o exemplo de faturamento até o fim em vários sementes', () => {
    const m = billingSample();
    for (let seed = 1; seed <= 20; seed++) {
      const r = simulate(m, { seed });
      expect(r.ok, JSON.stringify(r.blocking)).toBe(true);
      expect(['completed', 'terminated']).toContain(r.summary.endKind);
    }
  });
});
