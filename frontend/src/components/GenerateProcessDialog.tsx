/**
 * Diálogo "Gerar processo a partir de requisitos" (Process Studio).
 *
 * [2026-10-27] Criado: escolhe requisitos + visão (AS-IS/TO-BE) + nome; o backend gera um RASCUNHO (raias por ator, decisões,
 * subprocessos) e o usuário o revisa no editor — Rafael Brito
 * Decisões:
 * - Lista até 200 requisitos do projeto com busca local; "Selecionar sem processo" usa a análise de cobertura já carregada.
 * - [2026-10-27] Não exibe motor/modelo/fornecedor de IA; só o controle neutro "apenas regras (sem IA)" quando a IA está habilitada no servidor.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { processesAPI } from '../services/api'
import { useGenerateProcess, useGenerationInfo } from '../hooks/useProcesses'

const MAX = 25

interface Props {
  projectId: string
  uncoveredIds: ReadonlySet<string>
  onClose: () => void
  /** chamado com o id do processo principal criado */
  onGenerated: (processId: string) => void
}

export default function GenerateProcessDialog({ projectId, uncoveredIds, onClose, onGenerated }: Props) {
  const { t } = useTranslation(['processes', 'common'])
  const { data: info } = useGenerationInfo(projectId)
  const generate = useGenerateProcess(projectId)
  const { data: reqs = [], isLoading, isError } = useQuery({
    queryKey: ['processes', projectId, 'gen-reqs'],
    queryFn: async () => (await processesAPI.searchRequirements(projectId, '', 200)).data.requirements,
    enabled: !!projectId,
  })
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [view, setView] = useState<'TO_BE' | 'AS_IS'>('TO_BE')
  const [name, setName] = useState('')
  const [forceRules, setForceRules] = useState(false)

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? reqs.filter((r) => r.reqId.toLowerCase().includes(s) || r.shortDesc.toLowerCase().includes(s)) : reqs
  }, [reqs, q])

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < MAX ? [...p, id] : p))
  const pickUncovered = () => setPicked(reqs.filter((r) => uncoveredIds.has(r.id)).slice(0, MAX).map((r) => r.id))

  const submit = async () => {
    const r = await generate.mutateAsync({ requirementIds: picked, view, name: name.trim() || undefined, engine: forceRules ? 'deterministic' : 'auto' })
    onGenerated(r.process.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" data-testid="generate-dialog">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">{t('processes:generate.title')}</h2>
        <p className="mt-1 text-sm text-gray-600">{t('processes:generate.body')}</p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-300 text-sm" role="group" aria-label={t('processes:generate.view')}>
            {(['TO_BE', 'AS_IS'] as const).map((v) => (
              <button key={v} type="button" data-view={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 ${view === v ? 'bg-ancoro-navy-800 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                {v === 'TO_BE' ? 'TO-BE' : 'AS-IS'}
              </button>
            ))}
          </div>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} placeholder={t('processes:generate.namePlaceholder')}
            data-testid="generate-name" className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('processes:generate.search')} data-testid="generate-search"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
          <button type="button" onClick={pickUncovered} disabled={!uncoveredIds.size} data-testid="generate-pick-uncovered"
            className="whitespace-nowrap text-xs text-ancoro-navy-600 hover:underline disabled:opacity-40">{t('processes:generate.pickUncovered')}</button>
          <button type="button" onClick={() => setPicked([])} disabled={!picked.length} className="text-xs text-gray-500 hover:underline disabled:opacity-40">{t('processes:generate.clear')}</button>
        </div>

        <ul className="mt-2 min-h-[8rem] flex-1 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 text-sm" data-testid="generate-list">
          {isLoading && <li className="text-gray-400">{t('common:states.loading')}</li>}
          {/* [2026-10-27] estados vazio/erro explícitos: lista em branco parecia "nada acontece" */}
          {isError && <li className="text-red-600" data-testid="generate-error">{t('processes:generate.loadError')}</li>}
          {!isLoading && !isError && reqs.length === 0 && <li className="text-gray-500" data-testid="generate-empty">{t('processes:generate.noRequirements')}</li>}
          {!isLoading && !isError && reqs.length > 0 && shown.length === 0 && <li className="text-gray-500">{t('processes:generate.noMatch')}</li>}
          {shown.map((r) => (
            <li key={r.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-gray-50">
                <input type="checkbox" className="mt-1" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} data-req={r.reqId} />
                <span className="font-mono text-xs font-semibold">{r.reqId}</span>
                <span className="min-w-0 flex-1 truncate text-gray-700">{r.shortDesc}</span>
                {uncoveredIds.has(r.id) && <span className="rounded bg-amber-100 px-1.5 text-[11px] text-amber-800">{t('processes:generate.noProcess')}</span>}
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-gray-500">{t('processes:generate.selected', { count: picked.length, max: MAX })}</p>

        {/* [2026-10-27] Alterado: sem aviso de motor/modelo/fornecedor na tela (não expor a tecnologia ao cliente); fica só o controle neutro de
            privacidade — quem não quer que o texto dos requisitos saia do servidor marca "apenas regras" — Rafael Brito */}
        {info?.llm && (
          <label className="mt-3 flex items-center gap-2 text-xs text-gray-500" data-testid="generate-engine">
            <input type="checkbox" checked={forceRules} onChange={(e) => setForceRules(e.target.checked)} />
            {t('processes:generate.forceRules')}
          </label>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={generate.isPending} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">{t('processes:generate.cancel')}</button>
          <button type="button" onClick={() => void submit()} disabled={!picked.length || generate.isPending} data-testid="generate-confirm"
            className="rounded-lg bg-ancoro-teal-500 px-4 py-2 text-sm text-white hover:bg-ancoro-teal-600 disabled:opacity-50">
            {generate.isPending ? t('processes:generate.generating') : t('processes:generate.confirm')}
          </button>
        </div>
        <div className="mt-1 text-right text-xs text-gray-400">
          {!picked.length && reqs.length > 0 ? t('processes:generate.pickHint') : ''}
        </div>
      </div>
    </div>
  )
}
