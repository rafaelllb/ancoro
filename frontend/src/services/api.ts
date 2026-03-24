import axios, { AxiosInstance, AxiosError } from 'axios'

// Base URL do backend
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Cria instância do Axios
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor para adicionar token JWT automaticamente
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Interceptor para tratar erros globalmente
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token inválido ou expirado → logout
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api

// ===== TIPOS =====

export interface User {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
  updatedAt: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  user: User
  token: string
}

export interface Requirement {
  id: string
  reqId: string
  projectId: string
  shortDesc: string
  module: string
  what: string
  why: string
  who: string
  when: string
  where: string
  howToday: string
  howMuch: string
  dependsOn: string[]
  providesFor: string[]
  consultantId: string
  consultantNotes?: string
  status: string
  observations?: string
  consultant: {
    id: string
    name: string
    email: string
  }
  _count?: {
    comments: number
  }
  createdAt: string
  updatedAt: string
}

export interface CreateRequirementRequest {
  reqId: string
  projectId: string
  shortDesc: string
  module: string
  what: string
  why: string
  who: string
  when: string
  where: string
  howToday: string
  howMuch: string
  dependsOn?: string[]
  providesFor?: string[]
  consultantNotes?: string
  status?: string
  observations?: string
}

export interface UpdateRequirementRequest {
  shortDesc?: string
  module?: string
  what?: string
  why?: string
  who?: string
  when?: string
  where?: string
  howToday?: string
  howMuch?: string
  dependsOn?: string[]
  providesFor?: string[]
  consultantNotes?: string
  status?: string
  observations?: string
}

export interface CrossMatrixEntry {
  id: string
  projectId: string
  fromReqId: string
  toReqId: string
  fromModule: string
  toModule: string
  dataFlow?: string
  integrationType?: 'BAPI' | 'IDOC' | 'FILE' | 'API' | 'BATCH' | 'OTHER'
  trigger?: string
  timing?: 'SYNC' | 'ASYNC' | 'BATCH' | 'EVENT' | 'REALTIME'
  ownerId?: string
  status: 'PENDING' | 'OK' | 'CONFLICT' | 'CIRCULAR'
  manualNotes?: string
  createdAt: string
  updatedAt: string
}

export interface UpdateCrossMatrixEntryRequest {
  dataFlow?: string
  integrationType?: 'BAPI' | 'IDOC' | 'FILE' | 'API' | 'BATCH' | 'OTHER'
  trigger?: string
  timing?: 'SYNC' | 'ASYNC' | 'BATCH' | 'EVENT' | 'REALTIME'
  ownerId?: string
  status?: 'PENDING' | 'OK' | 'CONFLICT' | 'CIRCULAR'
  manualNotes?: string
}

export interface RegenerateCrossMatrixResponse {
  success: boolean
  data: {
    created: number
    circular: number
    hasCycles: boolean
    cycles: Array<{
      cycle: string[]
      affected: string[]
    }>
  }
  message: string
}

// Comment types
export type CommentType = 'QUESTION' | 'ANSWER' | 'OBSERVATION' | 'CONFLICT'

export interface Comment {
  id: string
  requirementId: string
  userId: string
  content: string
  type: CommentType
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    role: string
  }
}

export interface CreateCommentRequest {
  content: string
  type: CommentType
}

export interface CommentCountResponse {
  total: number
  byType: Record<string, number>
}

// ===== API FUNCTIONS =====

// Auth
export const authAPI = {
  login: (data: LoginRequest) => api.post<LoginResponse>('/api/auth/login', data),
}

// Bulk import types
export interface BulkImportError {
  row: number
  reqId?: string
  errors: string[]
}

export interface BulkImportResponse {
  success: boolean
  created: number
  updated: number  // Quantidade de requisitos atualizados (upsert)
  message: string
  errors?: BulkImportError[]
  validCount?: number
  errorCount?: number
}

export interface BulkImportRequest {
  requirements: Omit<CreateRequirementRequest, 'projectId'>[]
}

// Requirements
export const requirementsAPI = {
  getByProject: (projectId: string, filters?: { module?: string; status?: string }) =>
    api.get<Requirement[]>(`/api/projects/${projectId}/requirements`, { params: filters }),

  getById: (id: string) => api.get<Requirement>(`/api/requirements/${id}`),

  create: (data: CreateRequirementRequest) =>
    api.post<Requirement>('/api/requirements', data),

  update: (id: string, data: UpdateRequirementRequest) =>
    api.patch<Requirement>(`/api/requirements/${id}`, data),

  delete: (id: string) => api.delete(`/api/requirements/${id}`),

  bulkImport: (projectId: string, data: BulkImportRequest) =>
    api.post<BulkImportResponse>(`/api/projects/${projectId}/requirements/bulk`, data),
}

// Projects
export interface CreateProjectRequest {
  name: string
  client: string
  startDate: string
  status?: string
  reqIdPrefix?: string
  reqIdSeparator?: string
  reqIdDigitCount?: number
}

export const projectsAPI = {
  getAll: () => api.get('/api/projects'),

  getById: (projectId: string) => api.get(`/api/projects/${projectId}`),

  // Criar projeto (ADMIN only)
  create: (data: CreateProjectRequest) => api.post('/api/projects', data),

  // Configurações de padrão de ID de requisitos
  getSettings: (projectId: string) =>
    api.get(`/api/projects/${projectId}/settings`),

  updateSettings: (
    projectId: string,
    data: { reqIdPrefix?: string; reqIdSeparator?: string; reqIdDigitCount?: number }
  ) => api.patch(`/api/projects/${projectId}/settings`, data),
}

// ===== PROJECT LIST ITEMS TYPES =====

export type ListType = 'MODULE' | 'REQ_STATUS' | 'INTEGRATION_TYPE' | 'INTEGRATION_TIMING'

export interface ProjectListItem {
  id: string
  projectId: string
  listType: ListType
  code: string
  name: string
  color: string | null
  icon: string | null
  sortOrder: number
  isActive: boolean
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateListItemRequest {
  code: string
  name: string
  color?: string | null
  icon?: string | null
  sortOrder?: number
  isDefault?: boolean
}

export interface UpdateListItemRequest {
  name?: string
  color?: string | null
  icon?: string | null
  sortOrder?: number
  isActive?: boolean
  isDefault?: boolean
}

// Project Lists API
export const projectListsAPI = {
  // Lista itens de uma lista configurável
  getItems: (projectId: string, listType: ListType, includeInactive = false) =>
    api.get<{ success: boolean; listType: ListType; data: ProjectListItem[]; count: number }>(
      `/api/projects/${projectId}/lists/${listType}`,
      { params: { includeInactive } }
    ),

  // Adiciona item à lista
  createItem: (projectId: string, listType: ListType, data: CreateListItemRequest) =>
    api.post<{ success: boolean; data: ProjectListItem; message: string }>(
      `/api/projects/${projectId}/lists/${listType}`,
      data
    ),

  // Atualiza item da lista
  updateItem: (projectId: string, listType: ListType, itemId: string, data: UpdateListItemRequest) =>
    api.patch<{ success: boolean; data: ProjectListItem; message: string }>(
      `/api/projects/${projectId}/lists/${listType}/${itemId}`,
      data
    ),

  // Desativa item da lista (soft delete)
  deleteItem: (projectId: string, listType: ListType, itemId: string) =>
    api.delete<{ success: boolean; message: string }>(
      `/api/projects/${projectId}/lists/${listType}/${itemId}`
    ),
}

// Cross Matrix
export const crossMatrixAPI = {
  getByProject: (projectId: string, filters?: { module?: string }) =>
    api.get<{ success: boolean; data: CrossMatrixEntry[]; count: number }>(
      `/api/projects/${projectId}/cross-matrix`,
      { params: filters }
    ),

  regenerate: (projectId: string) =>
    api.post<RegenerateCrossMatrixResponse>(
      `/api/projects/${projectId}/cross-matrix/regenerate`
    ),

  update: (entryId: string, data: UpdateCrossMatrixEntryRequest) =>
    api.patch<{ success: boolean; data: CrossMatrixEntry; message: string }>(
      `/api/cross-matrix/${entryId}`,
      data
    ),
}

// Comments
export const commentsAPI = {
  getByRequirement: (requirementId: string) =>
    api.get<Comment[]>(`/api/requirements/${requirementId}/comments`),

  create: (requirementId: string, data: CreateCommentRequest) =>
    api.post<Comment>(`/api/requirements/${requirementId}/comments`, data),

  delete: (commentId: string) => api.delete(`/api/comments/${commentId}`),

  getCount: (requirementId: string) =>
    api.get<CommentCountResponse>(`/api/requirements/${requirementId}/comments/count`),
}

// ===== CHANGELOG TYPES =====

export type ChangeType = 'CREATE' | 'UPDATE' | 'DELETE' | 'STATUS_CHANGE' | 'COMMENT_ADDED'

export interface ChangeLog {
  id: string
  requirementId: string
  userId: string
  field: string
  oldValue: string | null
  newValue: string | null
  changeType: ChangeType
  createdAt: string
  user: {
    id: string
    name: string
    email: string
  }
  requirement?: {
    id: string
    reqId: string
    shortDesc: string
    module: string
  }
}

export interface ChangeLogResponse {
  changes: ChangeLog[]
  total: number
  pagination: {
    limit: number
    offset: number
    hasMore: boolean
  }
}

export interface RollbackResponse {
  message: string
  requirement: Requirement
  rolledBack: {
    field: string
    from: string | null
    to: string | null
  }
}

// Changelog API
export const changelogAPI = {
  getByRequirement: (
    requirementId: string,
    params?: {
      field?: string
      userId?: string
      startDate?: string
      endDate?: string
      limit?: number
      offset?: number
    }
  ) =>
    api.get<ChangeLogResponse>(`/api/requirements/${requirementId}/changes`, { params }),

  getByProject: (
    projectId: string,
    params?: {
      changeType?: ChangeType
      limit?: number
      offset?: number
    }
  ) =>
    api.get<ChangeLogResponse>(`/api/projects/${projectId}/changes`, { params }),

  getById: (changeId: string) =>
    api.get<ChangeLog>(`/api/changes/${changeId}`),

  rollback: (requirementId: string, changeId: string) =>
    api.post<RollbackResponse>(`/api/requirements/${requirementId}/rollback/${changeId}`),
}

// ===== EXPORT TYPES =====

export interface ExportValidation {
  ready: boolean
  warnings: string[]
  stats: {
    total: number
    validated: number
    conflicts: number
    pending: number
  }
}

export interface ExportPreviewResponse {
  success: boolean
  data: {
    markdown: string
    generatedAt: string
  }
}

// Export API
export const exportAPI = {
  // Valida se projeto está pronto para exportação
  validate: (projectId: string, module?: string) =>
    api.get<{ success: boolean; data: ExportValidation }>(
      `/api/projects/${projectId}/export/validate`,
      { params: { module } }
    ),

  // Preview do BPD em Markdown
  preview: (projectId: string, module?: string) =>
    api.get<ExportPreviewResponse>(
      `/api/projects/${projectId}/export/bpd/preview`,
      { params: { module } }
    ),

  // Download do BPD (retorna blob para download)
  downloadBPD: async (
    projectId: string,
    format: 'md' | 'docx',
    module?: string
  ): Promise<Blob> => {
    const response = await api.get(`/api/projects/${projectId}/export/bpd`, {
      params: { format, module },
      responseType: 'blob',
    })
    return response.data
  },
}

// ===== METRICS TYPES =====

export interface ProjectMetrics {
  totalRequirements: number
  totalIntegrations: number
  totalComments: number
  totalChanges: number
  requirementsByStatus: Record<string, number>
  requirementsByModule: Record<string, number>
  validationRate: number
  openConflicts: number
  pendingIntegrations: number
  circularDependencies: number
  recentChanges: number
  recentComments: number
}

export interface ConsultantPendency {
  consultantId: string
  consultantName: string
  consultantEmail: string
  pendingRequirements: number
  conflictRequirements: number
  totalAssigned: number
}

export interface TimelineDataPoint {
  date: string
  validated: number
  pending: number
  conflicts: number
  total: number
}

export interface ModuleHeatmapCell {
  fromModule: string
  toModule: string
  count: number
  status: 'OK' | 'PENDING' | 'CONFLICT' | 'MIXED'
}

export interface HeatmapResponse {
  cells: ModuleHeatmapCell[]
  modules: string[]
}

// Metrics API
export const metricsAPI = {
  // Métricas gerais do projeto
  getMetrics: (projectId: string) =>
    api.get<{ success: boolean; data: ProjectMetrics }>(
      `/api/projects/${projectId}/metrics`
    ),

  // Consultores com pendências
  getConsultants: (projectId: string) =>
    api.get<{ success: boolean; data: ConsultantPendency[]; count: number }>(
      `/api/projects/${projectId}/metrics/consultants`
    ),

  // Timeline de progresso
  getTimeline: (projectId: string, weeks?: number) =>
    api.get<{ success: boolean; data: TimelineDataPoint[]; count: number }>(
      `/api/projects/${projectId}/metrics/timeline`,
      { params: { weeks } }
    ),

  // Heatmap de integrações
  getHeatmap: (projectId: string) =>
    api.get<{ success: boolean; data: HeatmapResponse }>(
      `/api/projects/${projectId}/metrics/heatmap`
    ),

  // Estatísticas de comentários
  getCommentStats: (projectId: string) =>
    api.get<{ success: boolean; data: Record<string, number> }>(
      `/api/projects/${projectId}/metrics/comments`
    ),
}

// ===== PROJECT MEMBERS TYPES =====

export interface ProjectMember {
  id: string
  projectId: string
  userId: string
  module: string | null
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    role: string
  }
}

export interface AvailableUser {
  id: string
  name: string
  email: string
  role: string
}

export interface AddMemberRequest {
  userId: string
  module?: string | null
}

export interface UpdateMemberRequest {
  module?: string | null
}

// Project Members API
export const projectMembersAPI = {
  // Lista membros do projeto
  getMembers: (projectId: string) =>
    api.get<{ success: boolean; data: ProjectMember[]; count: number }>(
      `/api/projects/${projectId}/members`
    ),

  // Lista usuários disponíveis (não membros do projeto)
  getAvailableUsers: (projectId: string) =>
    api.get<{ success: boolean; data: AvailableUser[]; count: number }>(
      `/api/users/available`,
      { params: { projectId } }
    ),

  // Adiciona membro ao projeto
  addMember: (projectId: string, data: AddMemberRequest) =>
    api.post<{ success: boolean; data: ProjectMember; message: string }>(
      `/api/projects/${projectId}/members`,
      data
    ),

  // Atualiza módulo do membro
  updateMember: (projectId: string, userId: string, data: UpdateMemberRequest) =>
    api.patch<{ success: boolean; data: ProjectMember; message: string }>(
      `/api/projects/${projectId}/members/${userId}`,
      data
    ),

  // Remove membro do projeto
  removeMember: (projectId: string, userId: string) =>
    api.delete<{ success: boolean; message: string }>(
      `/api/projects/${projectId}/members/${userId}`
    ),
}
