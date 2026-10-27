/**
 * Processo de exemplo "Ciclo de faturamento de consumo" — mesmo diagrama do design spike
 * (docs/process-studio/spike/design-spike.html), agora no modelo de domínio.
 *
 * [2026-10-14] Criado: fixture canônica para testes e demos — Rafael Brito
 * Os REQ-xxx são FICTÍCIOS. Coordenadas: o spike usa centros; BPMN DI usa canto superior esquerdo,
 * por isso o helper `at`.
 */
import { parseModel, type ProcessModel } from '../model.js';

const at = (cx: number, cy: number, w: number, h: number) => ({ x: cx - w / 2, y: cy - h / 2, w, h });
const task = (cx: number, cy: number) => at(cx, cy, 120, 70);
const event = (cx: number, cy: number) => at(cx, cy, 36, 36);
const gw = (cx: number, cy: number) => at(cx, cy, 50, 50);

export function billingSample(): ProcessModel {
  return parseModel({
    id: 'Process_Billing',
    name: 'Ciclo de faturamento de consumo',
    pool: { x: 0, y: 0, w: 1240, h: 550 },
    lanes: [
      { id: 'Lane_A', name: 'Medição', bounds: { x: 36, y: 0, w: 1204, h: 170 } },
      { id: 'Lane_B', name: 'Faturamento', bounds: { x: 36, y: 170, w: 1204, h: 170 } },
      { id: 'Lane_C', name: 'Contas a Receber', bounds: { x: 36, y: 340, w: 1204, h: 210 } },
    ],
    nodes: [
      { id: 's1', kind: 'start', variant: 'timer', name: 'Ciclo de leitura encerrado', laneId: 'Lane_A', bounds: event(110, 85),
        performer: 'Sistema (job)', sla: 'Diário, 06:00', documentation: 'Job agendado dispara o processo ao fechar a janela de leitura.' },
      { id: 't1', kind: 'task', variant: 'service', name: 'Importar leituras', laneId: 'Lane_A', bounds: task(250, 85),
        performer: 'Sistema', sla: '< 30 min', sapTransaction: 'IMP-01', requirementRefs: ['REQ-014'] },
      { id: 'g1', kind: 'gateway', variant: 'exclusive', name: 'Leitura plausível?', laneId: 'Lane_A', bounds: gw(390, 85),
        requirementRefs: ['REQ-021'] },
      { id: 't2', kind: 'task', variant: 'user', name: 'Corrigir leitura manualmente', laneId: 'Lane_A', bounds: task(560, 85),
        performer: 'Analista de Medição', sla: '4 h úteis', sapTransaction: 'COR-01', requirementRefs: ['REQ-021', 'REQ-033'] },
      { id: 'n1', kind: 'annotation', name: 'Tarifas vigentes por classe de consumo', bounds: at(860, 85, 170, 46) },
      { id: 'd1', kind: 'dataObject', name: 'Pré-faturamento', bounds: at(250, 255, 28, 36), requirementRefs: ['REQ-008'] },
      { id: 't3', kind: 'task', variant: 'service', name: 'Gerar pré-faturamento', laneId: 'Lane_B', bounds: task(390, 255),
        performer: 'Sistema', sla: '< 1 h', sapTransaction: 'PRE-01', requirementRefs: ['REQ-008'] },
      { id: 'g2', kind: 'gateway', variant: 'parallel', name: '', laneId: 'Lane_B', bounds: gw(540, 255) },
      { id: 't4', kind: 'task', variant: 'service', name: 'Executar faturamento', laneId: 'Lane_B', bounds: task(690, 255),
        performer: 'Sistema', sla: '< 2 h', sapTransaction: 'FAT-01', requirementRefs: ['REQ-008', 'REQ-012'] },
      { id: 'sub1', kind: 'subprocess', name: 'Cálculo de tarifa e impostos', laneId: 'Lane_B', bounds: at(860, 255, 140, 80),
        performer: 'Sistema', requirementRefs: ['REQ-012', 'REQ-040'] },
      { id: 'e1', kind: 'end', variant: 'none', name: 'Fatura emitida', laneId: 'Lane_B', bounds: event(1010, 255) },
      { id: 't5', kind: 'task', variant: 'user', name: 'Notificar cliente', laneId: 'Lane_C', bounds: task(540, 435),
        performer: 'Atendimento', sla: '1 dia útil', requirementRefs: ['REQ-027'] },
      { id: 'i1', kind: 'intermediate', variant: 'timer', name: 'Aguardar vencimento', laneId: 'Lane_C', bounds: event(700, 435),
        sla: 'Data de vencimento' },
      { id: 't6', kind: 'task', variant: 'manual', name: 'Acompanhar pagamento', laneId: 'Lane_C', bounds: task(860, 435),
        performer: 'Contas a Receber', sla: 'D+1', sapTransaction: 'PAG-01', requirementRefs: ['REQ-031'] },
      { id: 'g4', kind: 'gateway', variant: 'exclusive', name: 'Pago?', laneId: 'Lane_C', bounds: gw(1000, 435),
        requirementRefs: ['REQ-031'] },
      { id: 'e2', kind: 'end', variant: 'none', name: 'Ciclo encerrado', laneId: 'Lane_C', bounds: event(1120, 435) },
      { id: 'e3', kind: 'end', variant: 'message', name: 'Escalar para cobrança', laneId: 'Lane_C', bounds: event(1000, 497),
        performer: 'Cobrança', requirementRefs: ['REQ-035'] },
    ],
    flows: [
      { id: 'f1', sourceId: 's1', targetId: 't1', waypoints: [[128, 85], [190, 85]] },
      { id: 'f2', sourceId: 't1', targetId: 'g1', waypoints: [[310, 85], [365, 85]] },
      { id: 'f3', sourceId: 'g1', targetId: 't2', name: 'Não', waypoints: [[415, 85], [500, 85]] },
      { id: 'f4', sourceId: 'g1', targetId: 't3', name: 'Sim', isDefault: true, waypoints: [[390, 110], [390, 220]] },
      { id: 'f5', sourceId: 't2', targetId: 't3', waypoints: [[560, 120], [560, 200], [420, 200], [420, 220]] },
      { id: 'f6', sourceId: 't3', targetId: 'g2', waypoints: [[450, 255], [515, 255]] },
      { id: 'f7', sourceId: 'g2', targetId: 't4', waypoints: [[565, 255], [630, 255]] },
      { id: 'f8', sourceId: 't4', targetId: 'sub1', waypoints: [[750, 255], [790, 255]] },
      { id: 'f9', sourceId: 'sub1', targetId: 'e1', waypoints: [[930, 255], [992, 255]] },
      { id: 'f10', sourceId: 'g2', targetId: 't5', waypoints: [[540, 280], [540, 400]] },
      { id: 'f11', sourceId: 't5', targetId: 'i1', waypoints: [[600, 435], [682, 435]] },
      { id: 'f12', sourceId: 'i1', targetId: 't6', waypoints: [[718, 435], [800, 435]] },
      { id: 'f13', sourceId: 't6', targetId: 'g4', waypoints: [[920, 435], [975, 435]] },
      { id: 'f14', sourceId: 'g4', targetId: 'e2', name: 'Sim', waypoints: [[1025, 435], [1102, 435]] },
      { id: 'f15', sourceId: 'g4', targetId: 'e3', name: 'Não', waypoints: [[1000, 460], [1000, 479]] },
      { id: 'a1', kind: 'association', sourceId: 'n1', targetId: 'sub1', waypoints: [[860, 108], [860, 215]] },
      { id: 'a2', kind: 'association', sourceId: 'd1', targetId: 't3', waypoints: [[264, 255], [330, 255]] },
    ],
  });
}
