import { useState } from 'react'
import { CommentType } from '../services/api'
import { useCreateComment } from '../hooks/useComments'

interface CommentFormProps {
  requirementId: string
  onSuccess?: () => void
}

// Configuração visual dos tipos de comentário
const COMMENT_TYPE_CONFIG: Record<
  CommentType,
  { label: string; emoji: string; color: string; description: string }
> = {
  QUESTION: {
    label: 'Dúvida',
    emoji: '❓',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    description: 'Solicita esclarecimento ou informação',
  },
  ANSWER: {
    label: 'Resposta',
    emoji: '💬',
    color: 'bg-green-100 text-green-800 border-green-300',
    description: 'Responde a uma dúvida anterior',
  },
  OBSERVATION: {
    label: 'Observação',
    emoji: '📝',
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    description: 'Adiciona contexto ou nota importante',
  },
  CONFLICT: {
    label: 'Conflito',
    emoji: '⚠️',
    color: 'bg-red-100 text-red-800 border-red-300',
    description: 'Sinaliza divergência ou problema',
  },
}

export default function CommentForm({ requirementId, onSuccess }: CommentFormProps) {
  const [content, setContent] = useState('')
  const [type, setType] = useState<CommentType>('OBSERVATION')

  const createMutation = useCreateComment()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!content.trim()) return

    createMutation.mutate(
      {
        requirementId,
        data: { content: content.trim(), type },
      },
      {
        onSuccess: () => {
          setContent('')
          setType('OBSERVATION')
          onSuccess?.()
        },
      }
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Tipo de comentário */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Tipo de comentário
        </label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(COMMENT_TYPE_CONFIG) as CommentType[]).map((t) => {
            const config = COMMENT_TYPE_CONFIG[t]
            const isSelected = type === t
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`
                  flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all
                  ${isSelected ? config.color + ' border-2 font-medium' : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'}
                `}
                title={config.description}
              >
                <span>{config.emoji}</span>
                <span>{config.label}</span>
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {COMMENT_TYPE_CONFIG[type].description}
        </p>
      </div>

      {/* Conteúdo */}
      <div>
        <label htmlFor="comment-content" className="block text-xs font-medium text-gray-700 mb-1">
          Comentário
        </label>
        <textarea
          id="comment-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Adicionar novo comentário..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none text-sm"
          disabled={createMutation.isPending}
        />
      </div>

      {/* Botão de envio */}
      <button
        type="submit"
        disabled={!content.trim() || createMutation.isPending}
        className={`
          w-full px-4 py-2 rounded-lg font-medium text-sm transition-all
          ${
            content.trim() && !createMutation.isPending
              ? 'bg-teal-600 text-white hover:bg-teal-700'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }
        `}
      >
        {createMutation.isPending ? 'Enviando...' : 'Enviar Comentário'}
      </button>
    </form>
  )
}

// Exporta config para uso no CommentPanel
export { COMMENT_TYPE_CONFIG }
