/**
 * ConfigService - Gerenciamento de configurações em banco de dados
 *
 * Responsabilidades:
 * - Cache em memória com TTL configurável
 * - CRUD de configurações com audit trail
 * - Suporte a configs globais e environment-specific
 * - Fallback para defaults quando banco indisponível
 *
 * Separação de responsabilidades:
 * - Infraestrutura (DATABASE_URL, JWT_SECRET, PORT) → .env files
 * - Aplicação (features, ui, limits) → Este service (banco de dados)
 */

import { PrismaClient, AppConfig } from '@prisma/client'
import {
  TypedAppConfig,
  FeaturesConfig,
  UIConfig,
  LimitsConfig,
  AppConfigItem,
  ConfigValidation,
  ConfigValueTypeType,
  ConfigCategoryType,
} from '../types'
import config from '../config'

// Estrutura do cache em memória
interface ConfigCache {
  data: Map<string, AppConfigItem>
  loadedAt: Date
  environment: string
}

// Valores default (mais restritivos - production-safe)
// Usados quando config não existe no banco ou banco indisponível
const DEFAULT_CONFIG: TypedAppConfig = {
  features: {
    allowSeed: false,
    allowDatabaseReset: false,
    showDebugInfo: false,
    enableBPDExport: true,
    enableAIAnalysis: false,
  },
  ui: {
    showEnvironmentBanner: false,
    bannerMessage: null,
    bannerColor: null,
    maxTablePageSize: 50,
  },
  limits: {
    maxBulkImportRows: 500,
    maxFileUploadSizeMB: 10,
    sessionTimeoutMinutes: 60 * 24 * 7, // 7 dias
  },
}

export class ConfigService {
  private cache: ConfigCache | null = null
  private cacheTTLMs: number
  private prisma: PrismaClient

  constructor(prisma: PrismaClient, cacheTTLMs = 60000) {
    this.prisma = prisma
    this.cacheTTLMs = cacheTTLMs
  }

  /**
   * Carrega todas configs do banco para o cache.
   * Filtra por ambiente atual + configs globais (environment=null).
   * Configs environment-specific sobrescrevem globais.
   */
  async loadCache(): Promise<void> {
    const currentEnv = config.env

    try {
      const dbConfigs = await this.prisma.appConfig.findMany({
        where: {
          isActive: true,
          OR: [
            { environment: null },        // Configs globais
            { environment: currentEnv },  // Configs do ambiente atual
          ],
        },
      })

      const cacheMap = new Map<string, AppConfigItem>()

      for (const dbConfig of dbConfigs) {
        // Environment-specific sobrescreve global
        const existing = cacheMap.get(dbConfig.key)
        if (!existing || (dbConfig.environment && !existing.environment)) {
          cacheMap.set(dbConfig.key, this.parseDbConfig(dbConfig))
        }
      }

      this.cache = {
        data: cacheMap,
        loadedAt: new Date(),
        environment: currentEnv,
      }
    } catch (error) {
      // Se falhar ao carregar, mantém cache antigo ou usa defaults
      console.error('[ConfigService] Erro ao carregar cache:', error)
      if (!this.cache) {
        this.cache = {
          data: new Map(),
          loadedAt: new Date(),
          environment: currentEnv,
        }
      }
    }
  }

  /**
   * Obtém valor único de configuração com type safety.
   * Retorna default se não encontrado.
   */
  async get<T>(key: string, defaultValue: T): Promise<T> {
    await this.ensureCacheValid()

    const cached = this.cache?.data.get(key)
    if (cached !== undefined) {
      return cached.value as T
    }

    return defaultValue
  }

  /**
   * Obtém objeto tipado completo de configuração.
   * Mescla valores do banco com defaults.
   */
  async getTypedConfig(): Promise<TypedAppConfig> {
    await this.ensureCacheValid()

    const features: FeaturesConfig = {
      allowSeed: await this.get('features.allowSeed', DEFAULT_CONFIG.features.allowSeed),
      allowDatabaseReset: await this.get('features.allowDatabaseReset', DEFAULT_CONFIG.features.allowDatabaseReset),
      showDebugInfo: await this.get('features.showDebugInfo', DEFAULT_CONFIG.features.showDebugInfo),
      enableBPDExport: await this.get('features.enableBPDExport', DEFAULT_CONFIG.features.enableBPDExport),
      enableAIAnalysis: await this.get('features.enableAIAnalysis', DEFAULT_CONFIG.features.enableAIAnalysis),
    }

    const ui: UIConfig = {
      showEnvironmentBanner: await this.get('ui.showEnvironmentBanner', DEFAULT_CONFIG.ui.showEnvironmentBanner),
      bannerMessage: await this.get('ui.bannerMessage', DEFAULT_CONFIG.ui.bannerMessage),
      bannerColor: await this.get('ui.bannerColor', DEFAULT_CONFIG.ui.bannerColor),
      maxTablePageSize: await this.get('ui.maxTablePageSize', DEFAULT_CONFIG.ui.maxTablePageSize),
    }

    const limits: LimitsConfig = {
      maxBulkImportRows: await this.get('limits.maxBulkImportRows', DEFAULT_CONFIG.limits.maxBulkImportRows),
      maxFileUploadSizeMB: await this.get('limits.maxFileUploadSizeMB', DEFAULT_CONFIG.limits.maxFileUploadSizeMB),
      sessionTimeoutMinutes: await this.get('limits.sessionTimeoutMinutes', DEFAULT_CONFIG.limits.sessionTimeoutMinutes),
    }

    return { features, ui, limits }
  }

  /**
   * Atualiza valor de configuração existente.
   * Cria entrada no audit log.
   */
  async set(
    key: string,
    value: unknown,
    userId: string,
    userName: string,
    userEmail: string,
    reason?: string
  ): Promise<AppConfigItem> {
    const existing = await this.prisma.appConfig.findUnique({ where: { key } })

    if (!existing) {
      throw new Error(`Config "${key}" não encontrada. Use createConfig para novas configs.`)
    }

    // Valida valor contra regras
    if (existing.validation) {
      this.validateValue(value, existing.valueType, JSON.parse(existing.validation))
    }

    // Atualiza config
    const updated = await this.prisma.appConfig.update({
      where: { key },
      data: {
        value: JSON.stringify(value),
        updatedBy: userId,
      },
    })

    // Cria audit log
    await this.prisma.configChangeLog.create({
      data: {
        configId: existing.id,
        configKey: key,
        oldValue: existing.value,
        newValue: JSON.stringify(value),
        userId,
        userName,
        userEmail,
        reason,
      },
    })

    // Invalida cache
    this.invalidateCache()

    return this.parseDbConfig(updated)
  }

  /**
   * Cria nova configuração.
   */
  async create(
    data: {
      key: string
      value: unknown
      valueType: ConfigValueTypeType
      category: ConfigCategoryType
      description?: string
      environment?: string | null
      validation?: ConfigValidation
    },
    userId: string
  ): Promise<AppConfigItem> {
    // Verifica se já existe
    const existing = await this.prisma.appConfig.findUnique({ where: { key: data.key } })
    if (existing) {
      throw new Error(`Config "${data.key}" já existe.`)
    }

    const created = await this.prisma.appConfig.create({
      data: {
        key: data.key,
        value: JSON.stringify(data.value),
        valueType: data.valueType,
        category: data.category,
        description: data.description,
        environment: data.environment ?? null,
        validation: data.validation ? JSON.stringify(data.validation) : null,
        createdBy: userId,
      },
    })

    this.invalidateCache()

    return this.parseDbConfig(created)
  }

  /**
   * Lista todas as configs (para admin).
   */
  async listAll(category?: string): Promise<AppConfigItem[]> {
    const configs = await this.prisma.appConfig.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    })

    return configs.map(c => this.parseDbConfig(c))
  }

  /**
   * Obtém histórico de alterações de uma config.
   */
  async getHistory(key: string, limit = 50, offset = 0) {
    const configRecord = await this.prisma.appConfig.findUnique({ where: { key } })
    if (!configRecord) {
      throw new Error(`Config "${key}" não encontrada.`)
    }

    const history = await this.prisma.configChangeLog.findMany({
      where: { configId: configRecord.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    })

    const total = await this.prisma.configChangeLog.count({
      where: { configId: configRecord.id },
    })

    return {
      history: history.map(h => ({
        ...h,
        oldValue: h.oldValue ? JSON.parse(h.oldValue) : null,
        newValue: h.newValue ? JSON.parse(h.newValue) : null,
      })),
      total,
      hasMore: offset + history.length < total,
    }
  }

  /**
   * Invalida cache manualmente.
   */
  invalidateCache(): void {
    this.cache = null
  }

  /**
   * Retorna defaults (útil para seed inicial).
   */
  getDefaults(): TypedAppConfig {
    return DEFAULT_CONFIG
  }

  // ===== Métodos privados =====

  /**
   * Garante que cache está válido, recarrega se stale.
   */
  private async ensureCacheValid(): Promise<void> {
    if (!this.cache) {
      await this.loadCache()
      return
    }

    const age = Date.now() - this.cache.loadedAt.getTime()
    if (age > this.cacheTTLMs) {
      await this.loadCache()
    }
  }

  /**
   * Converte registro do banco para AppConfigItem.
   */
  private parseDbConfig(dbConfig: AppConfig): AppConfigItem {
    return {
      id: dbConfig.id,
      key: dbConfig.key,
      value: JSON.parse(dbConfig.value),
      valueType: dbConfig.valueType as ConfigValueTypeType,
      category: dbConfig.category as ConfigCategoryType,
      description: dbConfig.description ?? undefined,
      environment: dbConfig.environment,
      validation: dbConfig.validation ? JSON.parse(dbConfig.validation) : undefined,
      isActive: dbConfig.isActive,
      createdAt: dbConfig.createdAt,
      updatedAt: dbConfig.updatedAt,
    }
  }

  /**
   * Valida valor contra regras de validação.
   */
  private validateValue(value: unknown, valueType: string, validation: ConfigValidation): void {
    if (validation.required && (value === null || value === undefined)) {
      throw new Error('Valor é obrigatório')
    }

    if (valueType === 'NUMBER' && typeof value === 'number') {
      if (validation.min !== undefined && value < validation.min) {
        throw new Error(`Valor deve ser no mínimo ${validation.min}`)
      }
      if (validation.max !== undefined && value > validation.max) {
        throw new Error(`Valor deve ser no máximo ${validation.max}`)
      }
    }

    if (valueType === 'STRING' && typeof value === 'string') {
      if (validation.minLength !== undefined && value.length < validation.minLength) {
        throw new Error(`Valor deve ter no mínimo ${validation.minLength} caracteres`)
      }
      if (validation.maxLength !== undefined && value.length > validation.maxLength) {
        throw new Error(`Valor deve ter no máximo ${validation.maxLength} caracteres`)
      }
      if (validation.pattern && !new RegExp(validation.pattern).test(value)) {
        throw new Error('Valor não corresponde ao padrão esperado')
      }
    }

    if (valueType === 'ENUM' && validation.enumValues) {
      if (!validation.enumValues.includes(value as string)) {
        throw new Error(`Valor deve ser um de: ${validation.enumValues.join(', ')}`)
      }
    }
  }
}

// Singleton - instância única por processo
let configServiceInstance: ConfigService | null = null

export function getConfigService(prisma: PrismaClient): ConfigService {
  if (!configServiceInstance) {
    configServiceInstance = new ConfigService(prisma)
  }
  return configServiceInstance
}

export { DEFAULT_CONFIG }
