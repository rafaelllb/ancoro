/**
 * Política de anexos: o que pode entrar, quanto pode pesar e como é entregue.
 *
 * Princípio: NÃO confiar no que o cliente declara. O tipo é decidido pela ASSINATURA BINÁRIA do conteúdo e tem de
 * concordar com a extensão. SVG/HTML/JS/executáveis ficam de fora (SVG executa script quando aberto direto no navegador).
 *
 * [2026-10-30] Criado: allowlist + sniffing + limites do repositório de anexos — Rafael Brito
 * TODO [ESTIGMERGIA]: varredura antivírus (ClamAV) antes do `storage.put`
 * - Por que pendente: exige o serviço clamd na infra (docs/INFRASTRUCTURE_GUIDE.md §Anexos); sem ele a política acima é a única barreira.
 * - Abordagem: porta `scanBuffer(buf): Promise<'clean'|'infected'|'unavailable'>`; 'unavailable' em produção deve recusar (fail-closed).
 */

export interface DetectedType { mime: string; inline: boolean }

const startsWith = (b: Buffer, sig: number[], off = 0) => b.length >= off + sig.length && sig.every((v, i) => b[off + i] === v)

/** Detecta o tipo pela assinatura. null = não reconhecido / fora da allowlist. */
export function sniff(buf: Buffer, ext: string): DetectedType | null {
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: 'image/png', inline: true }
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mime: 'image/jpeg', inline: true }
  if (startsWith(buf, [0x47, 0x49, 0x46, 0x38])) return { mime: 'image/gif', inline: true }
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: 'image/webp', inline: true }
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: 'application/pdf', inline: false }
  // OOXML/ODF são ZIP: a extensão decide QUAL formato (o ZIP puro é recusado para não aceitar bombas/arquivos arbitrários)
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) {
    const m = ZIP_BASED[ext]
    return m ? { mime: m, inline: false } : null
  }
  // Office legado (OLE2)
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    const m = OLE_BASED[ext]
    return m ? { mime: m, inline: false } : null
  }
  // texto puro: sem NUL nos primeiros 8 KB e UTF-8 válido nesse trecho
  if (TEXT_BASED[ext] && looksLikeText(buf)) return { mime: TEXT_BASED[ext]!, inline: false }
  return null
}

const ZIP_BASED: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
}
const OLE_BASED: Record<string, string> = { doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint' }
const TEXT_BASED: Record<string, string> = { txt: 'text/plain', csv: 'text/csv', md: 'text/plain', json: 'application/json', log: 'text/plain' }
const IMAGE_EXT: Record<string, string[]> = { 'image/png': ['png'], 'image/jpeg': ['jpg', 'jpeg'], 'image/gif': ['gif'], 'image/webp': ['webp'], 'application/pdf': ['pdf'] }

function looksLikeText(buf: Buffer): boolean {
  const head = buf.subarray(0, 8192)
  if (head.includes(0)) return false
  try { new TextDecoder('utf-8', { fatal: true }).decode(head.length === buf.length ? head : head.subarray(0, head.length - 3)); return true } catch { return false }
}

export const extensionOf = (fileName: string): string => (fileName.split('.').pop() ?? '').toLowerCase()

/** Valida conteúdo × extensão. Devolve o tipo ou o motivo da recusa. */
export function classify(buf: Buffer, fileName: string): { ok: true; type: DetectedType } | { ok: false; reason: string } {
  if (buf.length === 0) return { ok: false, reason: 'Arquivo vazio' }
  const ext = extensionOf(fileName)
  const t = sniff(buf, ext)
  if (!t) return { ok: false, reason: 'Tipo de arquivo não permitido' }
  const exts = IMAGE_EXT[t.mime]
  if (exts && !exts.includes(ext)) return { ok: false, reason: 'A extensão não corresponde ao conteúdo do arquivo' }
  return { ok: true, type: t }
}

/** Nome seguro para exibir/baixar: sem caminho, sem controle, tamanho limitado. Nunca é usado como caminho em disco. */
export function sanitizeFileName(raw: string): string {
  const base = raw.replace(/\\/g, '/').split('/').pop() ?? ''
  const clean = base.replace(/[\u0000-\u001f\u007f"<>|?*:]/g, '_').trim().replace(/^\.+/, '')
  return clean.slice(0, 180) || 'arquivo'
}

const int = (v: string | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d }
export const limits = () => ({
  maxFileBytes: int(process.env.ATTACHMENT_MAX_FILE_MB, 10) * 1024 * 1024,
  maxPerElement: int(process.env.ATTACHMENT_MAX_PER_ELEMENT, 25),
  maxProjectBytes: int(process.env.ATTACHMENT_PROJECT_QUOTA_MB, 500) * 1024 * 1024,
})
