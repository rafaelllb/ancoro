/**
 * Sistema centralizado de capacidades por role - Frontend
 *
 * Espelha as capacidades definidas no backend (backend/src/utils/roleCapabilities.ts)
 * para garantir consistência na UI.
 *
 * Regras implementadas conforme docs/ANALISE_PERMISSOES_POR_ROLE.md
 */

// Tipos de role disponíveis
export type UserRole = 'ADMIN' | 'MANAGER' | 'CONSULTANT' | 'CLIENT'

// Mapa de capacidades por role
export const RoleCapabilities = {
  ADMIN: {
    // Requisitos
    canCreateRequirement: true,
    canEditAnyRequirement: true,
    canDeleteAnyRequirement: true,

    // Matriz de Cruzamento
    canViewMatrix: true,
    canRegenerateMatrix: true,
    canEditMatrix: true,

    // Métricas
    canViewMetrics: true,

    // Configurações de Projeto
    canConfigureLists: true,
    canConfigureIdPattern: true,
    canCreateProject: true,
    canEditProject: true,
    canDeleteProject: true,
    canManageMembers: true,

    // Importação/Exportação
    canImportRequirements: true,
    canExportBPD: true,
  },

  MANAGER: {
    // Requisitos
    canCreateRequirement: true,
    canEditAnyRequirement: true,
    canDeleteAnyRequirement: false,

    // Matriz de Cruzamento
    canViewMatrix: true,
    canRegenerateMatrix: true,
    canEditMatrix: true,

    // Métricas
    canViewMetrics: true,

    // Configurações de Projeto
    canConfigureLists: true,
    canConfigureIdPattern: false,
    canCreateProject: true,
    canEditProject: false,
    canDeleteProject: false,
    canManageMembers: true,

    // Importação/Exportação
    canImportRequirements: true,
    canExportBPD: true,
  },

  CONSULTANT: {
    // Requisitos
    canCreateRequirement: true,
    canEditOwnRequirement: true,
    canDeleteOwnRequirement: true,

    // Matriz de Cruzamento
    canViewMatrix: true,
    canRegenerateMatrix: true,
    canEditMatrix: true,

    // Métricas
    canViewMetrics: true,

    // Configurações de Projeto
    canConfigureLists: false,
    canConfigureIdPattern: false,
    canCreateProject: false,
    canEditProject: false,
    canDeleteProject: false,
    canManageMembers: false,

    // Importação/Exportação
    canImportRequirements: false,
    canExportBPD: true,
  },

  CLIENT: {
    // Requisitos
    canCreateRequirement: true,
    canEditAnyRequirement: true,
    canDeleteAnyRequirement: false,

    // Matriz de Cruzamento
    canViewMatrix: false,
    canRegenerateMatrix: false,
    canEditMatrix: false,

    // Métricas
    canViewMetrics: false,

    // Configurações de Projeto
    canConfigureLists: false,
    canConfigureIdPattern: false,
    canCreateProject: false,
    canEditProject: false,
    canDeleteProject: false,
    canManageMembers: false,

    // Importação/Exportação
    canImportRequirements: false,
    canExportBPD: false,
  },
} as const

// Tipo para capacidades
export type CapabilityKey = keyof typeof RoleCapabilities.ADMIN

/**
 * Verifica se um role possui determinada capacidade
 */
export function hasCapability(
  role: string | undefined,
  capability: CapabilityKey
): boolean {
  if (!role) return false

  const caps = RoleCapabilities[role as keyof typeof RoleCapabilities]
  if (!caps) return false

  return (caps as Record<string, boolean>)[capability] ?? false
}

/**
 * Retorna todas as capacidades de um role
 */
export function getCapabilities(
  role: string | undefined
): Partial<typeof RoleCapabilities.ADMIN> {
  if (!role) return {}

  return RoleCapabilities[role as keyof typeof RoleCapabilities] ?? {}
}
