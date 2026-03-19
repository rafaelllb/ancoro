/**
 * Schemas de validação Zod para o frontend
 *
 * Schemas client-side espelham a validação do backend para:
 * 1. Feedback imediato ao usuário antes de enviar ao servidor
 * 2. Reduzir round-trips desnecessários com dados inválidos
 * 3. Consistência nas regras de validação
 *
 * Estes schemas são sincronizados com backend/src/schemas/index.ts
 */

import { z } from 'zod'

// ===== ENUMS =====

export const RequirementStatus = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'VALIDATED',
  'APPROVED',
  'CONFLICT',
  'REJECTED',
])

export const CommentType = z.enum([
  'QUESTION',
  'ANSWER',
  'OBSERVATION',
  'CONFLICT',
])

export const IntegrationType = z.enum([
  'BAPI',
  'iDoc',
  'File',
  'API',
  'Batch',
  'Other',
])

export const TimingType = z.enum([
  'Sync',
  'Async',
  'Batch',
  'Event',
  'Real-time',
])

export const CrossMatrixStatus = z.enum([
  'PENDING',
  'OK',
  'CONFLICT',
  'CIRCULAR',
])

// ===== REQUIREMENT SCHEMAS =====

// Schema para criação de requisito
export const createRequirementSchema = z.object({
  reqId: z
    .string()
    .min(1, 'Req ID é obrigatório')
    .regex(/^REQ-\d{3,}$/, 'Formato inválido. Use REQ-XXX (ex: REQ-001)'),

  projectId: z.string().uuid('ID do projeto inválido'),

  shortDesc: z
    .string()
    .min(1, 'Descrição é obrigatória')
    .max(50, 'Máximo 50 caracteres'),

  module: z.string().min(1, 'Módulo é obrigatório'),

  what: z.string().min(10, 'Mínimo 10 caracteres no campo "O Que"'),

  why: z.string().min(10, 'Mínimo 10 caracteres no campo "Por Quê"'),

  who: z.string().min(3, 'Mínimo 3 caracteres no campo "Quem"'),

  when: z.string().min(3, 'Mínimo 3 caracteres no campo "Quando"'),

  where: z.string().min(3, 'Mínimo 3 caracteres no campo "Onde"'),

  howToday: z.string().min(10, 'Mínimo 10 caracteres no campo "Como Hoje"'),

  howMuch: z.string().min(3, 'Mínimo 3 caracteres no campo "Quanto"'),

  dependsOn: z.array(z.string()).default([]),

  providesFor: z.array(z.string()).default([]),

  status: RequirementStatus.default('PENDING'),

  observations: z.string().optional(),

  consultantNotes: z.string().optional(),
})

// Schema para atualização de requisito (todos os campos opcionais)
export const updateRequirementSchema = z.object({
  shortDesc: z.string().max(50, 'Máximo 50 caracteres').optional(),
  module: z.string().optional(),
  what: z.string().min(10, 'Mínimo 10 caracteres').optional(),
  why: z.string().min(10, 'Mínimo 10 caracteres').optional(),
  who: z.string().min(3, 'Mínimo 3 caracteres').optional(),
  when: z.string().min(3, 'Mínimo 3 caracteres').optional(),
  where: z.string().min(3, 'Mínimo 3 caracteres').optional(),
  howToday: z.string().min(10, 'Mínimo 10 caracteres').optional(),
  howMuch: z.string().min(3, 'Mínimo 3 caracteres').optional(),
  dependsOn: z.array(z.string()).optional(),
  providesFor: z.array(z.string()).optional(),
  status: RequirementStatus.optional(),
  observations: z.string().optional(),
  consultantNotes: z.string().optional(),
})

// ===== COMMENT SCHEMAS =====

export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, 'Comentário não pode estar vazio')
    .max(2000, 'Máximo 2000 caracteres'),

  type: CommentType,
})

// ===== CROSS MATRIX SCHEMAS =====

export const updateCrossMatrixSchema = z.object({
  dataFlow: z.string().optional(),
  integrationType: IntegrationType.optional(),
  trigger: z.string().optional(),
  timing: TimingType.optional(),
  status: CrossMatrixStatus.optional(),
  manualNotes: z.string().optional(),
})

// ===== LOGIN SCHEMA =====

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email é obrigatório')
    .email('Email inválido'),

  password: z
    .string()
    .min(1, 'Senha é obrigatória')
    .min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

// ===== BULK IMPORT SCHEMA =====

export const bulkImportItemSchema = z.object({
  reqId: z.string().regex(/^REQ-\d{3,}$/, 'Formato inválido'),
  shortDesc: z.string().min(1).max(50),
  module: z.string().min(1),
  what: z.string().min(10),
  why: z.string().min(10),
  who: z.string().min(3),
  when: z.string().min(3),
  where: z.string().min(3),
  howToday: z.string().min(10),
  howMuch: z.string().min(3),
  dependsOn: z.array(z.string()).default([]),
  providesFor: z.array(z.string()).default([]),
  status: RequirementStatus.default('PENDING'),
  observations: z.string().optional(),
  consultantNotes: z.string().optional(),
})

// ===== TIPOS INFERIDOS =====

export type CreateRequirementInput = z.infer<typeof createRequirementSchema>
export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>
export type CreateCommentInput = z.infer<typeof createCommentSchema>
export type UpdateCrossMatrixInput = z.infer<typeof updateCrossMatrixSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type BulkImportItem = z.infer<typeof bulkImportItemSchema>

// ===== HELPER: VALIDAÇÃO COM MENSAGENS AMIGÁVEIS =====

/**
 * Valida dados contra um schema Zod e retorna erros formatados
 * @param schema Schema Zod para validação
 * @param data Dados a serem validados
 * @returns Objeto com { success, data, errors }
 */
export function validateWithErrors<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T; errors: null } | { success: false; data: null; errors: Record<string, string> } {
  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data, errors: null }
  }

  // Formata erros do Zod em objeto simples { campo: mensagem }
  const errors: Record<string, string> = {}
  for (const issue of result.error.issues) {
    const path = issue.path.join('.')
    if (!errors[path]) {
      errors[path] = issue.message
    }
  }

  return { success: false, data: null, errors }
}

/**
 * Valida um campo individual contra um schema parcial
 * Útil para validação em tempo real enquanto usuário digita
 */
export function validateField<T>(
  schema: z.ZodSchema<T>,
  fieldName: keyof T & string,
  value: unknown
): string | null {
  // Tenta validar apenas o campo especificado
  const fieldSchema = (schema as z.ZodObject<any>).shape[fieldName]
  if (!fieldSchema) return null

  const result = fieldSchema.safeParse(value)
  if (result.success) return null

  return result.error.issues[0]?.message || 'Valor inválido'
}
