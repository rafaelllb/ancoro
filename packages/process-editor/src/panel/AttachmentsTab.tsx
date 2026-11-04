/**
 * Aba "Anexos": arquivos e imagens ligados a um elemento do diagrama (repositório do processo).
 *
 * Só existe embutido no Ancoro (IS_HOST): os bytes ficam no backend e passam pela ponte RPC — o editor nunca vê o token.
 * Leitura e download funcionam também no modo somente leitura (CLIENT); enviar/excluir exigem edição.
 *
 * [2026-10-30] Criado: anexos por elemento BPMN — Rafael Brito
 */
import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { useT } from '../i18n';
import { rpc, useHost } from '../host';
import { useEditor } from '../store';

interface Att { id: string; fileName: string; mimeType: string; size: number; uploadedByName: string | null; createdAt: string; canDelete: boolean }
interface Quota { usedBytes: number; maxBytes: number; maxFileBytes: number; maxPerElement: number }

export const formatBytes = (n: number): string =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : n < 1024 ** 3 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`;

const ICON: Array<[RegExp, string]> = [[/pdf/, 'PDF'], [/word|opendocument\.text/, 'DOC'], [/sheet|excel|csv/, 'XLS'], [/presentation|powerpoint/, 'PPT'], [/json|text/, 'TXT']];
const badge = (mime: string) => ICON.find(([re]) => re.test(mime))?.[1] ?? 'FILE';

export function AttachmentsTab({ elementId }: { elementId: string }) {
  const t = useT();
  const readOnly = useEditor((s) => s.readOnly);
  const hostCanEdit = useHost((s) => s.canEdit);
  const canEdit = !readOnly && hostCanEdit;

  const [items, setItems] = useState<Att[] | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(0);
  const [over, setOver] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState<{ url: string; name: string } | null>(null);
  const requested = useRef(new Set<string>());
  const urls = useRef<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const r = await rpc<{ attachments: Att[]; quota: Quota }>('attachments.list', { elementId });
    setItems(r.attachments);
    setQuota(r.quota);
  }, [elementId]);

  // troca de elemento: descarta miniaturas (revoga as URLs de blob para não vazar memória) e recarrega
  useEffect(() => {
    let alive = true;
    setItems(null); setError(null); setPreviews({}); setZoom(null);
    requested.current.clear();
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    load().catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [load]);
  useEffect(() => () => { urls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  // miniaturas: só imagens, buscadas sob demanda uma vez
  useEffect(() => {
    for (const a of items ?? []) {
      if (!a.mimeType.startsWith('image/') || requested.current.has(a.id)) continue;
      requested.current.add(a.id);
      rpc<{ data: ArrayBuffer; mimeType: string }>('attachments.content', { id: a.id }, 60_000)
        .then((r) => {
          const url = URL.createObjectURL(new Blob([r.data], { type: r.mimeType }));
          urls.current.push(url);
          setPreviews((p) => ({ ...p, [a.id]: url }));
        })
        .catch(() => { /* sem miniatura: o item continua baixável */ });
    }
  }, [items]);

  const upload = async (files: File[]) => {
    if (!canEdit || !files.length) return;
    setError(null);
    for (const f of files) {
      if (quota && f.size > quota.maxFileBytes) {
        setError(t.files.tooBig.replace('{name}', f.name).replace('{mb}', String(Math.round(quota.maxFileBytes / 1024 / 1024))));
        continue;
      }
      setBusy((b) => b + 1);
      try {
        await rpc('attachments.upload', { elementId, name: f.name, data: await f.arrayBuffer() }, 180_000);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy((b) => b - 1);
      }
    }
    await load().catch(() => undefined);
  };

  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); void upload([...e.dataTransfer.files]); };
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files].map((f) => (f.name && f.name !== 'image.png' ? f : new File([f], `${t.files.pasted}-${Date.now()}.${f.type.split('/')[1] ?? 'png'}`, { type: f.type })));
    if (files.length) { e.preventDefault(); void upload(files); }
  };

  const remove = async (a: Att) => {
    if (!window.confirm(t.files.removeConfirm.replace('{name}', a.fileName))) return;
    try { await rpc('attachments.remove', { id: a.id }); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const download = (a: Att) => { rpc('attachments.download', { id: a.id }, 120_000).catch((e) => setError(e instanceof Error ? e.message : String(e))); };

  return (
    <div className="files" onPaste={onPaste}>
      {canEdit ? (
        <div className={`drop${over ? ' over' : ''}`} tabIndex={0}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
          {t.files.drop}{' '}
          <button type="button" className="linkbtn" onClick={() => fileInput.current?.click()}>{t.files.choose}</button>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => { void upload([...(e.target.files ?? [])]); e.target.value = ''; }} />
        </div>
      ) : <p className="fhint">{t.files.readOnlyHint}</p>}

      {busy > 0 && <p className="fhint" role="status">{t.files.uploading}</p>}
      {error && <p className="ferr" role="alert">{error}</p>}
      {items === null && !error && <p className="fhint">{t.files.loading}</p>}
      {items?.length === 0 && <p className="fhint">{t.files.none}</p>}

      <ul className="filelist">
        {items?.map((a) => (
          <li key={a.id} className="file" data-attachment={a.id}>
            {previews[a.id]
              ? <button type="button" className="thumb" title={t.files.preview} onClick={() => setZoom({ url: previews[a.id]!, name: a.fileName })}><img src={previews[a.id]} alt={a.fileName} /></button>
              : <span className="thumb ph" aria-hidden="true">{badge(a.mimeType)}</span>}
            <div className="meta">
              <strong title={a.fileName}>{a.fileName}</strong>
              <span>{formatBytes(a.size)}{a.uploadedByName ? ` · ${t.files.by} ${a.uploadedByName}` : ''} · {new Date(a.createdAt).toLocaleDateString()}</span>
            </div>
            <div className="acts">
              <button type="button" onClick={() => download(a)}>{t.files.download}</button>
              {canEdit && a.canDelete && <button type="button" className="danger" onClick={() => void remove(a)}>{t.files.remove}</button>}
            </div>
          </li>
        ))}
      </ul>

      {quota && <p className="fhint">{t.files.quota.replace('{used}', formatBytes(quota.usedBytes)).replace('{max}', formatBytes(quota.maxBytes))}</p>}
      {canEdit && <p className="fhint">{t.files.types}</p>}

      {zoom && (
        <div className="lightbox" role="dialog" aria-label={zoom.name} onClick={() => setZoom(null)} onKeyDown={(e) => e.key === 'Escape' && setZoom(null)}>
          <img src={zoom.url} alt={zoom.name} />
        </div>
      )}
    </div>
  );
}
