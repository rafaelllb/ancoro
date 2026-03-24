import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  projectListsAPI,
  ProjectListItem,
  ListType,
  CreateListItemRequest,
  UpdateListItemRequest,
} from '../services/api'

export const listKeys = {
  all: (projectId: string) => ['projectLists', projectId] as const,
  byType: (projectId: string, listType: ListType) =>
    ['projectLists', projectId, listType] as const,
}

/**
 * Hook para buscar itens de uma lista configurável do projeto.
 *
 * @param projectId ID do projeto
 * @param listType Tipo da lista (MODULE, REQ_STATUS, INTEGRATION_TYPE, INTEGRATION_TIMING)
 * @param includeInactive Se true, inclui itens desativados (default false)
 */
export function useProjectLists(
  projectId: string | undefined,
  listType: ListType,
  includeInactive = false
) {
  return useQuery({
    queryKey: listKeys.byType(projectId || '', listType),
    queryFn: async () => {
      if (!projectId) throw new Error('Project ID é obrigatório')
      const response = await projectListsAPI.getItems(projectId, listType, includeInactive)
      return response.data.data
    },
    enabled: !!projectId,
    staleTime: 60000, // Cache válido por 1 minuto
  })
}

/**
 * Hook para buscar módulos do projeto (atalho para useProjectLists com listType=MODULE)
 */
export function useProjectModules(projectId: string | undefined) {
  return useProjectLists(projectId, 'MODULE')
}

/**
 * Hook para buscar status de requisitos do projeto
 */
export function useProjectStatuses(projectId: string | undefined) {
  return useProjectLists(projectId, 'REQ_STATUS')
}

/**
 * Hook para buscar tipos de integração do projeto
 */
export function useProjectIntegrationTypes(projectId: string | undefined) {
  return useProjectLists(projectId, 'INTEGRATION_TYPE')
}

/**
 * Hook para buscar timings de integração do projeto
 */
export function useProjectIntegrationTimings(projectId: string | undefined) {
  return useProjectLists(projectId, 'INTEGRATION_TIMING')
}

/**
 * Hook para criar item em uma lista configurável
 */
export function useCreateListItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      listType,
      data,
    }: {
      projectId: string
      listType: ListType
      data: CreateListItemRequest
    }) => {
      const response = await projectListsAPI.createItem(projectId, listType, data)
      return response.data.data
    },
    onSuccess: (_, variables) => {
      // Invalida cache da lista específica
      queryClient.invalidateQueries({
        queryKey: listKeys.byType(variables.projectId, variables.listType),
      })
    },
  })
}

/**
 * Hook para atualizar item de uma lista configurável
 */
export function useUpdateListItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      listType,
      itemId,
      data,
    }: {
      projectId: string
      listType: ListType
      itemId: string
      data: UpdateListItemRequest
    }) => {
      const response = await projectListsAPI.updateItem(projectId, listType, itemId, data)
      return response.data.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: listKeys.byType(variables.projectId, variables.listType),
      })
    },
  })
}

/**
 * Hook para desativar (soft delete) item de uma lista
 */
export function useDeleteListItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      projectId,
      listType,
      itemId,
    }: {
      projectId: string
      listType: ListType
      itemId: string
    }) => {
      const response = await projectListsAPI.deleteItem(projectId, listType, itemId)
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: listKeys.byType(variables.projectId, variables.listType),
      })
    },
  })
}

// Re-export tipos para conveniência
export type { ProjectListItem, ListType, CreateListItemRequest, UpdateListItemRequest }
