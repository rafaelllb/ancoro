// [2026-10-14] Criado: propriedades completas (estilo Bizagi) — round-trip BPMN e operações de edição — Rafael Brito
import { describe, expect, it } from 'vitest';
import { canonicalize, fromBpmnXml, parseModel, toBpmnXml, updateFlow, updateLane, updateMeta, updateNode, type ProcessModel } from '../src/index.js';

const full = (): ProcessModel => parseModel({
  id: 'P_full', name: 'Processo completo',
  meta: { description: 'Descrição do processo', documentation: 'Doc longa\ncom 2 linhas', author: 'Rafael Brito', owner: 'Área de Faturamento', version: '1.2', createdAt: '2026-10-14T10:00:00.000Z', modifiedAt: '2026-10-14T11:00:00.000Z', tags: ['billing', 'ISU'] },
  lanes: [{ id: 'L1', name: 'Faturamento', description: 'Equipe de faturamento', fill: '#e8f0ff', bounds: { x: 36, y: 0, w: 900, h: 200 } }],
  participants: [{ id: 'X1', name: 'Sistema externo', description: 'Convergent Invoicing', bounds: { x: 0, y: 240, w: 936, h: 70 } }],
  pool: { x: 0, y: 0, w: 936, h: 200 },
  nodes: [
    { id: 's', kind: 'start', variant: 'none', name: 'Início', laneId: 'L1', bounds: { x: 80, y: 90, w: 36, h: 36 } },
    {
      id: 't', kind: 'task', variant: 'service', name: 'Executar faturamento', laneId: 'L1', bounds: { x: 160, y: 75, w: 120, h: 70 },
      description: 'Roda o faturamento em massa', documentation: 'Passo a passo detalhado', url: 'https://wiki.exemplo/faturamento',
      loop: 'sequential', duration: '2 h', cost: 'R$ 150', priority: 'high',
      performer: 'Sistema', accountable: 'Gerente de Faturamento', consulted: ['Fiscal', 'TI'], informed: ['Cliente'],
      sla: '< 2 h', sapTransaction: 'EASIBILL', requirementRefs: ['REQ-1', 'REQ-2'],
      systems: ['S/4HANA IS-U', 'CI'], inputs: ['Ordem de faturamento'], outputs: ['Documento de faturamento'], rules: ['Bloquear se inconsistente'],
      attributes: [{ name: 'Criticidade', value: 'Alta' }, { name: 'Frequência', value: 'Diária' }],
      fill: '#fff2cc', stroke: '#d6b656',
    },
    { id: 'm', kind: 'task', variant: 'user', name: 'Revisar faturas', laneId: 'L1', loop: 'parallel', bounds: { x: 340, y: 75, w: 120, h: 70 } },
    { id: 'g', kind: 'gateway', variant: 'exclusive', name: 'OK?', laneId: 'L1', bounds: { x: 520, y: 85, w: 50, h: 50 } },
    { id: 'e', kind: 'end', variant: 'none', name: 'Fim', laneId: 'L1', bounds: { x: 640, y: 92, w: 36, h: 36 } },
  ],
  flows: [
    { id: 'f1', sourceId: 's', targetId: 't', description: 'Dispara o job', documentation: 'Texto do fluxo' },
    { id: 'f2', sourceId: 't', targetId: 'm' },
    { id: 'f3', sourceId: 'm', targetId: 'g' },
    { id: 'f4', sourceId: 'g', targetId: 'e', name: 'Sim', condition: 'status == "OK"', probability: 80, isDefault: false },
    { id: 'f5', kind: 'message', sourceId: 't', targetId: 'X1', description: 'Envia BITs' },
  ],
});

describe('propriedades completas no BPMN', () => {
  it('round-trip sem perda de nenhum campo novo', async () => {
    const original = full();
    const xml = await toBpmnXml(original);
    const back = await fromBpmnXml(xml);
    expect(back.warnings).toEqual([]);
    expect(canonicalize(back.model)).toEqual(canonicalize(original));
    expect(await toBpmnXml(back.model)).toBe(xml); // idempotente
  });

  it('usa construtos BPMN padrão onde existem (interoperável com outras ferramentas)', async () => {
    const xml = await toBpmnXml(full());
    expect(xml).toContain('<bpmn:multiInstanceLoopCharacteristics isSequential="true"');
    expect(xml).toContain('<bpmn:multiInstanceLoopCharacteristics'); // paralela (m)
    expect(xml).toContain('<bpmn:conditionExpression');
    expect(xml).toContain('status == "OK"');
    expect(xml).toContain('bioc:fill="#fff2cc"');
    expect(xml).toContain('xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0"');
    expect(xml).toContain('<bpmn:documentation>Passo a passo detalhado</bpmn:documentation>');
    expect(xml).toContain('<ancoro:item list="consulted" value="Fiscal"');
    expect(xml).toContain('<ancoro:attribute name="Criticidade"');
  });

  it('sem nenhuma propriedade nova, o XML não ganha ruído (sem ancoro:props nem bioc)', async () => {
    const bare = parseModel({ id: 'P', name: 'x', nodes: [{ id: 'a', kind: 'start', name: '' }, { id: 'b', kind: 'end', name: '' }], flows: [{ id: 'f', sourceId: 'a', targetId: 'b' }] });
    const xml = await toBpmnXml(bare);
    expect(xml).not.toContain('ancoro:');
    expect(xml).not.toContain('bioc');
  });
});

describe('edição das propriedades', () => {
  it('updateNode aceita as novas propriedades e limpa com string vazia', () => {
    let m = full();
    m = updateNode(m, 't', { cost: '', priority: 'low', consulted: ['Jurídico'], loop: 'none', fill: '#ffffff' });
    const n = m.nodes.find((x) => x.id === 't')!;
    expect(n.cost).toBeUndefined();
    expect(n.priority).toBe('low');
    expect(n.consulted).toEqual(['Jurídico']);
    expect(n.loop).toBe('none');
    expect(() => updateNode(m, 't', { fill: 'vermelho' })).toThrow(/rrggbb/);
    expect(() => updateNode(m, 't', { priority: 'urgentissima' as never })).toThrow();
  });

  it('updateFlow: condição só em sequência; probabilidade 0-100; um padrão por gateway', () => {
    let m = full();
    m = updateFlow(m, 'f4', { condition: 'x > 1', probability: 55 });
    expect(m.flows.find((f) => f.id === 'f4')).toMatchObject({ condition: 'x > 1', probability: 55 });
    expect(() => updateFlow(m, 'f4', { probability: 120 })).toThrow();
    expect(() => updateFlow(m, 'f5', { condition: 'a' })).toThrow(/sequência/);
    expect(updateFlow(m, 'f4', { condition: '' }).flows.find((f) => f.id === 'f4')!.condition).toBeUndefined();
  });

  it('updateLane e updateMeta', () => {
    let m = full();
    m = updateLane(m, 'L1', { description: '', fill: '#ccffcc' });
    expect(m.lanes[0]).toMatchObject({ fill: '#ccffcc' });
    expect(m.lanes[0]!.description).toBeUndefined();
    m = updateMeta(m, { version: '2.0', owner: '', tags: ['a'] });
    expect(m.meta.version).toBe('2.0');
    expect(m.meta.owner).toBeUndefined();
    expect(m.meta.tags).toEqual(['a']);
  });
});
