/**
 * Hook para verificar capacidades do usuário baseado em seu role
 *
 * Centraliza a lógica de permissões no frontend, evitando checks inline
 * espalhados pelos componentes.
 *
 * @example
 * const { canViewMetrics, canDeleteRequirements } = useCapabilities()
 * if (canViewMetrics) { ... }
 */

import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { hasCapability, CapabilityKey } from '../utils/roleCapabilities'

export interface Capabilities {
  // Requisitos
  canCreateRequirement: boolean
  canEditRequirements: boolean      // True se pode editar (qualquer ou próprios)
  canDeleteRequirements: boolean    // True se pode excluir (qualquer ou próprios)

  // Matriz de Cruzamento
  canViewMatrix: boolean
  canRegenerateMatrix: boolean
  canEditMatrix: boolean

  // Métricas
  canViewMetrics: boolean

  // Configurações de Projeto
  canConfigureLists: boolean
  canConfigureIdPattern: boolean
  canCreateProject: boolean
  canEditProject: boolean
  canDeleteProject: boolean
  canManageMembers: boolean

  // Importação/Exportação
  canImportRequirements: boolean
  canExportBPD: boolean

  // Helper para verificar capacidade genérica
  can: (capability: CapabilityKey) => boolean

  // Role atual
  role: string | undefined
}

export function useCapabilities(): Capabilities {
  const { user } = useAuth()
  const role = user?.role

  // Memoiza as capacidades para evitar recálculos desnecessários
  const capabilities = useMemo<Capabilities>(() => {
    const can = (capability: CapabilityKey): boolean => {
      return hasCapability(role, capability)
    }

    return {
      // Requisitos
      canCreateRequirement: can('canCreateRequirement'),
      canEditRequirements:
        can('canEditAnyRequirement') ||
        hasCapability(role, 'canEditOwnRequirement' as CapabilityKey),
      canDeleteRequirements:
        can('canDeleteAnyRequirement') ||
        hasCapability(role, 'canDeleteOwnRequirement' as CapabilityKey),

      // Matriz de Cruzamento
      canViewMatrix: can('canViewMatrix'),
      canRegenerateMatrix: can('canRegenerateMatrix'),
      canEditMatrix: can('canEditMatrix'),

      // Métricas
      canViewMetrics: can('canViewMetrics'),

      // Configurações de Projeto
      canConfigureLists: can('canConfigureLists'),
      canConfigureIdPattern: can('canConfigureIdPattern'),
      canCreateProject: can('canCreateProject'),
      canEditProject: can('canEditProject'),
      canDeleteProject: can('canDeleteProject'),
      canManageMembers: can('canManageMembers'),

      // Importação/Exportação
      canImportRequirements: can('canImportRequirements'),
      canExportBPD: can('canExportBPD'),

      // Helper e role
      can,
      role,
    }
  }, [role])

  return capabilities
}

/**
 * Helper para verificar se o usuário pode excluir um requisito específico
 * Considera ownership para CONSULTANT
 *
 * @param userRole - Role do usuário
 * @param userId - ID do usuário
 * @param responsibleConsultantId - ID do consultor responsável pelo requisito
 */
export function canDeleteRequirement(
  userRole: string | undefined,
  userId: string | undefined,
  responsibleConsultantId: string | null | undefined
): boolean {
  if (!userRole || !userId) return false

  // ADMIN pode excluir qualquer
  if (userRole === 'ADMIN') return true

  // CONSULTANT pode excluir apenas os próprios
  if (userRole === 'CONSULTANT') {
    return responsibleConsultantId === userId
  }

  // MANAGER e CLIENT não podem excluir
  return false
}

/**
 * Helper para verificar se o usuário pode editar um requisito específico
 * Considera ownership para CONSULTANT
 *
 * @param userRole - Role do usuário
 * @param userId - ID do usuário
 * @param responsibleConsultantId - ID do consultor responsável pelo requisito
 */
export function canEditRequirement(
  userRole: string | undefined,
  userId: string | undefined,
  responsibleConsultantId: string | null | undefined
): boolean {
  if (!userRole || !userId) return false

  // ADMIN e MANAGER podem editar qualquer requisito
  if (userRole === 'ADMIN' || userRole === 'MANAGER') {
    return true
  }

  // CLIENT só pode editar enquanto não houver consultor responsável
  if (userRole === 'CLIENT') {
    return !responsibleConsultantId
  }

  // CONSULTANT pode editar apenas os atribuídos a ele
  if (userRole === 'CONSULTANT') {
    return responsibleConsultantId === userId
  }

  return false
}
