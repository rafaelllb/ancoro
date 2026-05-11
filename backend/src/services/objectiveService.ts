/**
 * Objective Service
 *
 * Serviço responsável por gerenciar objetivos de projeto (Ancora Method v2).
 * Implementa validação automática do campo WHY para detectar requisitos órfãos.
 *
 * @author Rafael Brito
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tipos
export interface ProjectObjective {
  id: string;
  projectId: string;
  code: string;
  title: string;
  description: string | null;
  activatePhase: string | null;
  keywords: string[];
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateObjectiveInput {
  code: string;
  title: string;
  description?: string;
  activatePhase?: string;
  keywords?: string[];
  priority?: number;
}

export interface UpdateObjectiveInput {
  code?: string;
  title?: string;
  description?: string;
  activatePhase?: string;
  keywords?: string[];
  priority?: number;
  isActive?: boolean;
}

export interface OrphanValidationResult {
  requirementId: string;
  reqId: string;
  why: string;
  isOrphan: boolean;
  matchedObjectiveId: string | null;
  matchedObjectiveCode: string | null;
  matchScore: number;
}

// Fases do projeto válidas (metodologia Activate)
const VALID_ACTIVATE_PHASES = ['DISCOVER', 'EXPLORE', 'REALIZE', 'DEPLOY', 'RUN'];

/**
 * Lista objetivos de um projeto
 */
export async function getProjectObjectives(projectId: string, includeInactive = false): Promise<ProjectObjective[]> {
  const objectives = await prisma.projectObjective.findMany({
    where: {
      projectId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [
      { priority: 'asc' },
      { code: 'asc' },
    ],
  });

  return objectives.map(obj => ({
    ...obj,
    keywords: JSON.parse(obj.keywords || '[]'),
  }));
}

/**
 * Busca um objetivo por ID
 */
export async function getObjectiveById(objectiveId: string): Promise<ProjectObjective | null> {
  const objective = await prisma.projectObjective.findUnique({
    where: { id: objectiveId },
  });

  if (!objective) return null;

  return {
    ...objective,
    keywords: JSON.parse(objective.keywords || '[]'),
  };
}

/**
 * Cria um novo objetivo de projeto
 */
export async function createObjective(projectId: string, input: CreateObjectiveInput): Promise<ProjectObjective> {
  // Valida fase Activate se fornecida
  if (input.activatePhase && !VALID_ACTIVATE_PHASES.includes(input.activatePhase)) {
    throw new Error(`Fase Activate inválida: ${input.activatePhase}. Válidas: ${VALID_ACTIVATE_PHASES.join(', ')}`);
  }

  const objective = await prisma.projectObjective.create({
    data: {
      projectId,
      code: input.code.toUpperCase(),
      title: input.title,
      description: input.description,
      activatePhase: input.activatePhase,
      keywords: JSON.stringify(input.keywords || []),
      priority: input.priority ?? 0,
    },
  });

  return {
    ...objective,
    keywords: JSON.parse(objective.keywords),
  };
}

/**
 * Atualiza um objetivo existente
 */
export async function updateObjective(objectiveId: string, input: UpdateObjectiveInput): Promise<ProjectObjective> {
  // Valida fase Activate se fornecida
  if (input.activatePhase && !VALID_ACTIVATE_PHASES.includes(input.activatePhase)) {
    throw new Error(`Fase Activate inválida: ${input.activatePhase}. Válidas: ${VALID_ACTIVATE_PHASES.join(', ')}`);
  }

  const updateData: Record<string, unknown> = {};

  if (input.code !== undefined) updateData.code = input.code.toUpperCase();
  if (input.title !== undefined) updateData.title = input.title;
  if (input.description !== undefined) updateData.description = input.description;
  if (input.activatePhase !== undefined) updateData.activatePhase = input.activatePhase;
  if (input.keywords !== undefined) updateData.keywords = JSON.stringify(input.keywords);
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.isActive !== undefined) updateData.isActive = input.isActive;

  const objective = await prisma.projectObjective.update({
    where: { id: objectiveId },
    data: updateData,
  });

  return {
    ...objective,
    keywords: JSON.parse(objective.keywords),
  };
}

/**
 * Deleta um objetivo (soft delete via isActive = false)
 */
export async function deleteObjective(objectiveId: string): Promise<void> {
  await prisma.projectObjective.update({
    where: { id: objectiveId },
    data: { isActive: false },
  });
}

/**
 * Normaliza texto para comparação (lowercase, remove acentos, pontuação)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^\w\s]/g, ' ')        // Remove pontuação
    .replace(/\s+/g, ' ')            // Normaliza espaços
    .trim();
}

/**
 * Calcula score de matching entre WHY e objetivo
 * Retorna valor entre 0 e 1
 */
function calculateMatchScore(why: string, objective: { title: string; description: string | null; keywords: string[] }): number {
  const normalizedWhy = normalizeText(why);
  const whyWords = new Set(normalizedWhy.split(' ').filter(w => w.length > 2));

  let score = 0;
  let maxPossibleScore = 0;

  // Match com keywords (peso 3)
  for (const keyword of objective.keywords) {
    maxPossibleScore += 3;
    const normalizedKeyword = normalizeText(keyword);
    if (normalizedWhy.includes(normalizedKeyword)) {
      score += 3;
    }
  }

  // Match com título (peso 2 por palavra)
  const titleWords = normalizeText(objective.title).split(' ').filter(w => w.length > 2);
  for (const titleWord of titleWords) {
    maxPossibleScore += 2;
    if (whyWords.has(titleWord) || normalizedWhy.includes(titleWord)) {
      score += 2;
    }
  }

  // Match com descrição (peso 1 por palavra)
  if (objective.description) {
    const descWords = normalizeText(objective.description).split(' ').filter(w => w.length > 3);
    for (const descWord of descWords) {
      maxPossibleScore += 1;
      if (whyWords.has(descWord)) {
        score += 1;
      }
    }
  }

  // Evita divisão por zero
  if (maxPossibleScore === 0) return 0;

  return score / maxPossibleScore;
}

/**
 * Valida se o WHY de um requisito corresponde a algum objetivo
 * Threshold padrão: 0.15 (15% de match)
 */
export async function validateRequirementWhy(
  projectId: string,
  requirementId: string,
  why: string,
  threshold = 0.15
): Promise<OrphanValidationResult> {
  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: { id: true, reqId: true, why: true },
  });

  if (!requirement) {
    throw new Error(`Requisito não encontrado: ${requirementId}`);
  }

  const objectives = await getProjectObjectives(projectId);

  // Caso especial: nenhum objetivo cadastrado = todos são órfãos
  if (objectives.length === 0) {
    return {
      requirementId,
      reqId: requirement.reqId,
      why,
      isOrphan: true,
      matchedObjectiveId: null,
      matchedObjectiveCode: null,
      matchScore: 0,
    };
  }

  // Calcula score para cada objetivo e pega o melhor
  let bestMatch: { objective: ProjectObjective; score: number } | null = null;

  for (const objective of objectives) {
    const score = calculateMatchScore(why, objective);
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { objective, score };
    }
  }

  const isOrphan = !bestMatch || bestMatch.score < threshold;

  return {
    requirementId,
    reqId: requirement.reqId,
    why,
    isOrphan,
    matchedObjectiveId: isOrphan ? null : bestMatch!.objective.id,
    matchedObjectiveCode: isOrphan ? null : bestMatch!.objective.code,
    matchScore: bestMatch?.score ?? 0,
  };
}

/**
 * Valida todos os requisitos de um projeto e atualiza flags isOrphan
 * Retorna lista de resultados de validação
 */
export async function validateAllRequirements(projectId: string, threshold = 0.15): Promise<OrphanValidationResult[]> {
  const requirements = await prisma.requirement.findMany({
    where: { projectId },
    select: { id: true, reqId: true, why: true },
  });

  const objectives = await getProjectObjectives(projectId);
  const results: OrphanValidationResult[] = [];

  for (const req of requirements) {
    // Caso especial: nenhum objetivo cadastrado
    if (objectives.length === 0) {
      results.push({
        requirementId: req.id,
        reqId: req.reqId,
        why: req.why,
        isOrphan: true,
        matchedObjectiveId: null,
        matchedObjectiveCode: null,
        matchScore: 0,
      });
      continue;
    }

    // Calcula melhor match
    let bestMatch: { objective: ProjectObjective; score: number } | null = null;

    for (const objective of objectives) {
      const score = calculateMatchScore(req.why, objective);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { objective, score };
      }
    }

    const isOrphan = !bestMatch || bestMatch.score < threshold;

    results.push({
      requirementId: req.id,
      reqId: req.reqId,
      why: req.why,
      isOrphan,
      matchedObjectiveId: isOrphan ? null : bestMatch!.objective.id,
      matchedObjectiveCode: isOrphan ? null : bestMatch!.objective.code,
      matchScore: bestMatch?.score ?? 0,
    });

    // Atualiza o requisito no banco
    await prisma.requirement.update({
      where: { id: req.id },
      data: {
        isOrphan,
        linkedObjectiveId: isOrphan ? null : bestMatch!.objective.id,
      },
    });
  }

  return results;
}

/**
 * Conta requisitos órfãos de um projeto
 */
export async function countOrphanRequirements(projectId: string): Promise<number> {
  return prisma.requirement.count({
    where: {
      projectId,
      isOrphan: true,
    },
  });
}

/**
 * Lista requisitos órfãos de um projeto
 */
export async function getOrphanRequirements(projectId: string): Promise<Array<{
  id: string;
  reqId: string;
  shortDesc: string;
  why: string;
  status: string;
}>> {
  return prisma.requirement.findMany({
    where: {
      projectId,
      isOrphan: true,
    },
    select: {
      id: true,
      reqId: true,
      shortDesc: true,
      why: true,
      status: true,
    },
    orderBy: { reqId: 'asc' },
  });
}
