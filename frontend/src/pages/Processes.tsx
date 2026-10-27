/**
 * Processes Page — Process Studio dentro do Ancoro (Fase 4).
 *
 * Lista os processos BPMN do projeto e embute o editor (iframe) para visualizar/editar. O iframe isola o CSS do editor do
 * Tailwind do Ancoro; o token JWT NUNCA entra nele — toda chamada de API passa pela ponte (useProcessStudioBridge).
 * Rotas: /processes e /processes/:processId.
 *
 * [2026-10-15] Criado: Fase 4 / etapa 3 — docs/process-studio/README.md §6.4 — Rafael Brito
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useCurrentProject } from '../hooks/useProjects'
import { useCapabilities } from '../hooks/useCapabilities'
import {
  useCreateProcess, useDeleteProcess, useExportBpmn, useImportProcesses, useProcessCoverage, useProcesses,
  useProcessStudioBridge, usePublishPortal,
} from '../hooks/useProcesses'
import ProjectSwitcher from '../components/ProjectSwitcher'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ConfirmDialog from '../components/ConfirmDialog'
import type { ProcessSummary } from '../services/api'

/** URL do editor compilado (npm run build:process-studio gera em public/process-studio). Sobrescrevível para apontar a outro host. */
const EDITOR_URL = import.meta.env.VITE_PROCESS_STUDIO_URL || '/process-studio/index.html'
/** Se o editor não disser "ready" neste prazo, assumimos que não está instalado (o dev server serviria a SPA do Ancoro no lugar). */
const EDITOR_TIMEOUT_MS = 8000

export default function Processes() {
  const { t, i18n } = useTranslation(['processes', 'nav', 'common'])
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { processId } = useParams<{ processId?: string }>()
  const { currentProject, projects, setCurrentProject } = useCurrentProject()
  const projectId = currentProject?.id || ''
  const { canViewProcesses, canEditProcesses, canPublishProcesses } = useCapabilities()

  const { data, isLoading } = useProcesses(projectId)
  const { data: coverage } = useProcessCoverage(projectId)
  const createMutation = useCreateProcess(projectId)
  const deleteMutation = useDeleteProcess(projectId)
  const importMutation = useImportProcesses(projectId)
  const exportMutation = useExportBpmn(projectId)
  const publishMutation = usePublishPortal(projectId)

  const processes = data?.processes ?? []
  const current = processes.find((p) => p.id === processId)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [newName, setNewName] = useState('')
  const [toDelete, setToDelete] = useState<ProcessSummary | null>(null)
  const [showUncovered, setShowUncovered] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishLabel, setPublishLabel] = useState('')
  const [publishPassword, setPublishPassword] = useState('')
  const [timedOut, setTimedOut] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Confirma antes de trocar de processo/sair quando o editor tem alterações não salvas.
  const [listOpen, setListOpen] = useState(() => { try { return localStorage.getItem('ancoro.processes.listOpen') !== '0' } catch { return true } })
  const toggleList = (open: boolean) => {
    setListOpen(open)
    try { localStorage.setItem('ancoro.processes.listOpen', open ? '1' : '0') } catch { /* preferência é só conveniência */ }
  }
  const confirmLeave = (dirty: boolean) => !dirty || window.confirm(t('processes:list.unsavedConfirm'))

  const { ready, dirty } = useProcessStudioBridge({
    projectId,
    processId: processId ?? '',
    iframe: iframeRef,
    onNavigate: ({ key, processId: pid }) => {
      const target = pid ? { id: pid } : processes.find((p) => p.key === key)
      if (target) navigate(`/processes/${target.id}`)
    },
  })
  const open = (id: string) => { if (id !== processId && confirmLeave(dirty)) navigate(`/processes/${id}`) }

  // Aviso de fechar a aba com alterações não salvas
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // Detecta editor ausente (ver EDITOR_TIMEOUT_MS)
  useEffect(() => {
    setTimedOut(false)
    if (!processId || ready) return
    const h = setTimeout(() => setTimedOut(true), EDITOR_TIMEOUT_MS)
    return () => clearTimeout(h)
  }, [processId, ready])

  const src = useMemo(() => {
    if (!processId) return ''
    const q = new URLSearchParams({ host: '1', origin: window.location.origin, pid: processId, lang: i18n.language.startsWith('en') ? 'en' : 'pt' })
    return `${EDITOR_URL}?${q.toString()}`
    // o idioma é atualizado depois por evento (ponte); não recarregar o iframe ao trocar de idioma
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processId])

  if (!canViewProcesses) return <Navigate to="/dashboard" replace />

  const create = async () => {
    const name = newName.trim()
    if (!name) return
    const p = await createMutation.mutateAsync(name)
    setNewName('')
    navigate(`/processes/${p.id}`)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    const r = await importMutation.mutateAsync(file)
    if (r.processes[0]) navigate(`/processes/${r.processes[0].id}`)
  }

  const publish = async () => {
    await publishMutation.mutateAsync({ label: publishLabel.trim() || undefined, password: publishPassword || undefined })
    setPublishOpen(false)
    setPublishLabel('')
    setPublishPassword('')
  }

  const passwordTooShort = publishPassword.length > 0 && publishPassword.length < 6

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t('processes:title')}</h1>
              <p className="text-xs text-gray-500 mt-0.5">{t('processes:subtitle')}</p>
            </div>
            <div className="hidden min-w-0 sm:block">
              <ProjectSwitcher projects={projects} currentProject={currentProject} onProjectChange={setCurrentProject} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            {canPublishProcesses && processes.length > 0 && (
              <button
                type="button"
                data-testid="publish-open"
                onClick={() => setPublishOpen(true)}
                className="px-4 py-2 text-sm text-white bg-ancoro-teal-500 hover:bg-ancoro-teal-600 rounded-lg"
              >
                {t('processes:publish.button')}
              </button>
            )}
            <Link
              to="/dashboard"
              onClick={(e) => { if (!confirmLeave(dirty)) e.preventDefault() }}
              className="px-4 py-2 text-sm text-ancoro-navy-600 hover:text-ancoro-navy-700 border border-ancoro-navy-300 rounded-lg hover:bg-ancoro-navy-50"
            >
              {t('nav:requirementsLink')}
            </Link>
            <LanguageSwitcher />
            <span className="text-sm text-gray-600 hidden lg:inline">{user?.name} ({user?.role})</span>
            <button
              onClick={logout}
              className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {t('nav:logout')}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ===== Lista + cobertura ===== */}
        {/* [2026-10-27] Criado: lista recolhível (seta na própria coluna, sem botão extra na barra do editor); preferência lembrada — Rafael Brito */}
        {!listOpen && (
          <aside className="w-8 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col items-center pt-3" aria-label={t('processes:list.title')}>
            <button type="button" data-testid="list-expand" onClick={() => toggleList(true)} title={t('processes:list.expand')} aria-label={t('processes:list.expand')} aria-expanded={false}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800">
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4l6 6-6 6" /></svg>
            </button>
          </aside>
        )}
        <aside className={`${listOpen ? 'w-80' : 'hidden'} flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-4 space-y-5`} aria-label={t('processes:list.title')}>
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('processes:list.title')}</h2>
              <button type="button" data-testid="list-collapse" onClick={() => toggleList(false)} title={t('processes:list.collapse')} aria-label={t('processes:list.collapse')} aria-expanded
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800">
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4l-6 6 6 6" /></svg>
              </button>
            </div>
            {isLoading && <p className="text-sm text-gray-400">{t('common:states.loading')}</p>}
            {!isLoading && processes.length === 0 && <p className="text-sm text-gray-500" data-testid="processes-empty">{t('processes:list.empty')}</p>}
            <ul className="space-y-1.5" data-testid="process-list">
              {processes.map((p) => (
                <li key={p.id} data-process-key={p.key}>
                  <div className={`group rounded-lg border px-3 py-2 text-sm ${p.id === processId ? 'border-ancoro-teal-400 bg-ancoro-teal-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                    <button type="button" onClick={() => open(p.id)} className="block w-full text-left" data-action="open-process">
                      <span className="block truncate font-medium text-gray-900">{p.name}</span>
                      <span className="block text-xs text-gray-500">
                        {t('processes:list.links', { count: p.linkCount })} · {t('processes:list.revision', { rev: p.rev })}
                      </span>
                    </button>
                    <div className="mt-1 flex gap-3 text-xs">
                      <button type="button" className="text-ancoro-navy-600 hover:underline" onClick={() => exportMutation.mutate({ id: p.id, key: p.key })}>
                        {t('processes:list.export')}
                      </button>
                      {p.canDelete && (
                        <button type="button" data-action="delete-process" className="text-red-600 hover:underline" onClick={() => setToDelete(p)}>
                          {t('processes:list.delete')}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {canEditProcesses && (
              <div className="mt-3 space-y-2">
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void create() }}>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={t('processes:list.newPlaceholder')}
                    maxLength={200}
                    data-testid="new-process-name"
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                  />
                  <button type="submit" disabled={!newName.trim() || createMutation.isPending} data-testid="new-process-create"
                    className="rounded-lg bg-ancoro-navy-800 px-3 py-1.5 text-sm text-white hover:bg-ancoro-navy-700 disabled:opacity-50">
                    {t('processes:list.create')}
                  </button>
                </form>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  {t('processes:list.import')}
                </button>
                <input ref={fileRef} type="file" accept=".bpm,.bpmn,.xml" hidden data-testid="import-file"
                  onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
              </div>
            )}
          </section>

          {/* Análise de lacunas: requisitos que ainda não aparecem em nenhum processo */}
          {coverage && coverage.total > 0 && (
            <section data-testid="coverage">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{t('processes:coverage.title')}</h2>
              <div className="mb-2 h-2 overflow-hidden rounded-full bg-gray-200" role="progressbar" aria-valuenow={coverage.covered} aria-valuemax={coverage.total}>
                <div className="h-full bg-ancoro-teal-500" style={{ width: `${(coverage.covered / coverage.total) * 100}%` }} />
              </div>
              <p className="text-sm text-gray-700" data-testid="coverage-summary">{t('processes:coverage.summary', { covered: coverage.covered, total: coverage.total })}</p>
              {coverage.uncovered.length === 0 ? (
                <p className="mt-1 text-xs text-green-700">{t('processes:coverage.allCovered')}</p>
              ) : (
                <>
                  <button type="button" className="mt-1 text-xs text-ancoro-navy-600 hover:underline" onClick={() => setShowUncovered((v) => !v)}>
                    {t('processes:coverage.uncovered', { count: coverage.uncovered.length })} — {showUncovered ? t('processes:coverage.hide') : t('processes:coverage.show')}
                  </button>
                  {showUncovered && (
                    <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs" data-testid="uncovered-list">
                      {coverage.uncovered.map((r) => (
                        <li key={r.id} className="rounded border border-gray-200 px-2 py-1">
                          <span className="font-mono font-semibold">{r.reqId}</span> <span className="text-gray-600">{r.shortDesc}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          )}
        </aside>

        {/* ===== Editor embutido ===== */}
        <main className="relative min-w-0 flex-1 bg-gray-100">
          {!processId || (!current && !isLoading) ? (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{t('processes:select.title')}</h2>
                <p className="mt-1 text-sm text-gray-500">{t('processes:select.body')}</p>
              </div>
            </div>
          ) : (
            <>
              <iframe
                key={processId}
                ref={iframeRef}
                src={src}
                title={t('processes:editor.title')}
                data-testid="process-editor"
                className="h-full w-full border-0 bg-white"
              />
              {!ready && !timedOut && <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-gray-500">{t('processes:editor.loading')}</div>}
              {!ready && timedOut && (
                <div className="absolute inset-0 flex items-center justify-center bg-white p-6 text-center text-sm text-red-700" data-testid="editor-missing">{t('processes:editor.missing')}</div>
              )}
            </>
          )}
        </main>
      </div>

      <ConfirmDialog
        isOpen={!!toDelete}
        title={t('processes:delete.title')}
        message={t('processes:delete.message', { name: toDelete?.name ?? '' })}
        confirmText={t('processes:delete.confirm')}
        cancelText={t('processes:delete.cancel')}
        isLoading={deleteMutation.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (!toDelete) return
          const id = toDelete.id
          deleteMutation.mutate(id, { onSuccess: () => { setToDelete(null); if (id === processId) navigate('/processes') } })
        }}
      />

      {publishOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" data-testid="publish-dialog">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">{t('processes:publish.title')}</h2>
            <p className="mt-1 text-sm text-gray-600">{t('processes:publish.body')}</p>
            <label className="mt-4 block text-sm font-medium text-gray-700">
              {t('processes:publish.label')}
              <input value={publishLabel} onChange={(e) => setPublishLabel(e.target.value)} maxLength={120} placeholder={t('processes:publish.labelPlaceholder')}
                data-testid="publish-label" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="mt-3 block text-sm font-medium text-gray-700">
              {t('processes:publish.password')}
              <input type="password" value={publishPassword} onChange={(e) => setPublishPassword(e.target.value)} maxLength={200} autoComplete="new-password"
                data-testid="publish-password" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <p className={`mt-1 text-xs ${passwordTooShort ? 'text-red-600' : 'text-gray-500'}`}>{t('processes:publish.passwordHint')}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setPublishOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">{t('processes:publish.cancel')}</button>
              <button type="button" data-testid="publish-confirm" onClick={() => void publish()} disabled={publishMutation.isPending || passwordTooShort}
                className="rounded-lg bg-ancoro-teal-500 px-4 py-2 text-sm text-white hover:bg-ancoro-teal-600 disabled:opacity-50">{t('processes:publish.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
