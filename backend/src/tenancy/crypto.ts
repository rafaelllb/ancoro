import crypto from 'crypto'
import { logger } from '../utils/logger'

// AES-256-GCM para criptografia de URLs de banco de dados
// Ver: docs/INFRASTRUCTURE_GUIDE.md seção 3.4

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16        // 128 bits
const AUTH_TAG_LENGTH = 16  // 128 bits
const KEY_LENGTH = 32       // 256 bits

// Chave de criptografia deve vir de variável de ambiente
// Em produção: TENANT_REGISTRY_ENCRYPTION_KEY=<base64 de 32 bytes>
// Gerar nova chave: node -e "console.log(crypto.randomBytes(32).toString('base64'))"
function getEncryptionKey(): Buffer {
  const keyBase64 = process.env.TENANT_REGISTRY_ENCRYPTION_KEY

  if (!keyBase64) {
    // Em desenvolvimento, usa chave fixa (NÃO usar em produção!)
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'demo') {
      logger.warn('Using development encryption key - DO NOT USE IN PRODUCTION')
      return Buffer.from('dev_key_32_bytes_do_not_use_prod!') // Exatamente 32 bytes
    }
    throw new Error('TENANT_REGISTRY_ENCRYPTION_KEY environment variable is required in production')
  }

  const key = Buffer.from(keyBase64, 'base64')
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be ${KEY_LENGTH} bytes (${KEY_LENGTH * 8} bits). Got ${key.length} bytes.`)
  }

  return key
}

/**
 * Criptografa uma string usando AES-256-GCM
 * Formato de saída: iv:authTag:ciphertext (todos em base64)
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64')
  ciphertext += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  // Formato: iv:authTag:ciphertext (separados por :)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`
}

/**
 * Descriptografa uma string criptografada com AES-256-GCM
 * Espera formato: iv:authTag:ciphertext (todos em base64)
 */
export function decrypt(encrypted: string): string {
  const key = getEncryptionKey()
  const parts = encrypted.split(':')

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format. Expected iv:authTag:ciphertext')
  }

  const [ivBase64, authTagBase64, ciphertext] = parts
  const iv = Buffer.from(ivBase64, 'base64')
  const authTag = Buffer.from(authTagBase64, 'base64')

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length. Expected ${IV_LENGTH}, got ${iv.length}`)
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error(`Invalid auth tag length. Expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`)
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let plaintext = decipher.update(ciphertext, 'base64', 'utf8')
  plaintext += decipher.final('utf8')

  return plaintext
}

/**
 * Gera uma nova chave de criptografia (32 bytes em base64)
 * Uso: npx ts-node -e "import { generateKey } from './src/tenancy/crypto'; console.log(generateKey())"
 */
export function generateKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('base64')
}
