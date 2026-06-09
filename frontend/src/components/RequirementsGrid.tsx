import { useEffect, useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnFiltersState,
  RowSelectionState,
} from '@tanstack/react-table'
import { Requirement } from '../services/api'
import { useUpdateRequirement, useDeleteRequirement, useBulkDeleteRequirements } from '../hooks/useRequirements'
import { useAuth } from '../contexts/AuthContext'
import {
  canDeleteRequirement,
  canEditRequirement,
  canEditResponsibleConsultant,
  canEditResponsibleBusiness,
} from '../hooks/useCapabilities'
import { useProjectMembers } from '../hooks/useProjectMembers'
import { useProjectModules } from '../hooks/useProjectLists'
import { useProjectTerminology } from '../hooks/useProjectTerminology'
import ConfirmDialog from './ConfirmDialog'
import { SkeletonRequirementsGrid } from './Skeleton'
import { RequirementMultiSelect, RequirementOption } from './RequirementMultiSelect'

// ===== TIPOS =====

interface RequirementsGridProps {
  data: Requirement[]
  isLoading: boolean
  onRowSelect?: (requirement: Requirement | null) => void
  projectId: string
  scopedModule?: string
  assignedModule?: string
  showAllModules?: boolean
}

// ===== STATUS INDICATORS =====

const STATUS_CONFIG = {
  PENDING: { emoji: '⏳', label: 'Pendente', color: 'bg-slate-100 text-slate-700 border border-slate-200' },
  IN_PROGRESS: { emoji: '🚧', label: 'Em Progresso', color: 'bg-blue-50 text-blue-700 border border-blue-200' },
  VALIDATED: { emoji: '✅', label: 'Validado', color: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  APPROVED: { emoji: '✔️', label: 'Aprovado', color: 'bg-teal-50 text-teal-700 border border-teal-200' },
  CONFLICT: { emoji: '🔴', label: 'Conflito', color: 'bg-red-50 text-red-700 border border-red-200' },
  REJECTED: { emoji: '❌', label: 'Rejeitado', color: 'bg-rose-50 text-rose-700 border border-rose-200' },
}

const StatusBadge = ({ status }: { status: string }) => {
  const config = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${config.color}`}>
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </span>
  )
}

// ===== EDITABLE STATUS CELL =====
// Componente dropdown para edição inline do status do requisito
// Exibe StatusBadge quando não está editando, select dropdown quando clicado

interface EditableStatusCellProps {
  value: string
  rowId: string
  onUpdate: (id: string, field: string, value: string) => void
  disabled?: boolean
}

const EditableStatusCell = ({ value, rowId, onUpdate, disabled = false }: EditableStatusCellProps) => {
  const [isEditing, setIsEditing] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value
    setIsEditing(false)
    if (newValue !== value) {
      onUpdate(rowId, 'status', newValue)
    }
  }

  if (isEditing) {
    return (
      <select
        className="w-full px-2 py-1 bg-white text-gray-900 border border-teal-400 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
        value={value}
        onChange={handleChange}
        onBlur={() => setIsEditing(false)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={disabled}
        autoFocus
        title="Selecionar status do requisito"
        aria-label="Status do requisito"
      >
        {Object.entries(STATUS_CONFIG).map(([key, config]) => (
          <option key={key} value={key}>
            {config.emoji} {config.label}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div
      className={`${disabled ? 'cursor-default opacity-70' : 'cursor-pointer hover:opacity-80'} transition-opacity`}
      onClick={(e) => {
        if (disabled) return
        e.stopPropagation() // Evita selecionar a row ao clicar no status
        setIsEditing(true)
      }}
      title={disabled ? 'Sem permissão para alterar o status' : 'Clique para alterar o status'}
    >
      <StatusBadge status={value} />
    </div>
  )
}

// ===== EDITABLE MODULE CELL =====
// Dropdown para seleção de módulo
// Permite tanto seleção de módulos pré-definidos quanto entrada customizada

const MODULES = [
  'FI-CA',
  'FI-AR',
  'FI-GL',
  'ISU-BILLING',
  'ISU-BPEM',
  'ISU-IDE',
  'ISU-EDM',
  'ISU-DM',
  'ISU-CS',
  'CRM',
  'SD',
  'MM',
  'PP',
  'CO',
  'PM',
  'HR',
  'CROSS',
  'CUSTOM',
  'OTHER',
]

interface EditableModuleCellProps {
  value: string
  rowId: string
  options: string[]
  label: string
  onUpdate: (id: string, field: string, value: string) => void
  disabled?: boolean
}

const EditableModuleCell = ({ value, rowId, options, label, onUpdate, disabled = false }: EditableModuleCellProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [isCustom, setIsCustom] = useState(false)
  const [customValue, setCustomValue] = useState('')

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value
    if (newValue === '__custom__') {
      setIsCustom(true)
      setCustomValue(value)
    } else {
      setIsEditing(false)
      if (newValue !== value) {
        onUpdate(rowId, 'module', newValue)
      }
    }
  }

  const handleCustomBlur = () => {
    setIsEditing(false)
    setIsCustom(false)
    if (customValue && customValue !== value) {
      onUpdate(rowId, 'module', customValue.toUpperCase())
    }
  }

  if (isEditing) {
    if (isCustom) {
      return (
        <input
          type="text"
          className="w-full px-2 py-1 bg-white text-gray-900 border border-teal-400 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm uppercase"
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          onBlur={handleCustomBlur}
          onKeyDown={(e) => e.key === 'Enter' && handleCustomBlur()}
          autoFocus
          placeholder="Ex: ISU-CUSTOM"
        />
      )
    }

    return (
      <select
        className="w-full px-2 py-1 bg-white text-gray-900 border border-teal-400 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
        value={options.includes(value) ? value : '__custom__'}
        onChange={handleSelectChange}
        onBlur={() => setIsEditing(false)}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={disabled}
        autoFocus
        title={`Selecionar ${label}`}
        aria-label={label}
      >
        {options.map((mod) => (
          <option key={mod} value={mod}>
            {mod}
          </option>
        ))}
        <option value="__custom__">Outro...</option>
      </select>
    )
  }

  return (
    <div
      className={`px-2 py-1 bg-gray-50 rounded font-medium text-gray-700 ${disabled ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-gray-100'}`}
      onClick={(e) => {
        if (disabled) return
        e.stopPropagation()
        setIsEditing(true)
      }}
      title={disabled ? `Sem permissão para alterar ${label.toLowerCase()}` : `Clique para alterar ${label.toLowerCase()}`}
    >
      {value || '—'}
    </div>
  )
}

interface EditableResponsibleConsultantCellProps {
  value?: string | null
  rowId: string
  options: Array<{ id: string; name: string }>
  onUpdate: (id: string, field: string, value: string | null) => void
  disabled?: boolean
}

const EditableResponsibleConsultantCell = ({
  value,
  rowId,
  options,
  onUpdate,
  disabled = false,
}: EditableResponsibleConsultantCellProps) => {
  return (
    <select
      className={`w-full px-2 py-1 border rounded text-sm ${disabled ? 'bg-gray-100 cursor-not-allowed border-gray-200' : 'bg-white border-gray-300'}`}
      value={value || ''}
      disabled={disabled}
      onChange={(e) => onUpdate(rowId, 'responsibleConsultantId', e.target.value || null)}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label="Responsável consultor"
    >
      <option value="">Não atribuído</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  )
}

// ===== EXPANDED EDIT MODAL =====
// Modal para edição expandida de campos de texto

interface ExpandedEditModalProps {
  isOpen: boolean
  title: string
  value: string
  onSave: (value: string) => void
  onClose: () => void
}

const ExpandedEditModal = ({ isOpen, title, value, onSave, onClose }: ExpandedEditModalProps) => {
  const [localValue, setLocalValue] = useState(value)

  // Atualiza valor local quando modal abre com novo valor
  useEffect(() => {
    setLocalValue(value)
  }, [value, isOpen])

  if (!isOpen) return null

  const handleSave = () => {
    onSave(localValue)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl+Enter ou Cmd+Enter para salvar
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSave()
    }
    // Escape para fechar
    if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal - stopPropagation impede que cliques no modal fechem via overlay */}
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
            aria-label="Fechar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 overflow-auto">
          <textarea
            className="w-full h-64 px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none text-sm"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder="Digite o conteúdo..."
          />
          <p className="text-xs text-gray-500 mt-2">
            Dica: Ctrl+Enter para salvar, Escape para cancelar
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 text-sm font-medium transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium transition-colors"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== EDITABLE CELL =====

interface EditableCellProps {
  value: string | string[]
  rowId: string
  columnId: string
  columnLabel?: string
  onUpdate: (id: string, field: string, value: any) => void
  multiline?: boolean
  isArray?: boolean
  disabled?: boolean
}

const EditableCell = ({ value, rowId, columnId, columnLabel, onUpdate, multiline, isArray, disabled = false }: EditableCellProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [localValue, setLocalValue] = useState(isArray ? (value as string[]).join(', ') : (value as string))

  const displayValue = isArray ? (value as string[]).join(', ') : (value as string)

  const handleBlur = () => {
    setIsEditing(false)
    const finalValue = isArray ? localValue.split(',').map((s) => s.trim()).filter(Boolean) : localValue
    if (!disabled && finalValue !== value) {
      onUpdate(rowId, columnId, finalValue)
    }
  }

  const handleModalSave = (newValue: string) => {
    const finalValue = isArray ? newValue.split(',').map((s) => s.trim()).filter(Boolean) : newValue
    if (!disabled && finalValue !== value) {
      onUpdate(rowId, columnId, finalValue)
    }
  }

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(false)
    setIsModalOpen(true)
  }

  if (isEditing) {
    return (
      <div className="relative">
        {multiline ? (
          <textarea
            className="w-full px-2 py-1 pr-8 bg-white text-gray-900 border border-teal-400 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={disabled}
            autoFocus
            rows={3}
            aria-label={`Editar ${columnId}`}
            placeholder={`Digite o valor para ${columnId}`}
          />
        ) : (
          <input
            type="text"
            className="w-full px-2 py-1 pr-8 bg-white text-gray-900 border border-teal-400 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={handleBlur}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={disabled}
            autoFocus
            aria-label={`Editar ${columnId}`}
            placeholder={`Digite o valor para ${columnId}`}
          />
        )}
        {/* Botão expandir */}
        <button
          type="button"
          onMouseDown={handleExpandClick}
          className="absolute top-1 right-1 p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
          title="Expandir para edição completa"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>

        {/* Modal de edição expandida */}
        <ExpandedEditModal
          isOpen={isModalOpen}
          title={columnLabel || columnId}
          value={localValue}
          onSave={handleModalSave}
          onClose={() => setIsModalOpen(false)}
        />
      </div>
    )
  }

  return (
    <>
      <div
        className={`px-2 py-1 bg-gray-50 rounded min-h-[32px] text-gray-900 group relative ${disabled ? 'cursor-default opacity-70' : 'cursor-text hover:bg-gray-100'}`}
        onClick={(e) => {
          e.stopPropagation()
          if (disabled) return
          setLocalValue(displayValue)
          setIsEditing(true)
        }}
        title={disabled ? 'Sem permissão para editar este campo' : 'Clique para editar'}
      >
        <span className="line-clamp-2 pr-6">{displayValue || '—'}</span>
        {/* Botão expandir visível no hover - sempre disponível para todos os campos */}
        {displayValue && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleExpandClick(e)
            }}
            className="absolute top-1 right-1 p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors opacity-0 group-hover:opacity-100"
            title="Expandir para ver completo"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        )}
      </div>

      {/* Modal de edição expandida */}
      <ExpandedEditModal
        isOpen={isModalOpen}
        title={columnLabel || columnId}
        value={displayValue}
        onSave={handleModalSave}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}

// ===== MAIN COMPONENT =====

export default function RequirementsGrid({
  data,
  isLoading,
  onRowSelect,
  projectId,
  scopedModule,
  assignedModule,
  showAllModules = false,
}: RequirementsGridProps) {
  const { user } = useAuth()
  // userRole obtido diretamente do contexto para evitar problemas de sincronização com props
  const userRole = user?.role
  const { data: membersResponse } = useProjectMembers(projectId)
  const projectMembers = membersResponse?.data || []
  const { data: projectModules = [] } = useProjectModules(projectId)
  const { moduleLabel } = useProjectTerminology(projectId)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)

  // Paginação client-side: controla quantos itens exibir progressivamente
  const [pageSize, setPageSize] = useState(20)
  const [displayCount, setDisplayCount] = useState(20)

  // Estado para dialog de confirmação de delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [requirementToDelete, setRequirementToDelete] = useState<Requirement | null>(null)

  // Estado para seleção múltipla (bulk delete)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)
  const [forceDeleteDialogOpen, setForceDeleteDialogOpen] = useState(false)
  const [forceDeleteIds, setForceDeleteIds] = useState<string[]>([])

  const updateMutation = useUpdateRequirement()
  const deleteMutation = useDeleteRequirement()
  const bulkDeleteMutation = useBulkDeleteRequirements()

  const consultantOptions = useMemo(
    () =>
      projectMembers
        .filter((member) => member.user.role === 'CONSULTANT')
        .map((member) => ({ id: member.user.id, name: member.user.name })),
    [projectMembers]
  )
  const moduleOptions = useMemo(
    () => (projectModules.length ? projectModules.map((item) => item.code) : MODULES),
    [projectModules]
  )

  // Opções de requisitos para autocomplete de dependências
  const requirementOptions: RequirementOption[] = useMemo(
    () => data.map((req) => ({
      reqId: req.reqId,
      shortDesc: req.shortDesc,
      module: req.module,
    })),
    [data]
  )

  const visibleData = useMemo(
    () => (scopedModule ? data.filter((requirement) => requirement.module === scopedModule) : data),
    [data, scopedModule]
  )

  const isReadOnlyExternalRequirement = (requirement: Requirement) =>
    !!assignedModule &&
    showAllModules &&
    (userRole === 'CONSULTANT' || userRole === 'CLIENT') &&
    requirement.module !== assignedModule

  // Requisitos selecionados para bulk delete (derivado do estado de seleção)
  const selectedRequirements = useMemo(() => {
    return Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((id) => visibleData.find((r) => r.id === id))
      .filter(Boolean) as Requirement[]
  }, [rowSelection, visibleData])

  // Handler para confirmar bulk delete
  const handleConfirmBulkDelete = () => {
    if (selectedRequirements.length === 0) return

    bulkDeleteMutation.mutate(
      {
        projectId,
        ids: selectedRequirements.map((r) => r.id),
      },
      {
        onSuccess: (response) => {
          setBulkDeleteDialogOpen(false)

          // Detecta falhas por cross-matrix e oferece force-delete
          const crossMatrixFailures = response.data.failures?.filter(
            (f) => f.reason.includes('matriz cruzada')
          )
          if (crossMatrixFailures && crossMatrixFailures.length > 0) {
            setForceDeleteIds(crossMatrixFailures.map((f) => f.id))
            setForceDeleteDialogOpen(true)
          } else {
            setRowSelection({})
          }

          // Limpa panel de detalhes se necessário
          if (selectedRowId && selectedRequirements.some((r) => r.id === selectedRowId)) {
            setSelectedRowId(null)
            onRowSelect?.(null)
          }
        },
        onError: () => {
          setBulkDeleteDialogOpen(false)
        },
      }
    )
  }

  // Handler para force-delete de requisitos com dependências cross-matrix
  const handleForceDelete = () => {
    if (forceDeleteIds.length === 0) return

    bulkDeleteMutation.mutate(
      {
        projectId,
        ids: forceDeleteIds,
        force: true,
      },
      {
        onSuccess: () => {
          setForceDeleteDialogOpen(false)
          setForceDeleteIds([])
          setRowSelection({})
        },
        onError: () => {
          setForceDeleteDialogOpen(false)
          setForceDeleteIds([])
        },
      }
    )
  }

  // Handler para abrir dialog de delete
  const handleDeleteClick = (requirement: Requirement, e: React.MouseEvent) => {
    e.stopPropagation() // Evita selecionar a row
    setRequirementToDelete(requirement)
    setDeleteDialogOpen(true)
  }

  // Handler para confirmar delete
  const handleConfirmDelete = () => {
    if (requirementToDelete) {
      deleteMutation.mutate(requirementToDelete.id, {
        onSuccess: () => {
          setDeleteDialogOpen(false)
          setRequirementToDelete(null)
          // Se o requisito deletado estava selecionado, limpa seleção
          if (selectedRowId === requirementToDelete.id) {
            setSelectedRowId(null)
            onRowSelect?.(null)
          }
        },
        onError: () => {
          // Erro já tratado pelo hook com toast
          setDeleteDialogOpen(false)
          setRequirementToDelete(null)
        },
      })
    }
  }

  // Handler para cancelar delete
  const handleCancelDelete = () => {
    setDeleteDialogOpen(false)
    setRequirementToDelete(null)
  }

  // Handler para atualizar célula
  const handleCellUpdate = (id: string, field: string, value: any) => {
    const requirement = visibleData.find((item) => item.id === id) || data.find((item) => item.id === id)
    if (!requirement) return

    if (isReadOnlyExternalRequirement(requirement)) {
      return
    }

    const canEditResponsibleConsultantField = canEditResponsibleConsultant(
      userRole,
      user?.id,
      requirement.responsibleConsultantId
    )

    const canEditResponsibleBusinessField = canEditResponsibleBusiness(
      userRole,
      user?.id,
      requirement.responsibleConsultantId
    )

    const canEditThisRequirement = canEditRequirement(
      userRole,
      user?.id,
      requirement.responsibleConsultantId
    )

    // Verificação de permissão por campo
    if (field === 'responsibleConsultantId') {
      if (!canEditResponsibleConsultantField) return
    } else if (field === 'responsibleBusiness') {
      if (!canEditResponsibleBusinessField) return
    } else if (!canEditThisRequirement) {
      return
    }

    updateMutation.mutate({ id, data: { [field]: value } })
  }

  // Column helper
  const columnHelper = createColumnHelper<Requirement>()

  // Definição de colunas
  const columns = useMemo(
    () => {
      const shouldShowActionsColumn =
        userRole === 'ADMIN' ||
        (userRole === 'CONSULTANT' &&
          visibleData.some((requirement) =>
            canDeleteRequirement(userRole, user?.id, requirement.responsibleConsultantId)
          ))

      // Verifica se deve mostrar coluna de seleção (mesma lógica da coluna de ações)
      const shouldShowSelectionColumn = shouldShowActionsColumn

      const baseColumns = [
      // Coluna de checkbox para seleção múltipla (bulk delete)
      ...(shouldShowSelectionColumn
        ? [
            columnHelper.display({
              id: 'select',
              size: 40,
              header: ({ table }) => {
                // Apenas requisitos que o usuário pode deletar
                const deletableRows = table.getRowModel().rows.filter(
                  (row) =>
                    !isReadOnlyExternalRequirement(row.original) &&
                    canDeleteRequirement(userRole, user?.id, row.original.responsibleConsultantId)
                )
                const allDeletableSelected =
                  deletableRows.length > 0 && deletableRows.every((row) => row.getIsSelected())
                const someDeletableSelected =
                  deletableRows.some((row) => row.getIsSelected()) && !allDeletableSelected

                return (
                  <input
                    type="checkbox"
                    checked={allDeletableSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someDeletableSelected
                    }}
                    onChange={() => {
                      if (allDeletableSelected) {
                        // Desmarcar todos
                        setRowSelection({})
                      } else {
                        // Selecionar apenas os que pode deletar
                        const newSelection: RowSelectionState = {}
                        deletableRows.forEach((row) => {
                          newSelection[row.original.id] = true
                        })
                        setRowSelection(newSelection)
                      }
                    }}
                    disabled={deletableRows.length === 0}
                    title={
                      deletableRows.length === 0
                        ? 'Nenhum requisito pode ser deletado'
                        : 'Selecionar todos que podem ser deletados'
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  />
                )
              },
              cell: ({ row }) => {
                const canDelete =
                  !isReadOnlyExternalRequirement(row.original) &&
                  canDeleteRequirement(userRole, user?.id, row.original.responsibleConsultantId)

                return (
                  <input
                    type="checkbox"
                    checked={row.getIsSelected()}
                    onChange={(e) => {
                      e.stopPropagation()
                      row.toggleSelected()
                    }}
                    onClick={(e) => e.stopPropagation()}
                    disabled={!canDelete}
                    title={canDelete ? undefined : 'Você não pode deletar este requisito'}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  />
                )
              },
            }),
          ]
        : []),

      columnHelper.accessor('reqId', {
        header: 'Req ID',
        size: 120,
        cell: (info) => (
          <span className="font-mono font-semibold text-blue-600">{info.getValue()}</span>
        ),
      }),

      columnHelper.accessor('shortDesc', {
        header: 'Descrição',
        size: 250,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="shortDesc"
            columnLabel="Descrição"
            onUpdate={handleCellUpdate}
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
          />
        ),
      }),

      columnHelper.accessor('module', {
        header: moduleLabel,
        size: 120,
        cell: (info) => (
          <EditableModuleCell
            value={info.getValue()}
            rowId={info.row.original.id}
            options={moduleOptions}
            label={moduleLabel}
            onUpdate={handleCellUpdate}
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
          />
        ),
      }),

      columnHelper.accessor('status', {
        header: 'Status',
        size: 150,
        cell: (info) => (
          <EditableStatusCell
            value={info.getValue()}
            rowId={info.row.original.id}
            onUpdate={handleCellUpdate}
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
          />
        ),
      }),
      columnHelper.display({
        id: 'responsibleConsultant',
        header: 'Responsável Consultor',
        size: 220,
        cell: (info) => (
          <EditableResponsibleConsultantCell
            value={info.row.original.responsibleConsultantId}
            rowId={info.row.original.id}
            options={consultantOptions}
            onUpdate={handleCellUpdate}
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditResponsibleConsultant(
              userRole,
              user?.id,
              info.row.original.responsibleConsultantId
            )}
          />
        ),
      }),
      columnHelper.accessor('responsibleBusiness', {
        header: 'Responsável Negócio',
        size: 220,
        cell: (info) => (
          <EditableCell
            value={info.getValue() || ''}
            rowId={info.row.original.id}
            columnId="responsibleBusiness"
            columnLabel="Responsável Negócio"
            onUpdate={handleCellUpdate}
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditResponsibleBusiness(userRole, user?.id, info.row.original.responsibleConsultantId)}
          />
        ),
      }),

      columnHelper.accessor('what', {
        header: 'What (O que)',
        size: 280,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="what"
            columnLabel="What (O que)"
            onUpdate={handleCellUpdate}
            multiline
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
          />
        ),
      }),

      columnHelper.accessor('why', {
        header: 'Why (Por que)',
        size: 280,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="why"
            columnLabel="Why (Por que)"
            onUpdate={handleCellUpdate}
            multiline
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
          />
        ),
      }),

      columnHelper.accessor('who', {
        header: 'Who (Quem)',
        size: 180,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="who"
            columnLabel="Who (Quem)"
            onUpdate={handleCellUpdate}
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
          />
        ),
      }),

      columnHelper.accessor('when', {
        header: 'When (Quando)',
        size: 180,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="when"
            columnLabel="When (Quando)"
            onUpdate={handleCellUpdate}
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
          />
        ),
      }),

      columnHelper.accessor('where', {
        header: 'Where (Onde)',
        size: 180,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="where"
            columnLabel="Where (Onde)"
            onUpdate={handleCellUpdate}
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
          />
        ),
      }),

      columnHelper.accessor('howToday', {
        header: 'How (Hoje)',
        size: 280,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="howToday"
            columnLabel="How (Como é hoje)"
            onUpdate={handleCellUpdate}
            multiline
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
          />
        ),
      }),

      columnHelper.accessor('howMuch', {
        header: 'How Much (Quanto)',
        size: 180,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="howMuch"
            columnLabel="How Much (Quanto)"
            onUpdate={handleCellUpdate}
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
          />
        ),
      }),

      columnHelper.accessor('dependsOn', {
        header: 'Depende De',
        size: 200,
        cell: (info) => (
          <RequirementMultiSelect
            value={info.getValue() || []}
            onChange={(newValue) => handleCellUpdate(info.row.original.id, 'dependsOn', newValue)}
            options={requirementOptions}
            excludeReqId={info.row.original.reqId}
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
            variant="inline"
            placeholder="Selecione..."
          />
        ),
      }),

      columnHelper.accessor('providesFor', {
        header: 'Fornece Para',
        size: 200,
        cell: (info) => (
          <RequirementMultiSelect
            value={info.getValue() || []}
            onChange={(newValue) => handleCellUpdate(info.row.original.id, 'providesFor', newValue)}
            options={requirementOptions}
            excludeReqId={info.row.original.reqId}
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
            variant="inline"
            placeholder="Selecione..."
          />
        ),
      }),

      columnHelper.accessor('consultantNotes', {
        header: 'Dúvidas',
        size: 200,
        cell: (info) => (
          <EditableCell
            value={info.getValue() || ''}
            rowId={info.row.original.id}
            columnId="consultantNotes"
            columnLabel="Dúvidas do Consultor"
            onUpdate={handleCellUpdate}
            multiline
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
          />
        ),
      }),

      columnHelper.accessor('observations', {
        header: 'Observações',
        size: 200,
        cell: (info) => (
          <EditableCell
            value={info.getValue() || ''}
            rowId={info.row.original.id}
            columnId="observations"
            columnLabel="Observações"
            onUpdate={handleCellUpdate}
            multiline
            disabled={isReadOnlyExternalRequirement(info.row.original) || !canEditRequirement(userRole, user?.id, info.row.original.responsibleConsultantId)}
          />
        ),
      }),

      columnHelper.display({
        id: 'comments',
        header: 'Comentários',
        size: 100,
        cell: (info) => {
          const count = info.row.original._count?.comments || 0
          return count > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md text-xs font-medium">
              💬 {count}
            </span>
          ) : (
            <span className="text-gray-400 text-xs">—</span>
          )
        },
      }),

      // Coluna de ações (delete) - ADMIN sempre pode, CONSULTANT só próprios requisitos
      columnHelper.display({
        id: 'actions',
        header: 'Ações',
        size: 80,
        cell: (info) => {
          // Verifica se pode excluir este requisito específico
          const canDeleteThis = canDeleteRequirement(
            userRole,
            user?.id,
            info.row.original.responsibleConsultantId
          )
          if (!canDeleteThis || isReadOnlyExternalRequirement(info.row.original)) return null

          return (
            <button
              type="button"
              onClick={(e) => handleDeleteClick(info.row.original, e)}
              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
              title="Deletar requisito"
              aria-label={`Deletar requisito ${info.row.original.reqId}`}
            >
              {/* Ícone de lixeira (SVG inline para evitar dependência) */}
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )
        },
      }),
      ]

      if (shouldShowActionsColumn) {
        return baseColumns
      }

      return baseColumns.filter((column) => column.id !== 'actions')
    },
    [columnHelper, consultantOptions, visibleData, moduleLabel, moduleOptions, userRole, user?.id, assignedModule, showAllModules]
  )

  // Inicializar tabela
  const table = useReactTable({
    data: visibleData,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      rowSelection,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    // Habilita seleção apenas para requisitos que o usuário pode deletar
    enableRowSelection: (row) =>
      !isReadOnlyExternalRequirement(row.original) &&
      canDeleteRequirement(userRole, user?.id, row.original.responsibleConsultantId),
    getRowId: (row) => row.id, // Usa o ID do requisito como identificador da row
  })

  // Dados filtrados e paginados para exibição progressiva
  const filteredRows = table.getFilteredRowModel().rows
  const displayedRows = filteredRows.slice(0, displayCount)
  const hasMore = displayCount < filteredRows.length
  const remainingCount = filteredRows.length - displayCount

  // Reset exibição quando filtros ou pageSize mudam
  useEffect(() => {
    setDisplayCount(pageSize)
  }, [globalFilter, columnFilters, pageSize])

  // Handler para seleção de row
  const handleRowClick = (requirement: Requirement) => {
    const newSelectedId = selectedRowId === requirement.id ? null : requirement.id
    setSelectedRowId(newSelectedId)
    onRowSelect?.(newSelectedId ? requirement : null)
  }

  // Exibe skeleton enquanto carrega
  if (isLoading) {
    return <SkeletonRequirementsGrid />
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search bar com filtros inline */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Campo de busca */}
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Buscar em todos os campos..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            aria-label="Buscar requisitos"
          />
        </div>

        {/* Filtros inline */}
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-sm text-gray-500 font-medium hidden sm:inline">Filtros:</span>

          {/* Filtro de área/módulo */}
          <select
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm bg-white text-gray-900 [&>option]:bg-white [&>option]:text-gray-900 [&>option:hover]:bg-gray-100"
            value={(columnFilters.find(f => f.id === 'module')?.value as string) || ''}
            onChange={(e) => {
              const value = e.target.value
              setColumnFilters(prev => {
                const filtered = prev.filter(f => f.id !== 'module')
                if (value) {
                  return [...filtered, { id: 'module', value }]
                }
                return filtered
              })
            }}
            aria-label={`Filtrar por ${moduleLabel.toLowerCase()}`}
          >
            <option value="">{moduleLabel}</option>
            {moduleOptions.map(mod => (
              <option key={mod} value={mod}>{mod}</option>
            ))}
          </select>

          {/* Filtro de status */}
          <select
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm bg-white text-gray-900 [&>option]:bg-white [&>option]:text-gray-900 [&>option:hover]:bg-gray-100"
            value={(columnFilters.find(f => f.id === 'status')?.value as string) || ''}
            onChange={(e) => {
              const value = e.target.value
              setColumnFilters(prev => {
                const filtered = prev.filter(f => f.id !== 'status')
                if (value) {
                  return [...filtered, { id: 'status', value }]
                }
                return filtered
              })
            }}
            aria-label="Filtrar por status"
          >
            <option value="">Status</option>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <option key={key} value={key}>{config.label}</option>
            ))}
          </select>

          {/* Contador de requisitos */}
          <span className="text-sm text-gray-500 whitespace-nowrap">
            {filteredRows.length} requisitos
          </span>
        </div>
      </div>

      {/* Toolbar de ações em massa */}
      {selectedRequirements.length > 0 && (
        <div className="flex items-center gap-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-sm font-medium text-red-800">
            {selectedRequirements.length} selecionado(s)
          </span>
          <button
            type="button"
            onClick={() => setBulkDeleteDialogOpen(true)}
            className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Deletar selecionados
          </button>
          <button
            type="button"
            onClick={() => setRowSelection({})}
            className="text-sm text-gray-600 hover:text-gray-800 underline"
          >
            Limpar seleção
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-auto border border-gray-200 rounded-lg shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-slate-700 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-semibold text-white uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors"
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: ' ▲',
                        desc: ' ▼',
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {isLoading ? null : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-500">
                  Nenhum requisito encontrado
                </td>
              </tr>
            ) : (
              displayedRows.map((row) => (
                <tr
                  key={row.id}
                  className={`hover:bg-teal-50 transition-colors cursor-pointer ${
                    selectedRowId === row.original.id ? 'bg-teal-100' : ''
                  }`}
                  onClick={() => handleRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-sm text-gray-900">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Controles de paginação */}
      {filteredRows.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">
              Exibindo <strong>{displayedRows.length}</strong> de <strong>{filteredRows.length}</strong> requisitos
            </span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="px-2 py-1 border border-gray-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              aria-label="Itens por carregamento"
            >
              <option value={20}>20 por vez</option>
              <option value={50}>50 por vez</option>
              <option value={100}>100 por vez</option>
            </select>
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => setDisplayCount((prev) => prev + pageSize)}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium transition-colors flex items-center gap-2"
            >
              Carregar mais
              <span className="bg-teal-500 px-2 py-0.5 rounded text-xs">
                +{Math.min(pageSize, remainingCount)}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Dialog de confirmação para delete individual */}
      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title="Deletar Requisito"
        message={`Tem certeza que deseja deletar o requisito "${requirementToDelete?.reqId}"? Esta ação não pode ser desfeita.`}
        confirmText="Deletar"
        cancelText="Cancelar"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        isLoading={deleteMutation.isPending}
        variant="danger"
      />

      {/* Dialog de confirmação para bulk delete */}
      <ConfirmDialog
        isOpen={bulkDeleteDialogOpen}
        title="Deletar Requisitos"
        message={`Tem certeza que deseja deletar ${selectedRequirements.length} requisito(s)?

IDs: ${selectedRequirements.slice(0, 5).map((r) => r.reqId).join(', ')}${
          selectedRequirements.length > 5 ? ` e mais ${selectedRequirements.length - 5}...` : ''
        }

Esta ação não pode ser desfeita.`}
        confirmText={`Deletar ${selectedRequirements.length}`}
        cancelText="Cancelar"
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setBulkDeleteDialogOpen(false)}
        isLoading={bulkDeleteMutation.isPending}
        variant="danger"
      />

      {/* Dialog para force-delete de requisitos com dependências cross-matrix */}
      <ConfirmDialog
        isOpen={forceDeleteDialogOpen}
        title="Requisitos com Dependências"
        message={`${forceDeleteIds.length} requisito(s) possuem dependências na matriz cruzada e não foram deletados.

Deseja deletar mesmo assim? As entradas da matriz cruzada serão removidas automaticamente.

Esta ação não pode ser desfeita.`}
        confirmText={`Forçar deleção (${forceDeleteIds.length})`}
        cancelText="Manter requisitos"
        onConfirm={handleForceDelete}
        onCancel={() => {
          setForceDeleteDialogOpen(false)
          setForceDeleteIds([])
          setRowSelection({})
        }}
        isLoading={bulkDeleteMutation.isPending}
        variant="warning"
      />
    </div>
  )
}
