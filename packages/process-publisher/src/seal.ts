/**
 * Proteção por senha de um portal ESTÁTICO: todo o conteúdo (manifesto com a estrutura, dados dos processos, busca, novidades)
 * é cifrado com AES-256-GCM; o navegador pede a senha, deriva a chave (PBKDF2-SHA256) e decifra com a Web Crypto API.
 *
 * [2026-10-14] Criado: Fase 3 — "acesso protegido por projeto" sem servidor (README §5.3) — Rafael Brito
 * Decisões e limites (honestidade):
 * - Protege contra acesso casual e vazamento da hospedagem (GitHub Pages público, e-mail do ZIP). NÃO substitui autenticação de servidor:
 *   quem tem os arquivos pode tentar adivinhar a senha OFFLINE — por isso PBKDF2 com 600 mil iterações e a recomendação de frase longa.
 * - Determinismo (mesma entrada => mesmos bytes): salt derivado do conteúdo público (título+versão do formato) e IV "sintético"
 *   (HMAC do texto claro, como em AES-GCM-SIV): sem reuso de IV para textos diferentes; textos idênticos geram cifras idênticas (aceitável aqui).
 * - Em modo protegido NÃO se publicam páginas estáticas, relatório nem versions.json em claro (vazariam nomes e conteúdo).
 *
 * TODO [ESTIGMERGIA]: rotação de senha e múltiplas senhas por projeto
 * - Hoje uma senha por publicação. Para senhas por projeto/pessoa, cifrar uma chave de dados aleatória (DEK) com cada senha (envelope).
 */
import { createCipheriv, createDecipheriv, createHmac, pbkdf2Sync, createHash } from 'node:crypto';

export interface Sealed { e: 1; iv: string; ct: string }
export interface LockedInfo { salt: string; iter: number; check: Sealed }

const CHECK_TEXT = 'ancoro-portal-ok';
export const DEFAULT_ITERATIONS = 600_000;
const b64 = (b: Uint8Array): string => Buffer.from(b).toString('base64');

function deriveKeys(password: string, salt: Uint8Array, iter: number): { enc: Buffer; mac: Buffer } {
  const okm = pbkdf2Sync(password, salt, iter, 64, 'sha256');
  return { enc: okm.subarray(0, 32), mac: okm.subarray(32, 64) };
}

function sealWith(keys: { enc: Buffer; mac: Buffer }, label: string, plaintext: string): Sealed {
  const pt = Buffer.from(plaintext, 'utf8');
  const iv = createHmac('sha256', keys.mac).update(label).update('\0').update(pt).digest().subarray(0, 12); // IV sintético
  const c = createCipheriv('aes-256-gcm', keys.enc, iv);
  const ct = Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]); // tag no final: formato esperado pela Web Crypto
  return { e: 1, iv: b64(iv), ct: b64(ct) };
}

export interface Sealer {
  locked: LockedInfo;
  /** cifra um texto (JSON) com a chave da senha */
  seal: (label: string, plaintext: string) => Sealed;
}

/** `saltSeed` = informação pública estável do portal (ex.: título): torna o salt único por portal sem aleatoriedade. */
export function createSealer(password: string, saltSeed: string, iterations = DEFAULT_ITERATIONS): Sealer {
  if (password.length < 8) throw new Error('a senha do portal deve ter ao menos 8 caracteres (prefira uma frase longa)');
  const salt = createHash('sha256').update(`ancoro-process-portal|${saltSeed}`).digest().subarray(0, 16);
  const keys = deriveKeys(password, salt, iterations);
  return { locked: { salt: b64(salt), iter: iterations, check: sealWith(keys, 'check', CHECK_TEXT) }, seal: (label, pt) => sealWith(keys, label, pt) };
}

// ---------------------------------------------------------------------------------------------- versions.json protegido
export interface SealedFile extends Sealed { salt: string; iter: number }

export function sealFile(password: string, label: string, plaintext: string, saltSeed: string, iterations = DEFAULT_ITERATIONS): SealedFile {
  const s = createSealer(password, saltSeed, iterations);
  return { ...s.seal(label, plaintext), salt: s.locked.salt, iter: s.locked.iter };
}

export function unsealFile(password: string, file: SealedFile): string {
  const keys = deriveKeys(password, Buffer.from(file.salt, 'base64'), file.iter);
  const ct = Buffer.from(file.ct, 'base64');
  const d = createDecipheriv('aes-256-gcm', keys.enc, Buffer.from(file.iv, 'base64'));
  d.setAuthTag(ct.subarray(ct.length - 16));
  try { return Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]).toString('utf8'); } catch { throw new Error('senha incorreta (ou arquivo adulterado)'); }
}

export const isSealedFile = (v: unknown): v is SealedFile => !!v && typeof v === 'object' && (v as { e?: unknown }).e === 1 && 'salt' in (v as object);
