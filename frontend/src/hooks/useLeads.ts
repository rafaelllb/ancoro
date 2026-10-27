/**
 * Envio do formulário comercial de /planos (público, sem JWT).
 *
 * [2026-10-24] Criado: hook do POST /api/leads — Rafael Brito
 */
import { useMutation } from '@tanstack/react-query'
import { leadsAPI, type CreateLeadRequest } from '../services/api'

export function useCreateLead() {
  return useMutation({
    mutationFn: async (data: CreateLeadRequest) => (await leadsAPI.create(data)).data,
    // Sem retry automático: reenviar um POST de formulário pode duplicar o lead; quem decide é o usuário (botão Enviar)
    retry: false,
  })
}
