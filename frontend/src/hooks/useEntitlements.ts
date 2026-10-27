/**
 * Direitos da assinatura (hoje: só o Process Studio). Contratação única => liga/desliga binário.
 * Fail-closed: enquanto carrega ou se a consulta falhar, o módulo fica oculto (ninguém vê por engano).
 *
 * [2026-10-16] Criado: gate de assinatura do Process Studio — Rafael Brito
 */
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { entitlementsAPI } from '../services/api'

export function useEntitlements() {
  const { isAuthenticated } = useAuth()
  const query = useQuery({
    queryKey: ['entitlements'],
    queryFn: async () => (await entitlementsAPI.get()).data,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  return {
    processStudio: query.data?.processStudio === true,
    isLoading: query.isLoading,
  }
}
