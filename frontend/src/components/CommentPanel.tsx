import { useState } from 'react'
import { Requirement, Comment } from '../services/api'
import { useComments, useDeleteComment } from '../hooks/useComments'
import { useAuth } from '../contexts/AuthContext'
import CommentForm, { COMMENT_TYPE_CONFIG } from './CommentForm'
import ChangeHistory from './ChangeHistory'

interface CommentPanelProps {
  requirement: Requirement | null
  onClose: () => void
}

// Formata data relativa (ex: "há 2 horas", "há 3 dias")
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

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
}

// Gera iniciais do nome para avatar
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

// Cores de avatar baseadas no role
const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'bg-purple-500',
  MANAGER: 'bg-blue-500',
  CONSULTANT: 'bg-green-500',
  CLIENT: 'bg-orange-500',
}

// Componente de avatar
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

// Componente de comentário individual
function CommentItem({ comment, canDelete, onDelete }: { comment: Comment; canDelete: boolean; onDelete: () => void }) {
  const typeConfig = COMMENT_TYPE_CONFIG[comment.type]

  return (
    <div className="flex gap-3 py-3 border-b border-gray-100 last:border-0">
      <Avatar name={comment.user.name} role={comment.user.role} />
      <div className="flex-1 min-w-0">
        {/* Header: nome + type badge + tempo */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-gray-900">{comment.user.name}</span>
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${typeConfig.color}`}
          >
            {typeConfig.emoji} {typeConfig.label}
          </span>
          <span className="text-xs text-gray-400">{formatRelativeTime(comment.createdAt)}</span>
        </div>

        {/* Conteúdo */}
        <p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap break-words">
          {comment.content}
        </p>

        {/* Ações */}
        {canDelete && (
          <button
            onClick={onDelete}
            className="text-xs text-red-500 hover:text-red-700 mt-1"
          >
            Excluir
          </button>
        )}
      </div>
    </div>
  )
}

type TabType = 'comments' | 'history'

export default function CommentPanel({ requirement, onClose }: CommentPanelProps) {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('comments')
  const { data: comments, isLoading } = useComments(requirement?.id || null)
  const deleteMutation = useDeleteComment()

  // Verifica se usuário pode deletar comentário
  const canDeleteComment = (comment: Comment) => {
    if (!user) return false
    // Autor pode deletar seus próprios comentários
    if (comment.userId === user.id) return true
    // Admin pode deletar qualquer comentário
    if (user.role === 'ADMIN') return true
    // Manager pode deletar comentários do projeto (já verificado no backend)
    if (user.role === 'MANAGER') return true
    return false
  }

  const handleDelete = (comment: Comment) => {
    if (!requirement) return
    if (!window.confirm('Deseja excluir este comentário?')) return

    deleteMutation.mutate({
      commentId: comment.id,
      requirementId: requirement.id,
    })
  }

  // Painel fechado (sem requisito selecionado) - oculto em mobile
  if (!requirement) {
    return (
      <div className="hidden lg:flex w-96 bg-slate-50 border-l border-gray-200 p-8 flex-col items-center justify-center text-center rounded-r-lg">
        {/* Ilustração de speech bubble */}
        <div className="w-24 h-24 mb-6 relative">
          <div className="absolute inset-0 bg-teal-100 rounded-full"></div>
          <div className="absolute inset-2 bg-white rounded-full flex items-center justify-center shadow-sm">
            <svg className="w-10 h-10 text-teal-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
            </svg>
          </div>
        </div>
        <h3 className="text-xl font-semibold text-gray-800 mb-3">Comentários</h3>
        <p className="text-sm text-gray-500 leading-relaxed">
          Selecione um requisito na tabela para ver e adicionar comentários.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full lg:w-96 bg-white lg:border-l border-gray-200 flex flex-col h-full">
      {/* Header - mais proeminente em mobile */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        {/* Botão voltar (mobile) */}
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
          aria-label="Voltar para a lista"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex-1 min-w-0 mx-2 lg:mx-0">
          <h3 className="font-semibold text-gray-900 truncate">
            {requirement.reqId}
          </h3>
          <p className="text-xs text-gray-500 truncate">{requirement.shortDesc}</p>
        </div>

        {/* Botão fechar (desktop) */}
        <button
          type="button"
          onClick={onClose}
          className="hidden lg:block p-1 text-gray-400 hover:text-gray-600 rounded"
          title="Fechar painel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('comments')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'comments'
              ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          💬 Comentários
          {comments && comments.length > 0 && (
            <span className="ml-1.5 text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">
              {comments.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'history'
              ? 'text-teal-600 border-b-2 border-teal-600 bg-teal-50'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          📜 Histórico
        </button>
      </div>

      {/* Conteúdo da tab ativa */}
      {activeTab === 'comments' ? (
        <>
          {/* Lista de comentários */}
          <div className="flex-1 overflow-auto px-4 py-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                Carregando comentários...
              </div>
            ) : !comments || comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="text-gray-300 text-4xl mb-2">📭</div>
                <p className="text-sm text-gray-500">
                  Nenhum comentário ainda.
                  <br />
                  Seja o primeiro a comentar!
                </p>
              </div>
            ) : (
              <div>
                {comments.map((comment) => (
                  <CommentItem
                    key={comment.id}
                    comment={comment}
                    canDelete={canDeleteComment(comment)}
                    onDelete={() => handleDelete(comment)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Formulário de novo comentário */}
          <div className="border-t border-gray-200 px-4 py-3 bg-gray-50">
            <CommentForm requirementId={requirement.id} />
          </div>
        </>
      ) : (
        /* Tab de histórico */
        <div className="flex-1 overflow-auto">
          <ChangeHistory requirementId={requirement.id} embedded />
        </div>
      )}
    </div>
  )
}
