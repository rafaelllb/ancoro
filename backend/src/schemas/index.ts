import { z } from 'zod'
import {
  SAPModule,
  ReqStatus,
  CommentType,
  IntegrationType,
  IntegrationTiming,
  IntegrationStatus,
} from '../types'

// ===== AUTH SCHEMAS =====

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

// ===== REQUIREMENT SCHEMAS =====

export const createRequirementSchema = z.object({
  reqId: z.string().regex(/^REQ-\d{3,}$/, 'Req ID deve seguir o padrão REQ-001, REQ-002, etc.'),
  projectId: z.string().cuid('Project ID inválido'),
  shortDesc: z.string().max(50, 'Descrição curta deve ter no máximo 50 caracteres'),
  module: z.enum([
    SAPModule.ISU,
    SAPModule.CRM,
    SAPModule.FICA,
    SAPModule.DEVICE,
    SAPModule.SD,
    SAPModule.MM,
    SAPModule.PM,
    SAPModule.OTHER,
  ]),
  what: z.string().min(10, 'Campo "What" deve ter no mínimo 10 caracteres'),
  why: z.string().min(10, 'Campo "Why" deve ter no mínimo 10 caracteres'),
  who: z.string().min(3, 'Campo "Who" deve ter no mínimo 3 caracteres'),
  when: z.string().min(3, 'Campo "When" deve ter no mínimo 3 caracteres'),
  where: z.string().min(3, 'Campo "Where" deve ter no mínimo 3 caracteres'),
  howToday: z.string().min(10, 'Campo "How (hoje)" deve ter no mínimo 10 caracteres'),
  howMuch: z.string().min(3, 'Campo "How Much" deve ter no mínimo 3 caracteres'),
  dependsOn: z.array(z.string()).optional().default([]),
  providesFor: z.array(z.string()).optional().default([]),
  consultantNotes: z.string().optional(),
  status: z
    .enum([
      ReqStatus.PENDING,
      ReqStatus.IN_PROGRESS,
      ReqStatus.VALIDATED,
      ReqStatus.CONFLICT,
      ReqStatus.REJECTED,
      ReqStatus.APPROVED,
    ])
    .optional()
    .default(ReqStatus.PENDING),
  observations: z.string().optional(),
})

export const updateRequirementSchema = z.object({
  shortDesc: z.string().max(50).optional(),
  module: z
    .enum([
      SAPModule.ISU,
      SAPModule.CRM,
      SAPModule.FICA,
      SAPModule.DEVICE,
      SAPModule.SD,
      SAPModule.MM,
      SAPModule.PM,
      SAPModule.OTHER,
    ])
    .optional(),
  what: z.string().min(10).optional(),
  why: z.string().min(10).optional(),
  who: z.string().min(3).optional(),
  when: z.string().min(3).optional(),
  where: z.string().min(3).optional(),
  howToday: z.string().min(10).optional(),
  howMuch: z.string().min(3).optional(),
  dependsOn: z.array(z.string()).optional(),
  providesFor: z.array(z.string()).optional(),
  consultantNotes: z.string().optional(),
  status: z
    .enum([
      ReqStatus.PENDING,
      ReqStatus.IN_PROGRESS,
      ReqStatus.VALIDATED,
      ReqStatus.CONFLICT,
      ReqStatus.REJECTED,
      ReqStatus.APPROVED,
    ])
    .optional(),
  observations: z.string().optional(),
})

// ===== COMMENT SCHEMAS =====

export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comentário não pode ser vazio'),
  type: z.enum([
    CommentType.QUESTION,
    CommentType.ANSWER,
    CommentType.OBSERVATION,
    CommentType.CONFLICT,
  ]),
})

// ===== CROSS MATRIX SCHEMAS =====

export const updateCrossMatrixSchema = z.object({
  integrationType: z
    .enum([
      IntegrationType.BAPI,
      IntegrationType.IDOC,
      IntegrationType.FILE,
      IntegrationType.API,
      IntegrationType.BATCH,
      IntegrationType.OTHER,
    ])
    .optional(),
  trigger: z.string().optional(),
  timing: z
    .enum([
      IntegrationTiming.SYNC,
      IntegrationTiming.ASYNC,
      IntegrationTiming.BATCH,
      IntegrationTiming.EVENT,
    ])
    .optional(),
  ownerUserId: z.string().cuid().optional(),
  status: z
    .enum([
      IntegrationStatus.OK,
      IntegrationStatus.PENDING,
      IntegrationStatus.CONFLICT,
      IntegrationStatus.CIRCULAR,
    ])
    .optional(),
  manualNotes: z.string().optional(),
})

// ===== BULK IMPORT SCHEMA =====

/**
 * Schema para item de bulk import (sem projectId, que vem da URL)
 * Usa validações mais flexíveis para permitir importação de planilhas
 * que podem ter dados parciais ou formatação diferente.
 */
export const bulkImportItemSchema = z.object({
  reqId: z.string().regex(/^REQ-\d{3,}$/, 'Req ID deve seguir o padrão REQ-001'),
  shortDesc: z.string().max(50, 'Máximo 50 caracteres').min(1, 'Descrição obrigatória'),
  module: z.enum([
    SAPModule.ISU,
    SAPModule.CRM,
    SAPModule.FICA,
    SAPModule.DEVICE,
    SAPModule.SD,
    SAPModule.MM,
    SAPModule.PM,
    SAPModule.OTHER,
  ]),
  what: z.string().min(10, 'Campo "What" deve ter no mínimo 10 caracteres'),
  why: z.string().min(10, 'Campo "Why" deve ter no mínimo 10 caracteres'),
  who: z.string().min(3, 'Campo "Who" deve ter no mínimo 3 caracteres'),
  when: z.string().min(3, 'Campo "When" deve ter no mínimo 3 caracteres'),
  where: z.string().min(3, 'Campo "Where" deve ter no mínimo 3 caracteres'),
  howToday: z.string().min(10, 'Campo "How (hoje)" deve ter no mínimo 10 caracteres'),
  howMuch: z.string().min(3, 'Campo "How Much" deve ter no mínimo 3 caracteres'),
  dependsOn: z.array(z.string()).optional().default([]),
  providesFor: z.array(z.string()).optional().default([]),
  status: z
    .enum([
      ReqStatus.PENDING,
      ReqStatus.IN_PROGRESS,
      ReqStatus.VALIDATED,
      ReqStatus.CONFLICT,
      ReqStatus.REJECTED,
      ReqStatus.APPROVED,
    ])
    .optional()
    .default(ReqStatus.PENDING),
  observations: z.string().optional(),
  consultantNotes: z.string().optional(),
})

export const bulkImportSchema = z.object({
  requirements: z.array(bulkImportItemSchema).min(1, 'Array de requisitos não pode ser vazio'),
})

// Helper para validar e lançar erro se inválido
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const errors = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`)
    throw new Error(`Validation failed: ${errors.join(', ')}`)
  }
  return result.data
}
