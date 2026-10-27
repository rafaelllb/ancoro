/**
 * Desbloqueio do portal protegido por senha (lado do navegador): PBKDF2-SHA256 -> AES-256-GCM via Web Crypto.
 * [2026-10-14] Criado: Fase 3 — par do src/seal.ts — Rafael Brito
 * A chave derivada (32 bytes) fica só em sessionStorage (some ao fechar a aba); a SENHA nunca é guardada.
 */
export interface Sealed { e: 1; iv: string; ct: string }
export interface LockedInfo { salt: string; iter: number; check: Sealed }

const b64d = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64e = (b: Uint8Array): string => btoa(String.fromCharCode(...b));
const CHECK = 'ancoro-portal-ok';
const SESSION_KEY = 'ps-session-key';

export async function decryptText(key: CryptoKey, s: Sealed): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(s.iv) as BufferSource }, key, b64d(s.ct) as BufferSource);
  return new TextDecoder().decode(pt);
}

async function importEnc(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['decrypt']);
}

/** Tenta a senha; devolve a chave se correta (confere o bloco `check`), senão null. */
export async function deriveKey(locked: LockedInfo, password: string): Promise<CryptoKey | null> {
  if (!crypto?.subtle) throw new Error('Web Crypto indisponível neste navegador/contexto');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password) as BufferSource, 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: b64d(locked.salt) as BufferSource, iterations: locked.iter }, base, 512));
  const raw = bits.slice(0, 32);
  const key = await importEnc(raw);
  try {
    if ((await decryptText(key, locked.check)) !== CHECK) return null;
  } catch { return null; }
  try { sessionStorage.setItem(SESSION_KEY, b64e(raw)); } catch { /* sem sessionStorage: pede a senha de novo a cada abertura */ }
  return key;
}

/** Reabre na mesma aba sem pedir a senha de novo (se a chave da sessão ainda confere). */
export async function restoreSession(locked: LockedInfo): Promise<CryptoKey | null> {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const key = await importEnc(b64d(raw));
    return (await decryptText(key, locked.check)) === CHECK ? key : null;
  } catch { return null; }
}
