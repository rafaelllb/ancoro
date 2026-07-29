/**
 * RequirementDetailPanel — Painel lateral de detalhes do requisito
 *
 * Substitui o CommentPanel original, adicionando aba 5W2H com toggle AS-IS/TO-BE.
 * Mantém abas de Comentários e Histórico do CommentPanel original.
 *
 * Estrutura:
 *   Header (reqId + shortDesc)
 *   Tab Bar: [5W2H] [Comentários] [Histórico]
 *   5W2H Tab:
 *     - Toggle segmentado AS-IS (azul) / TO-BE (laranja)
 *     - Campos 5W2H editáveis conforme modo
 *     - Botão "Comparar" → modal de diff side-by-side
 *   Comentários Tab: conteúdo do CommentPanel original
 *   Histórico Tab: ChangeHistory embedded
 */

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'react-hot-toast'
import { Requirement, Comment } from '../services/api'
import { useUpdateRequirement } from '../hooks/useRequirements'
import { useComments, useDeleteComment } from '../hooks/useComments'
import { useAuth } from '../contexts/AuthContext'
import CommentForm, { COMMENT_TYPE_CONFIG } from './CommentForm'
import ChangeHistory from './ChangeHistory'
import { DiffView } from './DiffView'
import {
  FIELD_PAIRS,
  hasToBe,
  getFieldDiffStatus,
  type DiffStatus,
} from '../utils/requirementHelpers'

// ===== TIPOS =====

interface RequirementDetailPanelProps {
  requirement: Requirement | null
  onClose: () => void
  projectId: string
}

type TabType = '5w2h' | 'comments' | 'history'
type ViewMode = 'as-is' | 'to-be'

// ===== HELPERS LOCAIS =====

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'agora'
  if (diffMins < 60) return `há ${diffMins} min`
  if (diffHours < 24) return `há ${diffHours}h`
  if (diffDays < 7) return `há ${diffDays}d`

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-purple-500',
  MANAGER: 'bg-blue-500',
  CONSULTANT: 'bg-green-500',
  CLIENT: 'bg-orange-500',
}

// ===== SUB-COMPONENTES =====

function Avatar({ name, role }: { name: string; role: string }) {
  const color = ROLE_COLORS[role] || 'bg-gray-500'
  return (
    <div
      className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium ${color}`}
      title={`${name} (${role})`}
    >
      {getInitials(name)}
    </div>
  )
}

function CommentItem({
  comment,
  canDelete,
  onDelete,
}: {
  comment: Comment
  canDelete: boolean
  onDelete: () => void
}) {
  const typeConfig = COMMENT_TYPE_CONFIG[comment.type]
  return (
    <div className="flex gap-3 py-3 border-b border-gray-100 last:border-0">
      <Avatar name={comment.user.name} role={comment.user.role} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-900">{comment.user.name}</span>
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${typeConfig.color}`}>
            {typeConfig.emoji} {typeConfig.label}
          </span>
          <span className="text-xs text-gray-400">{formatRelativeTime(comment.createdAt)}</span>
        </div>
        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap break-words">{comment.content}</p>
        {canDelete && (
          <button onClick={onDelete} className="text-xs text-red-500 hover:text-red-700 mt-1">
            Excluir
          </button>
        )}
      </div>
    </div>
  )
}

// ===== TOGGLE AS-IS / TO-BE =====

function ViewModeToggle({
  viewMode,
  onChange,
  hasToBeData,
}: {
  viewMode: ViewMode
  onChange: (mode: ViewMode) => void
  hasToBeData: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      {/* Toggle segmentado */}
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => onChange('as-is')}
          className={`px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
            viewMode === 'as-is'
              ? 'bg-blue-500 text-white shadow-inner'
              : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
          }`}
        >
          AS-IS
        </button>
        <button
          type="button"
          onClick={() => onChange('to-be')}
          className={`px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
            viewMode === 'to-be'
              ? 'bg-orange-500 text-white shadow-inner'
              : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
          }`}
        >
          TO-BE
          {/* Indicador de dados TO-BE existentes */}
          {hasToBeData && viewMode !== 'to-be' && (
            <span className="ml-1 w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
          )}
        </button>
      </div>
    </div>
  )
}

// ===== CAMPO EDITÁVEL INLINE =====

export interface EditableFieldProps {
  label: string
  value: string
  fieldKey: string
  requirementId: string
  isLong: boolean
  placeholder?: string
  /** Quando true, exibe apenas leitura sem interação */
  disabled?: boolean
}

export function EditableField({
  label,
  value,
  fieldKey,
  requirementId,
  isLong,
  placeholder,
  disabled = false,
}: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null)
  const updateMutation = useUpdateRequirement()

  // Sincroniza valor local quando prop muda (ex: optimistic update)
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value)
    }
  }, [value, isEditing])

  const handleSave = () => {
    setIsEditing(false)
    const trimmed = editValue.trim()

    // Valor não mudou — não faz nada
    if (trimmed === (value || '')) return

    // Campo TO-BE vazio → enviar null para limpar
    const sendValue = trimmed === '' ? null : trimmed

    updateMutation.mutate(
      { id: requirementId, data: { [fieldKey]: sendValue } },
      {
        onError: () => {
          // Reverte em caso de erro
          setEditValue(value)
          toast.error('Erro ao salvar campo')
        },
      }
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setEditValue(value)
      setIsEditing(false)
    }
    // Enter salva para campos curtos; Shift+Enter em longos cria nova linha
    if (e.key === 'Enter' && !isLong) {
      e.preventDefault()
      handleSave()
    }
  }

  // Campo desabilitado: apenas leitura, sem interação
  if (disabled) {
    return (
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
        <div className="px-2 py-1.5 text-sm rounded bg-gray-50 min-h-[28px]">
          {value ? (
            <span className="whitespace-pre-wrap break-words text-gray-600">{value}</span>
          ) : (
            <span className="italic text-gray-300">{placeholder || '—'}</span>
          )}
        </div>
      </div>
    )
  }

  if (isEditing) {
    return (
      <div className="mb-3">
        <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
        {isLong ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            rows={3}
            autoFocus
            placeholder={placeholder}
            className="w-full px-2 py-1.5 text-sm border border-teal-400 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder={placeholder}
            className="w-full px-2 py-1.5 text-sm border border-teal-400 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        )}
      </div>
    )
  }

  return (
    <div
      className="mb-3 cursor-pointer group"
      onClick={() => setIsEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setIsEditing(true)}
    >
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <div className="px-2 py-1.5 text-sm rounded bg-gray-50 group-hover:bg-gray-100 transition-colors min-h-[28px]">
        {value ? (
          <span className="whitespace-pre-wrap break-words text-gray-900">{value}</span>
        ) : (
          <span className="italic text-gray-400">{placeholder || 'Clique para editar...'}</span>
        )}
      </div>
    </div>
  )
}

// ===== MODAL DE COMPARAÇÃO (DIFF VIEW) =====

function CompareModal({
  requirement,
  isOpen,
  onClose,
}: {
  requirement: Requirement
  isOpen: boolean
  onClose: () => void
}) {
  if (!isOpen) return null

  // Cores de fundo por status de diff
  const DIFF_BG: Record<DiffStatus, string> = {
    changed: 'border-amber-200 bg-amber-50',
    added: 'border-green-200 bg-green-50',
    removed: 'border-red-200 bg-red-50',
    unchanged: 'border-gray-200 bg-gray-50',
    same: 'border-gray-200 bg-white',
  }

  // Renderiza via portal em document.body para escapar do containing block criado pelo
  // backdrop-blur do painel lateral (que prendia/clipava o modal aos ~400px do painel).
  return createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10 rounded-t-xl">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Comparar AS-IS vs TO-BE
              </h2>
              <p className="text-sm text-gray-500">{requirement.reqId} — {requirement.shortDesc}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded transition-colors"
              aria-label="Fechar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Cabeçalho de colunas */}
          <div className="grid grid-cols-2 gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-sm font-semibold text-blue-700">AS-IS (Atual)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500" />
              <span className="text-sm font-semibold text-orange-700">TO-BE (Futuro)</span>
            </div>
          </div>

          {/* Campos comparados */}
          <div className="px-6 py-4 space-y-4">
            {FIELD_PAIRS.map((pair) => {
              const asIsValue = requirement[pair.asIsKey as keyof Requirement] as string | null
              const toBeValue = requirement[pair.toBeKey as keyof Requirement] as string | null
              const status = getFieldDiffStatus(asIsValue, toBeValue)
              const bgClass = DIFF_BG[status]

              return (
                <div key={pair.toBeKey} className={`rounded-lg border p-4 ${bgClass}`}>
                  {/* Label do campo */}
                  <div className="text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">
                    {pair.label}
                  </div>

                  {pair.isLong ? (
                    // Layout vertical para campos longos — usa DiffView existente
                    <DiffView
                      oldValue={asIsValue || ''}
                      newValue={status === 'unchanged' ? null : (toBeValue || null)}
                      field={pair.label}
                    />
                  ) : (
                    // Layout horizontal para campos curtos
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                        {asIsValue || <span className="italic text-gray-400">(vazio)</span>}
                      </div>
                      <div className="text-sm whitespace-pre-wrap break-words">
                        {status === 'unchanged' ? (
                          <span className="italic text-gray-400">Sem alteração</span>
                        ) : (
                          toBeValue || <span className="italic text-gray-400">(vazio)</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legenda */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-4 text-xs text-gray-500 rounded-b-xl">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded border border-amber-300 bg-amber-100" /> Alterado
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded border border-green-300 bg-green-100" /> Novo
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded border border-gray-300 bg-gray-100" /> Sem alteração
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ===== ABA 5W2H =====

function FiveW2HTab({
  requirement,
}: {
  requirement: Requirement
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('as-is')
  const [showCompare, setShowCompare] = useState(false)
  const hasToBeData = hasToBe(requirement)

  return (
    <div className="flex-1 overflow-auto">
      {/* Controles: toggle + botão comparar */}
      <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between gap-2 z-[1]">
        <ViewModeToggle
          viewMode={viewMode}
          onChange={setViewMode}
          hasToBeData={hasToBeData}
        />

        <button
          type="button"
          onClick={() => setShowCompare(true)}
          disabled={!hasToBeData}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            hasToBeData
              ? 'border-teal-200 text-teal-700 bg-white hover:bg-teal-50'
              : 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
          }`}
          title={hasToBeData ? 'Comparar AS-IS vs TO-BE' : 'Preencha ao menos um campo TO-BE para comparar'}
        >
          <span className="flex items-center gap-1.5">
            {/* Ícone de comparação */}
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Comparar
          </span>
        </button>
      </div>

      {/* Campos 5W2H — renderiza AS-IS ou TO-BE conforme toggle */}
      <div className="px-4 py-3">
        {/* Indicador de modo ativo */}
        <div className={`mb-3 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
          viewMode === 'as-is'
            ? 'bg-blue-50 text-blue-700 border border-blue-100'
            : 'bg-orange-50 text-orange-700 border border-orange-100'
        }`}>
          {viewMode === 'as-is'
            ? 'Visualizando estado atual (AS-IS)'
            : 'Editando visão futura (TO-BE)'}
        </div>

        {/* Campos */}
        {FIELD_PAIRS.map((pair) => {
          if (viewMode === 'as-is') {
            // Modo AS-IS: campos originais
            const value = requirement[pair.asIsKey as keyof Requirement] as string || ''
            return (
              <EditableField
                key={pair.asIsKey}
                label={pair.label}
                value={value}
                fieldKey={pair.asIsKey}
                requirementId={requirement.id}
                isLong={pair.isLong}
              />
            )
          } else {
            // Modo TO-BE: campos *ToBe
            const value = (requirement[pair.toBeKey as keyof Requirement] as string) || ''
            return (
              <EditableField
                key={pair.toBeKey}
                label={`${pair.label} — TO-BE`}
                value={value}
                fieldKey={pair.toBeKey}
                requirementId={requirement.id}
                isLong={pair.isLong}
                placeholder="Descreva o estado futuro..."
              />
            )
          }
        })}
      </div>

      {/* Modal de comparação */}
      <CompareModal
        requirement={requirement}
        isOpen={showCompare}
        onClose={() => setShowCompare(false)}
      />
    </div>
  )
}

// ===== COMPONENTE PRINCIPAL =====

export default function RequirementDetailPanel({
  requirement,
  onClose,
}: RequirementDetailPanelProps) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('5w2h')
  const { data: comments, isLoading: commentsLoading } = useComments(requirement?.id || null)
  const deleteMutation = useDeleteComment()

  const canDeleteComment = (_comment: Comment) => {
    if (!user) return false
    return user.role === 'ADMIN'
  }

  const handleDeleteComment = (comment: Comment) => {
    if (!requirement) return
    if (!window.confirm('Deseja excluir este comentário?')) return
    deleteMutation.mutate({ commentId: comment.id, requirementId: requirement.id })
  }

  // Painel fechado (sem requisito selecionado) — card compacto (largura ~260px) mantendo o texto de orientação
  if (!requirement) {
    return (
      <div className="hidden xl:flex h-full items-center justify-center rounded-[28px] border border-ancoro-navy-100 bg-white/70 px-4 py-6 backdrop-blur overflow-hidden">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-ancoro-teal-200 bg-ancoro-teal-50 text-ancoro-teal-500">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-ancoro-navy-800">Detalhes do Requisito</p>
          <p className="text-xs leading-relaxed text-ancoro-navy-400">
            Selecione um requisito na tabela para visualizar e editar campos 5W2H, comentários e histórico.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full flex-col bg-white xl:w-[400px] xl:overflow-hidden xl:rounded-[28px] xl:border xl:border-ancoro-navy-100 xl:bg-white/88 xl:shadow-[0_12px_28px_rgba(21,45,74,0.06)] xl:backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 xl:bg-ancoro-navy-50/70">
        {/* Botão voltar (mobile) */}
        <button
          type="button"
          onClick={onClose}
          className="xl:hidden -ml-2 rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-200 hover:text-gray-900"
          aria-label="Voltar para a lista"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex-1 min-w-0 mx-2 lg:mx-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 truncate">{requirement.reqId}</h3>
            {hasToBe(requirement) && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-orange-100 text-orange-700 border border-orange-200 uppercase tracking-wide flex-shrink-0">
                TO-BE
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{requirement.shortDesc}</p>
        </div>

        {/* Botão fechar (desktop) */}
        <button
          type="button"
          onClick={onClose}
          className="hidden rounded xl:block p-1 text-gray-400 hover:text-gray-600"
          title="Fechar painel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {([
          { key: '5w2h' as const, label: '📋 5W2H' },
          { key: 'comments' as const, label: '💬 Comentários' },
          { key: 'history' as const, label: '📜 Histórico' },
        ]).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.label}
            {/* Badge de contagem nos comentários */}
            {tab.key === 'comments' && comments && comments.length > 0 && (
              <span className="ml-1.5 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">
                {comments.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Conteúdo da tab ativa */}
      {activeTab === '5w2h' && (
        <FiveW2HTab requirement={requirement} />
      )}

      {activeTab === 'comments' && (
        <>
          <div className="flex-1 overflow-auto px-4 py-2">
            {commentsLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                Carregando comentários...
              </div>
            ) : !comments || comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="text-gray-300 text-4xl mb-2">📭</div>
                <p className="text-sm text-gray-500">
                  Nenhum comentário ainda.<br />Seja o primeiro a comentar!
                </p>
              </div>
            ) : (
              <div>
                {comments.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    canDelete={canDeleteComment(comment)}
                    onDelete={() => handleDeleteComment(comment)}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
            <CommentForm requirementId={requirement.id} />
          </div>
        </>
      )}

      {activeTab === 'history' && (
        <div className="flex-1 overflow-auto">
          <ChangeHistory requirementId={requirement.id} embedded />
        </div>
      )}
    </div>
  )
}
