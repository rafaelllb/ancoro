/**
 * Metrics Service
 *
 * Serviço responsável por calcular métricas e KPIs do projeto.
 * Usado para alimentar o dashboard de métricas.
 *
 * @author Rafael Brito
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tipos de retorno das métricas
export interface ProjectMetrics {
  // Totais
  totalRequirements: number;
  totalIntegrations: number;
  totalComments: number;
  totalChanges: number;

  // Por status
  requirementsByStatus: Record<string, number>;

  // Por módulo
  requirementsByModule: Record<string, number>;

  // Taxa de validação
  validationRate: number;

  // Conflitos e problemas
  openConflicts: number;
  pendingIntegrations: number;
  circularDependencies: number;

  // Atividade recente
  recentChanges: number; // últimas 24h
  recentComments: number; // últimas 24h
}

export interface ConsultantPendency {
  consultantId: string;
  consultantName: string;
  consultantEmail: string;
  pendingRequirements: number;
  conflictRequirements: number;
  totalAssigned: number;
}

export interface TimelineDataPoint {
  date: string; // ISO date (YYYY-MM-DD)
  validated: number;
  pending: number;
  conflicts: number;
  total: number;
}

export interface ModuleHeatmapCell {
  fromModule: string;
  toModule: string;
  count: number;
  status: 'OK' | 'PENDING' | 'CONFLICT' | 'MIXED';
}

/**
 * Calcula métricas gerais do projeto
 */
export async function getProjectMetrics(projectId: string): Promise<ProjectMetrics> {
  // Busca requisitos com contagens
  const requirements = await prisma.requirement.findMany({
    where: { projectId },
    select: {
      status: true,
      module: true,
    },
  });

  // Busca integrações
  const integrations = await prisma.crossMatrixEntry.findMany({
    where: { projectId },
    select: {
      status: true,
    },
  });

  // Conta comentários
  const commentCount = await prisma.comment.count({
    where: {
      requirement: { projectId },
    },
  });

  // Conta mudanças
  const changeCount = await prisma.changeLog.count({
    where: {
      requirement: { projectId },
    },
  });

  // Atividade recente (últimas 24h)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const recentChanges = await prisma.changeLog.count({
    where: {
      requirement: { projectId },
      createdAt: { gte: yesterday },
    },
  });

  const recentComments = await prisma.comment.count({
    where: {
      requirement: { projectId },
      createdAt: { gte: yesterday },
    },
  });

  // Agrega por status
  const requirementsByStatus = requirements.reduce((acc, req) => {
    acc[req.status] = (acc[req.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Agrega por módulo
  const requirementsByModule = requirements.reduce((acc, req) => {
    acc[req.module] = (acc[req.module] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Calcula taxa de validação
  const validated =
    (requirementsByStatus['VALIDATED'] || 0) + (requirementsByStatus['APPROVED'] || 0);
  const validationRate = requirements.length > 0 ? validated / requirements.length : 0;

  // Conta conflitos e problemas nas integrações
  const pendingIntegrations = integrations.filter((i) => i.status === 'PENDING').length;
  const circularDependencies = integrations.filter((i) => i.status === 'CIRCULAR').length;

  return {
    totalRequirements: requirements.length,
    totalIntegrations: integrations.length,
    totalComments: commentCount,
    totalChanges: changeCount,
    requirementsByStatus,
    requirementsByModule,
    validationRate,
    openConflicts: requirementsByStatus['CONFLICT'] || 0,
    pendingIntegrations,
    circularDependencies,
    recentChanges,
    recentComments,
  };
}

/**
 * Busca consultores com pendências
 * Retorna lista de consultores ordenada por número de pendências
 */
export async function getConsultantsPendencies(
  projectId: string
): Promise<ConsultantPendency[]> {
  // Busca requisitos com informações do consultor
  const requirements = await prisma.requirement.findMany({
    where: { projectId },
    select: {
      consultantId: true,
      status: true,
      consultant: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  // Agrupa por consultor
  const consultantMap = new Map<
    string,
    {
      consultant: { id: string; name: string; email: string };
      pending: number;
      conflict: number;
      total: number;
    }
  >();

  for (const req of requirements) {
    const existing = consultantMap.get(req.consultantId) || {
      consultant: req.consultant,
      pending: 0,
      conflict: 0,
      total: 0,
    };

    existing.total++;
    if (req.status === 'PENDING' || req.status === 'IN_PROGRESS') {
      existing.pending++;
    }
    if (req.status === 'CONFLICT') {
      existing.conflict++;
    }

    consultantMap.set(req.consultantId, existing);
  }

  // Converte para array e ordena por pendências
  return Array.from(consultantMap.values())
    .map((entry) => ({
      consultantId: entry.consultant.id,
      consultantName: entry.consultant.name,
      consultantEmail: entry.consultant.email,
      pendingRequirements: entry.pending,
      conflictRequirements: entry.conflict,
      totalAssigned: entry.total,
    }))
    .sort((a, b) => b.pendingRequirements + b.conflictRequirements - (a.pendingRequirements + a.conflictRequirements));
}

/**
 * Calcula progressão temporal de requisitos validados
 * Retorna dados para gráfico de linha (por semana)
 */
export async function getProgressTimeline(
  projectId: string,
  weeks: number = 12
): Promise<TimelineDataPoint[]> {
  // Determina data de início (N semanas atrás)
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - weeks * 7);
  startDate.setHours(0, 0, 0, 0);

  // Busca changelog de mudanças de status
  const changes = await prisma.changeLog.findMany({
    where: {
      requirement: { projectId },
      field: 'status',
      createdAt: { gte: startDate },
    },
    select: {
      createdAt: true,
      oldValue: true,
      newValue: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Também busca criação de requisitos
  const requirements = await prisma.requirement.findMany({
    where: {
      projectId,
      createdAt: { gte: startDate },
    },
    select: {
      createdAt: true,
      status: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Agrupa por semana
  const weeklyData = new Map<string, { validated: number; pending: number; conflicts: number; total: number }>();

  // Inicializa semanas
  for (let i = 0; i < weeks; i++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + i * 7);
    const weekKey = getWeekKey(weekStart);
    weeklyData.set(weekKey, { validated: 0, pending: 0, conflicts: 0, total: 0 });
  }

  // Processa requisitos criados
  for (const req of requirements) {
    const weekKey = getWeekKey(req.createdAt);
    const weekData = weeklyData.get(weekKey);
    if (weekData) {
      weekData.total++;
      if (req.status === 'VALIDATED' || req.status === 'APPROVED') {
        weekData.validated++;
      } else if (req.status === 'CONFLICT') {
        weekData.conflicts++;
      } else {
        weekData.pending++;
      }
    }
  }

  // Processa mudanças de status
  for (const change of changes) {
    const weekKey = getWeekKey(change.createdAt);
    const weekData = weeklyData.get(weekKey);
    if (weekData) {
      // Se mudou para validado/aprovado
      if (change.newValue === 'VALIDATED' || change.newValue === 'APPROVED') {
        weekData.validated++;
        if (change.oldValue === 'PENDING' || change.oldValue === 'IN_PROGRESS') {
          weekData.pending--;
        } else if (change.oldValue === 'CONFLICT') {
          weekData.conflicts--;
        }
      }
      // Se mudou para conflito
      else if (change.newValue === 'CONFLICT') {
        weekData.conflicts++;
        if (change.oldValue === 'PENDING' || change.oldValue === 'IN_PROGRESS') {
          weekData.pending--;
        }
      }
    }
  }

  // Converte para array
  return Array.from(weeklyData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      ...data,
    }));
}

/**
 * Gera heatmap de integrações módulo × módulo
 */
export async function getIntegrationHeatmap(
  projectId: string
): Promise<ModuleHeatmapCell[]> {
  const integrations = await prisma.crossMatrixEntry.findMany({
    where: { projectId },
    select: {
      fromModule: true,
      toModule: true,
      status: true,
    },
  });

  // Agrupa por par de módulos
  const pairMap = new Map<
    string,
    { fromModule: string; toModule: string; count: number; statuses: string[] }
  >();

  for (const entry of integrations) {
    const key = `${entry.fromModule}->${entry.toModule}`;
    const existing = pairMap.get(key) || {
      fromModule: entry.fromModule,
      toModule: entry.toModule,
      count: 0,
      statuses: [],
    };

    existing.count++;
    existing.statuses.push(entry.status);
    pairMap.set(key, existing);
  }

  // Converte para array com status consolidado
  return Array.from(pairMap.values()).map((entry) => {
    // Determina status consolidado
    let status: ModuleHeatmapCell['status'];
    if (entry.statuses.every((s) => s === 'OK')) {
      status = 'OK';
    } else if (entry.statuses.some((s) => s === 'CONFLICT' || s === 'CIRCULAR')) {
      status = 'CONFLICT';
    } else if (entry.statuses.every((s) => s === 'PENDING')) {
      status = 'PENDING';
    } else {
      status = 'MIXED';
    }

    return {
      fromModule: entry.fromModule,
      toModule: entry.toModule,
      count: entry.count,
      status,
    };
  });
}

/**
 * Retorna chave de semana no formato YYYY-WXX
 */
function getWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7)); // Ajusta para quinta-feira
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
}

/**
 * Busca estatísticas de comentários por tipo
 */
export async function getCommentStats(
  projectId: string
): Promise<Record<string, number>> {
  const comments = await prisma.comment.findMany({
    where: {
      requirement: { projectId },
    },
    select: {
      type: true,
    },
  });

  return comments.reduce((acc, comment) => {
    acc[comment.type] = (acc[comment.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
