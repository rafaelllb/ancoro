// Tipos TypeScript compartilhados
// Sincronizados com Prisma schema

// ===== ENUMS (como constantes) =====
// SQLite usa String, então definimos os valores permitidos

export const ProjectStatus = {
  DISCOVERY: 'DISCOVERY',
  REALIZATION: 'REALIZATION',
  GOLIVE: 'GOLIVE',
  HYPERCARE: 'HYPERCARE',
  CLOSED: 'CLOSED',
} as const

export const UserRole = {
  CONSULTANT: 'CONSULTANT',
  CLIENT: 'CLIENT',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN',
} as const

export const SAPModule = {
  ISU: 'ISU',
  CRM: 'CRM',
  FICA: 'FICA',
  DEVICE: 'DEVICE',
  SD: 'SD',
  MM: 'MM',
  PM: 'PM',
  OTHER: 'OTHER',
} as const

export const ReqStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  VALIDATED: 'VALIDATED',
  CONFLICT: 'CONFLICT',
  REJECTED: 'REJECTED',
  APPROVED: 'APPROVED',
} as const

export const CommentType = {
  QUESTION: 'QUESTION',
  ANSWER: 'ANSWER',
  OBSERVATION: 'OBSERVATION',
  CONFLICT: 'CONFLICT',
} as const

export const IntegrationType = {
  BAPI: 'BAPI',
  IDOC: 'IDOC',
  FILE: 'FILE',
  API: 'API',
  BATCH: 'BATCH',
  OTHER: 'OTHER',
} as const

export const IntegrationTiming = {
  SYNC: 'SYNC',
  ASYNC: 'ASYNC',
  BATCH: 'BATCH',
  EVENT: 'EVENT',
} as const

export const IntegrationStatus = {
  OK: 'OK',
  PENDING: 'PENDING',
  CONFLICT: 'CONFLICT',
  CIRCULAR: 'CIRCULAR',
} as const

export const ChangeType = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  STATUS_CHANGE: 'STATUS_CHANGE',
  COMMENT_ADDED: 'COMMENT_ADDED',
} as const

// Type derivados dos objetos const
export type ProjectStatusType = (typeof ProjectStatus)[keyof typeof ProjectStatus]
export type UserRoleType = (typeof UserRole)[keyof typeof UserRole]
export type SAPModuleType = (typeof SAPModule)[keyof typeof SAPModule]
export type ReqStatusType = (typeof ReqStatus)[keyof typeof ReqStatus]
export type CommentTypeType = (typeof CommentType)[keyof typeof CommentType]
export type IntegrationTypeType = (typeof IntegrationType)[keyof typeof IntegrationType]
export type IntegrationTimingType = (typeof IntegrationTiming)[keyof typeof IntegrationTiming]
export type IntegrationStatusType = (typeof IntegrationStatus)[keyof typeof IntegrationStatus]
export type ChangeTypeType = (typeof ChangeType)[keyof typeof ChangeType]

// ===== JWT Payload =====
export interface JWTPayload {
  userId: string
  email: string
  role: UserRoleType
}

// ===== Request/Response Types =====

// User (sanitizado - sem password)
export interface UserPublic {
  id: string
  name: string
  email: string
  role: UserRoleType
  createdAt: Date
  updatedAt: Date
}

// Login
export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  user: UserPublic
  token: string
}

// Requirement Create/Update
export interface CreateRequirementRequest {
  reqId: string
  projectId: string
  shortDesc: string
  module: SAPModuleType
  what: string
  why: string
  who: string
  when: string
  where: string
  howToday: string
  howMuch: string
  dependsOn?: string[] // Array de Req IDs
  providesFor?: string[] // Array de Req IDs
  consultantNotes?: string
  status?: ReqStatusType
  observations?: string
}

export interface UpdateRequirementRequest {
  shortDesc?: string
  module?: SAPModuleType
  what?: string
  why?: string
  who?: string
  when?: string
  where?: string
  howToday?: string
  howMuch?: string
  dependsOn?: string[]
  providesFor?: string[]
  consultantNotes?: string
  status?: ReqStatusType
  observations?: string
}

// Comment Create
export interface CreateCommentRequest {
  content: string
  type: CommentTypeType
}

// CrossMatrix Update (campos de validação manual)
export interface UpdateCrossMatrixRequest {
  integrationType?: IntegrationTypeType
  trigger?: string
  timing?: IntegrationTimingType
  ownerUserId?: string
  status?: IntegrationStatusType
  manualNotes?: string
}
