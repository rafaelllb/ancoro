/**
 * Aba "Comentários": observações, perguntas e ajustes solicitados sobre um elemento (ou sobre o processo geral).
 *
 * [2026-11-10] Criado: validação do processo pelo cliente — Rafael Brito
 * - Tópicos (raiz) com respostas de um nível. Equipe (canModerate) resolve/reabre e exclui; cada um exclui o que escreveu.
 * - Modo revisão (link público): o visitante informa nome (+ e-mail opcional) uma vez; fica lembrado neste navegador.
 * - Texto do comentário é renderizado como TEXTO (React escapa): nada de HTML vindo de visitante chega ao DOM.
 */
import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { COMMENT_TYPES, PROCESS_ELEMENT, useComments, type CommentType, type ProcessComment } from '../comments';

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

export function CommentsTab({ elementId }: { elementId: string }) {
  const t = useT();
  const { items, perms, loaded, error } = useComments();
  const [showResolved, setShowResolved] = useState(false);

  const roots = useMemo(() => items.filter((c) => !c.parentId && c.elementId === elementId), [items, elementId]);
  const repliesOf = useMemo(() => {
    const m = new Map<string, ProcessComment[]>();
    for (const c of items) if (c.parentId) m.set(c.parentId, [...(m.get(c.parentId) ?? []), c]);
    return m;
  }, [items]);
  const open = roots.filter((c) => c.status === 'OPEN');
  const resolved = roots.filter((c) => c.status === 'RESOLVED');
  const visible = showResolved ? roots : open;

  return (
    <div className="comments" data-comments-for={elementId}>
      {elementId === PROCESS_ELEMENT && <p className="fhint">{t.comments.aboutProcess}</p>}
      {perms.canComment ? <Composer elementId={elementId} /> : loaded && <p className="fhint">{t.comments.readOnly}</p>}

      {error && <p className="ferr" role="alert">{error}</p>}
      {!loaded && !error && <p className="fhint">{t.comments.loading}</p>}
      {loaded && roots.length === 0 && <p className="fhint">{elementId === PROCESS_ELEMENT ? t.comments.noneProcess : t.comments.none}</p>}

      {roots.length > 0 && (
        <div className="cbar">
          <span className="muted">{t.comments.openCount.replace('{n}', String(open.length))}</span>
          {resolved.length > 0 && (
            <label className="chk"><input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> {t.comments.showResolved} ({resolved.length})</label>
          )}
        </div>
      )}

      <ul className="clist">
        {visible.map((c) => <Thread key={c.id} root={c} replies={repliesOf.get(c.id) ?? []} />)}
      </ul>
    </div>
  );
}

function Thread({ root, replies }: { root: ProcessComment; replies: ProcessComment[] }) {
  const t = useT();
  const { perms, setStatus } = useComments();
  const [replying, setReplying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = (p: Promise<unknown>) => p.catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  return (
    <li className={`thread ${root.status === 'RESOLVED' ? 'done' : ''} t-${root.type}`} data-comment={root.id}>
      <Item c={root} head />
      {replies.map((r) => <Item key={r.id} c={r} />)}
      {err && <p className="ferr" role="alert">{err}</p>}
      <div className="cacts">
        {perms.canComment && !replying && <button type="button" className="linkbtn" data-action="reply" onClick={() => setReplying(true)}>{t.comments.reply}</button>}
        {perms.canModerate && (root.status === 'OPEN'
          ? <button type="button" data-action="resolve" onClick={() => void run(setStatus(root.id, 'RESOLVED'))}>✓ {t.comments.resolve}</button>
          : <button type="button" data-action="reopen" onClick={() => void run(setStatus(root.id, 'OPEN'))}>{t.comments.reopen}</button>)}
      </div>
      {replying && <Composer elementId={root.elementId} parentId={root.id} onDone={() => setReplying(false)} />}
    </li>
  );
}

function Item({ c, head = false }: { c: ProcessComment; head?: boolean }) {
  const t = useT();
  const { perms, remove } = useComments();
  const canRemove = !perms.share && (c.mine || perms.canModerate);
  return (
    <div className={head ? 'citem head' : 'citem reply'}>
      <div className="cmeta">
        <strong>{c.authorName}</strong>
        {c.viaShare && <span className="tag guest">{t.comments.guest}</span>}
        {head && <span className={`tag type ${c.type}`}>{t.commentType[c.type]}</span>}
        {head && c.status === 'RESOLVED' && <span className="tag ok">{t.comments.resolved}</span>}
        <span className="muted">{fmt(c.createdAt)}</span>
        {canRemove && (
          <button type="button" className="linkbtn danger" data-action="remove-comment"
            onClick={() => { if (window.confirm(t.comments.removeConfirm)) void remove(c.id).catch(() => undefined); }}>{t.comments.remove}</button>
        )}
      </div>
      <p className="ctext">{c.content}</p>
      {c.authorEmail && <span className="muted cmail">{c.authorEmail}</span>}
    </div>
  );
}

function Composer({ elementId, parentId, onDone }: { elementId: string; parentId?: string; onDone?: () => void }) {
  const t = useT();
  const { perms, identity, setIdentity, add } = useComments();
  const [type, setType] = useState<CommentType>('OBSERVATION');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needsName = !!perms.share;

  const send = async () => {
    const content = text.trim();
    if (!content || busy) return;
    if (needsName && identity.name.trim().length < 2) { setErr(t.comments.nameRequired); return; }
    setBusy(true); setErr(null);
    try {
      await add({ elementId, type, content, parentId });
      setText('');
      onDone?.();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  return (
    <form className={`composer${parentId ? ' reply' : ''}`} onSubmit={(e) => { e.preventDefault(); void send(); }}>
      {needsName && !parentId && (
        <div className="ident">
          <input aria-label={t.comments.yourName} placeholder={t.comments.yourName} maxLength={80} value={identity.name} data-field="author-name"
            onChange={(e) => setIdentity({ ...identity, name: e.target.value })} />
          <input aria-label={t.comments.yourEmail} placeholder={t.comments.yourEmail} type="email" maxLength={160} value={identity.email} data-field="author-email"
            onChange={(e) => setIdentity({ ...identity, email: e.target.value })} />
          <p className="fhint">{t.comments.identityHint}</p>
        </div>
      )}
      {!parentId && (
        <div className="ctypes" role="radiogroup" aria-label={t.comments.title}>
          {COMMENT_TYPES.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={type === k} data-ctype={k} className={`tag type ${k}${type === k ? ' on' : ''}`} onClick={() => setType(k)}>{t.commentType[k]}</button>
          ))}
        </div>
      )}
      <textarea value={text} maxLength={4000} rows={parentId ? 2 : 3} data-field="comment-text"
        placeholder={parentId ? t.comments.replyPlaceholder : t.comments.placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }} />
      {err && <p className="ferr" role="alert">{err}</p>}
      <div className="cacts">
        {onDone && <button type="button" onClick={onDone}>{t.comments.cancel}</button>}
        <button type="submit" className="primary" data-action="send-comment" disabled={busy || !text.trim()} title="Ctrl+Enter">{busy ? t.comments.sending : t.comments.send}</button>
      </div>
    </form>
  );
}
