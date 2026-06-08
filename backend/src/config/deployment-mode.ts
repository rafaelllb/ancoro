/**
 * Deployment Mode Configuration
 *
 * Distingue entre dois modos de deployment:
 * - SaaS: Multi-tenant, licenciamento centralizado, tenant resolver ativo
 * - On-premise: Single-tenant, licença local, tenant resolver simplificado
 *
 * Detectado via DEPLOYMENT_MODE env var (default: 'saas' para compatibilidade)
 */

import { z } from 'zod'

/**
 * Modos de deployment suportados.
 */
export type DeploymentMode = 'saas' | 'onpremise'

/**
 * Tipos de ambiente para instalações on-premise.
 * Cada ambiente (dev, qa, prod) pode ser uma instalação separada
 * usando a mesma licença.
 */
export type EnvironmentType = 'dev' | 'qa' | 'prod'

/**
 * Schema de validação para DEPLOYMENT_MODE.
 */
const deploymentModeSchema = z.enum(['saas', 'onpremise']).default('saas')

/**
 * Schema de validação para ENVIRONMENT_TYPE.
 */
const environmentTypeSchema = z.enum(['dev', 'qa', 'prod']).default('prod')

/**
 * Carrega e valida o modo de deployment das env vars.
 */
function loadDeploymentMode(): DeploymentMode {
  const result = deploymentModeSchema.safeParse(process.env.DEPLOYMENT_MODE)

  if (!result.success) {
    console.warn(
      `DEPLOYMENT_MODE inválido: "${process.env.DEPLOYMENT_MODE}". ` +
      'Usando default "saas". Valores válidos: saas, onpremise'
    )
    return 'saas'
  }

  return result.data
}

/**
 * Carrega e valida o tipo de ambiente das env vars.
 * Relevante apenas em modo on-premise.
 */
function loadEnvironmentType(): EnvironmentType {
  const result = environmentTypeSchema.safeParse(process.env.ENVIRONMENT_TYPE)

  if (!result.success) {
    // Não loga warning em modo SaaS pois não é relevante
    if (process.env.DEPLOYMENT_MODE === 'onpremise') {
      console.warn(
        `ENVIRONMENT_TYPE inválido: "${process.env.ENVIRONMENT_TYPE}". ` +
        'Usando default "prod". Valores válidos: dev, qa, prod'
      )
    }
    return 'prod'
  }

  return result.data
}

/**
 * Modo de deployment atual.
 * Imutável após o startup.
 */
export const deploymentMode: DeploymentMode = loadDeploymentMode()

/**
 * Tipo de ambiente atual (relevante em on-premise).
 * Imutável após o startup.
 */
export const environmentType: EnvironmentType = loadEnvironmentType()

/**
 * Helpers para checagem rápida.
 */
export const isSaaSMode = deploymentMode === 'saas'
export const isOnPremiseMode = deploymentMode === 'onpremise'
export const isDevEnvironment = environmentType === 'dev'
export const isQaEnvironment = environmentType === 'qa'
export const isProdEnvironment = environmentType === 'prod'

/**
 * Configurações específicas por modo de deployment.
 */
export interface DeploymentModeConfig {
  // Licenciamento
  requireLicenseFile: boolean       // On-premise precisa de arquivo .license
  enforceLocalLimits: boolean       // Limites são verificados localmente

  // Multi-tenancy
  enableTenantRoutes: boolean       // Rotas de gestão de tenants
  useTenantResolver: boolean        // Middleware de resolução de tenant

  // Features condicionais
  enableTelemetry: boolean          // Telemetria (opt-in em on-premise)
  enableAutoUpdates: boolean        // Verificação de atualizações

  // Onboarding
  requireTenantSlug: boolean        // Slug obrigatório no JWT
  defaultTenantSlug: string | null  // Slug default para single-tenant
}

/**
 * Configurações por modo de deployment.
 */
const MODE_CONFIGS: Record<DeploymentMode, DeploymentModeConfig> = {
  saas: {
    requireLicenseFile: false,
    enforceLocalLimits: false,
    enableTenantRoutes: true,
    useTenantResolver: true,
    enableTelemetry: true,
    enableAutoUpdates: false, // SaaS atualiza centralmente
    requireTenantSlug: true,
    defaultTenantSlug: null,
  },
  onpremise: {
    requireLicenseFile: true,
    enforceLocalLimits: true,
    enableTenantRoutes: false,
    useTenantResolver: false,
    enableTelemetry: false, // Opt-in
    enableAutoUpdates: true,
    requireTenantSlug: false,
    defaultTenantSlug: 'default',
  },
}

/**
 * Retorna a configuração para o modo de deployment atual.
 */
export function getDeploymentConfig(): DeploymentModeConfig {
  return MODE_CONFIGS[deploymentMode]
}

/**
 * Log info do modo de deployment (para startup).
 */
export function getDeploymentInfo(): {
  mode: DeploymentMode
  environment: EnvironmentType
  description: string
  config: DeploymentModeConfig
} {
  const modeDescriptions: Record<DeploymentMode, string> = {
    saas: 'Multi-tenant SaaS - licenciamento centralizado',
    onpremise: 'Single-tenant On-premise - licença local',
  }

  const envDescriptions: Record<EnvironmentType, string> = {
    dev: 'Desenvolvimento',
    qa: 'Qualidade/Testes',
    prod: 'Produção',
  }

  const description = deploymentMode === 'onpremise'
    ? `${modeDescriptions[deploymentMode]} (${envDescriptions[environmentType]})`
    : modeDescriptions[deploymentMode]

  return {
    mode: deploymentMode,
    environment: environmentType,
    description,
    config: getDeploymentConfig(),
  }
}
