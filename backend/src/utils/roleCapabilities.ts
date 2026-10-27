/**
 * Sistema centralizado de capacidades por role
 *
 * Este arquivo e a fonte unica de verdade para permissoes no backend.
 * O frontend deve espelhar estas capacidades para consistencia na UI.
 *
 * Regras implementadas conforme docs/ANALISE_PERMISSOES_POR_ROLE.md
 */

import { UserRole, UserRoleType } from '../types'

type CapabilityMap = {
  canCreateRequirement: boolean
  canEditAnyRequirement: boolean
  canDeleteAnyRequirement: boolean
  canEditOwnRequirement: boolean
  canDeleteOwnRequirement: boolean
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
  // [2026-10-15] Criado: Process Studio (Fase 4) — ver docs/process-studio/README.md §6.4 — Rafael Brito
  canViewProcesses: boolean
  canEditProcesses: boolean
  canDeleteAnyProcess: boolean
  canDeleteOwnProcess: boolean
  canPublishProcesses: boolean
}

type RoleCapabilityMap = Record<UserRoleType, Partial<CapabilityMap>>

export const RoleCapabilities: RoleCapabilityMap = {
  [UserRole.ADMIN]: {
    canCreateRequirement: true,
    canEditAnyRequirement: true,
    canDeleteAnyRequirement: true,
    canAssignRequirementResponsible: true,
    canViewMatrix: true,
    canRegenerateMatrix: true,
    canEditMatrix: true,
    canViewMetrics: true,
    canConfigureLists: true,
    canConfigureIdPattern: true,
    canCreateProject: true,
    canEditProject: true,
    canDeleteProject: true,
    canManageMembers: true,
    canImportRequirements: true,
    canExportBPD: true,
    canViewProcesses: true,
    canEditProcesses: true,
    canDeleteAnyProcess: true,
    canDeleteOwnProcess: false,
    canPublishProcesses: true,
  },

  [UserRole.MANAGER]: {
    canCreateRequirement: true,
    canEditAnyRequirement: true,
    canDeleteAnyRequirement: false,
    canAssignRequirementResponsible: true,
    canViewMatrix: true,
    canRegenerateMatrix: true,
    canEditMatrix: true,
    canViewMetrics: true,
    canConfigureLists: true,
    canConfigureIdPattern: false,
    canCreateProject: true,
    canEditProject: false,
    canDeleteProject: false,
    canManageMembers: true,
    canImportRequirements: true,
    canExportBPD: true,
    canViewProcesses: true,
    canEditProcesses: true,
    canDeleteAnyProcess: false,
    canDeleteOwnProcess: true,
    canPublishProcesses: true,
  },

  [UserRole.CONSULTANT]: {
    canCreateRequirement: true,
    canEditOwnRequirement: true,
    canDeleteOwnRequirement: true,
    canAssignRequirementResponsible: false,
    canViewMatrix: true,
    canRegenerateMatrix: true,
    canEditMatrix: true,
    canViewMetrics: true,
    canConfigureLists: false,
    canConfigureIdPattern: false,
    canCreateProject: false,
    canEditProject: false,
    canDeleteProject: false,
    canManageMembers: false,
    canImportRequirements: false,
    canExportBPD: true,
    canViewProcesses: true,
    canEditProcesses: true,
    canDeleteAnyProcess: false,
    canDeleteOwnProcess: true,
    canPublishProcesses: false,
  },

  [UserRole.CLIENT]: {
    canCreateRequirement: true,
    canEditAnyRequirement: true,
    canDeleteAnyRequirement: false,
    canAssignRequirementResponsible: false,
    canViewMatrix: false,
    canRegenerateMatrix: false,
    canEditMatrix: false,
    canViewMetrics: false,
    canConfigureLists: false,
    canConfigureIdPattern: false,
    canCreateProject: false,
    canEditProject: false,
    canDeleteProject: false,
    canManageMembers: false,
    canImportRequirements: false,
    canExportBPD: false,
    canViewProcesses: true,
    canEditProcesses: false,
    canDeleteAnyProcess: false,
    canDeleteOwnProcess: false,
    canPublishProcesses: false,
  },
}

export type CapabilityKey = keyof CapabilityMap

export function hasCapability(
  role: UserRoleType | string | undefined,
  capability: CapabilityKey
): boolean {
  if (!role) return false

  const caps = RoleCapabilities[role as keyof typeof RoleCapabilities]
  if (!caps) return false

  return caps[capability] ?? false
}

export function getCapabilities(
  role: UserRoleType | string | undefined
): Partial<CapabilityMap> {
  if (!role) return {}

  return RoleCapabilities[role as keyof typeof RoleCapabilities] ?? {}
}

export function canEditRequirements(role: UserRoleType | string | undefined): boolean {
  if (!role) return false

  return (
    hasCapability(role, 'canEditAnyRequirement') ||
    hasCapability(role, 'canEditOwnRequirement' as CapabilityKey)
  )
}

export function canDeleteRequirements(role: UserRoleType | string | undefined): boolean {
  if (!role) return false

  return (
    hasCapability(role, 'canDeleteAnyRequirement') ||
    hasCapability(role, 'canDeleteOwnRequirement' as CapabilityKey)
  )
}

/**
 * [2026-10-15] Criado: pode EXCLUIR este processo? ADMIN qualquer; MANAGER/CONSULTANT só os que criaram. — Rafael Brito
 */
export function canDeleteProcess(
  role: UserRoleType | string | undefined,
  userId: string | undefined,
  createdById: string | null | undefined
): boolean {
  if (hasCapability(role, 'canDeleteAnyProcess')) return true
  return !!userId && hasCapability(role, 'canDeleteOwnProcess') && createdById === userId
}
