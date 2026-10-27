// [2026-10-14] Criado: testes de round-trip, import tolerante e validação (Fase 1) — Rafael Brito
import { describe, expect, it } from 'vitest';
import { canonicalize, fromBpmnXml, parseModel, toBpmnXml, validateModel } from '../src/index.js';
import { billingSample } from '../src/samples/billing.js';

describe('round-trip BPMN XML', () => {
  it('modelo -> XML -> modelo é idêntico (sem perda), incluindo extensões ancoro e geometria', async () => {
    const original = billingSample();
    const xml = await toBpmnXml(original);
    const { model, warnings } = await fromBpmnXml(xml);
    expect(warnings).toEqual([]);
    expect(canonicalize(model)).toEqual(canonicalize(original));
  });

  it('XML é idempotente: serializar o resultado do parse gera exatamente o mesmo XML', async () => {
    const xml1 = await toBpmnXml(billingSample());
    const { model } = await fromBpmnXml(xml1);
    expect(await toBpmnXml(model)).toBe(xml1);
  });

  it('emite BPMN 2.0 padrão com namespace de extensão isolado', async () => {
    const xml = await toBpmnXml(billingSample());
    expect(xml).toContain('<bpmn:collaboration');
    expect(xml).toContain('<bpmn:userTask id="t2"');
    expect(xml).toContain('<bpmn:exclusiveGateway id="g1"');
    expect(xml).toContain('default="f4"');
    expect(xml).toContain('<ancoro:requirement ref="REQ-021"');
    expect(xml).toContain('<bpmndi:BPMNEdge id="f5_di"');
  });

  it('modelo sem geometria nem lanes (saída típica de IA, antes do layout) também faz round-trip', async () => {
    const bare = parseModel({
      id: 'P1', name: 'Processo simples',
      nodes: [
        { id: 'a', kind: 'start', name: 'Início' },
        { id: 'b', kind: 'task', variant: 'user', name: 'Aprovar pedido', source: 'REQ-1: aprovação obrigatória' },
        { id: 'c', kind: 'end', name: 'Fim' },
      ],
      flows: [{ id: 'f1', sourceId: 'a', targetId: 'b' }, { id: 'f2', sourceId: 'b', targetId: 'c' }],
    });
    const xml = await toBpmnXml(bare);
    expect(xml).not.toContain('BPMNDiagram');
    const { model } = await fromBpmnXml(xml);
    expect(canonicalize(model)).toEqual(canonicalize({ ...bare, nodes: bare.nodes.map((n) => ({ ...n, variant: n.variant ?? (n.kind === 'task' ? 'generic' : 'none') })) }));
  });
});

describe('import tolerante de BPMN externo', () => {
  // Arquivo escrito à mão no estilo Camunda Modeler: sem DI, com complexGateway (não suportado) e send task.
  // [2026-10-14] Alterado: boundary event passou a ser suportado; usa complexGateway como exemplo de elemento não suportado — Rafael Brito
  const external = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="D1" targetNamespace="x">
  <bpmn:process id="Proc_X" name="Externo" isExecutable="true">
    <bpmn:startEvent id="S"/>
    <bpmn:sendTask id="T1" name="Enviar aviso"/>
    <bpmn:complexGateway id="B1"/>
    <bpmn:endEvent id="E"/>
    <bpmn:sequenceFlow id="F1" sourceRef="S" targetRef="T1"/>
    <bpmn:sequenceFlow id="F2" sourceRef="T1" targetRef="E"/>
    <bpmn:sequenceFlow id="F3" sourceRef="B1" targetRef="E"/>
  </bpmn:process>
</bpmn:definitions>`;

  it('importa o que dá e avisa explicitamente sobre o que foi degradado/descartado', async () => {
    const { model, warnings } = await fromBpmnXml(external);
    expect(model.nodes.map((n) => n.id).sort()).toEqual(['E', 'S', 'T1']);
    expect(model.flows.map((f) => f.id).sort()).toEqual(['F1', 'F2']);
    expect(warnings.some((w) => w.includes('SendTask') && w.includes('tarefa genérica'))).toBe(true);
    expect(warnings.some((w) => w.includes('ComplexGateway') && w.includes('não suportado'))).toBe(true);
    expect(warnings.some((w) => w.includes('F3') && w.includes('descartado'))).toBe(true);
  });

  it('rejeita arquivo sem processo e XML inválido', async () => {
    await expect(fromBpmnXml('<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"/>')).rejects.toThrow(/sem <process>/);
    await expect(fromBpmnXml('isso não é xml')).rejects.toThrow();
  });
});

describe('schema do modelo', () => {
  it('rejeita variant incompatível com kind e ids que não são NCName', () => {
    expect(() => parseModel({ id: 'P', name: 'x', flows: [], nodes: [{ id: 'a', kind: 'task', variant: 'timer', name: 'x y' }] })).toThrow(/variant/);
    expect(() => parseModel({ id: 'P', name: 'x', flows: [], nodes: [{ id: '1abc', kind: 'start', name: '' }] })).toThrow(/NCName/);
  });
});

describe('validateModel', () => {
  it('o exemplo de faturamento não tem erros', () => {
    const issues = validateModel(billingSample());
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('detecta início/fim ausentes, fluxo solto, gateway sem padrão e nome ruim', () => {
    const m = parseModel({
      id: 'P', name: 'Ruim',
      nodes: [
        { id: 't1', kind: 'task', variant: 'user', name: 'Aprovar' },
        { id: 'g', kind: 'gateway', variant: 'exclusive', name: 'Ok?' },
        { id: 't2', kind: 'task', name: 'Fazer coisa boa' },
        { id: 't3', kind: 'task', name: 'Fazer coisa ruim' },
      ],
      flows: [
        { id: 'f1', sourceId: 't1', targetId: 'g' },
        { id: 'f2', sourceId: 'g', targetId: 't2' },
        { id: 'f3', sourceId: 'g', targetId: 't3' },
      ],
    });
    const codes = validateModel(m).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['NO_START', 'NO_END', 'NO_INCOMING', 'NO_OUTGOING', 'GATEWAY_NO_DEFAULT', 'TASK_NAME_FORMAT']));
  });

  it('detecta referências quebradas e ids duplicados', () => {
    const m = parseModel({
      id: 'P', name: 'x',
      nodes: [{ id: 'a', kind: 'start', name: '' }, { id: 'a', kind: 'end', name: '' }],
      flows: [{ id: 'f', sourceId: 'a', targetId: 'zzz' }],
    });
    const codes = validateModel(m).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['DUPLICATE_ID', 'FLOW_DANGLING']));
  });
});
