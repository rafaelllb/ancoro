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

// Módulos SAP alinhados com frontend e defaultLists.ts
export const SAPModule = {
  // Financeiro
  'FI-CA': 'FI-CA',
  'FI-AR': 'FI-AR',
  'FI-GL': 'FI-GL',
  // ISU - Industry Solution Utilities
  'ISU-BILLING': 'ISU-BILLING',
  'ISU-BPEM': 'ISU-BPEM',
  'ISU-IDE': 'ISU-IDE',
  'ISU-EDM': 'ISU-EDM',
  'ISU-DM': 'ISU-DM',
  'ISU-CS': 'ISU-CS',
  // Outros módulos SAP
  CRM: 'CRM',
  SD: 'SD',
  MM: 'MM',
  PP: 'PP',
  PM: 'PM',
  CO: 'CO',
  HR: 'HR',
  CROSS: 'CROSS',
  CUSTOM: 'CUSTOM',
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

// ===== APP CONFIGURATION (Database-driven) =====
// Configurações de aplicação armazenadas em banco para alteração em runtime

export const ConfigValueType = {
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
  JSON: 'JSON',
  ENUM: 'ENUM',
} as const

export type ConfigValueTypeType = (typeof ConfigValueType)[keyof typeof ConfigValueType]

export const ConfigCategory = {
  FEATURE: 'FEATURE',           // Feature flags
  UI: 'UI',                     // Configurações de UI
  LIMIT: 'LIMIT',               // Limites (rate, size, etc.)
  NOTIFICATION: 'NOTIFICATION', // Email/notificações
  INTEGRATION: 'INTEGRATION',   // Integrações terceiros
} as const

export type ConfigCategoryType = (typeof ConfigCategory)[keyof typeof ConfigCategory]

// Regras de validação armazenadas como JSON
export interface ConfigValidation {
  min?: number              // Para NUMBER
  max?: number              // Para NUMBER
  minLength?: number        // Para STRING
  maxLength?: number        // Para STRING
  pattern?: string          // Regex para STRING
  enumValues?: string[]     // Para ENUM
  required?: boolean
}

// Item de configuração com valor tipado
export interface AppConfigItem {
  id: string
  key: string
  value: unknown            // Parseado do JSON string
  valueType: ConfigValueTypeType
  category: ConfigCategoryType
  description?: string
  environment?: string | null
  validation?: ConfigValidation
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// Request para criar config
export interface CreateConfigRequest {
  key: string
  value: unknown
  valueType: ConfigValueTypeType
  category: ConfigCategoryType
  description?: string
  environment?: string | null
  validation?: ConfigValidation
}

// Request para atualizar config
export interface UpdateConfigRequest {
  value?: unknown
  description?: string
  validation?: ConfigValidation
  isActive?: boolean
  reason?: string           // Motivo da alteração (audit)
}

// Histórico de alteração
export interface ConfigChangeLogEntry {
  id: string
  configKey: string
  oldValue: unknown
  newValue: unknown
  userName: string
  reason?: string
  createdAt: Date
}

// Seções tipadas para acesso type-safe
export interface FeaturesConfig {
  allowSeed: boolean
  allowDatabaseReset: boolean
  showDebugInfo: boolean
  enableBPDExport: boolean
  enableAIAnalysis: boolean
}

export interface UIConfig {
  showEnvironmentBanner: boolean
  bannerMessage: string | null
  bannerColor: string | null
  maxTablePageSize: number
}

export interface LimitsConfig {
  maxBulkImportRows: number
  maxFileUploadSizeMB: number
  sessionTimeoutMinutes: number
}

// Objeto tipado completo de configuração
export interface TypedAppConfig {
  features: FeaturesConfig
  ui: UIConfig
  limits: LimitsConfig
}
