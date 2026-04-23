/**
 * Sistema centralizado de capacidades por role - Frontend
 *
 * Espelha as capacidades definidas no backend (backend/src/utils/roleCapabilities.ts)
 * para garantir consistencia na UI.
 *
 * Regras implementadas conforme docs/ANALISE_PERMISSOES_POR_ROLE.md
 */

export type UserRole = 'ADMIN' | 'MANAGER' | 'CONSULTANT' | 'CLIENT'

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
}

type RoleCapabilityMap = Record<UserRole, Partial<CapabilityMap>>

export const RoleCapabilities: RoleCapabilityMap = {
  ADMIN: {
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
  },

  MANAGER: {
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
  },

  CONSULTANT: {
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
  },

  CLIENT: {
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
  },
}

export type CapabilityKey = keyof CapabilityMap

function normalizeRole(role: string | undefined): UserRole | undefined {
  if (!role) return undefined

  const normalizedRole = role.toUpperCase() as UserRole
  return normalizedRole in RoleCapabilities ? normalizedRole : undefined
}

export function hasCapability(
  role: string | undefined,
  capability: CapabilityKey
): boolean {
  const normalizedRole = normalizeRole(role)
  if (!normalizedRole) return false

  const caps = RoleCapabilities[normalizedRole]
  if (!caps) return false

  return (caps as Record<string, boolean>)[capability] ?? false
}

export function getCapabilities(
  role: string | undefined
): Partial<CapabilityMap> {
  const normalizedRole = normalizeRole(role)
  if (!normalizedRole) return {}

  return RoleCapabilities[normalizedRole] ?? {}
}
