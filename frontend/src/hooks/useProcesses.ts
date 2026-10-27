/**
 * Hooks do Process Studio (Fase 4): lista/cobertura/vínculos + mutations + a PONTE com o editor embutido (iframe).
 *
 * A ponte é o único lugar que fala com o iframe: o editor nunca recebe o token JWT; ele pede "carregar/salvar/buscar" por
 * postMessage e esta camada executa via services/api.ts (README Process Studio §6.4, decisão 1; protocolo em
 * packages/process-editor/src/host.ts).
 *
 * [2026-10-15] Criado: Fase 4 / etapa 3 — Rafael Brito
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { processesAPI } from '../services/api'

const KEY = 'processes'
export const processKeys = {
  list: (projectId: string) => [KEY, projectId, 'list'] as const,
  coverage: (projectId: string) => [KEY, projectId, 'coverage'] as const,
  forRequirement: (projectId: string, requirementId: string) => [KEY, projectId, 'req', requirementId] as const,
  all: (projectId: string) => [KEY, projectId] as const,
}

export function useProcesses(projectId: string) {
  return useQuery({
    queryKey: processKeys.list(projectId),
    queryFn: async () => (await processesAPI.list(projectId)).data,
    enabled: !!projectId,
  })
}

export function useProcessCoverage(projectId: string) {
  return useQuery({
    queryKey: processKeys.coverage(projectId),
    queryFn: async () => (await processesAPI.coverage(projectId)).data,
    enabled: !!projectId,
  })
}

/** "Em quais processos este requisito aparece?" (aba Processos do requisito) */
export function useRequirementProcesses(projectId: string, requirementId: string | null) {
  return useQuery({
    queryKey: processKeys.forRequirement(projectId, requirementId ?? ''),
    queryFn: async () => (await processesAPI.forRequirement(projectId, requirementId!)).data.links,
    enabled: !!projectId && !!requirementId,
  })
}

const errorMessage = (e: unknown, fallback: string): string =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback

export function useCreateProcess(projectId: string) {
  const qc = useQueryClient()
  const { t } = useTranslation('processes')
  return useMutation({
    mutationFn: async (name: string) => (await processesAPI.create(projectId, { name })).data,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: processKeys.all(projectId) }) },
    onError: (e) => toast.error(errorMessage(e, t('errors.create'))),
  })
}

export function useDeleteProcess(projectId: string) {
  const qc = useQueryClient()
  const { t } = useTranslation('processes')
  return useMutation({
    mutationFn: async (processId: string) => { await processesAPI.remove(projectId, processId) },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: processKeys.all(projectId) }); toast.success(t('toast.deleted')) },
    onError: (e) => toast.error(errorMessage(e, t('errors.delete'))),
  })
}

/** Lê o arquivo (.bpm/.bpmn) como base64 e importa; devolve os processos criados e avisos do import */
export function useImportProcesses(projectId: string) {
  const qc = useQueryClient()
  const { t } = useTranslation('processes')
  return useMutation({
    mutationFn: async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let bin = ''
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const kind = file.name.toLowerCase().endsWith('.bpm') ? 'bpm' : 'bpmn'
      return (await processesAPI.importFile(projectId, { kind, data: btoa(bin) })).data
    },
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: processKeys.all(projectId) })
      toast.success(t('toast.imported', { count: r.processes.length }))
      if (r.warnings.length) toast(t('toast.importWarnings', { count: r.warnings.length }), { icon: '⚠️' })
    },
    onError: (e) => toast.error(errorMessage(e, t('errors.import'))),
  })
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function usePublishPortal(projectId: string) {
  const qc = useQueryClient()
  const { t } = useTranslation('processes')
  return useMutation({
    mutationFn: async (data: { label?: string; password?: string }) => {
      const r = await processesAPI.publish(projectId, data)
      const n = r.headers['x-portal-publish-count'] ?? '1'
      downloadBlob(r.data, `portal-processos-v${n}.zip`)
      return Number(n)
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: processKeys.all(projectId) }); toast.success(t('toast.published')) },
    onError: (e) => toast.error(errorMessage(e, t('errors.publish'))),
  })
}

export function useExportBpmn(projectId: string) {
  const { t } = useTranslation('processes')
  return useMutation({
    mutationFn: async (p: { id: string; key: string }) => downloadBlob((await processesAPI.exportBpmn(projectId, p.id)).data, `${p.key}.bpmn`),
    onError: (e) => toast.error(errorMessage(e, t('errors.export'))),
  })
}

// ---------------------------------------------------------------- ponte com o editor (iframe)

interface BridgeOptions {
  projectId: string
  processId: string
  iframe: RefObject<HTMLIFrameElement>
  /** o editor pediu para abrir outro processo (drill-down por chave do modelo, ou o id de uma cópia recém-criada) */
  onNavigate: (target: { key?: string; processId?: string }) => void
}

interface RpcRequest { ps: 1; kind: 'req'; id: number; type: string; payload?: any }

/**
 * Atende os pedidos do editor embutido. Só aceita mensagens do PRÓPRIO iframe e da mesma origem do Ancoro.
 * Devolve `ready` (editor respondeu "ready" — se nunca vier, o editor não está instalado) e `dirty` (alterações não salvas).
 */
export function useProcessStudioBridge({ projectId, processId, iframe, onNavigate }: BridgeOptions) {
  const qc = useQueryClient()
  const { i18n } = useTranslation()
  const [ready, setReady] = useState(false)
  const [dirty, setDirty] = useState(false)
  const nav = useRef(onNavigate)
  nav.current = onNavigate

  useEffect(() => { setReady(false); setDirty(false) }, [processId])

  useEffect(() => {
    const reply = (id: number, body: { ok: true; data: unknown } | { ok: false; error: { status: number; message: string; data?: unknown } }) =>
      iframe.current?.contentWindow?.postMessage({ ps: 1, kind: 'res', id, ...body }, window.location.origin)
    const sendLang = () => iframe.current?.contentWindow?.postMessage({ ps: 1, kind: 'event', type: 'lang', payload: { lang: i18n.language.startsWith('en') ? 'en' : 'pt' } }, window.location.origin)

    const run = async (type: string, p: any): Promise<unknown> => {
      switch (type) {
        case 'process.load': return (await processesAPI.get(projectId, processId)).data
        case 'process.save': {
          const r = (await processesAPI.save(projectId, processId, { baseRev: p.baseRev, model: p.model })).data
          void qc.invalidateQueries({ queryKey: processKeys.all(projectId) })
          return r
        }
        case 'process.saveAs': {
          const r = (await processesAPI.create(projectId, { name: p.name, model: p.model })).data
          void qc.invalidateQueries({ queryKey: processKeys.all(projectId) })
          return r
        }
        case 'versions.list': return (await processesAPI.listVersions(projectId, processId)).data
        case 'versions.snapshot': return (await processesAPI.snapshot(projectId, processId, p?.label)).data
        // [2026-10-19] Alterado: 'versions.restore' (gravava nova versão sozinho) -> 'versions.get' (só leitura).
        // O editor carrega o conteúdo como rascunho e o usuário salva manualmente — Rafael Brito
        case 'versions.get': return (await processesAPI.getVersion(projectId, processId, p.version)).data
        case 'requirements.search': return (await processesAPI.searchRequirements(projectId, p?.q ?? '')).data
        default: throw Object.assign(new Error(`unknown request: ${type}`), { status: 400 })
      }
    }

    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.current?.contentWindow || e.origin !== window.location.origin) return
      const d = e.data as RpcRequest | { ps: 1; kind: 'event'; type: string; payload?: any }
      if (d?.ps !== 1) return
      if (d.kind === 'event') {
        if (d.type === 'ready') { setReady(true); sendLang() }
        else if (d.type === 'dirty') setDirty(!!d.payload?.dirty)
        else if (d.type === 'navigate') nav.current({ key: d.payload?.key, processId: d.payload?.processId })
        return
      }
      if (d.kind !== 'req') return
      run(d.type, d.payload).then(
        (data) => reply(d.id, { ok: true, data }),
        (err: any) => reply(d.id, {
          ok: false,
          error: {
            status: err?.response?.status ?? err?.status ?? 500,
            message: err?.response?.data?.message ?? err?.message ?? 'error',
            data: err?.response?.data,
          },
        }),
      )
    }
    window.addEventListener('message', onMessage)
    i18n.on('languageChanged', sendLang)
    return () => { window.removeEventListener('message', onMessage); i18n.off('languageChanged', sendLang) }
  }, [projectId, processId, iframe, qc, i18n])

  return { ready, dirty }
}
