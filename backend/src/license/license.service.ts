/**
 * License Service
 *
 * Serviço de validação de licenças offline.
 * Usa JWT com RS256 (assimétrico) para que clientes possam
 * validar a licença sem ter acesso à chave de assinatura.
 *
 * Fluxo:
 * 1. Licença é gerada com chave privada (scripts/generate-license.ts)
 * 2. Cliente recebe arquivo .license (JWT)
 * 3. No startup, app valida com chave pública embarcada
 * 4. Se válida, features são liberadas conforme payload
 */

import * as jwt from 'jsonwebtoken'
import * as fs from 'fs'
import * as path from 'path'
import {
  LicensePayload,
  LicenseValidationResult,
  LicenseError,
  LicenseErrorCode,
  LicenseFeatures,
  EnvironmentType,
  DEFAULT_FEATURES_BY_TIER,
  isUnlimited,
} from './license.types'
import { logger } from '../utils/logger'

/**
 * Chave pública para validação de licenças.
 * Embarcada no código - não é segredo.
 * A chave privada correspondente fica apenas no ambiente de geração.
 *
 * TODO [ESTIGMERGIA]: Gerar par de chaves RSA 2048 para produção
 * - openssl genrsa -out license-private.pem 2048
 * - openssl rsa -in license-private.pem -pubout -out license-public.pem
 * - Substituir esta chave placeholder pela pública gerada
 * - Manter privada em ambiente seguro (nunca commitar)
 */
const PUBLIC_KEY_PLACEHOLDER = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0Z3VS5JJcds3xfn/ygWyf8sLmMHT9x
PLACEHOLDER_KEY_NEEDS_TO_BE_GENERATED
-----END PUBLIC KEY-----`

// Em produção, carrega de variável de ambiente ou arquivo
function getPublicKey(): string {
  // Prioridade: env var > arquivo > placeholder
  if (process.env.LICENSE_PUBLIC_KEY) {
    return process.env.LICENSE_PUBLIC_KEY.replace(/\\n/g, '\n')
  }

  const keyPath = path.resolve(__dirname, '../../keys/license-public.pem')
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, 'utf-8')
  }

  // Fallback para desenvolvimento - aceita qualquer licença válida estruturalmente
  logger.warn('Usando chave pública placeholder - apenas para desenvolvimento')
  return PUBLIC_KEY_PLACEHOLDER
}

// Caminho padrão do arquivo de licença
const DEFAULT_LICENSE_PATH = path.resolve(process.cwd(), '.license')

/**
 * Licença em memória após validação.
 * Singleton - validada uma vez no startup.
 */
let cachedLicense: LicensePayload | null = null
let licenseValidated = false

/**
 * Cria um erro de licença padronizado.
 */
function createLicenseError(
  code: LicenseErrorCode,
  message: string,
  details?: Record<string, unknown>
): LicenseError {
  return { code, message, details }
}

/**
 * Valida e parseia uma licença JWT.
 *
 * @param token - O JWT da licença
 * @returns Resultado da validação com payload ou erro
 */
export function validateLicenseToken(token: string): LicenseValidationResult {
  try {
    const publicKey = getPublicKey()

    // Verifica assinatura e decodifica
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
      // Não usa clockTolerance em produção para evitar exploits
    }) as LicensePayload

    // Validações adicionais do payload
    const now = Math.floor(Date.now() / 1000)

    // Verifica se não está expirada
    if (decoded.expiresAt < now) {
      const expiredDate = new Date(decoded.expiresAt * 1000).toISOString()
      return {
        valid: false,
        license: null,
        error: createLicenseError(
          'LICENSE_EXPIRED',
          `Licença expirou em ${expiredDate}`,
          { expiresAt: decoded.expiresAt, now }
        ),
      }
    }

    // Verifica se já é válida (issuedAt não pode ser no futuro)
    if (decoded.issuedAt > now + 60) { // 60s de tolerância para clock skew
      return {
        valid: false,
        license: null,
        error: createLicenseError(
          'LICENSE_NOT_YET_VALID',
          'Licença ainda não é válida (data de emissão no futuro)',
          { issuedAt: decoded.issuedAt, now }
        ),
      }
    }

    // Verifica versão do schema
    if (decoded.version !== 1) {
      return {
        valid: false,
        license: null,
        error: createLicenseError(
          'LICENSE_VERSION_MISMATCH',
          `Versão de licença ${decoded.version} não suportada. Esperado: 1`,
          { version: decoded.version }
        ),
      }
    }

    return {
      valid: true,
      license: decoded,
      error: null,
    }
  } catch (err) {
    // jwt.verify lança erro para assinatura inválida ou formato incorreto
    if (err instanceof jwt.JsonWebTokenError) {
      return {
        valid: false,
        license: null,
        error: createLicenseError(
          'LICENSE_INVALID_SIGNATURE',
          'Assinatura da licença inválida ou formato incorreto',
          { originalError: err.message }
        ),
      }
    }

    return {
      valid: false,
      license: null,
      error: createLicenseError(
        'LICENSE_INVALID_FORMAT',
        'Formato de licença inválido',
        { originalError: String(err) }
      ),
    }
  }
}

/**
 * Carrega e valida licença do arquivo padrão ou caminho especificado.
 *
 * @param licensePath - Caminho opcional do arquivo de licença
 * @returns Resultado da validação
 */
export function loadLicenseFromFile(
  licensePath: string = DEFAULT_LICENSE_PATH
): LicenseValidationResult {
  // Verifica se arquivo existe
  if (!fs.existsSync(licensePath)) {
    return {
      valid: false,
      license: null,
      error: createLicenseError(
        'LICENSE_NOT_FOUND',
        `Arquivo de licença não encontrado: ${licensePath}`,
        { path: licensePath }
      ),
    }
  }

  try {
    const token = fs.readFileSync(licensePath, 'utf-8').trim()
    return validateLicenseToken(token)
  } catch (err) {
    return {
      valid: false,
      license: null,
      error: createLicenseError(
        'LICENSE_INVALID_FORMAT',
        'Erro ao ler arquivo de licença',
        { originalError: String(err) }
      ),
    }
  }
}

/**
 * Inicializa o serviço de licença no startup.
 * Valida uma vez e cacheia o resultado.
 *
 * @param licensePath - Caminho opcional do arquivo de licença
 * @returns Resultado da validação
 */
export function initializeLicense(
  licensePath?: string
): LicenseValidationResult {
  if (licenseValidated) {
    return {
      valid: cachedLicense !== null,
      license: cachedLicense,
      error: cachedLicense ? null : createLicenseError(
        'LICENSE_NOT_FOUND',
        'Licença não foi carregada'
      ),
    }
  }

  const result = loadLicenseFromFile(licensePath)
  licenseValidated = true

  if (result.valid && result.license) {
    cachedLicense = result.license
    logger.info({
      msg: 'Licença validada com sucesso',
      customer: result.license.customerName,
      tier: result.license.tier,
      expiresAt: new Date(result.license.expiresAt * 1000).toISOString(),
    })
  } else {
    logger.warn({
      msg: 'Falha na validação da licença',
      error: result.error,
    })
  }

  return result
}

/**
 * Retorna a licença atual (se válida).
 * Lança erro se não houver licença válida.
 */
export function getCurrentLicense(): LicensePayload {
  if (!cachedLicense) {
    throw new Error('Nenhuma licença válida carregada')
  }
  return cachedLicense
}

/**
 * Verifica se há licença válida carregada.
 */
export function hasValidLicense(): boolean {
  return cachedLicense !== null
}

/**
 * Retorna as features da licença atual.
 * Se não houver licença, retorna features do tier 'pilot' (mais restritivo).
 */
export function getLicenseFeatures(): LicenseFeatures {
  if (cachedLicense) {
    return cachedLicense.features
  }
  // Fallback para tier mais restritivo
  return DEFAULT_FEATURES_BY_TIER.pilot
}

/**
 * Verifica se uma feature específica está habilitada.
 *
 * @param feature - Nome da feature a verificar
 * @returns true se habilitada, false caso contrário
 */
export function isFeatureEnabled(feature: keyof LicenseFeatures): boolean {
  const features = getLicenseFeatures()
  const value = features[feature]

  // Para limites numéricos, considera habilitado se > 0 ou ilimitado
  if (typeof value === 'number') {
    return isUnlimited(value) || value > 0
  }

  return value === true
}

/**
 * Verifica se um limite quantitativo foi atingido.
 *
 * @param feature - Feature de limite (maxProjects, maxUsers, etc)
 * @param currentCount - Quantidade atual
 * @returns true se ainda pode adicionar, false se limite atingido
 */
export function checkLimit(
  feature: 'maxProjects' | 'maxUsersPerProject' | 'maxRequirementsPerProject',
  currentCount: number
): boolean {
  const features = getLicenseFeatures()
  const limit = features[feature]

  if (isUnlimited(limit)) {
    return true
  }

  return currentCount < limit
}

/**
 * Retorna o tipo de ambiente atual configurado via ENVIRONMENT_TYPE.
 * Default: 'prod' (mais restritivo)
 */
export function getEnvironmentType(): EnvironmentType {
  const envType = process.env.ENVIRONMENT_TYPE as EnvironmentType
  if (envType && ['dev', 'qa', 'prod'].includes(envType)) {
    return envType
  }
  return 'prod'
}

/**
 * Verifica se o ambiente atual é permitido pela licença.
 * Usado no startup em modo on-premise para bloquear ambientes não autorizados.
 *
 * @returns true se ambiente permitido, false caso contrário
 */
export function isEnvironmentAllowed(): boolean {
  if (!cachedLicense) {
    return false
  }

  const currentEnv = getEnvironmentType()
  const allowedEnvs = cachedLicense.features.allowedEnvironmentTypes

  // Se não tem array de ambientes (licença antiga), permite tudo
  if (!allowedEnvs || allowedEnvs.length === 0) {
    return true
  }

  return allowedEnvs.includes(currentEnv)
}

/**
 * Valida ambiente e retorna erro se não permitido.
 * Usado para gerar mensagem de erro detalhada no startup.
 */
export function validateEnvironment(): LicenseValidationResult {
  if (!cachedLicense) {
    return {
      valid: false,
      license: null,
      error: createLicenseError(
        'LICENSE_NOT_FOUND',
        'Nenhuma licença carregada'
      ),
    }
  }

  const currentEnv = getEnvironmentType()

  if (!isEnvironmentAllowed()) {
    const allowedEnvs = cachedLicense.features.allowedEnvironmentTypes || []
    return {
      valid: false,
      license: cachedLicense,
      error: createLicenseError(
        'LICENSE_ENVIRONMENT_NOT_ALLOWED',
        `Ambiente "${currentEnv}" não é permitido por esta licença. ` +
        `Ambientes permitidos: ${allowedEnvs.join(', ')}`,
        {
          currentEnvironment: currentEnv,
          allowedEnvironments: allowedEnvs,
          tier: cachedLicense.tier,
        }
      ),
    }
  }

  return {
    valid: true,
    license: cachedLicense,
    error: null,
  }
}

/**
 * Retorna informações da licença para exibição na UI.
 * Remove campos sensíveis.
 */
export function getLicenseInfo(): {
  customerName: string
  tier: string
  expiresAt: string
  daysRemaining: number
  features: LicenseFeatures
} | null {
  if (!cachedLicense) {
    return null
  }

  const now = Math.floor(Date.now() / 1000)
  const daysRemaining = Math.ceil((cachedLicense.expiresAt - now) / 86400)

  return {
    customerName: cachedLicense.customerName,
    tier: cachedLicense.tier,
    expiresAt: new Date(cachedLicense.expiresAt * 1000).toISOString(),
    daysRemaining,
    features: cachedLicense.features,
  }
}

/**
 * Reseta o estado do serviço (apenas para testes).
 */
export function resetLicenseState(): void {
  cachedLicense = null
  licenseValidated = false
}
