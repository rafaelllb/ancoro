import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { commentsAPI, Comment, CreateCommentRequest } from '../services/api'
import { requirementKeys } from './useRequirements'

// Query keys para cache management de comentários
export const commentKeys = {
  all: ['comments'] as const,
  byRequirement: (requirementId: string) => [...commentKeys.all, requirementId] as const,
  count: (requirementId: string) => [...commentKeys.all, 'count', requirementId] as const,
}

/**
 * Hook para buscar comentários de um requisito
 * - Retorna lista ordenada cronologicamente (mais antigos primeiro)
 * - Inclui dados do autor (name, email, role)
 */
export function useComments(requirementId: string | null) {
  return useQuery({
    queryKey: commentKeys.byRequirement(requirementId || ''),
    queryFn: async () => {
      if (!requirementId) return []
      const response = await commentsAPI.getByRequirement(requirementId)
      return response.data
    },
    enabled: !!requirementId, // Só executa se requirementId existir
    staleTime: 15000, // Cache válido por 15s (comentários mudam frequentemente)
  })
}

/**
 * Hook para buscar contagem de comentários (útil para badge na grid)
 * - Retorna total e contagem por tipo
 */
export function useCommentCount(requirementId: string | null) {
  return useQuery({
    queryKey: commentKeys.count(requirementId || ''),
    queryFn: async () => {
      if (!requirementId) return { total: 0, byType: {} }
      const response = await commentsAPI.getCount(requirementId)
      return response.data
    },
    enabled: !!requirementId,
    staleTime: 30000, // Cache válido por 30s
  })
}

/**
 * Hook para criar novo comentário
 * - Optimistic update: adiciona à lista imediatamente
 * - Invalida cache de comentários e requisitos (para atualizar _count)
 */
export function useCreateComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      requirementId,
      data,
    }: {
      requirementId: string
      data: CreateCommentRequest
    }) => commentsAPI.create(requirementId, data),

    // Optimistic update: adiciona comentário antes da resposta
    onMutate: async ({ requirementId, data }) => {
      await queryClient.cancelQueries({
        queryKey: commentKeys.byRequirement(requirementId),
      })

      // Snapshot do estado anterior
      const previousComments = queryClient.getQueryData<Comment[]>(
        commentKeys.byRequirement(requirementId)
      )

      // Cria comentário otimista (ID temporário)
      const optimisticComment: Comment = {
        id: `temp-${Date.now()}`,
        requirementId,
        userId: '', // Será preenchido pelo servidor
        content: data.content,
        type: data.type,
        createdAt: new Date().toISOString(),
        user: {
          id: '',
          name: 'Você', // Placeholder até o servidor responder
          email: '',
          role: '',
        },
      }

      // Adiciona à lista
      queryClient.setQueryData<Comment[]>(
        commentKeys.byRequirement(requirementId),
        (old) => [...(old || []), optimisticComment]
      )

      return { previousComments, requirementId }
    },

    onSuccess: (_response, { requirementId }) => {
      // Invalida cache para refetch com dados corretos do servidor
      queryClient.invalidateQueries({
        queryKey: commentKeys.byRequirement(requirementId),
      })
      // Invalida contagem
      queryClient.invalidateQueries({
        queryKey: commentKeys.count(requirementId),
      })
      // Invalida requisitos (para atualizar _count.comments na grid)
      queryClient.invalidateQueries({
        queryKey: requirementKeys.all,
      })
      toast.success('Comentário adicionado')
    },

    onError: (error: any, { requirementId }, context) => {
      // Rollback: restaura estado anterior
      if (context?.previousComments) {
        queryClient.setQueryData(
          commentKeys.byRequirement(requirementId),
          context.previousComments
        )
      }
      const message = error.response?.data?.message || 'Erro ao adicionar comentário'
      toast.error(message)
    },
  })
}

/**
 * Hook para deletar comentário
 * - Optimistic update: remove da lista imediatamente
 * - Rollback automático se falhar
 */
export function useDeleteComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ commentId }: { commentId: string; requirementId: string }) =>
      commentsAPI.delete(commentId),

    // Optimistic update: remove antes da resposta
    onMutate: async ({ commentId, requirementId }) => {
      await queryClient.cancelQueries({
        queryKey: commentKeys.byRequirement(requirementId),
      })

      // Snapshot do estado anterior
      const previousComments = queryClient.getQueryData<Comment[]>(
        commentKeys.byRequirement(requirementId)
      )

      // Remove da UI imediatamente
      queryClient.setQueryData<Comment[]>(
        commentKeys.byRequirement(requirementId),
        (old) => (old || []).filter((c) => c.id !== commentId)
      )

      return { previousComments, requirementId }
    },

    onSuccess: (_response, { requirementId }) => {
      // Invalida cache
      queryClient.invalidateQueries({
        queryKey: commentKeys.byRequirement(requirementId),
      })
      queryClient.invalidateQueries({
        queryKey: commentKeys.count(requirementId),
      })
      // Invalida requisitos (para atualizar _count.comments na grid)
      queryClient.invalidateQueries({
        queryKey: requirementKeys.all,
      })
      toast.success('Comentário deletado')
    },

    onError: (error: any, { requirementId }, context) => {
      // Rollback: restaura estado anterior
      if (context?.previousComments) {
        queryClient.setQueryData(
          commentKeys.byRequirement(requirementId),
          context.previousComments
        )
      }
      const message = error.response?.data?.message || 'Erro ao deletar comentário'
      toast.error(message)
    },
  })
}
