/**
 * Diálogo "Compartilhar para revisão": gera/copia/desativa o LINK PÚBLICO do processo (sem login, sem senha).
 *
 * [2026-11-10] Criado — Rafael Brito
 * Endereço público: o link precisa apontar para um endereço que o CLIENTE alcança. Rodando local, é a URL do túnel
 * (ex.: encaminhamento de porta "Público" do VS Code) — por isso o campo é editável e lembrado neste navegador.
 * Padrão: VITE_PUBLIC_APP_URL, senão a origem atual.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { processCommentsAPI, type ProcessShareLinkInfo } from '../services/api'

const ORIGIN_KEY = 'ancoro.share.publicOrigin'
const defaultOrigin = () => {
  try { const v = localStorage.getItem(ORIGIN_KEY); if (v) return v } catch { /* storage bloqueado */ }
  return (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined) || window.location.origin
}
/** aceita só http(s) e devolve sem barra final (evita "//share") */
const cleanOrigin = (v: string): string | null => {
  try {
    const u = new URL(v.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? `${u.origin}${u.pathname.replace(/\/+$/, '')}` : null
  } catch { return null }
}

interface Props { projectId: string; processId: string; processName: string; onClose: () => void }

export default function ShareProcessDialog({ projectId, processId, processName, onClose }: Props) {
  const { t } = useTranslation(['processes'])
  const [info, setInfo] = useState<ProcessShareLinkInfo | null>(null)
  const [busy, setBusy] = useState(false)
  const [origin, setOrigin] = useState(defaultOrigin)
  const base = cleanOrigin(origin)
  const link = useMemo(() => (info?.enabled && info.token && base ? `${base}/share/${info.token}` : ''), [info, base])
  const isLocal = !!base && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)

  useEffect(() => {
    let alive = true
    processCommentsAPI.getShare(projectId, processId).then((r) => { if (alive) setInfo(r.data) }, () => { if (alive) toast.error(t('processes:share.loadError')) })
    return () => { alive = false }
  }, [projectId, processId, t])

  const act = async (fn: () => Promise<{ data: ProcessShareLinkInfo }>, ok?: string) => {
    setBusy(true)
    try { setInfo((await fn()).data); if (ok) toast.success(ok) } catch { toast.error(t('processes:share.actionError')) } finally { setBusy(false) }
  }
  const saveOrigin = (v: string) => { setOrigin(v); const c = cleanOrigin(v); if (c) try { localStorage.setItem(ORIGIN_KEY, c) } catch { /* só não lembra */ } }
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.success(t('processes:share.copied')) } catch { toast.error(t('processes:share.copyError')) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" data-testid="share-dialog">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">{t('processes:share.title')}</h2>
        <p className="mt-1 text-sm text-gray-600">{t('processes:share.body', { name: processName })}</p>
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('processes:share.warning')}</p>

        <label className="mt-4 block text-sm font-medium text-gray-700">
          {t('processes:share.publicOrigin')}
          <input value={origin} onChange={(e) => saveOrigin(e.target.value)} data-testid="share-origin" spellCheck={false}
            className={`mt-1 w-full rounded-lg border px-3 py-2 font-mono text-xs ${base ? 'border-gray-300' : 'border-red-400'}`} />
        </label>
        <p className={`mt-1 text-xs ${isLocal ? 'text-amber-700' : 'text-gray-500'}`}>{isLocal ? t('processes:share.localWarning') : t('processes:share.publicOriginHint')}</p>

        {info === null ? (
          <p className="mt-4 text-sm text-gray-500">{t('processes:share.loading')}</p>
        ) : info.enabled && info.token ? (
          <div className="mt-4">
            <div className="flex gap-2">
              <input readOnly value={link} data-testid="share-link" onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs" />
              <button type="button" onClick={() => void copy()} disabled={!link} data-testid="share-copy"
                className="rounded-lg bg-ancoro-teal-500 px-3 py-2 text-sm text-white hover:bg-ancoro-teal-600 disabled:opacity-50">{t('processes:share.copy')}</button>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs">
              {link && <a href={link} target="_blank" rel="noopener noreferrer" className="text-ancoro-navy-600 hover:underline">{t('processes:share.openLink')}</a>}
              {info.canShare && (
                <>
                  <button type="button" disabled={busy} data-testid="share-regenerate" className="text-ancoro-navy-600 hover:underline disabled:opacity-50"
                    onClick={() => { if (window.confirm(t('processes:share.regenerateConfirm'))) void act(() => processCommentsAPI.enableShare(projectId, processId, true), t('processes:share.regenerated')) }}>
                    {t('processes:share.regenerate')}
                  </button>
                  <button type="button" disabled={busy} data-testid="share-disable" className="text-red-600 hover:underline disabled:opacity-50"
                    onClick={() => void act(() => processCommentsAPI.disableShare(projectId, processId), t('processes:share.disabled'))}>
                    {t('processes:share.disable')}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-gray-600">{info.canShare ? t('processes:share.none') : t('processes:share.noPermission')}</p>
            {info.canShare && (
              <button type="button" disabled={busy} data-testid="share-enable" onClick={() => void act(() => processCommentsAPI.enableShare(projectId, processId))}
                className="mt-3 rounded-lg bg-ancoro-teal-500 px-4 py-2 text-sm text-white hover:bg-ancoro-teal-600 disabled:opacity-50">{t('processes:share.enable')}</button>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} data-testid="share-close" className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">{t('processes:share.close')}</button>
        </div>
      </div>
    </div>
  )
}
