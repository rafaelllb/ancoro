/**
 * Ponte do editor (iframe) no LINK PÚBLICO de revisão: atende o mesmo protocolo RPC do Process Studio, mas pela API pública
 * (token do link, sem login). Só o que um revisor pode fazer: ler o processo e os comentários, e comentar.
 *
 * [2026-11-10] Criado: o cliente valida o processo pelo link e todos acompanham ao vivo — Rafael Brito
 * "Ao vivo": consulta /state a cada POLL_MS (pausa com a aba em segundo plano). Mudou o carimbo dos comentários => avisa
 * `comments.changed`; mudou a revisão do processo (alguém salvou) => avisa `process.changed`. Link desativado => `gone`.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { publicShareAPI, type PublicShareProcess } from '../services/api'

const POLL_MS = 4000

export type ShareStatus = 'loading' | 'ready' | 'gone' | 'error'

interface RpcRequest { ps: 1; kind: 'req'; id: number; type: string; payload?: any }
const statusOf = (e: any): number => e?.response?.status ?? e?.status ?? 0

export function useProcessShare(token: string, iframe: RefObject<HTMLIFrameElement>) {
  const { i18n } = useTranslation()
  const [status, setStatus] = useState<ShareStatus>('loading')
  const [name, setName] = useState('')
  const first = useRef<PublicShareProcess | null>(null)
  const last = useRef<{ rev: number; stamp: string } | null>(null)

  // 1) confere o link antes de montar o editor (link inválido não deve nem carregar o iframe)
  useEffect(() => {
    let alive = true
    setStatus('loading')
    publicShareAPI.get(token).then(
      (r) => {
        if (!alive) return
        first.current = r.data
        last.current = { rev: r.data.process.rev, stamp: r.data.stamp }
        setName(r.data.process.name)
        setStatus('ready')
      },
      (e) => { if (alive) setStatus(statusOf(e) === 404 ? 'gone' : 'error') },
    )
    return () => { alive = false }
  }, [token])

  // 2) RPC do editor
  useEffect(() => {
    if (status !== 'ready') return
    const post = (msg: Record<string, unknown>) => iframe.current?.contentWindow?.postMessage({ ps: 1, ...msg }, window.location.origin)
    const sendLang = () => post({ kind: 'event', type: 'lang', payload: { lang: i18n.language.startsWith('en') ? 'en' : 'pt' } })
    const forbidden = () => Object.assign(new Error('not available in review mode'), { status: 403 })

    const run = async (type: string, p: any): Promise<unknown> => {
      switch (type) {
        case 'process.load': {
          // primeira carga reaproveita o que já veio na conferência do link; recargas (process.changed) buscam de novo
          const d = first.current ?? (await publicShareAPI.get(token)).data
          first.current = null
          setName(d.process.name)
          return { id: 'share', key: (d.process.model as { id?: string })?.id ?? 'share', rev: d.process.rev, model: d.process.model, permissions: { canEdit: false, canPublish: false } }
        }
        case 'comments.list': {
          const r = (await publicShareAPI.comments(token)).data
          return { comments: r.comments, permissions: { canComment: true, canModerate: false, share: true } }
        }
        case 'comments.add':
          return (await publicShareAPI.add(token, {
            elementId: String(p.elementId), type: p.type, content: String(p.content), parentId: p.parentId,
            authorName: String(p.authorName ?? ''), authorEmail: p.authorEmail ? String(p.authorEmail) : undefined,
          })).data
        default: throw forbidden()
      }
    }

    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.current?.contentWindow || e.origin !== window.location.origin) return
      const d = e.data as RpcRequest | { ps: 1; kind: 'event'; type: string }
      if (d?.ps !== 1) return
      if (d.kind === 'event') { if (d.type === 'ready') sendLang(); return } // 'navigate' (drill-down) não se aplica ao link
      if (d.kind !== 'req') return
      run(d.type, d.payload).then(
        (data) => post({ kind: 'res', id: d.id, ok: true, data }),
        (err: any) => post({
          kind: 'res', id: d.id, ok: false,
          error: { status: statusOf(err) || 500, message: err?.response?.data?.message ?? err?.message ?? 'error', data: err?.response?.data },
        }),
      )
    }
    window.addEventListener('message', onMessage)
    i18n.on('languageChanged', sendLang)

    // 3) ao vivo
    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false
    const tick = async () => {
      if (stopped) return
      if (!document.hidden) {
        try {
          const s = (await publicShareAPI.state(token)).data
          const prev = last.current
          last.current = s
          if (prev && s.rev !== prev.rev) post({ kind: 'event', type: 'process.changed' })
          if (prev && s.stamp !== prev.stamp) post({ kind: 'event', type: 'comments.changed' })
        } catch (e) {
          if (statusOf(e) === 404) { stopped = true; setStatus('gone'); return } // link desativado durante a visita
        }
      }
      timer = setTimeout(() => void tick(), POLL_MS)
    }
    timer = setTimeout(() => void tick(), POLL_MS)
    // voltou para a aba: atualiza já, sem esperar o próximo ciclo
    const onVisible = () => { if (!document.hidden) { clearTimeout(timer); void tick() } }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      stopped = true
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      document.removeEventListener('visibilitychange', onVisible)
      i18n.off('languageChanged', sendLang)
    }
  }, [status, token, iframe, i18n])

  return { status, name }
}
