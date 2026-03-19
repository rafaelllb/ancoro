/**
 * useChangelog Hook
 * React Query hooks para histórico de mudanças
 *
 * Features:
 * - Fetch histórico por requisito ou projeto
 * - Paginação e filtros
 * - Mutation para rollback (admin only)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { changelogAPI, ChangeType } from '../services/api'

// Query keys
const CHANGELOG_KEYS = {
  requirement: (requirementId: string) => ['changelog', 'requirement', requirementId],
  project: (projectId: string) => ['changelog', 'project', projectId],
  detail: (changeId: string) => ['changelog', 'detail', changeId],
}

interface UseRequirementChangelogOptions {
  requirementId: string
  field?: string
  userId?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
  enabled?: boolean
}

/**
 * Hook para buscar histórico de mudanças de um requisito
 */
export function useRequirementChangelog(options: UseRequirementChangelogOptions) {
  const { requirementId, enabled = true, ...params } = options

  return useQuery({
    queryKey: [...CHANGELOG_KEYS.requirement(requirementId), params],
    queryFn: async () => {
      const response = await changelogAPI.getByRequirement(requirementId, params)
      return response.data
    },
    enabled: enabled && !!requirementId,
    staleTime: 30000, // 30 segundos
  })
}

interface UseProjectChangelogOptions {
  projectId: string
  changeType?: ChangeType
  limit?: number
  offset?: number
  enabled?: boolean
}

/**
 * Hook para buscar histórico de mudanças de um projeto (timeline geral)
 */
export function useProjectChangelog(options: UseProjectChangelogOptions) {
  const { projectId, enabled = true, ...params } = options

  return useQuery({
    queryKey: [...CHANGELOG_KEYS.project(projectId), params],
    queryFn: async () => {
      const response = await changelogAPI.getByProject(projectId, params)
      return response.data
    },
    enabled: enabled && !!projectId,
    staleTime: 30000,
  })
}

/**
 * Hook para buscar detalhes de uma mudança específica
 */
export function useChangelogDetail(changeId: string, enabled = true) {
  return useQuery({
    queryKey: CHANGELOG_KEYS.detail(changeId),
    queryFn: async () => {
      const response = await changelogAPI.getById(changeId)
      return response.data
    },
    enabled: enabled && !!changeId,
  })
}

/**
 * Hook para fazer rollback de uma mudança
 * Apenas admin pode usar
 */
export function useRollback() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ requirementId, changeId }: { requirementId: string; changeId: string }) => {
      const response = await changelogAPI.rollback(requirementId, changeId)
      return response.data
    },
    onSuccess: (data, variables) => {
      toast.success(`Rollback realizado: ${data.rolledBack.field}`)

      // Invalida queries relacionadas
      queryClient.invalidateQueries({
        queryKey: CHANGELOG_KEYS.requirement(variables.requirementId),
      })
      queryClient.invalidateQueries({
        queryKey: ['requirements'],
      })
    },
    onError: (error: any) => {
      const message = error.response?.data?.message || 'Erro ao fazer rollback'
      toast.error(message)
    },
  })
}

// ===== HELPERS =====

/**
 * Formata o tipo de mudança para exibição
 */
export function formatChangeType(type: ChangeType): string {
  const labels: Record<ChangeType, string> = {
    CREATE: 'Criação',
    UPDATE: 'Atualização',
    DELETE: 'Deleção',
    STATUS_CHANGE: 'Mudança de Status',
    COMMENT_ADDED: 'Comentário',
  }
  return labels[type] || type
}

/**
 * Cor do badge por tipo de mudança
 */
export function getChangeTypeColor(type: ChangeType): string {
  const colors: Record<ChangeType, string> = {
    CREATE: 'bg-green-100 text-green-800',
    UPDATE: 'bg-blue-100 text-blue-800',
    DELETE: 'bg-red-100 text-red-800',
    STATUS_CHANGE: 'bg-yellow-100 text-yellow-800',
    COMMENT_ADDED: 'bg-purple-100 text-purple-800',
  }
  return colors[type] || 'bg-gray-100 text-gray-800'
}

/**
 * Ícone por tipo de mudança
 */
export function getChangeTypeIcon(type: ChangeType): string {
  const icons: Record<ChangeType, string> = {
    CREATE: '✨',
    UPDATE: '✏️',
    DELETE: '🗑️',
    STATUS_CHANGE: '🔄',
    COMMENT_ADDED: '💬',
  }
  return icons[type] || '📝'
}

/**
 * Formata nome de campo para exibição
 */
export function formatFieldName(field: string): string {
  const labels: Record<string, string> = {
    shortDesc: 'Descrição',
    module: 'Módulo',
    what: 'O que',
    why: 'Por que',
    who: 'Quem',
    when: 'Quando',
    where: 'Onde',
    howToday: 'Como (hoje)',
    howMuch: 'Quanto',
    dependsOn: 'Depende de',
    providesFor: 'Fornece para',
    consultantNotes: 'Notas do Consultor',
    status: 'Status',
    observations: 'Observações',
    requirement: 'Requisito',
    comments: 'Comentários',
  }
  return labels[field] || field
}

/**
 * Formata timestamp relativo
 */
export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'agora'
  if (minutes < 60) return `${minutes}m atrás`
  if (hours < 24) return `${hours}h atrás`
  if (days < 7) return `${days}d atrás`

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: days > 365 ? 'numeric' : undefined,
  })
}
