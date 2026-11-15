// [2026-11-07] Criado: testes de subprocesso chamado, esperas de evento, timer de borda, link e ações (link/anexo) — Rafael Brito
import { describe, expect, it } from 'vitest';
import { parseModel, simulate, type ProcessModel } from '../src/index.js';

const b = (i: number) => ({ x: i * 100, y: 0, w: 40, h: 40 });
const f = (id: string, s: string, t: string, extra: object = {}) => ({ id, sourceId: s, targetId: t, ...extra });

/** pai: s → call(piso 30 min) → e ; filho: cs → ct(2 h) → ce */
const parent = (): ProcessModel => parseModel({
  id: 'Parent', name: 'pai',
  nodes: [
    { id: 's', kind: 'start', name: 'Início', bounds: b(0) },
    { id: 'call', kind: 'subprocess', name: 'Chamar filho', calledProcessId: 'Child', duration: '30 min', cost: 'R$ 999', bounds: b(1) },
    { id: 'e', kind: 'end', name: 'Fim', bounds: b(2) },
  ],
  flows: [f('f1', 's', 'call'), f('f2', 'call', 'e')],
});
const child = (): ProcessModel => parseModel({
  id: 'Child', name: 'filho',
  nodes: [
    { id: 'cs', kind: 'start', name: 'Início filho', bounds: b(0) },
    { id: 'ct', kind: 'task', name: 'Trabalho interno', duration: '2 h', cost: 'R$ 10', bounds: b(1) },
    { id: 'ce', kind: 'end', name: 'Fim filho', bounds: b(2) },
  ],
  flows: [f('f1', 'cs', 'ct'), f('f2', 'ct', 'ce')],
});
const resolve = (id: string) => (id === 'Child' ? child() : undefined);

describe('subprocesso chamado', () => {
  it('mergulha, executa o filho e volta; tempo = o do filho; custo do nó chamador não conta', () => {
    const r = simulate(parent(), { resolve });
    expect(r.summary.endKind).toBe('completed');
    expect(r.summary.totalMinutes).toBe(120);
    expect(r.summary.totalCost).toBe(10);
    const types = r.events.map((e) => e.type);
    expect(types).toContain('subprocess-entered');
    expect(types.indexOf('subprocess-exited')).toBeGreaterThan(types.indexOf('subprocess-entered'));
    expect(r.events.find((e) => e.type === 'node-entered' && e.nodeId === 'ct')?.pid).toBe('Child');
    expect(r.events.find((e) => e.type === 'node-entered' && e.nodeId === 'e')?.pid).toBe('Parent');
    expect(r.summary.path).toContain('Child/ct');
  });

  it('a duração própria do nó vira piso quando o filho é mais rápido', () => {
    const p = parent();
    p.nodes.find((n) => n.id === 'call')!.duration = '5 h';
    expect(simulate(p, { resolve }).summary.totalMinutes).toBe(300);
  });

  it('sem resolver, vira tarefa atômica e avisa', () => {
    const r = simulate(parent());
    expect(r.summary.totalMinutes).toBe(30);
    expect(r.limitations).toContain('call-activity');
  });

  it('ciclo (filho chama o pai) não trava', () => {
    const c = child();
    const ct = c.nodes.find((n) => n.id === 'ct')!;
    ct.kind = 'subprocess';
    ct.calledProcessId = 'Parent';
    const r = simulate(parent(), { resolve: (id) => (id === 'Child' ? c : id === 'Parent' ? parent() : undefined) });
    expect(['completed', 'aborted']).toContain(r.summary.endKind);
    expect(r.limitations).toContain('call-cycle');
  });

  it('erro de integridade no filho bloqueia e diz em qual processo', () => {
    const bad = { ...child(), flows: [...child().flows, f('fx', 'ct', 'fantasma')] } as ProcessModel;
    const r = simulate(parent(), { resolve: () => bad });
    expect(r.ok).toBe(false);
    expect(r.blocking[0]?.message).toContain('[filho]');
  });
});

/** início por timer (não espera) → tarefa 1 h → timer 2 d → mensagem 3 h → fim */
const timerWait = (): ProcessModel => parseModel({
  id: 'P', name: 'espera',
  nodes: [
    { id: 's', kind: 'start', variant: 'timer', name: 'Início', duration: '9 d', bounds: b(0) },
    { id: 't', kind: 'task', name: 'Fazer coisa', duration: '1 h', bounds: b(1) },
    { id: 'w', kind: 'intermediate', variant: 'timer', name: 'Aguardar prazo', duration: '2 d', bounds: b(2) },
    { id: 'm', kind: 'intermediate', variant: 'message', name: 'Aguardar resposta', duration: '3 h', bounds: b(3) },
    { id: 'e', kind: 'end', name: 'Fim', bounds: b(4) },
  ],
  flows: [f('f1', 's', 't'), f('f2', 't', 'w'), f('f3', 'w', 'm'), f('f4', 'm', 'e')],
});

describe('esperas de evento', () => {
  it('timer/mensagem avançam o relógio simulado e entram como ESPERA (início não espera)', () => {
    const r = simulate(timerWait());
    expect(r.summary.totalMinutes).toBe(60 + 2880 + 180);
    expect(r.summary.waitMinutes).toBe(2880 + 180);
    expect(r.summary.waits.map((w) => w.variant)).toEqual(['timer', 'message']);
    expect(r.events.filter((e) => e.type === 'wait-started')).toHaveLength(2);
    expect(r.summary.coverage.waitsWithDuration).toBe(2);
  });
});

/** tarefa de 4 h com timer de borda de 1 h → escalada */
const withBoundary = (interrupting: boolean): ProcessModel => parseModel({
  id: 'P', name: 'borda',
  nodes: [
    { id: 's', kind: 'start', name: 'Início', bounds: b(0) },
    { id: 't', kind: 'task', name: 'Tarefa longa', duration: '4 h', bounds: b(1) },
    { id: 'bt', kind: 'boundary', variant: 'timer', name: 'Estourou', duration: '1 h', attachedToId: 't', cancelActivity: interrupting, bounds: b(2) },
    { id: 'esc', kind: 'task', name: 'Escalar gestor', duration: '30 min', bounds: b(3) },
    { id: 'e1', kind: 'end', name: 'Fim normal', bounds: b(4) },
    { id: 'e2', kind: 'end', name: 'Fim escalado', bounds: b(5) },
  ],
  flows: [f('f1', 's', 't'), f('f2', 't', 'e1'), f('f3', 'bt', 'esc'), f('f4', 'esc', 'e2')],
});

describe('timer de borda', () => {
  it('interrompente: corta a tarefa na hora do timer e segue pela borda', () => {
    const r = simulate(withBoundary(true));
    const cut = r.events.find((e) => e.type === 'node-exited' && e.nodeId === 't');
    expect(cut?.type === 'node-exited' && cut.durationMin).toBe(60);
    expect(r.events.some((e) => e.type === 'boundary-fired' && e.interrupting)).toBe(true);
    expect(r.summary.path).toContain('esc');
    expect(r.summary.path).not.toContain('e1');
    expect(r.summary.totalMinutes).toBe(90);
  });
  it('não interrompente: a tarefa continua e o ramo da borda corre em paralelo', () => {
    const r = simulate(withBoundary(false));
    expect(r.summary.path).toContain('esc');
    expect(r.summary.path).toContain('e1');
    expect(r.summary.totalMinutes).toBe(240);
  });
});

const linear = (): ProcessModel => parseModel({
  id: 'P', name: 'linear',
  nodes: [
    { id: 's', kind: 'start', name: 'Início', bounds: b(0) },
    { id: 't1', kind: 'task', name: 'Preencher formulário', duration: '1 h', bounds: b(1) },
    { id: 't2', kind: 'task', name: 'Anexar checklist', duration: '1 h', bounds: b(2) },
    { id: 'e', kind: 'end', name: 'Fim', bounds: b(3) },
  ],
  flows: [f('f1', 's', 't1'), f('f2', 't1', 't2'), f('f3', 't2', 'e')],
});

describe('link e ações', () => {
  it('link throw salta para o catch de mesmo nome (evento visível, com o nome)', () => {
    const m = parseModel({
      id: 'P', name: 'link',
      nodes: [
        { id: 's', kind: 'start', name: 'Início', bounds: b(0) },
        { id: 'lt', kind: 'intermediate', variant: 'link', throw: true, name: 'ir', bounds: b(1) },
        { id: 'lc', kind: 'intermediate', variant: 'link', throw: false, name: 'ir', bounds: b(2) },
        { id: 'e', kind: 'end', name: 'Fim', bounds: b(3) },
      ],
      flows: [f('f1', 's', 'lt'), f('f2', 'lc', 'e')],
    });
    const r = simulate(m);
    const j = r.events.find((e) => e.type === 'link-jump');
    expect(j?.type === 'link-jump' && [j.to, j.name]).toEqual(['lc', 'ir']);
    expect(r.summary.endKind).toBe('completed');
  });

  it('elemento com link (url) ou anexo emite action-required', () => {
    const m = linear();
    m.nodes.find((n) => n.id === 't1')!.url = 'https://forms.exemplo/leitura';
    const r = simulate(m, { artifacts: (_p, id) => (id === 't2' ? [{ kind: 'file', name: 'checklist.pdf', id: 'a1' }] : []) });
    const acts = r.events.filter((e) => e.type === 'action-required');
    expect(acts.map((e) => e.type === 'action-required' && e.nodeId)).toEqual(['t1', 't2']);
    expect(r.summary.actionsRequired).toBe(2);
  });

  it('url que não é http(s) é ignorada (javascript: nunca vira ação)', () => {
    const m = linear();
    m.nodes.find((n) => n.id === 't1')!.url = 'javascript:alert(1)';
    expect(simulate(m).events.some((e) => e.type === 'action-required')).toBe(false);
  });
});
