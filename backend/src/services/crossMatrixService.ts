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

interface ExistingMatrixEntry {
  fromReqId: string;
  toReqId: string;
  dataFlow: string | null;
  dataFlowBack: string | null;
  integrationType: string;
  trigger: string;
  timing: string;
  ownerUserId: string | null;
  status: string;
  manualNotes: string | null;
}

const AUTO_CIRCULAR_NOTE_PREFIX = '[AUTO:CIRCULAR]';

function buildEntryKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

function stripAutoCircularNote(notes: string | null): string | null {
  if (!notes) return null;

  const sanitized = notes
    .replace(
      new RegExp(`\\n\\n${AUTO_CIRCULAR_NOTE_PREFIX}[\\s\\S]*$`),
      ''
    )
    .trim();

  return sanitized.length > 0 ? sanitized : null;
}

function buildCircularNotes(
  manualNotes: string | null,
  cycleDescriptions: string[]
): string | null {
  const sanitizedManualNotes = stripAutoCircularNote(manualNotes);

  if (cycleDescriptions.length === 0) {
    return sanitizedManualNotes;
  }

  const autoNote = `${AUTO_CIRCULAR_NOTE_PREFIX} Dependência circular detectada: ${cycleDescriptions.join(
    '; '
  )}`;

  return sanitizedManualNotes
    ? `${sanitizedManualNotes}\n\n${autoNote}`
    : autoNote;
}

/**
 * Extrai IDs de requisitos de uma string separada por vírgulas
 * Exemplo: "ISU-001, ISU-002, FI-001" → ["ISU-001", "ISU-002", "FI-001"]
 */
function parseReqIds(text: string | null): string[] {
  if (!text) return [];

  const trimmed = text.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map((id) => String(id).trim())
        .filter((id) => id.length > 0);
    }
  } catch {
    // Compatibilidade com registros antigos armazenados como CSV.
  }

  return trimmed
    .split(',')
    .map((id) => id.trim().replace(/^["[]+|["\]]+$/g, ''))
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
  const seenEdges = new Set<string>();

  const addEdge = (fromReqId: string, toReqId: string) => {
    const key = `${fromReqId}->${toReqId}`;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    edges.push({ fromReqId, toReqId });
  };

  requirements.forEach((req) => {
    // "Depende De" = outros reqs → este req
    const dependsOn = parseReqIds(req.dependsOn);
    dependsOn.forEach((fromReqId) => {
      addEdge(fromReqId, req.reqId);
    });

    // "Fornece Para" = este req → outros reqs
    const providesTo = parseReqIds(req.providesFor);
    providesTo.forEach((toReqId) => {
      addEdge(req.reqId, toReqId);
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
  const existingEntries = await prisma.crossMatrixEntry.findMany({
    where: { projectId },
    select: {
      fromReqId: true,
      toReqId: true,
      dataFlow: true,
      dataFlowBack: true,
      integrationType: true,
      trigger: true,
      timing: true,
      ownerUserId: true,
      status: true,
      manualNotes: true,
    },
  });

  const existingEntriesByKey = new Map<string, ExistingMatrixEntry>(
    existingEntries.map((entry) => [
      buildEntryKey(entry.fromReqId, entry.toReqId),
      entry,
    ])
  );

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
    await prisma.crossMatrixEntry.deleteMany({
      where: { projectId },
    });

    return { created: 0, circular: 0, cycles: [] };
  }

  // 2. Extrair dependências
  const edges = extractDependencies(requirements);

  // 2.1 Detectar ciclos antes de recriar as entries
  const cycles = detectCircularDependencies(edges);
  const circularEdgeKeys = new Set<string>();
  const cycleDescriptionsByEdge = new Map<string, string[]>();

  cycles.forEach((cycle) => {
    const formattedCycle = formatCycle(cycle.cycle);

    for (let index = 0; index < cycle.cycle.length - 1; index++) {
      const fromReqId = cycle.cycle[index];
      const toReqId = cycle.cycle[index + 1];
      const edgeKey = buildEntryKey(fromReqId, toReqId);

      circularEdgeKeys.add(edgeKey);
      cycleDescriptionsByEdge.set(edgeKey, [
        ...(cycleDescriptionsByEdge.get(edgeKey) ?? []),
        formattedCycle,
      ]);
    }
  });

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

      const existingEntry = existingEntriesByKey.get(buildEntryKey(fromId, toId));
      const humanReadableEdgeKey = buildEntryKey(edge.fromReqId, edge.toReqId);
      const isCircular = circularEdgeKeys.has(humanReadableEdgeKey);
      const cycleDescriptions =
        cycleDescriptionsByEdge.get(humanReadableEdgeKey) ?? [];

      return {
        projectId,
        fromReqId: fromId,
        toReqId: toId,
        fromModule,
        toModule,
        dataFlow: existingEntry?.dataFlow ?? null,
        dataFlowBack: existingEntry?.dataFlowBack ?? null,
        integrationType: existingEntry?.integrationType ?? 'OTHER',
        trigger: existingEntry?.trigger ?? '',
        timing: existingEntry?.timing ?? 'SYNC',
        ownerUserId: existingEntry?.ownerUserId ?? null,
        status: isCircular
          ? 'CIRCULAR'
          : existingEntry?.status === 'CIRCULAR'
            ? 'PENDING'
            : existingEntry?.status ?? 'PENDING',
        manualNotes: buildCircularNotes(
          existingEntry?.manualNotes ?? null,
          cycleDescriptions
        ),
      };
    })
    .filter((entry) => entry !== null);

  if (entriesToCreate.length > 0) {
    await prisma.crossMatrixEntry.createMany({
      data: entriesToCreate,
    });
  }
  if (cycles.length > 0) {
    // Emite notificação real-time sobre ciclos detectados
    const cycleArrays = cycles.map((c) => c.cycle);
    emitCircularDependency(projectId, cycleArrays);
  }

  return {
    created: entriesToCreate.length,
    circular: circularEdgeKeys.size,
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
    include: {
      fromReq: {
        select: { reqId: true },
      },
      toReq: {
        select: { reqId: true },
      },
    },
    orderBy: [{ fromReqId: 'asc' }, { toReqId: 'asc' }],
  });

  return entries
    .map(({ fromReq, toReq, ...entry }) => ({
      ...entry,
      fromReqId: fromReq.reqId,
      toReqId: toReq.reqId,
    }))
    .sort((a, b) => {
      if (a.fromReqId !== b.fromReqId) {
        return a.fromReqId.localeCompare(b.fromReqId);
      }

      return a.toReqId.localeCompare(b.toReqId);
    });
}

/**
 * Atualiza campos de validação manual de uma entry
 */
export async function updateCrossMatrixEntry(
  entryId: string,
  data: {
    dataFlow?: string;
    dataFlowBack?: string;
    integrationType?: string;
    trigger?: string;
    timing?: string;
    ownerId?: string;
    status?: string;
    manualNotes?: string;
  }
) {
  const { ownerId, ...rest } = data;

  return await prisma.crossMatrixEntry.update({
    where: { id: entryId },
    data: {
      ...rest,
      ...(ownerId !== undefined ? { ownerUserId: ownerId || null } : {}),
    },
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
