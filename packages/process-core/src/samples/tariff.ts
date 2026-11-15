/**
 * Processo de exemplo "Cálculo de tarifa e impostos" — o subprocesso chamado (call activity) pelo faturamento.
 *
 * [2026-11-07] Criado: fixture para demonstrar o mergulho da simulação em subprocessos — Rafael Brito
 * Sem geometria de propósito: o editor aplica o auto-layout (mesmo caminho dos processos gerados por IA).
 */
import { parseModel, type ProcessModel } from '../model.js';

export function tariffSample(): ProcessModel {
  return parseModel({
    id: 'Process_Tariff',
    name: 'Cálculo de tarifa e impostos',
    nodes: [
      { id: 'ts', kind: 'start', variant: 'none', name: 'Faturamento iniciado' },
      { id: 'tt1', kind: 'task', variant: 'service', name: 'Buscar tarifa vigente', duration: '10 min', cost: 'R$ 1', performer: 'Sistema', sapTransaction: 'TAR-01',
        inputs: ['Classe de consumo'], outputs: ['Tarifa aplicável'] },
      { id: 'tg', kind: 'gateway', variant: 'exclusive', name: 'Cliente isento?' },
      { id: 'tt2', kind: 'task', variant: 'service', name: 'Calcular impostos', duration: '25 min', cost: 'R$ 3', performer: 'Sistema', sapTransaction: 'IMP-02',
        rules: ['Aplicar alíquota por município'] },
      { id: 'te', kind: 'end', variant: 'none', name: 'Valores calculados' },
    ],
    flows: [
      { id: 'tf1', sourceId: 'ts', targetId: 'tt1' },
      { id: 'tf2', sourceId: 'tt1', targetId: 'tg' },
      { id: 'tf3', sourceId: 'tg', targetId: 'tt2', name: 'Não', probability: 90 },
      { id: 'tf4', sourceId: 'tg', targetId: 'te', name: 'Sim', isDefault: true, probability: 10 },
      { id: 'tf5', sourceId: 'tt2', targetId: 'te' },
    ],
  });
}
