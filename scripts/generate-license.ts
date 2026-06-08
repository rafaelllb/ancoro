#!/usr/bin/env npx ts-node
/**
 * License Generator CLI
 *
 * Script interno para gerar licenças para clientes on-premise.
 * Usa chave privada RSA para assinar o JWT.
 *
 * Uso:
 *   npx ts-node scripts/generate-license.ts \
 *     --customer "Seidor Brasil" \
 *     --customer-id "seidor-001" \
 *     --tier professional \
 *     --days 365 \
 *     --output ./seidor.license
 *
 * Pré-requisitos:
 *   - Chave privada em keys/license-private.pem
 *   - Ou variável de ambiente LICENSE_PRIVATE_KEY
 *
 * Para gerar par de chaves:
 *   openssl genrsa -out keys/license-private.pem 2048
 *   openssl rsa -in keys/license-private.pem -pubout -out keys/license-public.pem
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import * as jwt from 'jsonwebtoken'

// Importa tipos do módulo de licença
// Caminho relativo porque este script roda da raiz
type EnvironmentType = 'dev' | 'qa' | 'prod'

interface LicenseFeatures {
  maxProjects: number
  maxUsersPerProject: number
  maxRequirementsPerProject: number
  exportPdf: boolean
  crossMatrix: boolean
  conflictDetection: boolean
  auditLog: boolean
  apiAccess: boolean
  customBranding: boolean
  multipleProjects: boolean
  // Ambientes permitidos
  maxEnvironments: number
  allowedEnvironmentTypes: EnvironmentType[]
}

type LicenseTier = 'pilot' | 'starter' | 'professional' | 'enterprise'

interface LicensePayload {
  licenseId: string
  customerId: string
  customerName: string
  tier: LicenseTier
  features: LicenseFeatures
  issuedAt: number
  expiresAt: number
  version: number
}

// Features default por tier
const DEFAULT_FEATURES_BY_TIER: Record<LicenseTier, LicenseFeatures> = {
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
    maxRequirementsPerProject: -1,
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
    maxProjects: -1,
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

// Parseia argumentos da linha de comando
function parseArgs(): {
  customer: string
  customerId: string
  tier: LicenseTier
  days: number
  output: string
  keyPath?: string
} {
  const args = process.argv.slice(2)
  const parsed: Record<string, string> = {}

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '')
    const value = args[i + 1]
    if (value) {
      parsed[key] = value
    }
  }

  // Validações
  if (!parsed.customer) {
    console.error('Erro: --customer é obrigatório')
    printUsage()
    process.exit(1)
  }

  if (!parsed['customer-id']) {
    console.error('Erro: --customer-id é obrigatório')
    printUsage()
    process.exit(1)
  }

  const tier = (parsed.tier || 'starter') as LicenseTier
  if (!['pilot', 'starter', 'professional', 'enterprise'].includes(tier)) {
    console.error(`Erro: tier inválido "${tier}"`)
    console.error('Valores válidos: pilot, starter, professional, enterprise')
    process.exit(1)
  }

  const days = parseInt(parsed.days || '365', 10)
  if (isNaN(days) || days < 1) {
    console.error('Erro: --days deve ser um número positivo')
    process.exit(1)
  }

  return {
    customer: parsed.customer,
    customerId: parsed['customer-id'],
    tier,
    days,
    output: parsed.output || `./${parsed['customer-id']}.license`,
    keyPath: parsed['key-path'],
  }
}

function printUsage(): void {
  console.log(`
Uso: npx ts-node scripts/generate-license.ts [opções]

Opções obrigatórias:
  --customer      Nome do cliente (ex: "Seidor Brasil")
  --customer-id   ID único do cliente (ex: "seidor-001")

Opções:
  --tier          Tier da licença: pilot|starter|professional|enterprise (default: starter)
  --days          Dias de validade (default: 365)
  --output        Caminho do arquivo de saída (default: ./{customer-id}.license)
  --key-path      Caminho da chave privada (default: keys/license-private.pem)

Exemplos:
  npx ts-node scripts/generate-license.ts \\
    --customer "Seidor Brasil" \\
    --customer-id "seidor-001" \\
    --tier professional \\
    --days 365

  npx ts-node scripts/generate-license.ts \\
    --customer "Energia Vitalis" \\
    --customer-id "evitalis-001" \\
    --tier enterprise \\
    --days 730 \\
    --output ./licenses/energia-vitalis.license
`)
}

// Carrega chave privada
function loadPrivateKey(keyPath?: string): string {
  // Prioridade: argumento > env var > arquivo padrão
  if (process.env.LICENSE_PRIVATE_KEY) {
    return process.env.LICENSE_PRIVATE_KEY.replace(/\\n/g, '\n')
  }

  const defaultPath = path.resolve(__dirname, '../keys/license-private.pem')
  const finalPath = keyPath || defaultPath

  if (!fs.existsSync(finalPath)) {
    console.error(`Erro: Chave privada não encontrada em ${finalPath}`)
    console.error('')
    console.error('Para gerar um par de chaves:')
    console.error('  mkdir -p keys')
    console.error('  openssl genrsa -out keys/license-private.pem 2048')
    console.error('  openssl rsa -in keys/license-private.pem -pubout -out keys/license-public.pem')
    process.exit(1)
  }

  return fs.readFileSync(finalPath, 'utf-8')
}

// Gera UUID v4
function generateUUID(): string {
  return crypto.randomUUID()
}

// Função principal
function main(): void {
  console.log('=== Ancoro License Generator ===\n')

  const args = parseArgs()
  const privateKey = loadPrivateKey(args.keyPath)

  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + (args.days * 24 * 60 * 60)

  const payload: LicensePayload = {
    licenseId: generateUUID(),
    customerId: args.customerId,
    customerName: args.customer,
    tier: args.tier,
    features: DEFAULT_FEATURES_BY_TIER[args.tier],
    issuedAt: now,
    expiresAt,
    version: 1,
  }

  // Assina o JWT com RS256
  const token = jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
  })

  // Garante que diretório de saída existe
  const outputDir = path.dirname(args.output)
  if (outputDir && !fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Salva arquivo
  fs.writeFileSync(args.output, token)

  // Sumário
  console.log('Licença gerada com sucesso!\n')
  console.log('Detalhes:')
  console.log(`  ID:         ${payload.licenseId}`)
  console.log(`  Cliente:    ${payload.customerName} (${payload.customerId})`)
  console.log(`  Tier:       ${payload.tier}`)
  console.log(`  Emissão:    ${new Date(now * 1000).toISOString()}`)
  console.log(`  Expiração:  ${new Date(expiresAt * 1000).toISOString()}`)
  console.log(`  Validade:   ${args.days} dias`)
  console.log('')
  console.log('Features:')
  const features = payload.features
  console.log(`  Projetos:           ${features.maxProjects === -1 ? 'ilimitado' : features.maxProjects}`)
  console.log(`  Usuários/projeto:   ${features.maxUsersPerProject === -1 ? 'ilimitado' : features.maxUsersPerProject}`)
  console.log(`  Requisitos/projeto: ${features.maxRequirementsPerProject === -1 ? 'ilimitado' : features.maxRequirementsPerProject}`)
  console.log(`  Export PDF:         ${features.exportPdf ? 'sim' : 'não'}`)
  console.log(`  Matriz cruzamento:  ${features.crossMatrix ? 'sim' : 'não'}`)
  console.log(`  Detecção conflitos: ${features.conflictDetection ? 'sim' : 'não'}`)
  console.log(`  Audit log:          ${features.auditLog ? 'sim' : 'não'}`)
  console.log(`  API access:         ${features.apiAccess ? 'sim' : 'não'}`)
  console.log(`  Custom branding:    ${features.customBranding ? 'sim' : 'não'}`)
  console.log('')
  console.log('Ambientes permitidos:')
  console.log(`  Máximo:             ${features.maxEnvironments}`)
  console.log(`  Tipos:              ${features.allowedEnvironmentTypes.join(', ')}`)
  console.log('')
  console.log(`Arquivo salvo em: ${path.resolve(args.output)}`)
  console.log('')
  console.log('Instrução para o cliente:')
  console.log(`  Copie o arquivo ${path.basename(args.output)} para o diretório`)
  console.log('  raiz da instalação do Ancoro como ".license"')
}

main()
