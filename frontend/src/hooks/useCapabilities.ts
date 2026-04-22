/**
 * Hook para verificar capacidades do usuario baseado em seu role.
 */

import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { hasCapability, CapabilityKey } from '../utils/roleCapabilities'

export interface Capabilities {
  canCreateRequirement: boolean
  canEditRequirements: boolean
  canDeleteRequirements: boolean
  canAssignRequirementResponsible: boolean
  canViewMatrix: boolean
  canRegenerateMatrix: boolean
  canEditMatrix: boolean
  canViewMetrics: boolean
  canConfigureLists: boolean
  canConfigureIdPattern: boolean
  canCreateProject: boolean
  canEditProject: boolean
  canDeleteProject: boolean
  canManageMembers: boolean
  canImportRequirements: boolean
  canExportBPD: boolean
  can: (capability: CapabilityKey) => boolean
  role: string | undefined
}

export function useCapabilities(): Capabilities {
  const { user } = useAuth()
  const role = user?.role

  const capabilities = useMemo<Capabilities>(() => {
    const can = (capability: CapabilityKey): boolean => hasCapability(role, capability)

    return {
      canCreateRequirement: can('canCreateRequirement'),
      canEditRequirements:
        can('canEditAnyRequirement') ||
        hasCapability(role, 'canEditOwnRequirement' as CapabilityKey),
      canDeleteRequirements:
        can('canDeleteAnyRequirement') ||
        hasCapability(role, 'canDeleteOwnRequirement' as CapabilityKey),
      canAssignRequirementResponsible: can('canAssignRequirementResponsible'),
      canViewMatrix: can('canViewMatrix'),
      canRegenerateMatrix: can('canRegenerateMatrix'),
      canEditMatrix: can('canEditMatrix'),
      canViewMetrics: can('canViewMetrics'),
      canConfigureLists: can('canConfigureLists'),
      canConfigureIdPattern: can('canConfigureIdPattern'),
      canCreateProject: can('canCreateProject'),
      canEditProject: can('canEditProject'),
      canDeleteProject: can('canDeleteProject'),
      canManageMembers: can('canManageMembers'),
      canImportRequirements: can('canImportRequirements'),
      canExportBPD: can('canExportBPD'),
      can,
      role,
    }
  }, [role])

  return capabilities
}

export function canDeleteRequirement(
  userRole: string | undefined,
  userId: string | undefined,
  responsibleConsultantId: string | null | undefined
): boolean {
  // Admin SEMPRE pode deletar - verificação prioritária antes de userId
  if (userRole === 'ADMIN') return true

  // Outros roles precisam de userId válido
  if (!userRole || !userId) return false

  if (userRole === 'CONSULTANT') {
    return responsibleConsultantId === userId
  }

  return false
}

export function canEditRequirement(
  userRole: string | undefined,
  userId: string | undefined,
  responsibleConsultantId: string | null | undefined
): boolean {
  // Admin SEMPRE pode editar tudo - verificação prioritária antes de userId
  if (userRole === 'ADMIN') return true

  // Manager NÃO pode editar campos gerais, apenas o responsável consultor
  // (usar canAssignRequirementResponsible para esse campo)
  if (userRole === 'MANAGER') return false

  // Outros roles precisam de userId válido
  if (!userRole || !userId) return false

  if (userRole === 'CLIENT') {
    return !responsibleConsultantId
  }

  if (userRole === 'CONSULTANT') {
    return responsibleConsultantId === userId
  }

  return false
}

export function canAssignRequirementResponsible(userRole: string | undefined): boolean {
  return hasCapability(userRole, 'canAssignRequirementResponsible')
}

export function canEditResponsibleConsultant(
  userRole: string | undefined,
  userId: string | undefined,
  responsibleConsultantId: string | null | undefined
): boolean {
  if (canAssignRequirementResponsible(userRole)) return true

  if (!userRole || !userId) return false

  return userRole === 'CONSULTANT' && responsibleConsultantId === userId
}
