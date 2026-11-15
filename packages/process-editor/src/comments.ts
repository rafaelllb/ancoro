/**
 * Comentários do processo (todos os elementos) — fonte única para a aba "Comentários" e para os balões no diagrama.
 *
 * [2026-11-10] Criado: comentários por elemento + "ao vivo" — Rafael Brito
 * - Só existe embutido (IS_HOST): os dados vêm do host pela ponte RPC (no Ancoro com JWT; no link público pelo token do link).
 * - "Ao vivo": o host avisa `comments.changed` (Socket.io no Ancoro; polling no link público) e aqui só se recarrega a lista.
 * - Identidade do visitante (modo revisão) fica no localStorage DESTE navegador: preenche o formulário na próxima vez.
 */
import { create } from 'zustand';
import { rpc } from './host';

export type CommentType = 'OBSERVATION' | 'QUESTION' | 'CHANGE_REQUEST';
export const COMMENT_TYPES: CommentType[] = ['OBSERVATION', 'QUESTION', 'CHANGE_REQUEST'];
export const PROCESS_ELEMENT = '__process';

export interface ProcessComment {
  id: string;
  elementId: string;
  elementName: string;
  type: CommentType;
  content: string;
  status: 'OPEN' | 'RESOLVED';
  parentId: string | null;
  authorName: string;
  authorEmail?: string | null;
  viaShare: boolean;
  mine?: boolean;
  createdAt: string;
}
interface Perms { canComment: boolean; canModerate: boolean; share?: boolean }
export interface Identity { name: string; email: string }

interface CommentsState {
  items: ProcessComment[];
  perms: Perms;
  loaded: boolean;
  error: string | null;
  identity: Identity;
  refresh: () => Promise<void>;
  add: (input: { elementId: string; type: CommentType; content: string; parentId?: string }) => Promise<void>;
  setStatus: (id: string, status: 'OPEN' | 'RESOLVED') => Promise<void>;
  remove: (id: string) => Promise<void>;
  setIdentity: (id: Identity) => void;
}

const ID_KEY = 'ps-share-identity-v1';
const loadIdentity = (): Identity => {
  try { const v = JSON.parse(localStorage.getItem(ID_KEY) ?? '{}') as Partial<Identity>; return { name: v.name ?? '', email: v.email ?? '' }; } catch { return { name: '', email: '' }; }
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

let inflight: Promise<void> | null = null;
let again = false;

export const useComments = create<CommentsState>((set, get) => ({
  items: [], perms: { canComment: false, canModerate: false }, loaded: false, error: null, identity: loadIdentity(),
  // coalescente: vários avisos seguidos (ex.: rajada de eventos) viram no máximo uma recarga em andamento + uma em seguida
  refresh: async () => {
    if (inflight) { again = true; return inflight; }
    inflight = (async () => {
      try {
        do {
          again = false;
          const r = await rpc<{ comments: ProcessComment[]; permissions: Perms }>('comments.list');
          set({ items: r.comments, perms: r.permissions, loaded: true, error: null });
        } while (again);
      } catch (e) { set({ error: errMsg(e), loaded: true }); } finally { inflight = null; }
    })();
    return inflight;
  },
  add: async (input) => {
    const { identity, perms } = get();
    await rpc('comments.add', perms.share ? { ...input, authorName: identity.name.trim(), authorEmail: identity.email.trim() } : input);
    await get().refresh();
  },
  setStatus: async (id, status) => { await rpc('comments.setStatus', { id, status }); await get().refresh(); },
  remove: async (id) => { await rpc('comments.remove', { id }); await get().refresh(); },
  setIdentity: (identity) => {
    set({ identity });
    try { localStorage.setItem(ID_KEY, JSON.stringify(identity)); } catch { /* storage bloqueado: só não lembra na próxima visita */ }
  },
}));

/** Quantidade de tópicos ABERTOS por elemento (para os balões no diagrama). */
export function openCountByElement(items: ReadonlyArray<ProcessComment>): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of items) if (!c.parentId && c.status === 'OPEN') m.set(c.elementId, (m.get(c.elementId) ?? 0) + 1);
  return m;
}
