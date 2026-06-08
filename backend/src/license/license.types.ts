/**
 * License Types
 *
 * Define os tipos do payload JWT da licença offline.
 * A licença é um JWT assinado com chave privada (RS256),
 * validado no startup da aplicação sem necessidade de internet.
 */

/**
 * Tipos de ambiente suportados para instalação on-premise.
 */
export type EnvironmentType = 'dev' | 'qa' | 'prod'

/**
 * Features habilitadas na licença.
 * Permite controle granular de funcionalidades por tier.
 */
export interface LicenseFeatures {
  // Limites quantitativos
  maxProjects: number           // -1 para ilimitado
  maxUsersPerProject: number    // -1 para ilimitado
  maxRequirementsPerProject: number // -1 para ilimitado

  // Funcionalidades premium
  exportPdf: boolean            // Exportação para PDF/BPD
  crossMatrix: boolean          // Matriz de cruzamento
  conflictDetection: boolean    // Detecção de conflitos
  auditLog: boolean             // Log de alterações completo
  apiAccess: boolean            // Acesso via API externa
  customBranding: boolean       // Logo e cores customizadas
  multipleProjects: boolean     // Mais de 1 projeto ativo

  // Ambientes permitidos (on-premise multi-ambiente)
  maxEnvironments: number                    // Quantos ambientes simultâneos
  allowedEnvironmentTypes: EnvironmentType[] // Quais tipos de ambiente
}

/**
 * Tiers de licença disponíveis.
 * Cada tier tem um conjunto de features pré-definido.
 */
export type LicenseTier = 'pilot' | 'starter' | 'professional' | 'enterprise'

/**
 * Payload completo da licença JWT.
 * Assinado com RS256 para validação offline.
 */
export interface LicensePayload {
  // Identificação
  licenseId: string             // UUID único da licença
  customerId: string            // ID do cliente (para tracking)
  customerName: string          // Nome do cliente (exibição)

  // Tier e features
  tier: LicenseTier
  features: LicenseFeatures

  // Validade
  issuedAt: number              // Unix timestamp (segundos)
  expiresAt: number             // Unix timestamp (segundos)

  // Metadata
  version: number               // Versão do schema da licença (para migrations futuras)
}

/**
 * Resultado da validação de licença.
 * Retornado pelo LicenseService após parsing e verificação.
 */
export interface LicenseValidationResult {
  valid: boolean
  license: LicensePayload | null
  error: LicenseError | null
}

/**
 * Tipos de erro de validação de licença.
 */
export type LicenseErrorCode =
  | 'LICENSE_NOT_FOUND'       // Arquivo não existe
  | 'LICENSE_INVALID_FORMAT'  // Não é JWT válido
  | 'LICENSE_INVALID_SIGNATURE' // Assinatura não confere
  | 'LICENSE_EXPIRED'         // Passou da data de expiração
  | 'LICENSE_NOT_YET_VALID'   // issuedAt no futuro
  | 'LICENSE_VERSION_MISMATCH' // Versão incompatível
  | 'LICENSE_ENVIRONMENT_NOT_ALLOWED' // Ambiente não permitido pela licença

export interface LicenseError {
  code: LicenseErrorCode
  message: string
  details?: Record<string, unknown>
}

/**
 * Features default por tier.
 * Usado pelo gerador de licenças e para referência.
 */
export const DEFAULT_FEATURES_BY_TIER: Record<LicenseTier, LicenseFeatures> = {
  pilot: {
    maxProjects: 1,
    maxUsersPerProject: 5,
    maxRequirementsPerProject: 50,
    exportPdf: false,
    crossMatrix: true,
    conflictDetection: false,
    auditLog: false,
    apiAccess: false,
    customBranding: false,
    multipleProjects: false,
    // Pilot: apenas produção
    maxEnvironments: 1,
    allowedEnvironmentTypes: ['prod'],
  },
  starter: {
    maxProjects: 3,
    maxUsersPerProject: 10,
    maxRequirementsPerProject: 200,
    exportPdf: true,
    crossMatrix: true,
    conflictDetection: true,
    auditLog: false,
    apiAccess: false,
    customBranding: false,
    multipleProjects: true,
    // Starter: QA + produção
    maxEnvironments: 2,
    allowedEnvironmentTypes: ['qa', 'prod'],
  },
  professional: {
    maxProjects: 10,
    maxUsersPerProject: 25,
    maxRequirementsPerProject: -1, // ilimitado
    exportPdf: true,
    crossMatrix: true,
    conflictDetection: true,
    auditLog: true,
    apiAccess: true,
    customBranding: false,
    multipleProjects: true,
    // Professional: todos os ambientes
    maxEnvironments: 3,
    allowedEnvironmentTypes: ['dev', 'qa', 'prod'],
  },
  enterprise: {
    maxProjects: -1, // ilimitado
    maxUsersPerProject: -1,
    maxRequirementsPerProject: -1,
    exportPdf: true,
    crossMatrix: true,
    conflictDetection: true,
    auditLog: true,
    apiAccess: true,
    customBranding: true,
    multipleProjects: true,
    // Enterprise: todos os ambientes
    maxEnvironments: 3,
    allowedEnvironmentTypes: ['dev', 'qa', 'prod'],
  },
}

/**
 * Verifica se um valor de limite é efetivamente ilimitado.
 * Usado para display e lógica de enforcement.
 */
export function isUnlimited(value: number): boolean {
  return value === -1
}
