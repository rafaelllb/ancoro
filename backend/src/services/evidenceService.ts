/**
 * Evidence Service
 *
 * Serviço responsável por gerenciar evidências de implementação (Ancora Method v2).
 * Requisito só pode ir para APPROVED com pelo menos uma evidência anexada.
 *
 * @author Rafael Brito
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tipos de evidência válidos
export const EVIDENCE_TYPES = [
  'COMMIT',        // Link para commit no repositório
  'TEST_RESULT',   // Resultado de teste (unitário, integração, etc)
  'SCREENSHOT',    // Screenshot de tela/funcionalidade
  'APPROVAL_DOC',  // Documento de aprovação/homologação
  'LINK',          // Link externo genérico (Jira, Confluence, etc)
  'FILE',          // Arquivo anexado
  'OTHER',         // Outro tipo
] as const;

export type EvidenceType = typeof EVIDENCE_TYPES[number];

export interface Evidence {
  id: string;
  requirementId: string;
  userId: string;
  type: EvidenceType;
  title: string;
  description: string | null;
  url: string | null;
  fileName: string | null;
  filePath: string | null;
  reference: string | null;
  verified: boolean;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  verifier?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export interface CreateEvidenceInput {
  type: EvidenceType;
  title: string;
  description?: string;
  url?: string;
  fileName?: string;
  filePath?: string;
  reference?: string;
}

export interface UpdateEvidenceInput {
  title?: string;
  description?: string;
  url?: string;
  reference?: string;
}

/**
 * Lista evidências de um requisito
 */
export async function getRequirementEvidences(requirementId: string): Promise<Evidence[]> {
  const evidences = await prisma.evidence.findMany({
    where: { requirementId },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      verifier: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return evidences as Evidence[];
}

/**
 * Busca uma evidência por ID
 */
export async function getEvidenceById(evidenceId: string): Promise<Evidence | null> {
  const evidence = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      verifier: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return evidence as Evidence | null;
}

/**
 * Cria uma nova evidência
 */
export async function createEvidence(
  requirementId: string,
  userId: string,
  input: CreateEvidenceInput
): Promise<Evidence> {
  // Valida tipo
  if (!EVIDENCE_TYPES.includes(input.type)) {
    throw new Error(`Tipo de evidência inválido: ${input.type}. Válidos: ${EVIDENCE_TYPES.join(', ')}`);
  }

  // Verifica se requisito existe
  const requirement = await prisma.requirement.findUnique({
    where: { id: requirementId },
    select: { id: true, status: true },
  });

  if (!requirement) {
    throw new Error('Requisito não encontrado');
  }

  const evidence = await prisma.evidence.create({
    data: {
      requirementId,
      userId,
      type: input.type,
      title: input.title,
      description: input.description,
      url: input.url,
      fileName: input.fileName,
      filePath: input.filePath,
      reference: input.reference,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return evidence as Evidence;
}

/**
 * Atualiza uma evidência existente
 */
export async function updateEvidence(
  evidenceId: string,
  userId: string,
  input: UpdateEvidenceInput
): Promise<Evidence> {
  // Verifica se evidência existe e se o usuário é o criador
  const existing = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    select: { userId: true },
  });

  if (!existing) {
    throw new Error('Evidência não encontrada');
  }

  if (existing.userId !== userId) {
    throw new Error('Apenas o criador pode editar a evidência');
  }

  const evidence = await prisma.evidence.update({
    where: { id: evidenceId },
    data: {
      title: input.title,
      description: input.description,
      url: input.url,
      reference: input.reference,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      verifier: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return evidence as Evidence;
}

/**
 * Deleta uma evidência
 */
export async function deleteEvidence(evidenceId: string, userId: string, userRole: string): Promise<void> {
  const existing = await prisma.evidence.findUnique({
    where: { id: evidenceId },
    select: { userId: true },
  });

  if (!existing) {
    throw new Error('Evidência não encontrada');
  }

  // Apenas criador ou admin pode deletar
  if (existing.userId !== userId && userRole !== 'ADMIN') {
    throw new Error('Sem permissão para deletar esta evidência');
  }

  await prisma.evidence.delete({
    where: { id: evidenceId },
  });
}

/**
 * Verifica/aprova uma evidência
 * Apenas MANAGER ou ADMIN podem verificar
 */
export async function verifyEvidence(evidenceId: string, verifierId: string): Promise<Evidence> {
  const evidence = await prisma.evidence.update({
    where: { id: evidenceId },
    data: {
      verified: true,
      verifiedBy: verifierId,
      verifiedAt: new Date(),
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
      verifier: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return evidence as Evidence;
}

/**
 * Remove verificação de uma evidência
 */
export async function unverifyEvidence(evidenceId: string): Promise<Evidence> {
  const evidence = await prisma.evidence.update({
    where: { id: evidenceId },
    data: {
      verified: false,
      verifiedBy: null,
      verifiedAt: null,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return evidence as Evidence;
}

/**
 * Verifica se um requisito tem evidências suficientes para ser aprovado
 * Retorna true se tem pelo menos uma evidência
 */
export async function hasRequiredEvidences(requirementId: string): Promise<boolean> {
  const count = await prisma.evidence.count({
    where: { requirementId },
  });

  return count > 0;
}

/**
 * Conta evidências de um requisito
 */
export async function countEvidences(requirementId: string): Promise<{
  total: number;
  verified: number;
  unverified: number;
}> {
  const [total, verified] = await Promise.all([
    prisma.evidence.count({ where: { requirementId } }),
    prisma.evidence.count({ where: { requirementId, verified: true } }),
  ]);

  return {
    total,
    verified,
    unverified: total - verified,
  };
}

/**
 * Valida se requisito pode mudar para status APPROVED
 * Bloqueia se não tiver evidências
 */
export async function validateStatusChangeToApproved(requirementId: string): Promise<{
  canApprove: boolean;
  reason: string | null;
  evidenceCount: number;
}> {
  const evidenceCount = await prisma.evidence.count({
    where: { requirementId },
  });

  if (evidenceCount === 0) {
    return {
      canApprove: false,
      reason: 'Requisito não pode ser aprovado sem evidências de implementação. Anexe pelo menos uma evidência.',
      evidenceCount: 0,
    };
  }

  return {
    canApprove: true,
    reason: null,
    evidenceCount,
  };
}

/**
 * Lista requisitos sem evidências (para dashboard)
 */
export async function getRequirementsWithoutEvidences(projectId: string): Promise<Array<{
  id: string;
  reqId: string;
  shortDesc: string;
  status: string;
}>> {
  // Busca requisitos que não estão PENDING e não têm evidências
  const requirements = await prisma.requirement.findMany({
    where: {
      projectId,
      status: { notIn: ['PENDING', 'REJECTED'] },
      evidences: { none: {} },
    },
    select: {
      id: true,
      reqId: true,
      shortDesc: true,
      status: true,
    },
    orderBy: { reqId: 'asc' },
  });

  return requirements;
}
