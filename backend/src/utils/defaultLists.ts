/**
 * Valores default para listas configuráveis por projeto.
 * Estes valores são usados ao criar um novo projeto ou popular projetos existentes.
 *
 * listType define o tipo de lista:
 * - MODULE: Módulos SAP para requisitos e membros
 * - REQ_STATUS: Status do workflow de requisitos
 * - INTEGRATION_TYPE: Tipos de integração no cross-matrix
 * - INTEGRATION_TIMING: Timing de integração no cross-matrix
 */

export const LIST_TYPES = {
  MODULE: 'MODULE',
  REQ_STATUS: 'REQ_STATUS',
  INTEGRATION_TYPE: 'INTEGRATION_TYPE',
  INTEGRATION_TIMING: 'INTEGRATION_TIMING',
} as const

export type ListType = typeof LIST_TYPES[keyof typeof LIST_TYPES]

export interface DefaultListItem {
  code: string
  name: string
  color?: string
  icon?: string
  sortOrder: number
  isDefault?: boolean
}

// Módulos SAP padrão para projetos Utilities
// Nomenclatura alinhada com estrutura SAP: ÁREA-SUBÁREA
export const DEFAULT_MODULES: DefaultListItem[] = [
  // Financeiro
  { code: 'FI-CA', name: 'FI-CA - Contract Accounting', color: '#F59E0B', sortOrder: 1 },
  { code: 'FI-AR', name: 'FI-AR - Accounts Receivable', color: '#F59E0B', sortOrder: 2 },
  { code: 'FI-GL', name: 'FI-GL - General Ledger', color: '#F59E0B', sortOrder: 3 },
  // ISU - Industry Solution Utilities
  { code: 'ISU-BILLING', name: 'ISU-BILLING - Faturamento', color: '#3B82F6', sortOrder: 10 },
  { code: 'ISU-BPEM', name: 'ISU-BPEM - Business Process Except. Mgmt', color: '#3B82F6', sortOrder: 11 },
  { code: 'ISU-IDE', name: 'ISU-IDE - Installation & Device Mgmt', color: '#3B82F6', sortOrder: 12 },
  { code: 'ISU-EDM', name: 'ISU-EDM - Energy Data Management', color: '#3B82F6', sortOrder: 13 },
  { code: 'ISU-DM', name: 'ISU-DM - Device Management', color: '#3B82F6', sortOrder: 14 },
  { code: 'ISU-CS', name: 'ISU-CS - Customer Service', color: '#3B82F6', sortOrder: 15 },
  // CRM
  { code: 'CRM', name: 'CRM - Customer Relationship', color: '#10B981', sortOrder: 20 },
  // Logística
  { code: 'SD', name: 'SD - Sales & Distribution', color: '#EC4899', sortOrder: 30 },
  { code: 'MM', name: 'MM - Materials Management', color: '#6366F1', sortOrder: 31 },
  { code: 'PP', name: 'PP - Production Planning', color: '#6366F1', sortOrder: 32 },
  { code: 'PM', name: 'PM - Plant Maintenance', color: '#14B8A6', sortOrder: 33 },
  // Outros
  { code: 'CO', name: 'CO - Controlling', color: '#8B5CF6', sortOrder: 40 },
  { code: 'HR', name: 'HR - Human Resources', color: '#8B5CF6', sortOrder: 41 },
  { code: 'CROSS', name: 'CROSS - Cross-Module', color: '#6B7280', sortOrder: 50 },
  { code: 'CUSTOM', name: 'Customizado', color: '#6B7280', sortOrder: 98 },
  { code: 'OTHER', name: 'Outro', color: '#6B7280', sortOrder: 99, isDefault: true },
]

// Status de requisito com workflow definido
export const DEFAULT_REQ_STATUSES: DefaultListItem[] = [
  { code: 'PENDING', name: 'Pendente', color: '#FCD34D', icon: '⏳', sortOrder: 1, isDefault: true },
  { code: 'IN_PROGRESS', name: 'Em Progresso', color: '#60A5FA', icon: '🚧', sortOrder: 2 },
  { code: 'VALIDATED', name: 'Validado', color: '#34D399', icon: '✅', sortOrder: 3 },
  { code: 'CONFLICT', name: 'Em Conflito', color: '#F87171', icon: '⚠️', sortOrder: 4 },
  { code: 'REJECTED', name: 'Rejeitado', color: '#9CA3AF', icon: '❌', sortOrder: 5 },
  { code: 'APPROVED', name: 'Aprovado', color: '#22C55E', icon: '✔️', sortOrder: 6 },
]

// Tipos de integração SAP
export const DEFAULT_INTEGRATION_TYPES: DefaultListItem[] = [
  { code: 'BAPI', name: 'BAPI', sortOrder: 1 },
  { code: 'IDOC', name: 'IDOC', sortOrder: 2 },
  { code: 'FILE', name: 'Arquivo', sortOrder: 3 },
  { code: 'API', name: 'API REST', sortOrder: 4 },
  { code: 'BATCH', name: 'Batch', sortOrder: 5 },
  { code: 'OTHER', name: 'Outro', sortOrder: 99, isDefault: true },
]

// Timing de execução da integração
export const DEFAULT_INTEGRATION_TIMINGS: DefaultListItem[] = [
  { code: 'SYNC', name: 'Síncrono', sortOrder: 1, isDefault: true },
  { code: 'ASYNC', name: 'Assíncrono', sortOrder: 2 },
  { code: 'BATCH', name: 'Batch', sortOrder: 3 },
  { code: 'EVENT', name: 'Evento', sortOrder: 4 },
]

// Mapa para fácil acesso por listType
export const DEFAULT_LISTS: Record<ListType, DefaultListItem[]> = {
  [LIST_TYPES.MODULE]: DEFAULT_MODULES,
  [LIST_TYPES.REQ_STATUS]: DEFAULT_REQ_STATUSES,
  [LIST_TYPES.INTEGRATION_TYPE]: DEFAULT_INTEGRATION_TYPES,
  [LIST_TYPES.INTEGRATION_TIMING]: DEFAULT_INTEGRATION_TIMINGS,
}

/**
 * Gera os dados para criação de listItems de um projeto.
 * Usado ao criar novo projeto ou migrar projetos existentes.
 */
export function generateDefaultListItemsData(projectId: string) {
  const items: Array<{
    projectId: string
    listType: string
    code: string
    name: string
    color: string | null
    icon: string | null
    sortOrder: number
    isDefault: boolean
  }> = []

  for (const [listType, defaults] of Object.entries(DEFAULT_LISTS)) {
    for (const item of defaults) {
      items.push({
        projectId,
        listType,
        code: item.code,
        name: item.name,
        color: item.color ?? null,
        icon: item.icon ?? null,
        sortOrder: item.sortOrder,
        isDefault: item.isDefault ?? false,
      })
    }
  }

  return items
}

/**
 * Valida se um código pertence a uma lista específica.
 * Usado para validação de fallback quando valores ainda não estão no banco.
 */
export function isValidDefaultCode(listType: ListType, code: string): boolean {
  const defaults = DEFAULT_LISTS[listType]
  if (!defaults) return false
  return defaults.some(item => item.code === code)
}
