/**
 * Hook para gerenciamento de membros do projeto
 *
 * Fornece queries e mutations para:
 * - Listar membros do projeto
 * - Listar usuários disponíveis
 * - Adicionar/remover/atualizar membros
 *
 * @author Rafael Brito
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  projectMembersAPI,
  ProjectMember,
  AvailableUser,
  AddMemberRequest,
  UpdateMemberRequest,
} from '../services/api'
import toast from 'react-hot-toast'

// Query keys para invalidação de cache
const MEMBERS_KEY = 'project-members'
const AVAILABLE_USERS_KEY = 'available-users'

/**
 * Hook para listar membros do projeto
 */
export function useProjectMembers(projectId: string) {
  return useQuery({
    queryKey: [MEMBERS_KEY, projectId],
    queryFn: async () => {
      const response = await projectMembersAPI.getMembers(projectId)
      return response.data.data
    },
    enabled: !!projectId,
    staleTime: 30 * 1000, // 30 segundos
  })
}

/**
 * Hook para listar usuários disponíveis (não membros do projeto)
 */
export function useAvailableUsers(projectId: string) {
  return useQuery({
    queryKey: [AVAILABLE_USERS_KEY, projectId],
    queryFn: async () => {
      const response = await projectMembersAPI.getAvailableUsers(projectId)
      return response.data.data
    },
    enabled: !!projectId,
    staleTime: 30 * 1000,
  })
}

/**
 * Hook para adicionar membro ao projeto
 */
export function useAddMember(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: AddMemberRequest) =>
      projectMembersAPI.addMember(projectId, data),

    onSuccess: (response) => {
      // Invalida cache de membros e usuários disponíveis
      queryClient.invalidateQueries({ queryKey: [MEMBERS_KEY, projectId] })
      queryClient.invalidateQueries({ queryKey: [AVAILABLE_USERS_KEY, projectId] })
      toast.success(response.data.message)
    },

    onError: (error: any) => {
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Erro ao adicionar membro'
      toast.error(message)
    },
  })
}

/**
 * Hook para atualizar módulo do membro
 */
export function useUpdateMember(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UpdateMemberRequest }) =>
      projectMembersAPI.updateMember(projectId, userId, data),

    // Optimistic update
    onMutate: async ({ userId, data }) => {
      await queryClient.cancelQueries({ queryKey: [MEMBERS_KEY, projectId] })

      const previousMembers = queryClient.getQueryData<ProjectMember[]>([
        MEMBERS_KEY,
        projectId,
      ])

      if (previousMembers) {
        queryClient.setQueryData<ProjectMember[]>(
          [MEMBERS_KEY, projectId],
          previousMembers.map((member) =>
            member.userId === userId
              ? { ...member, module: data.module ?? member.module }
              : member
          )
        )
      }

      return { previousMembers }
    },

    onError: (error: any, _variables, context) => {
      // Rollback em caso de erro
      if (context?.previousMembers) {
        queryClient.setQueryData([MEMBERS_KEY, projectId], context.previousMembers)
      }
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Erro ao atualizar membro'
      toast.error(message)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [MEMBERS_KEY, projectId] })
    },
  })
}

/**
 * Hook para remover membro do projeto
 */
export function useRemoveMember(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (userId: string) => projectMembersAPI.removeMember(projectId, userId),

    // Optimistic update
    onMutate: async (userId) => {
      await queryClient.cancelQueries({ queryKey: [MEMBERS_KEY, projectId] })

      const previousMembers = queryClient.getQueryData<ProjectMember[]>([
        MEMBERS_KEY,
        projectId,
      ])

      if (previousMembers) {
        queryClient.setQueryData<ProjectMember[]>(
          [MEMBERS_KEY, projectId],
          previousMembers.filter((member) => member.userId !== userId)
        )
      }

      return { previousMembers }
    },

    onSuccess: (response) => {
      // Invalida cache de usuários disponíveis (agora tem +1)
      queryClient.invalidateQueries({ queryKey: [AVAILABLE_USERS_KEY, projectId] })
      toast.success(response.data.message)
    },

    onError: (error: any, _userId, context) => {
      // Rollback em caso de erro
      if (context?.previousMembers) {
        queryClient.setQueryData([MEMBERS_KEY, projectId], context.previousMembers)
      }
      const message =
        error.response?.data?.error ||
        error.response?.data?.message ||
        'Erro ao remover membro'
      toast.error(message)
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [MEMBERS_KEY, projectId] })
    },
  })
}

// Módulos SAP disponíveis para seleção
export const SAP_MODULES = [
  { value: 'ISU', label: 'ISU - Industry Solution Utilities' },
  { value: 'CRM', label: 'CRM - Customer Relationship Management' },
  { value: 'FICA', label: 'FI-CA - Contract Accounts Receivable' },
  { value: 'DEVICE', label: 'Device Management' },
  { value: 'SD', label: 'SD - Sales & Distribution' },
  { value: 'MM', label: 'MM - Materials Management' },
  { value: 'PM', label: 'PM - Plant Maintenance' },
  { value: 'OTHER', label: 'Outro' },
] as const

export type SAPModule = (typeof SAP_MODULES)[number]['value']
