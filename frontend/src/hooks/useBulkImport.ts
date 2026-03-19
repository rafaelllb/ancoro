/**
 * useBulkImport - Hook para importação em massa de requisitos
 *
 * Utiliza React Query para gerenciar a mutation de bulk import.
 * Invalida o cache de requisitos após sucesso para atualizar a grid.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { requirementsAPI, BulkImportRequest, BulkImportResponse } from '../services/api'
import { requirementKeys } from './useRequirements'

interface UseBulkImportParams {
  projectId: string
  requirements: BulkImportRequest['requirements']
}

/**
 * Hook para importação em massa de requisitos
 *
 * @returns mutation object com:
 *  - mutate: função para executar a importação
 *  - isPending: boolean indicando se está processando
 *  - isError: boolean indicando se houve erro
 *  - data: resposta do servidor após sucesso
 *  - error: objeto de erro se falhou
 */
export function useBulkImportRequirements() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ projectId, requirements }: UseBulkImportParams) => {
      const response = await requirementsAPI.bulkImport(projectId, { requirements })
      return response.data
    },

    onSuccess: (data: BulkImportResponse, variables) => {
      // Invalida cache para refetch dos requisitos
      queryClient.invalidateQueries({
        queryKey: requirementKeys.byProject(variables.projectId),
      })

      // Toast de sucesso
      toast.success(data.message)
    },

    onError: (error: any) => {
      // Erro de validação retorna 400 com detalhes
      const response = error.response?.data as BulkImportResponse | undefined

      if (response?.errors && response.errors.length > 0) {
        // Mostra resumo dos erros
        const errorCount = response.errorCount || response.errors.length
        toast.error(`${errorCount} erro(s) de validação encontrados`)
      } else {
        // Erro genérico
        const message = response?.message || error.message || 'Erro na importação'
        toast.error(message)
      }
    },
  })
}
