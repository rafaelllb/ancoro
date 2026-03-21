import { useState, useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table'
import { Requirement } from '../services/api'
import { useUpdateRequirement, useDeleteRequirement } from '../hooks/useRequirements'
import ConfirmDialog from './ConfirmDialog'
import { SkeletonRequirementsGrid } from './Skeleton'

// ===== TIPOS =====

interface RequirementsGridProps {
  data: Requirement[]
  isLoading: boolean
  onRowSelect?: (requirement: Requirement | null) => void
  userRole?: string // Role do usuário logado para controle de permissões
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
}

const EditableStatusCell = ({ value, rowId, onUpdate }: EditableStatusCellProps) => {
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
      className="cursor-pointer hover:opacity-80 transition-opacity"
      onClick={(e) => {
        e.stopPropagation() // Evita selecionar a row ao clicar no status
        setIsEditing(true)
      }}
      title="Clique para alterar o status"
    >
      <StatusBadge status={value} />
    </div>
  )
}

// ===== EDITABLE MODULE CELL =====
// Dropdown para seleção de módulo SAP
// Permite tanto seleção de módulos pré-definidos quanto entrada customizada

const SAP_MODULES = [
  'FI-CA',
  'FI-AR',
  'FI-GL',
  'ISU-BILLING',
  'ISU-BPEM',
  'ISU-IDE',
  'ISU-EDM',
  'ISU-DM',
  'ISU-CS',
  'SD',
  'MM',
  'PP',
  'CO',
  'PM',
  'HR',
  'CROSS',
  'CUSTOM',
]

interface EditableModuleCellProps {
  value: string
  rowId: string
  onUpdate: (id: string, field: string, value: string) => void
}

const EditableModuleCell = ({ value, rowId, onUpdate }: EditableModuleCellProps) => {
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
        value={SAP_MODULES.includes(value) ? value : '__custom__'}
        onChange={handleSelectChange}
        onBlur={() => setIsEditing(false)}
        autoFocus
        title="Selecionar módulo SAP"
        aria-label="Módulo SAP"
      >
        {SAP_MODULES.map((mod) => (
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
      className="cursor-pointer px-2 py-1 bg-gray-50 hover:bg-gray-100 rounded font-medium text-gray-700"
      onClick={(e) => {
        e.stopPropagation()
        setIsEditing(true)
      }}
      title="Clique para alterar o módulo"
    >
      {value || '—'}
    </div>
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
  useState(() => {
    setLocalValue(value)
  })

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

      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
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
}

const EditableCell = ({ value, rowId, columnId, columnLabel, onUpdate, multiline, isArray }: EditableCellProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [localValue, setLocalValue] = useState(isArray ? (value as string[]).join(', ') : (value as string))

  const displayValue = isArray ? (value as string[]).join(', ') : (value as string)

  const handleBlur = () => {
    setIsEditing(false)
    const finalValue = isArray ? localValue.split(',').map((s) => s.trim()).filter(Boolean) : localValue
    if (finalValue !== value) {
      onUpdate(rowId, columnId, finalValue)
    }
  }

  const handleModalSave = (newValue: string) => {
    const finalValue = isArray ? newValue.split(',').map((s) => s.trim()).filter(Boolean) : newValue
    if (finalValue !== value) {
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
        className="cursor-text px-2 py-1 bg-gray-50 hover:bg-gray-100 rounded min-h-[32px] text-gray-900 group relative"
        onClick={() => {
          setLocalValue(displayValue)
          setIsEditing(true)
        }}
      >
        <span className="line-clamp-2">{displayValue || '—'}</span>
        {/* Botão expandir visível no hover */}
        {displayValue && displayValue.length > 50 && (
          <button
            type="button"
            onClick={handleExpandClick}
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

export default function RequirementsGrid({ data, isLoading, onRowSelect, userRole }: RequirementsGridProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null)

  // Estado para dialog de confirmação de delete
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [requirementToDelete, setRequirementToDelete] = useState<Requirement | null>(null)

  const updateMutation = useUpdateRequirement()
  const deleteMutation = useDeleteRequirement()

  // Verifica se usuário pode deletar (ADMIN ou MANAGER)
  const canDelete = userRole === 'ADMIN' || userRole === 'MANAGER'

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
    updateMutation.mutate({ id, data: { [field]: value } })
  }

  // Column helper
  const columnHelper = createColumnHelper<Requirement>()

  // Definição de colunas
  const columns = useMemo(
    () => [
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
          />
        ),
      }),

      columnHelper.accessor('module', {
        header: 'Módulo',
        size: 120,
        cell: (info) => (
          <EditableModuleCell
            value={info.getValue()}
            rowId={info.row.original.id}
            onUpdate={handleCellUpdate}
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
          />
        ),
      }),

      columnHelper.accessor('what', {
        header: 'What (O que)',
        size: 200,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="what"
            columnLabel="What (O que)"
            onUpdate={handleCellUpdate}
            multiline
          />
        ),
      }),

      columnHelper.accessor('why', {
        header: 'Why (Por que)',
        size: 200,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="why"
            columnLabel="Why (Por que)"
            onUpdate={handleCellUpdate}
            multiline
          />
        ),
      }),

      columnHelper.accessor('who', {
        header: 'Who (Quem)',
        size: 150,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="who"
            columnLabel="Who (Quem)"
            onUpdate={handleCellUpdate}
          />
        ),
      }),

      columnHelper.accessor('when', {
        header: 'When (Quando)',
        size: 150,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="when"
            columnLabel="When (Quando)"
            onUpdate={handleCellUpdate}
          />
        ),
      }),

      columnHelper.accessor('where', {
        header: 'Where (Onde)',
        size: 150,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="where"
            columnLabel="Where (Onde)"
            onUpdate={handleCellUpdate}
          />
        ),
      }),

      columnHelper.accessor('howToday', {
        header: 'How (Hoje)',
        size: 200,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="howToday"
            columnLabel="How (Como é hoje)"
            onUpdate={handleCellUpdate}
            multiline
          />
        ),
      }),

      columnHelper.accessor('howMuch', {
        header: 'How Much (Quanto)',
        size: 150,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="howMuch"
            columnLabel="How Much (Quanto)"
            onUpdate={handleCellUpdate}
          />
        ),
      }),

      columnHelper.accessor('dependsOn', {
        header: 'Depende De',
        size: 150,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="dependsOn"
            columnLabel="Depende De"
            onUpdate={handleCellUpdate}
            isArray
          />
        ),
      }),

      columnHelper.accessor('providesFor', {
        header: 'Fornece Para',
        size: 150,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="providesFor"
            columnLabel="Fornece Para"
            onUpdate={handleCellUpdate}
            isArray
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

      // Coluna de ações (delete) - apenas visível para ADMIN/MANAGER
      columnHelper.display({
        id: 'actions',
        header: 'Ações',
        size: 80,
        cell: (info) => {
          if (!canDelete) return null

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
    ],
    [canDelete] // Dependência: recriar colunas se permissão mudar
  )

  // Inicializar tabela
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

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

          {/* Filtro de módulo */}
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
            aria-label="Filtrar por módulo"
          >
            <option value="">Módulo</option>
            {SAP_MODULES.map(mod => (
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
            {table.getFilteredRowModel().rows.length} requisitos
          </span>
        </div>
      </div>

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
            {isLoading ? null : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-8 text-center text-gray-500">
                  Nenhum requisito encontrado
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
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

      {/* Dialog de confirmação para delete */}
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
    </div>
  )
}
