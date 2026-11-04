/**
 * Storage de anexos do Process Studio — interface única, dois backends.
 *
 *   local : disco (dev/demo/on-premise). Em container exige VOLUME persistente em ATTACHMENT_LOCAL_DIR.
 *   s3    : qualquer API S3 (Cloudflare R2, AWS S3, MinIO). É o backend de produção SaaS: o disco do Cloud Run/Railway é efêmero.
 *
 * O banco guarda só metadados + `storageKey` opaca; trocar de backend = copiar os objetos mantendo as chaves.
 *
 * [2026-10-30] Criado: abstração de storage para o repositório de anexos dos elementos BPMN — Rafael Brito
 */
import { promises as fs } from 'fs'
import path from 'path'

export interface AttachmentStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
}

/** Chaves são geradas pelo servidor (`projeto/processo/uuid`); a checagem barra path traversal mesmo se um dia vierem de outra fonte. */
const SAFE_KEY = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/
function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key)) throw new Error('storage key inválida')
}

export class LocalDiskStorage implements AttachmentStorage {
  private readonly root: string
  constructor(root: string) { this.root = path.resolve(root) }

  private resolve(key: string): string {
    assertSafeKey(key)
    const p = path.resolve(this.root, key)
    if (!p.startsWith(this.root + path.sep)) throw new Error('storage key fora da raiz')
    return p
  }
  async put(key: string, data: Buffer): Promise<void> {
    const p = this.resolve(key)
    await fs.mkdir(path.dirname(p), { recursive: true })
    // escrita atômica: arquivo parcial nunca fica visível sob a chave final
    const tmp = `${p}.${process.pid}.tmp`
    await fs.writeFile(tmp, data, { mode: 0o640 })
    await fs.rename(tmp, p)
  }
  async get(key: string): Promise<Buffer> { return fs.readFile(this.resolve(key)) }
  async delete(key: string): Promise<void> {
    try { await fs.unlink(this.resolve(key)) } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e }
  }
}

/**
 * S3-compatível. O SDK é carregado sob demanda (`@aws-sdk/client-s3`) para não pesar quem usa disco.
 * [2026-10-30] NÃO validado contra um bucket real nesta sessão (sem credenciais): validar em QA antes do primeiro cliente.
 */
export class S3Storage implements AttachmentStorage {
  private client: any
  private mod: any
  constructor(private readonly bucket: string, private readonly opts: { endpoint?: string; region: string; accessKeyId: string; secretAccessKey: string; prefix?: string }) {}

  private async sdk() {
    if (!this.mod) {
      try { this.mod = require('@aws-sdk/client-s3') } catch { throw new Error('ATTACHMENT_STORAGE=s3 exige a dependência @aws-sdk/client-s3 (npm i @aws-sdk/client-s3)') }
      this.client = new this.mod.S3Client({
        region: this.opts.region, endpoint: this.opts.endpoint, forcePathStyle: !!this.opts.endpoint, // R2/MinIO
        credentials: { accessKeyId: this.opts.accessKeyId, secretAccessKey: this.opts.secretAccessKey },
      })
    }
    return { m: this.mod, c: this.client }
  }
  private k(key: string): string { assertSafeKey(key); return `${this.opts.prefix ?? ''}${key}` }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const { m, c } = await this.sdk()
    // SSE não é enviado: R2 já cifra em repouso; em AWS habilite default encryption no bucket.
    await c.send(new m.PutObjectCommand({ Bucket: this.bucket, Key: this.k(key), Body: data, ContentType: contentType }))
  }
  async get(key: string): Promise<Buffer> {
    const { m, c } = await this.sdk()
    const r = await c.send(new m.GetObjectCommand({ Bucket: this.bucket, Key: this.k(key) }))
    return Buffer.from(await r.Body.transformToByteArray())
  }
  async delete(key: string): Promise<void> {
    const { m, c } = await this.sdk()
    await c.send(new m.DeleteObjectCommand({ Bucket: this.bucket, Key: this.k(key) })) // S3 é idempotente (não falha se não existe)
  }
}

let instance: AttachmentStorage | null = null
/** Singleton configurado por ambiente. `setAttachmentStorage` existe para testes. */
export function getAttachmentStorage(): AttachmentStorage {
  if (instance) return instance
  const kind = (process.env.ATTACHMENT_STORAGE || 'local').toLowerCase()
  if (kind === 's3') {
    const need = ['ATTACHMENT_S3_BUCKET', 'ATTACHMENT_S3_ACCESS_KEY_ID', 'ATTACHMENT_S3_SECRET_ACCESS_KEY']
    const missing = need.filter((n) => !process.env[n])
    if (missing.length) throw new Error(`ATTACHMENT_STORAGE=s3 sem: ${missing.join(', ')}`)
    instance = new S3Storage(process.env.ATTACHMENT_S3_BUCKET!, {
      endpoint: process.env.ATTACHMENT_S3_ENDPOINT || undefined,
      region: process.env.ATTACHMENT_S3_REGION || 'auto',
      accessKeyId: process.env.ATTACHMENT_S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.ATTACHMENT_S3_SECRET_ACCESS_KEY!,
      prefix: process.env.ATTACHMENT_S3_PREFIX || '',
    })
  } else if (kind === 'local') {
    instance = new LocalDiskStorage(process.env.ATTACHMENT_LOCAL_DIR || path.join(process.cwd(), 'data', 'attachments'))
  } else {
    throw new Error(`ATTACHMENT_STORAGE inválido: ${kind} (use local ou s3)`)
  }
  return instance
}
export function setAttachmentStorage(s: AttachmentStorage | null): void { instance = s }
