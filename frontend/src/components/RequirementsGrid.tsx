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
  PENDING: { emoji: '⏳', label: 'Pendente', color: 'bg-gray-100 text-gray-800' },
  IN_PROGRESS: { emoji: '🚧', label: 'Em Progresso', color: 'bg-blue-100 text-blue-800' },
  VALIDATED: { emoji: '✅', label: 'Validado', color: 'bg-green-100 text-green-800' },
  APPROVED: { emoji: '✔️', label: 'Aprovado', color: 'bg-emerald-100 text-emerald-800' },
  CONFLICT: { emoji: '🔴', label: 'Conflito', color: 'bg-red-100 text-red-800' },
  REJECTED: { emoji: '❌', label: 'Rejeitado', color: 'bg-rose-100 text-rose-800' },
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
        className="w-full px-2 py-1 border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
          className="w-full px-2 py-1 border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm uppercase"
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
        className="w-full px-2 py-1 border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
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
      className="cursor-pointer px-2 py-1 hover:bg-gray-50 rounded font-medium text-gray-700"
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

// ===== EDITABLE CELL =====

interface EditableCellProps {
  value: string | string[]
  rowId: string
  columnId: string
  onUpdate: (id: string, field: string, value: any) => void
  multiline?: boolean
  isArray?: boolean
}

const EditableCell = ({ value, rowId, columnId, onUpdate, multiline, isArray }: EditableCellProps) => {
  const [isEditing, setIsEditing] = useState(false)
  const [localValue, setLocalValue] = useState(isArray ? (value as string[]).join(', ') : (value as string))

  const handleBlur = () => {
    setIsEditing(false)
    const finalValue = isArray ? localValue.split(',').map((s) => s.trim()).filter(Boolean) : localValue
    if (finalValue !== value) {
      onUpdate(rowId, columnId, finalValue)
    }
  }

  if (isEditing) {
    if (multiline) {
      return (
        <textarea
          className="w-full px-2 py-1 border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          autoFocus
          rows={3}
          aria-label={`Editar ${columnId}`}
          placeholder={`Digite o valor para ${columnId}`}
        />
      )
    }
    return (
      <input
        type="text"
        className="w-full px-2 py-1 border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        autoFocus
        aria-label={`Editar ${columnId}`}
        placeholder={`Digite o valor para ${columnId}`}
      />
    )
  }

  return (
    <div
      className="cursor-text px-2 py-1 hover:bg-gray-50 rounded min-h-[32px]"
      onClick={() => setIsEditing(true)}
    >
      {isArray ? (value as string[]).join(', ') || '—' : value || '—'}
    </div>
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
            onUpdate={handleCellUpdate}
            multiline
          />
        ),
      }),

      columnHelper.accessor('who', {
        header: 'Who (QUEM)',
        size: 150,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="who"
            onUpdate={handleCellUpdate}
          />
        ),
      }),

      columnHelper.accessor('when', {
        header: 'When (QUANDO)',
        size: 150,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="when"
            onUpdate={handleCellUpdate}
          />
        ),
      }),

      columnHelper.accessor('where', {
        header: 'Where (ONDE)',
        size: 150,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="where"
            onUpdate={handleCellUpdate}
          />
        ),
      }),

      columnHelper.accessor('howToday', {
        header: 'How (hoje)',
        size: 200,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="howToday"
            onUpdate={handleCellUpdate}
            multiline
          />
        ),
      }),

      columnHelper.accessor('howMuch', {
        header: 'How Much (QUANTO)',
        size: 150,
        cell: (info) => (
          <EditableCell
            value={info.getValue()}
            rowId={info.row.original.id}
            columnId="howMuch"
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
      {/* Search bar */}
      <div className="flex items-center gap-4">
        <input
          type="text"
          placeholder="Buscar em todos os campos..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          aria-label="Buscar requisitos"
        />
        <div className="text-sm text-gray-500">
          {table.getFilteredRowModel().rows.length} requisitos
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {{
                        asc: ' 🔼',
                        desc: ' 🔽',
                      }[header.column.getIsSorted() as string] ?? null}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
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
                  className={`hover:bg-blue-50 transition-colors ${
                    selectedRowId === row.original.id ? 'bg-blue-100' : ''
                  }`}
                  onClick={() => handleRowClick(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 text-sm text-gray-900">
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
