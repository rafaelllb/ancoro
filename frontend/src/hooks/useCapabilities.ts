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

function isRole(userRole: string | undefined, expectedRole: string): boolean {
  return userRole?.toUpperCase() === expectedRole
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
  if (hasCapability(userRole, 'canDeleteAnyRequirement')) return true
  if (!userRole || !userId) return false

  if (hasCapability(userRole, 'canDeleteOwnRequirement' as CapabilityKey)) {
    return responsibleConsultantId === userId
  }

  return false
}

export function canEditRequirement(
  userRole: string | undefined,
  userId: string | undefined,
  responsibleConsultantId: string | null | undefined
): boolean {
  if (hasCapability(userRole, 'canEditAnyRequirement')) {
    return !isRole(userRole, 'CLIENT') || !responsibleConsultantId
  }

  if (!userRole || !userId) return false

  if (hasCapability(userRole, 'canEditOwnRequirement' as CapabilityKey)) {
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

  return (
    hasCapability(userRole, 'canEditOwnRequirement' as CapabilityKey) &&
    responsibleConsultantId === userId
  )
}

/**
 * Verifica se o usuario pode editar o campo "Responsavel Negocio"
 * - ADMIN, MANAGER, CLIENT: sempre podem editar
 * - CONSULTANT: apenas se for o responsavel do requisito
 */
export function canEditResponsibleBusiness(
  userRole: string | undefined,
  userId: string | undefined,
  responsibleConsultantId: string | null | undefined
): boolean {
  if (
    hasCapability(userRole, 'canAssignRequirementResponsible') ||
    isRole(userRole, 'ADMIN') ||
    isRole(userRole, 'CLIENT')
  ) {
    return true
  }

  return canEditResponsibleConsultant(userRole, userId, responsibleConsultantId)
}
