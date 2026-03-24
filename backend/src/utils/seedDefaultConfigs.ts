/**
 * Seed de Configurações Default
 *
 * Popula a tabela AppConfig com valores iniciais.
 * Usa upsert para não sobrescrever configs já existentes.
 *
 * Estratégia de ambientes:
 * - Configs globais (environment=null) → defaults restritivos (production-safe)
 * - Configs environment-specific → sobrescrevem globais para cada ambiente
 */

import { PrismaClient } from '@prisma/client'
import { ConfigValueType, ConfigCategory } from '../types'

// Configurações globais (defaults restritivos)
const GLOBAL_CONFIGS = [
  // Features
  {
    key: 'features.allowSeed',
    value: false,
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE,
    description: 'Permite popular banco com dados de demonstração',
  },
  {
    key: 'features.allowDatabaseReset',
    value: false,
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE,
    description: 'Permite reset completo do banco via API',
  },
  {
    key: 'features.showDebugInfo',
    value: false,
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE,
    description: 'Mostra informações de debug em respostas de erro',
  },
  {
    key: 'features.enableBPDExport',
    value: true,
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE,
    description: 'Habilita exportação de BPD (Business Process Document)',
  },
  {
    key: 'features.enableAIAnalysis',
    value: false,
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.FEATURE,
    description: 'Habilita funcionalidade de AI Impact Analysis',
  },

  // UI
  {
    key: 'ui.showEnvironmentBanner',
    value: false,
    valueType: ConfigValueType.BOOLEAN,
    category: ConfigCategory.UI,
    description: 'Mostra banner indicando ambiente no header',
  },
  {
    key: 'ui.bannerMessage',
    value: null,
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.UI,
    description: 'Mensagem do banner de ambiente',
  },
  {
    key: 'ui.bannerColor',
    value: null,
    valueType: ConfigValueType.STRING,
    category: ConfigCategory.UI,
    description: 'Cor do banner (blue, yellow, purple, red)',
  },
  {
    key: 'ui.maxTablePageSize',
    value: 50,
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.UI,
    description: 'Número máximo de linhas por página em tabelas',
    validation: { min: 10, max: 200 },
  },

  // Limits
  {
    key: 'limits.maxBulkImportRows',
    value: 500,
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.LIMIT,
    description: 'Máximo de linhas em importação bulk',
    validation: { min: 10, max: 5000 },
  },
  {
    key: 'limits.maxFileUploadSizeMB',
    value: 10,
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.LIMIT,
    description: 'Tamanho máximo de upload de arquivo em MB',
    validation: { min: 1, max: 100 },
  },
  {
    key: 'limits.sessionTimeoutMinutes',
    value: 10080, // 7 dias
    valueType: ConfigValueType.NUMBER,
    category: ConfigCategory.LIMIT,
    description: 'Timeout de sessão em minutos',
    validation: { min: 15, max: 43200 }, // 15min a 30 dias
  },
]

// Overrides por ambiente
const ENVIRONMENT_OVERRIDES: Record<string, Array<{ key: string; value: unknown }>> = {
  demo: [
    { key: 'features.allowSeed', value: true },
    { key: 'features.allowDatabaseReset', value: true },
    { key: 'features.showDebugInfo', value: true },
    { key: 'ui.showEnvironmentBanner', value: true },
    { key: 'ui.bannerMessage', value: 'MODO DEMO - Dados podem ser resetados a qualquer momento' },
    { key: 'ui.bannerColor', value: 'purple' },
  ],
  development: [
    { key: 'features.allowSeed', value: true },
    { key: 'features.allowDatabaseReset', value: true },
    { key: 'features.showDebugInfo', value: true },
    { key: 'ui.showEnvironmentBanner', value: true },
    { key: 'ui.bannerMessage', value: 'Ambiente de Desenvolvimento' },
    { key: 'ui.bannerColor', value: 'blue' },
  ],
  staging: [
    { key: 'features.showDebugInfo', value: true },
    { key: 'ui.showEnvironmentBanner', value: true },
    { key: 'ui.bannerMessage', value: 'Ambiente de Qualidade (Staging)' },
    { key: 'ui.bannerColor', value: 'yellow' },
  ],
  production: [
    // Production usa defaults (mais restritivos)
    // Não precisa de overrides
  ],
}

/**
 * Seed de configs globais (defaults).
 * Usa upsert para não sobrescrever configs existentes.
 */
export async function seedGlobalConfigs(prisma: PrismaClient): Promise<number> {
  let seeded = 0

  for (const cfg of GLOBAL_CONFIGS) {
    const existing = await prisma.appConfig.findUnique({ where: { key: cfg.key } })

    if (!existing) {
      await prisma.appConfig.create({
        data: {
          key: cfg.key,
          value: JSON.stringify(cfg.value),
          valueType: cfg.valueType,
          category: cfg.category,
          description: cfg.description,
          environment: null, // Global
          validation: 'validation' in cfg ? JSON.stringify(cfg.validation) : null,
          createdBy: 'system',
        },
      })
      seeded++
    }
  }

  return seeded
}

/**
 * Seed de overrides para um ambiente específico.
 */
export async function seedEnvironmentOverrides(
  prisma: PrismaClient,
  environment: string
): Promise<number> {
  const overrides = ENVIRONMENT_OVERRIDES[environment]
  if (!overrides || overrides.length === 0) {
    return 0
  }

  let seeded = 0

  for (const override of overrides) {
    // Busca config global para copiar metadata
    const globalConfig = await prisma.appConfig.findFirst({
      where: { key: override.key, environment: null },
    })

    if (!globalConfig) {
      console.warn(`[SeedConfig] Config global "${override.key}" não encontrada, pulando override`)
      continue
    }

    // Verifica se override já existe
    const existingOverride = await prisma.appConfig.findFirst({
      where: { key: override.key, environment },
    })

    if (!existingOverride) {
      await prisma.appConfig.create({
        data: {
          key: override.key,
          value: JSON.stringify(override.value),
          valueType: globalConfig.valueType,
          category: globalConfig.category,
          description: `[${environment}] ${globalConfig.description}`,
          environment,
          validation: globalConfig.validation,
          createdBy: 'system',
        },
      })
      seeded++
    }
  }

  return seeded
}

/**
 * Seed completo: globals + overrides do ambiente atual.
 */
export async function seedDefaultConfigs(
  prisma: PrismaClient,
  currentEnvironment: string
): Promise<{ globals: number; overrides: number }> {
  console.log('[SeedConfig] Iniciando seed de configurações...')

  const globals = await seedGlobalConfigs(prisma)
  console.log(`[SeedConfig] ${globals} configs globais criadas`)

  const overrides = await seedEnvironmentOverrides(prisma, currentEnvironment)
  console.log(`[SeedConfig] ${overrides} overrides de ${currentEnvironment} criados`)

  return { globals, overrides }
}

/**
 * Lista todas as configs disponíveis para seed (útil para documentação).
 */
export function getAvailableConfigs() {
  return {
    global: GLOBAL_CONFIGS.map(c => ({
      key: c.key,
      valueType: c.valueType,
      category: c.category,
      description: c.description,
    })),
    environments: Object.keys(ENVIRONMENT_OVERRIDES),
  }
}
