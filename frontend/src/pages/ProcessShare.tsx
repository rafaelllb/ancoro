/**
 * Página PÚBLICA do link de revisão de processo: /share/:token — sem login, sem senha.
 * O cliente vê o processo (cada atividade ou o processo geral) e comenta se identificando por nome; a equipe vê ao vivo.
 *
 * [2026-11-10] Criado — Rafael Brito
 * Reaproveita o editor do Process Studio em MODO REVISÃO (?share=1: somente leitura + aba Comentários) dentro de um <iframe>,
 * atendido pela ponte `useProcessShare` (API pública pelo token). Nenhum JWT de quem estiver logado neste navegador é usado.
 */
import { useMemo, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useProcessShare } from '../hooks/useProcessShare'

const EDITOR_URL = import.meta.env.VITE_PROCESS_STUDIO_URL || '/process-studio/index.html'

export default function ProcessShare() {
  const { token = '' } = useParams<{ token: string }>()
  const { t, i18n } = useTranslation(['processes'])
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const { status, name } = useProcessShare(token, iframeRef)

  const src = useMemo(() => {
    const q = new URLSearchParams({ host: '1', share: '1', origin: window.location.origin, lang: i18n.language.startsWith('en') ? 'en' : 'pt' })
    return `${EDITOR_URL}?${q.toString()}`
    // idioma muda por evento da ponte; não recarregar o iframe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-2">
        <span className="font-semibold text-gray-800">Ancoro</span>
        <span className="text-gray-300">|</span>
        <span className="truncate text-sm text-gray-600" data-testid="share-title">{name || t('processes:share.pageTitle')}</span>
        <span className="ml-auto"><LanguageSwitcher /></span>
      </header>
      <main className="relative min-h-0 flex-1">
        {status === 'ready' && (
          <iframe ref={iframeRef} src={src} title={t('processes:share.pageTitle')} data-testid="process-share-editor" className="h-full w-full border-0" />
        )}
        {status === 'loading' && <div className="flex h-full items-center justify-center text-sm text-gray-500">{t('processes:share.loading')}</div>}
        {(status === 'gone' || status === 'error') && (
          <div className="flex h-full items-center justify-center p-6" role="alert">
            <div className="max-w-md text-center">
              <h1 className="text-lg font-semibold text-gray-800">{t(status === 'gone' ? 'processes:share.goneTitle' : 'processes:share.errorTitle')}</h1>
              <p className="mt-2 text-sm text-gray-500">{t(status === 'gone' ? 'processes:share.goneBody' : 'processes:share.errorBody')}</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
