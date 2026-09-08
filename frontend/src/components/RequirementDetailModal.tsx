/**
 * RequirementDetailModal — Modal centralizado de leitura e edição completa
 *
 * Aberto ao clicar no ícone de olho que aparece no hover de cada linha da tabela.
 * Exibe todos os campos do requisito em abas organizadas, com 900px de largura,
 * proporcionando leitura e edição confortável sem necessidade de scroll horizontal.
 *
 * Tabs: [🗂️ Detalhes] [📋 5W2H] [💬 Comentários] [📜 Histórico]
 *
 * @author Rafael Brito
 */

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { Requirement, Comment } from '../services/api'
import { useUpdateRequirement, useCreateConnection, useDeleteConnection } from '../hooks/useRequirements'
import { useComments, useDeleteComment } from '../hooks/useComments'
import { useProjectMembers } from '../hooks/useProjectMembers'
import { canEditRequirement } from '../hooks/useCapabilities'
import { useAuth } from '../contexts/AuthContext'
import { FIELD_PAIRS, hasToBe } from '../utils/requirementHelpers'
import { EditableField } from './RequirementDetailPanel'
import { RequirementMultiSelect, RequirementOption } from './RequirementMultiSelect'
import CommentForm, { COMMENT_TYPE_CONFIG } from './CommentForm'
import ChangeHistory from './ChangeHistory'

// STATUS_CONFIG local — reproduzido para independência de RequirementsGrid
const STATUS_CONFIG = {
  PENDING:     { emoji: '⏳', label: 'Pendente',     color: 'bg-slate-100 text-slate-700 border border-slate-200' },
  IN_PROGRESS: { emoji: '🚧', label: 'Em Progresso', color: 'bg-blue-50 text-blue-700 border border-blue-200' },
  VALIDATED:   { emoji: '✅', label: 'Validado',     color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  APPROVED:    { emoji: '✔️', label: 'Aprovado',     color: 'bg-teal-50 text-teal-700 border border-teal-200' },
  CONFLICT:    { emoji: '🔴', label: 'Conflito',     color: 'bg-red-50 text-red-700 border border-red-200' },
  REJECTED:    { emoji: '❌', label: 'Rejeitado',    color: 'bg-rose-50 text-rose-700 border border-rose-200' },
}

type ModalTab = 'details' | '5w2h' | 'comments' | 'history'
type ViewMode = 'as-is' | 'to-be'

// ===== SELECT FIELD =====
// Select com auto-save via useUpdateRequirement, mesmo padrão do EditableField

interface SelectOption {
  value: string
  label: string
}

interface SelectFieldProps {
  label: string
  value: string
  fieldKey: string
  requirementId: string
  options: SelectOption[]
  disabled?: boolean
  /** Renderiza uma badge colorida em vez de texto simples para o valor atual */
  renderValue?: (value: string) => React.ReactNode
}

function SelectField({
  label,
  value,
  fieldKey,
  requirementId,
  options,
  disabled = false,
  renderValue,
}: SelectFieldProps) {
  const updateMutation = useUpdateRequirement()

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value
    updateMutation.mutate(
      { id: requirementId, data: { [fieldKey]: newValue } },
      {
        onError: () => {
          toast.error('Erro ao salvar campo')
        },
      }
    )
  }

  const displayValue = renderValue ? renderValue(value) : (
    <span className="text-sm text-gray-900">
      {options.find(o => o.value === value)?.label || value || '—'}
    </span>
  )

  if (disabled) {
    return (
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
        <div className="px-3 py-2 text-sm rounded-lg bg-gray-50 min-h-[36px] flex items-center">
          {value ? displayValue : <span className="italic text-gray-300">—</span>}
        </div>
      </div>
    )
  }

  return (
    <div className="mb-4">
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="relative">
        <select
          value={value || ''}
          onChange={handleChange}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white hover:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-400 appearance-none cursor-pointer transition-colors"
        >
          {!value && <option value="">Selecionar...</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {/* Ícone de chevron */}
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  )
}

// ===== SECTION HEADER =====

function SectionHeader({ title }: { title: string }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3 mt-5 first:mt-0 border-b border-gray-100 pb-2">
      {title}
    </h4>
  )
}

// ===== TAB DETALHES =====

interface DetailsTabProps {
  requirement: Requirement
  canEdit: boolean
  canEditConsultant: boolean
  consultantOptions: SelectOption[]
  allRequirements: RequirementOption[]
  userRole: string
}

function DetailsTab({
  requirement,
  canEdit,
  canEditConsultant,
  consultantOptions,
  allRequirements,
  userRole,
}: DetailsTabProps) {
  const createConnection = useCreateConnection()
  const deleteConnection = useDeleteConnection()

  const statusOptions: SelectOption[] = Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({
    value: key,
    label: `${cfg.emoji} ${cfg.label}`,
  }))

  // Extrai lista única de módulos dos requisitos do projeto como opções
  const moduleOptions: SelectOption[] = Array.from(
    new Set(allRequirements.map((r) => r.module).filter(Boolean))
  ).sort().map((m) => ({ value: m, label: m }))

  // Handlers de relações via multiselect: usam o endpoint atômico de conexão (diff add/remove),
  // garantindo sincronização bidirecional (providesFor/dependsOn) e permissão "dono de 1 lado".
  //
  // "Depende de" de R: X no array significa a aresta X → R (X fornece para R).
  const handleDependsOnChange = (newValue: string[]) => {
    const current = requirement.dependsOn || []
    const added = newValue.filter((id) => !current.includes(id))
    const removed = current.filter((id) => !newValue.includes(id))
    added.forEach((depReqId) =>
      createConnection.mutate({ projectId: requirement.projectId, fromReqId: depReqId, toReqId: requirement.reqId })
    )
    removed.forEach((depReqId) =>
      deleteConnection.mutate({ projectId: requirement.projectId, fromReqId: depReqId, toReqId: requirement.reqId })
    )
  }

  // "Fornece para" de R: Y no array significa a aresta R → Y (R fornece para Y).
  const handleProvidesForChange = (newValue: string[]) => {
    const current = requirement.providesFor || []
    const added = newValue.filter((id) => !current.includes(id))
    const removed = current.filter((id) => !newValue.includes(id))
    added.forEach((provReqId) =>
      createConnection.mutate({ projectId: requirement.projectId, fromReqId: requirement.reqId, toReqId: provReqId })
    )
    removed.forEach((provReqId) =>
      deleteConnection.mutate({ projectId: requirement.projectId, fromReqId: requirement.reqId, toReqId: provReqId })
    )
  }

  return (
    <div className="px-6 py-5 overflow-auto">
      {/* IDENTIFICAÇÃO */}
      <SectionHeader title="Identificação" />

      {/* shortDesc — full width */}
      <div className="mb-4">
        <EditableField
          label="Descrição curta"
          value={requirement.shortDesc}
          fieldKey="shortDesc"
          requirementId={requirement.id}
          isLong={false}
          placeholder="Descrição em até 50 caracteres..."
          disabled={!canEdit}
        />
      </div>

      {/* módulo + status — 2 colunas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <SelectField
          label="Módulo"
          value={requirement.module}
          fieldKey="module"
          requirementId={requirement.id}
          options={moduleOptions}
          disabled={!canEdit}
        />
        <SelectField
          label="Status"
          value={requirement.status}
          fieldKey="status"
          requirementId={requirement.id}
          options={statusOptions}
          disabled={!canEdit}
          renderValue={(val) => {
            const cfg = STATUS_CONFIG[val as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING
            return (
              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${cfg.color}`}>
                {cfg.emoji} {cfg.label}
              </span>
            )
          }}
        />
      </div>

      {/* RESPONSÁVEIS */}
      <SectionHeader title="Responsáveis" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
        <SelectField
          label="Consultor responsável"
          value={requirement.responsibleConsultantId || ''}
          fieldKey="responsibleConsultantId"
          requirementId={requirement.id}
          options={consultantOptions}
          disabled={!canEditConsultant}
        />
        <div>
          <EditableField
            label="Responsável negócio"
            value={requirement.responsibleBusiness || ''}
            fieldKey="responsibleBusiness"
            requirementId={requirement.id}
            isLong={false}
            placeholder="Nome do responsável no negócio..."
            disabled={!canEdit}
          />
        </div>
      </div>

      {/* RELAÇÕES */}
      <SectionHeader title="Relações" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 mb-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Depende de</label>
          <RequirementMultiSelect
            value={requirement.dependsOn}
            onChange={handleDependsOnChange}
            options={allRequirements}
            excludeReqId={requirement.reqId}
            disabled={!canEdit}
            placeholder="Adicionar dependência..."
            variant="modal"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Fornece para</label>
          <RequirementMultiSelect
            value={requirement.providesFor}
            onChange={handleProvidesForChange}
            options={allRequirements}
            excludeReqId={requirement.reqId}
            disabled={!canEdit}
            placeholder="Adicionar relação..."
            variant="modal"
          />
        </div>
      </div>

      {/* NOTAS — visíveis apenas para não-CLIENT */}
      {userRole !== 'CLIENT' && (
        <>
          <SectionHeader title="Notas" />
          <EditableField
            label="Dúvidas do consultor"
            value={requirement.consultantNotes || ''}
            fieldKey="consultantNotes"
            requirementId={requirement.id}
            isLong={true}
            placeholder="Dúvidas, pontos em aberto ou observações internas..."
            disabled={!canEdit}
          />
          <EditableField
            label="Observações"
            value={requirement.observations || ''}
            fieldKey="observations"
            requirementId={requirement.id}
            isLong={true}
            placeholder="Observações gerais sobre o requisito..."
            disabled={!canEdit}
          />
        </>
      )}

      {/* Se CLIENT, mostrar apenas Observações */}
      {userRole === 'CLIENT' && (
        <>
          <SectionHeader title="Observações" />
          <EditableField
            label="Observações"
            value={requirement.observations || ''}
            fieldKey="observations"
            requirementId={requirement.id}
            isLong={true}
            placeholder="Observações gerais sobre o requisito..."
            disabled={true}
          />
        </>
      )}
    </div>
  )
}

// ===== TAB 5W2H =====

function FiveW2HModalTab({
  requirement,
  canEdit,
}: {
  requirement: Requirement
  canEdit: boolean
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('as-is')
  const hasToBeData = hasToBe(requirement)

  return (
    <div className="px-6 py-5">
      {/* Toggle AS-IS / TO-BE */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode('as-is')}
            className={`px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
              viewMode === 'as-is'
                ? 'bg-blue-500 text-white shadow-inner'
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            AS-IS
          </button>
          <button
            type="button"
            onClick={() => setViewMode('to-be')}
            className={`px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
              viewMode === 'to-be'
                ? 'bg-orange-500 text-white shadow-inner'
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}
          >
            TO-BE
            {hasToBeData && viewMode !== 'to-be' && (
              <span className="ml-1 w-1.5 h-1.5 rounded-full bg-orange-400 inline-block align-middle" />
            )}
          </button>
        </div>

        <span className={`text-xs px-3 py-1 rounded-full font-medium ${
          viewMode === 'as-is'
            ? 'bg-blue-50 text-blue-700'
            : 'bg-orange-50 text-orange-700'
        }`}>
          {viewMode === 'as-is' ? 'Estado atual' : 'Visão futura'}
        </span>
      </div>

      {/* Campos em grid de 2 colunas em telas lg+ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
        {FIELD_PAIRS.map((pair) => {
          if (viewMode === 'as-is') {
            const value = requirement[pair.asIsKey as keyof Requirement] as string || ''
            return (
              <EditableField
                key={pair.asIsKey}
                label={pair.label}
                value={value}
                fieldKey={pair.asIsKey}
                requirementId={requirement.id}
                isLong={pair.isLong}
                disabled={!canEdit}
              />
            )
          } else {
            const value = requirement[pair.toBeKey as keyof Requirement] as string || ''
            return (
              <EditableField
                key={pair.toBeKey}
                label={`${pair.label} — TO-BE`}
                value={value}
                fieldKey={pair.toBeKey}
                requirementId={requirement.id}
                isLong={pair.isLong}
                placeholder="Deixe em branco para herdar do AS-IS"
                disabled={!canEdit}
              />
            )
          }
        })}
      </div>
    </div>
  )
}

// ===== TAB COMENTÁRIOS =====

function CommentsSection({ requirement }: { requirement: Requirement }) {
  const { user } = useAuth()
  const { data: comments, isLoading } = useComments(requirement.id)
  const deleteMutation = useDeleteComment()

  const canDeleteComment = (comment: Comment) => {
    if (!user) return false
    return user.role === 'ADMIN' || comment.userId === user.id
  }

  const handleDelete = (comment: Comment) => {
    if (!window.confirm('Deseja excluir este comentário?')) return
    deleteMutation.mutate({ commentId: comment.id, requirementId: requirement.id })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            Carregando comentários...
          </div>
        ) : !comments || comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-sm text-gray-500">Nenhum comentário ainda.<br />Seja o primeiro a comentar!</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {comments.map((comment) => {
              const typeConfig = COMMENT_TYPE_CONFIG[comment.type]
              return (
                <div key={comment.id} className="py-4">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-medium text-sm text-gray-900">{comment.user.name}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${typeConfig.color}`}>
                      {typeConfig.emoji} {typeConfig.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(comment.createdAt).toLocaleDateString('pt-BR', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                    {canDeleteComment(comment) && (
                      <button
                        onClick={() => handleDelete(comment)}
                        className="text-xs text-red-400 hover:text-red-600 ml-auto"
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{comment.content}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Formulário fixo no rodapé da seção */}
      <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex-shrink-0">
        <CommentForm requirementId={requirement.id} />
      </div>
    </div>
  )
}

// ===== PROPS DO MODAL =====

interface RequirementDetailModalProps {
  requirement: Requirement | null
  onClose: () => void
  projectId: string
  allRequirements: RequirementOption[]
}

// ===== COMPONENTE PRINCIPAL =====

export default function RequirementDetailModal({
  requirement,
  onClose,
  projectId,
  allRequirements,
}: RequirementDetailModalProps) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<ModalTab>('details')
  // useProjectMembers retorna { data: MembersResponse } onde MembersResponse.data é o array
  const { data: membersResponse } = useProjectMembers(projectId)
  const members = membersResponse?.data || []

  // Permissões — alinhadas ao backend/roleCapabilities:
  // ADMIN e MANAGER editam qualquer; CONSULTANT edita os seus; CLIENT conforme regra de negócio.
  const canEdit = canEditRequirement(user?.role, user?.id, requirement?.responsibleConsultantId)
  const canEditConsultant = user?.role === 'ADMIN'

  // Opções de consultores a partir dos membros do projeto
  const consultantOptions: SelectOption[] = members
    .filter((m) => ['ADMIN', 'CONSULTANT', 'MANAGER'].includes(m.user.role))
    .map((m) => ({ value: m.user.id, label: m.user.name }))

  // Fechar com tecla Escape
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Resetar para aba Detalhes ao abrir novo requisito
  useEffect(() => {
    if (requirement) setActiveTab('details')
  }, [requirement?.id])

  if (!requirement) return null

  const currentStatus = STATUS_CONFIG[requirement.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING

  const tabs: { key: ModalTab; label: string }[] = [
    { key: 'details',  label: '🗂️ Detalhes' },
    { key: '5w2h',    label: '📋 5W2H' },
    { key: 'comments', label: '💬 Comentários' },
    { key: 'history',  label: '📜 Histórico' },
  ]

  return (
    /* Backdrop — clique fora fecha o modal */
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label={`Detalhes do requisito ${requirement.reqId}`}
    >
      {/* Painel do modal — stopPropagation para não fechar ao clicar dentro */}
      <div
        className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4 flex-shrink-0 bg-gray-50 rounded-t-2xl">
          <div className="flex-1 min-w-0 mr-4">
            <div className="flex items-center gap-2 flex-wrap">
              {/* reqId badge */}
              <span className="px-2 py-0.5 text-sm font-mono font-semibold bg-ancoro-navy-100 text-ancoro-navy-700 rounded">
                {requirement.reqId}
              </span>
              {/* TO-BE indicator */}
              {hasToBe(requirement) && (
                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-orange-100 text-orange-700 border border-orange-200 uppercase tracking-wide">
                  TO-BE
                </span>
              )}
              {/* Status badge */}
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${currentStatus.color}`}>
                {currentStatus.emoji} {currentStatus.label}
              </span>
            </div>
            <h2 className="text-base font-semibold text-gray-900 mt-1 truncate">
              {requirement.shortDesc}
            </h2>
          </div>

          {/* Botão fechar */}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors flex-shrink-0"
            aria-label="Fechar modal"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* TAB BAR */}
        <div className="flex border-b border-gray-200 flex-shrink-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* CONTEÚDO DA TAB — área scrollável */}
        <div className="flex-1 overflow-auto min-h-0">
          {activeTab === 'details' && (
            <DetailsTab
              requirement={requirement}
              canEdit={!!canEdit}
              canEditConsultant={canEditConsultant}
              consultantOptions={consultantOptions}
              allRequirements={allRequirements}
              userRole={user?.role || 'CLIENT'}
            />
          )}

          {activeTab === '5w2h' && (
            <FiveW2HModalTab
              requirement={requirement}
              canEdit={!!canEdit}
            />
          )}

          {activeTab === 'comments' && (
            <CommentsSection requirement={requirement} />
          )}

          {activeTab === 'history' && (
            <div className="flex-1">
              <ChangeHistory requirementId={requirement.id} embedded />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
