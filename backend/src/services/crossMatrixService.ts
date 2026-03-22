/**
 * Cross Matrix Service
 *
 * Serviço responsável por gerar automaticamente a matriz de cruzamento
 * a partir dos campos "Depende De" e "Fornece Para" dos requisitos.
 *
 * @author Rafael Brito
 */

import { PrismaClient } from '@prisma/client';
import {
  detectCircularDependencies,
  formatCycle,
  type DependencyEdge,
  type CircularDependency,
} from '../utils/circularDependency';
import { emitCircularDependency } from './notificationService';

const prisma = new PrismaClient();

interface RequirementForMatrix {
  id: string;
  reqId: string;
  module: string;
  dependsOn: string | null;
  providesFor: string | null;
}

/**
 * Extrai IDs de requisitos de uma string separada por vírgulas
 * Exemplo: "ISU-001, ISU-002, FI-001" → ["ISU-001", "ISU-002", "FI-001"]
 */
function parseReqIds(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Extrai todas as dependências dos requisitos
 * Retorna lista de edges para construir grafo
 */
function extractDependencies(
  requirements: RequirementForMatrix[]
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];

  requirements.forEach((req) => {
    // "Depende De" = este req → outros reqs
    const dependsOn = parseReqIds(req.dependsOn);
    dependsOn.forEach((toReqId) => {
      edges.push({
        fromReqId: req.reqId,
        toReqId,
      });
    });

    // "Fornece Para" = outros reqs → este req
    const providesTo = parseReqIds(req.providesFor);
    providesTo.forEach((fromReqId) => {
      edges.push({
        fromReqId,
        toReqId: req.reqId,
      });
    });
  });

  return edges;
}

/**
 * Busca módulo de um requisito pelo Req ID
 */
function findModule(
  reqId: string,
  requirements: RequirementForMatrix[]
): string | null {
  const req = requirements.find((r) => r.reqId === reqId);
  return req?.module || null;
}

/**
 * Busca ID do banco de dados de um requisito pelo Req ID
 */
function findRequirementId(
  reqId: string,
  requirements: RequirementForMatrix[]
): string | null {
  const req = requirements.find((r) => r.reqId === reqId);
  return req?.id || null;
}

/**
 * Gera a matriz de cruzamento completa para um projeto
 *
 * Etapas:
 * 1. Buscar todos os requisitos do projeto
 * 2. Extrair dependências dos campos "Depende De" e "Fornece Para"
 * 3. Deletar entries antigas da matriz
 * 4. Criar novas entries
 * 5. Detectar dependências circulares
 * 6. Atualizar status das entries com ciclos
 */
export async function regenerateCrossMatrix(
  projectId: string
): Promise<{ created: number; circular: number; cycles: CircularDependency[] }> {
  // 1. Buscar requisitos do projeto
  const requirements = await prisma.requirement.findMany({
    where: { projectId },
    select: {
      id: true,
      reqId: true,
      module: true,
      dependsOn: true,
      providesFor: true,
    },
  });

  if (requirements.length === 0) {
    return { created: 0, circular: 0, cycles: [] };
  }

  // 2. Extrair dependências
  const edges = extractDependencies(requirements);

  // 3. Deletar entries antigas
  await prisma.crossMatrixEntry.deleteMany({
    where: { projectId },
  });

  // 4. Criar novas entries
  const entriesToCreate = edges
    .map((edge) => {
      const fromModule = findModule(edge.fromReqId, requirements);
      const toModule = findModule(edge.toReqId, requirements);
      const fromId = findRequirementId(edge.fromReqId, requirements);
      const toId = findRequirementId(edge.toReqId, requirements);

      // Ignorar se algum requisito não foi encontrado
      if (!fromModule || !toModule || !fromId || !toId) {
        return null;
      }

      return {
        projectId,
        fromReqId: edge.fromReqId,
        toReqId: edge.toReqId,
        fromModule,
        toModule,
        status: 'PENDING' as const,
      };
    })
    .filter((entry) => entry !== null);

  if (entriesToCreate.length > 0) {
    await prisma.crossMatrixEntry.createMany({
      data: entriesToCreate,
    });
  }

  // 5. Detectar dependências circulares
  const cycles = detectCircularDependencies(edges);

  // 6. Atualizar status para CIRCULAR e emitir notificação
  let circularCount = 0;
  if (cycles.length > 0) {
    // Emite notificação real-time sobre ciclos detectados
    const cycleArrays = cycles.map((c) => c.cycle);
    emitCircularDependency(projectId, cycleArrays);
    const affectedReqIds = new Set<string>();
    cycles.forEach((cycle) => {
      cycle.affectedReqIds.forEach((reqId) => affectedReqIds.add(reqId));
    });

    // Atualizar entries envolvidas em ciclos
    for (const reqId of affectedReqIds) {
      await prisma.crossMatrixEntry.updateMany({
        where: {
          projectId,
          OR: [{ fromReqId: reqId }, { toReqId: reqId }],
        },
        data: {
          status: 'CIRCULAR',
          manualNotes: `Dependência circular detectada: ${cycles
            .filter((c) => c.affectedReqIds.has(reqId))
            .map((c) => formatCycle(c.cycle))
            .join('; ')}`,
        },
      });
      circularCount++;
    }
  }

  return {
    created: entriesToCreate.length,
    circular: circularCount,
    cycles,
  };
}

/**
 * Busca a matriz de cruzamento de um projeto
 * Permite filtrar por módulo
 */
export async function getCrossMatrix(
  projectId: string,
  moduleFilter?: string
) {
  const where: any = { projectId };

  if (moduleFilter) {
    where.OR = [{ fromModule: moduleFilter }, { toModule: moduleFilter }];
  }

  const entries = await prisma.crossMatrixEntry.findMany({
    where,
    orderBy: [{ fromReqId: 'asc' }, { toReqId: 'asc' }],
  });

  return entries;
}

/**
 * Atualiza campos de validação manual de uma entry
 */
export async function updateCrossMatrixEntry(
  entryId: string,
  data: {
    dataFlow?: string;
    integrationType?: string;
    trigger?: string;
    timing?: string;
    ownerId?: string;
    status?: string;
    manualNotes?: string;
  }
) {
  return await prisma.crossMatrixEntry.update({
    where: { id: entryId },
    data,
  });
}

// =============================================================================
// TODO [ESTIGMERGIA]: AI-Powered Impact Analysis
// =============================================================================
// CONTEXTO:
//   Diferencial competitivo identificado - nenhum competidor (Jira, Azure DevOps,
//   DOORS) oferece análise semântica de impacto quando um requisito muda.
//
// O QUE IMPLEMENTAR:
//   Quando um requisito é alterado, usar LLM para analisar:
//   1. Delta da mudança (oldValue → newValue)
//   2. Requisitos conectados via cross-matrix (1º e 2º grau)
//   3. Histórico de conflitos similares (changelog)
//   4. Ranquear impacto: ALTO / MÉDIO / BAIXO + razão
//
// ARQUITETURA SUGERIDA:
//   - Novo service: ImpactAnalysisService
//   - Endpoint: POST /api/requirements/:id/impact-analysis
//   - Provider: Anthropic (Haiku) ou OpenAI (GPT-4o-mini) - custo ~$0.01-0.05/análise
//   - Cache: Redis ou in-memory para análises recentes (mesmo delta = mesmo resultado)
//   - Trigger: manual (botão na UI) ou automático (on change com debounce)
//
// FLUXO:
//   1. Requisito alterado → captura delta
//   2. Query getCrossMatrix() → lista dependências
//   3. Monta prompt com contexto estruturado
//   4. LLM retorna JSON: { impacts: [{ reqId, level, reason }] }
//   5. UI exibe lista priorizada para review
//
// DECISÃO PENDENTE:
//   - Definir se análise é síncrona (bloqueia UI 2-5s) ou async (notifica quando pronta)
//   - Definir limite de tokens/custo mensal aceitável
//
// REFERÊNCIAS:
//   - Cross-matrix já disponível via getCrossMatrix()
//   - Changelog disponível via /api/requirements/:id/changelog
//   - Plano estratégico: C:\Users\rafae\.claude\plans\reactive-bouncing-ripple.md
// =============================================================================
