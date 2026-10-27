// [2026-10-14] Criado: rótulos posicionáveis e atributos estendidos tipados — round-trip, edição, validação, import Bizagi — Rafael Brito
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  addAttributeDef, canonicalize, deleteAttributeDef, flowLabel, fromBpmnXml, importBizagi, nodeLabel, parseModel, setLabelOffset, setNodeAttribute,
  toBpmnXml, updateAttributeDef, validateModel, type ProcessModel,
} from '../src/index.js';
import { billingSample } from '../src/samples/billing.js';

const node = (m: ProcessModel, id: string) => m.nodes.find((n) => n.id === id)!;

describe('rótulos (texto fora da forma)', () => {
  it('rótulo padrão: abaixo do evento, acima do gateway, meio do fluxo; nenhum para tarefa', () => {
    const m = billingSample();
    const ev = node(m, 's1'), gw = node(m, 'g1'), task = node(m, 't1');
    expect(nodeLabel(ev)!.box.y).toBeGreaterThan(ev.bounds!.y + ev.bounds!.h);
    expect(nodeLabel(gw)!.box.y + nodeLabel(gw)!.box.h).toBeLessThanOrEqual(gw.bounds!.y);
    expect(nodeLabel(task)).toBeNull();
    const f = m.flows.find((x) => x.id === 'f3')!;
    expect(flowLabel(f)!.box.y).toBeLessThan(f.waypoints![0]![1]);
  });

  it('setLabelOffset desloca o rótulo, arredonda e limpa quando ~0', () => {
    let m = setLabelOffset(billingSample(), 's1', { dx: 12.4, dy: 30.6 });
    expect(node(m, 's1').labelOffset).toEqual({ dx: 12, dy: 31 });
    const home = nodeLabel({ ...node(m, 's1'), labelOffset: undefined })!.box;
    expect(nodeLabel(node(m, 's1'))!.box.x).toBeCloseTo(home.x + 12);
    m = setLabelOffset(m, 's1', { dx: 0.3, dy: -0.2 });
    expect(node(m, 's1').labelOffset).toBeUndefined();
    expect(() => setLabelOffset(m, 'nao-existe', { dx: 5, dy: 5 })).toThrow();
  });

  it('o rótulo acompanha o elemento quando ele muda de posição (offset é relativo)', () => {
    const m = setLabelOffset(billingSample(), 's1', { dx: 0, dy: 40 });
    const moved = { ...m, nodes: m.nodes.map((n) => (n.id === 's1' ? { ...n, bounds: { ...n.bounds!, x: n.bounds!.x + 100 } } : n)) };
    expect(nodeLabel(node(moved, 's1'))!.box.x - nodeLabel(node(m, 's1'))!.box.x).toBeCloseTo(100);
  });

  it('round-trip BPMN preserva deslocamentos de nó e de fluxo (BPMNLabel) e é idempotente', async () => {
    let m = setLabelOffset(billingSample(), 's1', { dx: 15, dy: 22 });
    m = setLabelOffset(m, 'g1', { dx: -30, dy: -10 });
    m = setLabelOffset(m, 'f3', { dx: 8, dy: -14 });
    const xml = await toBpmnXml(m);
    expect(xml).toContain('<bpmndi:BPMNLabel');
    const back = await fromBpmnXml(xml);
    expect(back.warnings).toEqual([]);
    expect(canonicalize(back.model)).toEqual(canonicalize(m));
    expect(await toBpmnXml(back.model)).toBe(xml);
  });

  it('sem deslocamento, nenhum BPMNLabel é emitido (XML sem ruído)', async () => {
    expect(await toBpmnXml(billingSample())).not.toContain('BPMNLabel');
  });
});

describe('atributos estendidos tipados', () => {
  const base = () => billingSample();

  it('cria definições de todos os tipos, valida entrada e recusa nomes repetidos', () => {
    let m = base();
    const types = ['textarea', 'text', 'number', 'date', 'image', 'fileLink', 'url', 'file'] as const;
    for (const t of types) m = addAttributeDef(m, { name: `A_${t}`, type: t }).model;
    m = addAttributeDef(m, { name: 'Criticidade', type: 'select', options: ['Alta', 'Média', 'Baixa'] }).model;
    m = addAttributeDef(m, { name: 'Prioridade', type: 'radio', options: ['P1', 'P2'] }).model;
    m = addAttributeDef(m, { name: 'Módulos', type: 'multiselect', options: ['IS-U', 'FI-CA', 'BW'] }).model;
    m = addAttributeDef(m, { name: 'Fiori_Apps', type: 'table', columns: [{ name: 'Descrição' }, { name: 'Link', type: 'url' }] }).model;
    expect(m.attributeDefs).toHaveLength(12);
    expect(m.attributeDefs.find((d) => d.name === 'Fiori_Apps')!.columns.map((c) => c.type)).toEqual(['text', 'url']);
    expect(() => addAttributeDef(m, { name: 'criticidade', type: 'text' })).toThrow(/já existe/);
    expect(() => addAttributeDef(m, { name: 'X', type: 'select' })).toThrow(/opção/);
    expect(() => addAttributeDef(m, { name: 'Y', type: 'table' })).toThrow(/coluna/);
  });

  const full = () => {
    let m = base();
    const tc = addAttributeDef(m, { name: 'TCodes', type: 'textarea', appliesTo: ['task', 'subprocess'] }); m = tc.model;
    const cr = addAttributeDef(m, { name: 'Criticidade', type: 'select', options: ['Alta', 'Baixa'] }); m = cr.model;
    const mod = addAttributeDef(m, { name: 'Módulos', type: 'multiselect', options: ['IS-U', 'FI-CA'] }); m = mod.model;
    const fio = addAttributeDef(m, { name: 'Fiori_Apps', type: 'table', columns: [{ name: 'App' }, { name: 'Link', type: 'url' }] }); m = fio.model;
    m = setNodeAttribute(m, 't3', tc.id, 'EA00 - Criar fatura\nEA19 - Reverter');
    m = setNodeAttribute(m, 't3', cr.id, 'Alta');
    m = setNodeAttribute(m, 't3', mod.id, ['IS-U', 'FI-CA']);
    m = setNodeAttribute(m, 't3', fio.id, [['Resolve Implausible', 'F2185'], ['Process Missing', 'F3133']]);
    return { m, tc: tc.id, cr: cr.id, mod: mod.id, fio: fio.id };
  };

  it('valores tipados (texto, seleção, múltipla, tabela) sobrevivem ao round-trip BPMN, com definições', async () => {
    const { m } = full();
    const xml = await toBpmnXml(m);
    expect(xml).toContain('<ancoro:attributeDef');
    expect(xml).toContain('<ancoro:row>');
    const back = await fromBpmnXml(xml);
    expect(back.warnings).toEqual([]);
    expect(canonicalize(back.model)).toEqual(canonicalize(m));
    expect(await toBpmnXml(back.model)).toBe(xml);
    expect(node(back.model, 't3').attributes.find((a) => a.name === 'Fiori_Apps')!.value).toEqual([['Resolve Implausible', 'F2185'], ['Process Missing', 'F3133']]);
  });

  it('setNodeAttribute: valor vazio remove; tipo errado é normalizado', () => {
    const { m, cr, mod } = full();
    const cleared = setNodeAttribute(m, 't3', cr, '');
    expect(node(cleared, 't3').attributes.some((a) => a.defId === cr)).toBe(false);
    const coerced = setNodeAttribute(m, 't3', mod, 'IS-U'); // string para multiselect -> lista
    expect(node(coerced, 't3').attributes.find((a) => a.defId === mod)!.value).toEqual(['IS-U']);
    expect(() => setNodeAttribute(m, 't3', 'inexistente', 'x')).toThrow();
  });

  it('validação: valor fora das opções, número inválido, definição ausente, fora do escopo', () => {
    const { m, cr, tc } = full();
    const num = addAttributeDef(m, { name: 'Qtde', type: 'number' });
    let bad = setNodeAttribute(num.model, 't1', num.id, 'abc');
    bad = { ...bad, nodes: bad.nodes.map((n) => (n.id === 't3' ? { ...n, attributes: n.attributes.map((a) => (a.defId === cr ? { ...a, value: 'Média' } : a)) } : n)) };
    bad = { ...bad, nodes: bad.nodes.map((n) => (n.id === 't2' ? { ...n, attributes: [{ name: 'Fantasma', defId: 'Attr_999', value: 'x' }] } : n)) };
    bad = setNodeAttribute(bad, 'g1', tc, 'x'); // TCodes só se aplica a tarefa/subprocesso
    const codes = validateModel(bad).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['ATTR_VALUE', 'ATTR_DEF_MISSING', 'ATTR_NOT_APPLICABLE']));
    expect(validateModel(m).filter((i) => i.code.startsWith('ATTR'))).toEqual([]);
  });

  it('alterar opções remove só valores inválidos; alterar colunas remonta as linhas; trocar tipo descarta', () => {
    const { m, cr, mod, fio } = full();
    const opts = updateAttributeDef(m, cr, { options: ['Baixa'] }); // 'Alta' some
    expect(node(opts, 't3').attributes.some((a) => a.defId === cr)).toBe(false);
    const multi = updateAttributeDef(m, mod, { options: ['IS-U', 'BW'] }); // FI-CA some, IS-U fica
    expect(node(multi, 't3').attributes.find((a) => a.defId === mod)!.value).toEqual(['IS-U']);
    const cols = m.attributeDefs.find((d) => d.id === fio)!.columns;
    const reshaped = updateAttributeDef(m, fio, { columns: [{ id: cols[1]!.id, name: 'Link', type: 'url' }, { name: 'Nova', type: 'text' }] }); // inverte/remove/adiciona
    expect(node(reshaped, 't3').attributes.find((a) => a.defId === fio)!.value).toEqual([['F2185', ''], ['F3133', '']]);
    const typed = updateAttributeDef(m, cr, { type: 'text' });
    expect(node(typed, 't3').attributes.some((a) => a.defId === cr)).toBe(false);
    expect(updateAttributeDef(m, cr, { name: 'Severidade' }).nodes.find((n) => n.id === 't3')!.attributes.some((a) => a.name === 'Severidade')).toBe(true);
  });

  it('deleteAttributeDef remove a definição e todos os valores', () => {
    const { m, fio } = full();
    const r = deleteAttributeDef(m, fio);
    expect(r.attributeDefs.some((d) => d.id === fio)).toBe(false);
    expect(r.nodes.every((n) => !n.attributes.some((a) => a.defId === fio))).toBe(true);
    expect(validateModel(r).filter((i) => i.code === 'ATTR_DEF_MISSING')).toEqual([]);
  });

  it('modelo continua aceitando atributos livres antigos (nome/valor sem definição)', () => {
    const legacy = parseModel({ id: 'P', name: 'x', nodes: [{ id: 'a', kind: 'start', name: '', attributes: [{ name: 'Criticidade', value: 'Alta' }] }], flows: [] });
    expect(legacy.nodes[0]!.attributes).toEqual([{ name: 'Criticidade', value: 'Alta' }]);
  });
});

const BPM = process.env.BIIN_BPM ??
  'C:/Users/rafae/OneDrive/Documentos/Profissional-Rafael/SAP/ISU/BIIN Process/Processo geral Billing - EN.bpm';

describe.skipIf(!existsSync(BPM))('Extended Attributes reais do Bizagi (corpus BIIN)', () => {
  const { processes } = importBizagi(new Uint8Array(readFileSync(BPM)));
  const sap = processes.find((p) => p.name.startsWith('SAP S/4HANA'))!;

  it('importa as definições TCodes (texto longo) e Fiori_Apps (tabela com link), unificadas e aplicáveis a subprocessos', () => {
    const tc = sap.attributeDefs.find((d) => d.name === 'TCodes')!;
    const fio = sap.attributeDefs.find((d) => d.name === 'Fiori_Apps')!;
    expect(tc.type).toBe('textarea');
    expect(fio.type).toBe('table');
    expect(fio.columns.map((c) => c.type)).toEqual(['text', 'url']);
    expect(sap.attributeDefs.filter((d) => d.name === 'TCodes')).toHaveLength(1); // duplicatas por tipo de elemento foram unidas
    expect(tc.appliesTo).toContain('subprocess');
  });

  it('importa valores: TCodes em texto simples (HTML removido) e linhas da tabela de Fiori', () => {
    const withTc = sap.nodes.filter((n) => n.attributes.some((a) => a.name === 'TCodes'));
    expect(withTc.length).toBeGreaterThan(0);
    const texts = withTc.flatMap((n) => n.attributes).filter((a) => a.name === 'TCodes').map((a) => a.value as string);
    expect(texts.some((t) => /\bEA00\b/.test(t))).toBe(true); // TCodes do subprocesso de faturamento
    expect(texts.some((t) => /\bEL01\b/.test(t))).toBe(true); // TCodes do subprocesso de leitura (o da captura do Rafael)
    expect(texts.every((t) => !t.includes('<span') && !t.includes('&lt;'))).toBe(true);
    const table = sap.nodes.flatMap((n) => n.attributes).find((a) => a.name === 'Fiori_Apps')!.value as string[][];
    expect(table.length).toBeGreaterThan(0);
    expect(table.every((r) => r.length === 2 && /^https:\/\/.*Apps\('F\d{4}'\)/.test(r[1]!))).toBe(true); // links reais da Fiori Apps Library (valor = URL)
  });

  it('nenhum atributo importado gera aviso de validação e tudo faz round-trip', async () => {
    for (const p of processes) {
      expect(validateModel(p).filter((i) => i.code.startsWith('ATTR')), p.name).toEqual([]);
      const back = await fromBpmnXml(await toBpmnXml(p));
      expect(canonicalize(back.model)).toEqual(canonicalize(p));
    }
  });

  it('documentação e descrição dos elementos viram texto simples (sem tags HTML nem entidades)', () => {
    const texts = processes.flatMap((p) => p.nodes.flatMap((n) => [n.documentation, n.description]).filter((x): x is string => !!x));
    expect(texts.length).toBeGreaterThan(0);
    expect(texts.every((t) => !/<\/?(p|span|br|div)/i.test(t) && !/&#?\w+;/.test(t))).toBe(true);
    expect(texts.some((t) => /consumption is gathered/.test(t))).toBe(true); // texto real do subprocesso Meter Reading
  });

  it('posições dos textos do Bizagi viram deslocamentos de rótulo', () => {
    const total = processes.reduce((n, p) => n + p.nodes.filter((x) => x.labelOffset).length + p.flows.filter((f) => f.labelOffset).length, 0);
    expect(total).toBeGreaterThan(20);
  });
});
