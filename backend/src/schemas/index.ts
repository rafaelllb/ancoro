import { z } from 'zod'
import {
  SAPModule,
  ReqStatus,
  CommentType,
  IntegrationType,
  IntegrationTiming,
  IntegrationStatus,
} from '../types'
import {
  RequirementIdPattern,
  buildRegex,
  generateExample,
  DEFAULT_PATTERN,
} from '../utils/reqIdPattern'

// ===== AUTH SCHEMAS =====

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
})

// ===== REQUIREMENT SCHEMAS =====

/**
 * Factory function que cria schema de requisito com validação de reqId dinâmica
 * baseada no padrão de ID configurado para o projeto.
 *
 * @param pattern - Padrão de ID do projeto (prefix, separator, digitCount)
 * @returns Schema Zod configurado para validar reqId no formato correto
 */
export function createRequirementSchemaForProject(pattern: RequirementIdPattern) {
  const regex = buildRegex(pattern)
  const example = generateExample(pattern)

  return z.object({
    reqId: z.string().regex(regex, `Req ID deve seguir o padrão ${example}`),
    projectId: z.string().cuid('Project ID inválido'),
    shortDesc: z.string().max(50, 'Descrição curta deve ter no máximo 50 caracteres'),
    module: z.enum([
      // Financeiro
      SAPModule['FI-CA'],
      SAPModule['FI-AR'],
      SAPModule['FI-GL'],
      // ISU
      SAPModule['ISU-BILLING'],
      SAPModule['ISU-BPEM'],
      SAPModule['ISU-IDE'],
      SAPModule['ISU-EDM'],
      SAPModule['ISU-DM'],
      SAPModule['ISU-CS'],
      // Outros
      SAPModule.CRM,
      SAPModule.SD,
      SAPModule.MM,
      SAPModule.PP,
      SAPModule.PM,
      SAPModule.CO,
      SAPModule.HR,
      SAPModule.CROSS,
      SAPModule.CUSTOM,
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
}

/**
 * Schema default para retrocompatibilidade (usa padrão REQ-XXX)
 * Usado quando não se tem acesso ao contexto do projeto
 */
export const createRequirementSchema = createRequirementSchemaForProject(DEFAULT_PATTERN)

export const updateRequirementSchema = z.object({
  shortDesc: z.string().max(50).optional(),
  module: z
    .enum([
      // Financeiro
      SAPModule['FI-CA'],
      SAPModule['FI-AR'],
      SAPModule['FI-GL'],
      // ISU
      SAPModule['ISU-BILLING'],
      SAPModule['ISU-BPEM'],
      SAPModule['ISU-IDE'],
      SAPModule['ISU-EDM'],
      SAPModule['ISU-DM'],
      SAPModule['ISU-CS'],
      // Outros
      SAPModule.CRM,
      SAPModule.SD,
      SAPModule.MM,
      SAPModule.PP,
      SAPModule.PM,
      SAPModule.CO,
      SAPModule.HR,
      SAPModule.CROSS,
      SAPModule.CUSTOM,
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
 * Factory function para schema de item de bulk import com validação dinâmica de reqId
 * (sem projectId, que vem da URL)
 *
 * @param pattern - Padrão de ID do projeto
 * @returns Schema Zod para validar itens de importação em massa
 */
export function createBulkImportItemSchemaForProject(pattern: RequirementIdPattern) {
  const regex = buildRegex(pattern)
  const example = generateExample(pattern)

  return z.object({
    reqId: z.string().regex(regex, `Req ID deve seguir o padrão ${example}`),
    shortDesc: z.string().max(50, 'Máximo 50 caracteres').min(1, 'Descrição obrigatória'),
    module: z.enum([
      // Financeiro
      SAPModule['FI-CA'],
      SAPModule['FI-AR'],
      SAPModule['FI-GL'],
      // ISU
      SAPModule['ISU-BILLING'],
      SAPModule['ISU-BPEM'],
      SAPModule['ISU-IDE'],
      SAPModule['ISU-EDM'],
      SAPModule['ISU-DM'],
      SAPModule['ISU-CS'],
      // Outros
      SAPModule.CRM,
      SAPModule.SD,
      SAPModule.MM,
      SAPModule.PP,
      SAPModule.PM,
      SAPModule.CO,
      SAPModule.HR,
      SAPModule.CROSS,
      SAPModule.CUSTOM,
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
}

/**
 * Schema default para item de bulk import (usa padrão REQ-XXX)
 */
export const bulkImportItemSchema = createBulkImportItemSchemaForProject(DEFAULT_PATTERN)

/**
 * Factory function para schema completo de bulk import
 */
export function createBulkImportSchemaForProject(pattern: RequirementIdPattern) {
  const itemSchema = createBulkImportItemSchemaForProject(pattern)
  return z.object({
    requirements: z.array(itemSchema).min(1, 'Array de requisitos não pode ser vazio'),
  })
}

/**
 * Schema default para bulk import (usa padrão REQ-XXX)
 */
export const bulkImportSchema = createBulkImportSchemaForProject(DEFAULT_PATTERN)

// ===== PROJECT SCHEMAS =====

/**
 * Schema para criação de projeto (ADMIN only)
 * Usado pelo endpoint POST /api/projects
 */
export const createProjectSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100, 'Nome deve ter no máximo 100 caracteres'),
  client: z.string().min(2, 'Cliente deve ter no mínimo 2 caracteres').max(100, 'Cliente deve ter no máximo 100 caracteres'),
  startDate: z.string().datetime({ message: 'Data deve estar no formato ISO 8601' }),
  status: z.enum(['DISCOVERY', 'REALIZATION', 'GOLIVE', 'HYPERCARE', 'CLOSED']).optional().default('DISCOVERY'),
  reqIdPrefix: z
    .string()
    .min(1, 'Prefixo deve ter no mínimo 1 caractere')
    .max(10, 'Prefixo deve ter no máximo 10 caracteres')
    .regex(/^[A-Za-z0-9]+$/, 'Prefixo deve conter apenas letras e números')
    .optional()
    .default('REQ'),
  reqIdSeparator: z
    .string()
    .max(1, 'Separador deve ter no máximo 1 caractere')
    .refine((val) => ['', '-', '_'].includes(val), { message: 'Separador deve ser "-", "_" ou vazio' })
    .optional()
    .default('-'),
  reqIdDigitCount: z.number().int().min(2).max(6).optional().default(3),
})

/**
 * Schema para atualização de dados gerais do projeto (ADMIN only)
 * Usado pelo endpoint PUT /api/projects/:id
 * Nota: Configurações de padrão de ID usam PATCH /projects/:id/settings
 */
export const updateProjectSchema = z.object({
  name: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').max(100, 'Nome deve ter no máximo 100 caracteres').optional(),
  client: z.string().min(2, 'Cliente deve ter no mínimo 2 caracteres').max(100, 'Cliente deve ter no máximo 100 caracteres').optional(),
  startDate: z.string().datetime({ message: 'Data deve estar no formato ISO 8601' }).optional(),
  status: z.enum(['DISCOVERY', 'REALIZATION', 'GOLIVE', 'HYPERCARE', 'CLOSED']).optional(),
})

/**
 * Schema para atualização de configurações do projeto (padrão de ID de requisitos)
 * Usado pelo endpoint PATCH /projects/:id/settings
 */
export const updateProjectSettingsSchema = z.object({
  reqIdPrefix: z
    .string()
    .min(1, 'Prefixo deve ter no mínimo 1 caractere')
    .max(10, 'Prefixo deve ter no máximo 10 caracteres')
    .regex(/^[A-Za-z0-9]+$/, 'Prefixo deve conter apenas letras e números')
    .optional(),
  reqIdSeparator: z
    .string()
    .max(1, 'Separador deve ter no máximo 1 caractere')
    .refine((val) => ['', '-', '_'].includes(val), {
      message: 'Separador deve ser "-", "_" ou vazio',
    })
    .optional(),
  reqIdDigitCount: z
    .number()
    .int('Quantidade de dígitos deve ser um número inteiro')
    .min(2, 'Mínimo 2 dígitos')
    .max(6, 'Máximo 6 dígitos')
    .optional(),
})

// ===== PROJECT LIST ITEM SCHEMAS =====

/**
 * Tipos de lista válidos para configuração por projeto
 */
export const LIST_TYPES = ['MODULE', 'REQ_STATUS', 'INTEGRATION_TYPE', 'INTEGRATION_TIMING'] as const
export type ListTypeEnum = typeof LIST_TYPES[number]

/**
 * Schema para criação de item de lista configurável
 * Usado pelo endpoint POST /api/projects/:id/lists/:listType
 */
export const createListItemSchema = z.object({
  code: z.string().min(1, 'Código obrigatório').max(20, 'Código deve ter no máximo 20 caracteres')
    .regex(/^[A-Z0-9_]+$/, 'Código deve conter apenas letras maiúsculas, números e underscore'),
  name: z.string().min(1, 'Nome obrigatório').max(100, 'Nome deve ter no máximo 100 caracteres'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato hex #RRGGBB').optional().nullable(),
  icon: z.string().max(10, 'Ícone deve ter no máximo 10 caracteres').optional().nullable(),
  sortOrder: z.number().int().min(0).optional().default(0),
  isDefault: z.boolean().optional().default(false),
})

/**
 * Schema para atualização de item de lista
 * Usado pelo endpoint PATCH /api/projects/:id/lists/:listType/:itemId
 */
export const updateListItemSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  icon: z.string().max(10).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
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
