/**
 * Sistema centralizado de capacidades por role
 *
 * Este arquivo é a fonte única de verdade para permissões no backend.
 * O frontend deve espelhar estas capacidades para consistência na UI.
 *
 * Regras implementadas conforme docs/ANALISE_PERMISSOES_POR_ROLE.md
 */

import { UserRole, UserRoleType } from '../types'

// Mapa de capacidades por role
// Cada capacidade é um booleano indicando se o role pode executar a ação
export const RoleCapabilities = {
  [UserRole.ADMIN]: {
    // Requisitos
    canCreateRequirement: true,
    canEditAnyRequirement: true,    // Pode editar qualquer requisito
    canDeleteAnyRequirement: true,  // Pode excluir qualquer requisito

    // Matriz de Cruzamento
    canViewMatrix: true,
    canRegenerateMatrix: true,
    canEditMatrix: true,

    // Métricas
    canViewMetrics: true,

    // Configurações de Projeto
    canConfigureLists: true,        // Listas configuráveis (status, módulos, etc)
    canConfigureIdPattern: true,    // Padrão de ID de requisitos
    canCreateProject: true,
    canEditProject: true,           // Dados gerais do projeto
    canDeleteProject: true,
    canManageMembers: true,         // Adicionar/remover membros

    // Importação/Exportação
    canImportRequirements: true,    // Importar via planilha
    canExportBPD: true,             // Exportar BPD
  },

  [UserRole.MANAGER]: {
    // Requisitos
    canCreateRequirement: true,
    canEditAnyRequirement: true,    // Pode editar qualquer requisito do projeto
    canDeleteAnyRequirement: false, // NÃO pode excluir requisitos

    // Matriz de Cruzamento
    canViewMatrix: true,
    canRegenerateMatrix: true,
    canEditMatrix: true,

    // Métricas
    canViewMetrics: true,

    // Configurações de Projeto
    canConfigureLists: true,        // Pode configurar listas
    canConfigureIdPattern: false,   // NÃO pode alterar padrão de ID (só ADMIN)
    canCreateProject: true,
    canEditProject: false,          // NÃO pode editar dados gerais (só ADMIN)
    canDeleteProject: false,        // NÃO pode excluir projeto (só ADMIN)
    canManageMembers: true,         // Pode gerenciar membros

    // Importação/Exportação
    canImportRequirements: true,
    canExportBPD: true,
  },

  [UserRole.CONSULTANT]: {
    // Requisitos
    canCreateRequirement: true,
    canEditOwnRequirement: true,    // Pode editar apenas requisitos próprios
    canDeleteOwnRequirement: true,  // Pode excluir apenas requisitos próprios

    // Nota: CONSULTANT não tem canEditAnyRequirement nem canDeleteAnyRequirement
    // A lógica de ownership é verificada em middleware separado

    // Matriz de Cruzamento
    canViewMatrix: true,
    canRegenerateMatrix: true,
    canEditMatrix: true,

    // Métricas
    canViewMetrics: true,           // MUDANÇA: agora pode ver métricas

    // Configurações de Projeto
    canConfigureLists: false,       // NÃO pode configurar listas
    canConfigureIdPattern: false,
    canCreateProject: false,
    canEditProject: false,
    canDeleteProject: false,
    canManageMembers: false,

    // Importação/Exportação
    canImportRequirements: false,   // NÃO pode importar via planilha
    canExportBPD: true,
  },

  [UserRole.CLIENT]: {
    // Requisitos
    canCreateRequirement: true,     // MUDANÇA: agora pode criar
    canEditAnyRequirement: true,    // MUDANÇA: agora pode editar qualquer requisito
    canDeleteAnyRequirement: false, // NÃO pode excluir

    // Matriz de Cruzamento
    canViewMatrix: false,           // NÃO pode ver matriz
    canRegenerateMatrix: false,
    canEditMatrix: false,

    // Métricas
    canViewMetrics: false,          // NÃO pode ver métricas

    // Configurações de Projeto
    canConfigureLists: false,
    canConfigureIdPattern: false,
    canCreateProject: false,
    canEditProject: false,
    canDeleteProject: false,
    canManageMembers: false,

    // Importação/Exportação
    canImportRequirements: false,
    canExportBPD: false,            // NÃO pode exportar BPD
  },
} as const

// Tipo para todas as capacidades disponíveis
export type CapabilityKey = keyof typeof RoleCapabilities[typeof UserRole.ADMIN]

/**
 * Verifica se um role possui determinada capacidade
 *
 * @param role - Role do usuário (ADMIN, MANAGER, CONSULTANT, CLIENT)
 * @param capability - Nome da capacidade a verificar
 * @returns true se o role possui a capacidade, false caso contrário
 */
export function hasCapability(
  role: UserRoleType | string | undefined,
  capability: CapabilityKey
): boolean {
  if (!role) return false

  const caps = RoleCapabilities[role as keyof typeof RoleCapabilities]
  if (!caps) return false

  return caps[capability] ?? false
}

/**
 * Retorna todas as capacidades de um role
 *
 * @param role - Role do usuário
 * @returns Objeto com todas as capacidades do role
 */
export function getCapabilities(
  role: UserRoleType | string | undefined
): Partial<typeof RoleCapabilities[typeof UserRole.ADMIN]> {
  if (!role) return {}

  return RoleCapabilities[role as keyof typeof RoleCapabilities] ?? {}
}

/**
 * Verifica se o role pode editar requisitos (considerando ownership para CONSULTANT)
 * Esta função é um helper para ser usado em conjunto com verificação de ownership
 *
 * @param role - Role do usuário
 * @returns true se o role tem alguma capacidade de edição
 */
export function canEditRequirements(role: UserRoleType | string | undefined): boolean {
  if (!role) return false

  return (
    hasCapability(role, 'canEditAnyRequirement') ||
    hasCapability(role, 'canEditOwnRequirement' as CapabilityKey)
  )
}

/**
 * Verifica se o role pode excluir requisitos (considerando ownership para CONSULTANT)
 * Esta função é um helper para ser usado em conjunto com verificação de ownership
 *
 * @param role - Role do usuário
 * @returns true se o role tem alguma capacidade de exclusão
 */
export function canDeleteRequirements(role: UserRoleType | string | undefined): boolean {
  if (!role) return false

  return (
    hasCapability(role, 'canDeleteAnyRequirement') ||
    hasCapability(role, 'canDeleteOwnRequirement' as CapabilityKey)
  )
}
