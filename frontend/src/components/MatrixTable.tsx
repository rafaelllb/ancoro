/**
 * MatrixTable Component
 *
 * Tabela interativa da matriz de cruzamento com edição inline
 * Usa TanStack Table v8
 *
 * @author Rafael Brito
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { type CrossMatrixEntry } from '../services/api'
import { useUpdateCrossMatrixEntry } from '../hooks/useCrossMatrix'
import { useProjectModules } from '../hooks/useProjectLists'
import { useProjectTerminology } from '../hooks/useProjectTerminology'

interface MatrixTableProps {
  data: CrossMatrixEntry[]
  projectId: string
  userRole?: string  // Role do usuário para controle de edição
}

// Badge de status
const StatusBadge = ({ status }: { status: CrossMatrixEntry['status'] }) => {
  const styles = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    OK: 'bg-green-100 text-green-800',
    CONFLICT: 'bg-red-100 text-red-800',
    CIRCULAR: 'bg-purple-100 text-purple-800',
  }

  const icons = {
    PENDING: '⚠️',
    OK: '✅',
    CONFLICT: '🔴',
    CIRCULAR: '🔄',
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${styles[status]}`}
    >
      {icons[status]} {status}
    </span>
  )
}

// Ícone "expandir" reutilizado nos botões de célula (setas diagonais)
const ExpandIcon = ({ className = 'w-3 h-3' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
    />
  </svg>
)

// ===== EXPANDED EDIT MODAL =====
// Modal para edição/leitura expandida de campos de texto longos.
// Portado do padrão de RequirementsGrid para dar paridade de exibição à matriz.
const ExpandedEditModal = ({
  isOpen,
  title,
  value,
  onSave,
  onClose,
}: {
  isOpen: boolean
  title: string
  value: string
  onSave: (value: string) => void
  onClose: () => void
}) => {
  const [localValue, setLocalValue] = useState(value)

  // Sincroniza o valor local sempre que o modal reabre com novo conteúdo
  useEffect(() => {
    setLocalValue(value)
  }, [value, isOpen])

  if (!isOpen) return null

  const handleSave = () => {
    onSave(localValue)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        className="relative bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
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

        <div className="flex-1 p-4 overflow-auto">
          <textarea
            className="w-full h-64 px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none text-sm font-mono"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder="Digite o conteúdo..."
          />
          <p className="text-xs text-gray-500 mt-2">Dica: Ctrl+Enter para salvar, Escape para cancelar</p>
        </div>

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
// Célula de texto com paridade de exibição à tabela de requisitos:
// - modo display (bg-gray-50, line-clamp-2, sem truncamento) → clique para editar
// - botão "expandir" no hover abre o modal de edição para textos longos
const EditableCell = ({
  value: initialValue,
  row,
  column,
  label,
  onUpdate,
  disabled = false,
}: {
  value: any
  row: any
  column: any
  label: string
  onUpdate: (rowId: string, columnId: string, value: any) => void
  disabled?: boolean
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [localValue, setLocalValue] = useState((initialValue as string) || '')

  const displayValue = (initialValue as string) || ''

  const commit = (finalValue: string) => {
    if (!disabled && finalValue !== initialValue) {
      onUpdate(row.original.id, column.id, finalValue)
    }
  }

  const handleBlur = () => {
    setIsEditing(false)
    commit(localValue)
  }

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsEditing(false)
    setIsModalOpen(true)
  }

  if (isEditing) {
    return (
      <div className="relative">
        <textarea
          className="w-full px-2 py-1 pr-8 bg-white text-gray-900 border border-teal-400 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-mono"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onBlur={handleBlur}
          disabled={disabled}
          autoFocus
          rows={3}
          aria-label={`Editar ${label}`}
          placeholder={`Digite o valor para ${label}`}
        />
        <button
          type="button"
          onMouseDown={handleExpandClick}
          className="absolute top-1 right-1 p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors"
          title="Expandir para edição completa"
        >
          <ExpandIcon className="w-4 h-4" />
        </button>
        <ExpandedEditModal
          isOpen={isModalOpen}
          title={label}
          value={localValue}
          onSave={commit}
          onClose={() => setIsModalOpen(false)}
        />
      </div>
    )
  }

  return (
    <>
      <div
        className={`px-2 py-1 bg-gray-50 rounded min-h-[32px] text-gray-900 font-mono group relative ${
          disabled ? 'cursor-default opacity-70' : 'cursor-text hover:bg-gray-100'
        }`}
        onClick={() => {
          if (disabled) return
          setLocalValue(displayValue)
          setIsEditing(true)
        }}
        title={disabled ? 'Sem permissão para editar este campo' : 'Clique para editar'}
      >
        <span className="line-clamp-2 pr-6">{displayValue || '—'}</span>
        {displayValue && (
          <button
            type="button"
            onClick={handleExpandClick}
            className="absolute top-1 right-1 p-1 text-gray-400 hover:text-teal-600 hover:bg-teal-50 rounded transition-colors opacity-0 group-hover:opacity-100"
            title="Expandir para ver completo"
          >
            <ExpandIcon />
          </button>
        )}
      </div>
      <ExpandedEditModal
        isOpen={isModalOpen}
        title={label}
        value={displayValue}
        onSave={commit}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  )
}

// ===== EDITABLE SELECT =====
// Chip em modo display → clique abre o <select> estilizado (padrão da grade de requisitos)
const EditableSelect = ({
  value: initialValue,
  row,
  column,
  options,
  onUpdate,
  disabled = false,
}: {
  value: any
  row: any
  column: any
  options: { value: string; label: string }[]
  onUpdate: (rowId: string, columnId: string, value: any) => void
  disabled?: boolean
}) => {
  const [isEditing, setIsEditing] = useState(false)

  const currentLabel = options.find((opt) => opt.value === initialValue)?.label

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value
    setIsEditing(false)
    if (!disabled && newValue !== initialValue) {
      onUpdate(row.original.id, column.id, newValue)
    }
  }

  if (isEditing && !disabled) {
    return (
      <select
        value={initialValue || ''}
        onChange={handleChange}
        onBlur={() => setIsEditing(false)}
        autoFocus
        aria-label={`Selecionar ${column.id}`}
        className="w-full px-2 py-1 bg-white text-gray-900 border border-teal-400 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm font-mono"
      >
        <option value="">-</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div
      className={`px-2 py-1 bg-gray-50 rounded text-sm font-mono font-medium text-gray-700 ${
        disabled ? 'cursor-default opacity-70' : 'cursor-pointer hover:bg-gray-100'
      }`}
      onClick={() => !disabled && setIsEditing(true)}
      title={disabled ? 'Sem permissão para editar' : 'Clique para alterar'}
    >
      {currentLabel || '—'}
    </div>
  )
}

export default function MatrixTable({ data, projectId, userRole }: MatrixTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const updateMutation = useUpdateCrossMatrixEntry(projectId)
  const { data: projectModules = [] } = useProjectModules(projectId)
  const { moduleLabel } = useProjectTerminology(projectId)
  const moduleNames = useMemo(
    () =>
      projectModules.reduce((acc, item) => {
        acc[item.code] = item.name
        return acc
      }, {} as Record<string, string>),
    [projectModules]
  )

  // CLIENT não pode editar a matriz
  const canEdit = userRole !== 'CLIENT'

  // Handler de update (só executa se puder editar)
  const handleUpdate = (rowId: string, columnId: string, value: any) => {
    if (!canEdit) return
    updateMutation.mutate({
      entryId: rowId,
      data: { [columnId]: value },
    })
  }

  // Definir colunas
  const columns = useMemo<ColumnDef<CrossMatrixEntry>[]>(
    () => [
      {
        accessorKey: 'fromReqId',
        header: 'From Req',
        size: 120,
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: 'toReqId',
        header: 'To Req',
        size: 120,
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: 'fromModule',
        header: `From ${moduleLabel}`,
        size: 100,
        cell: ({ getValue }) => (
          <span className="text-sm font-mono text-gray-900">
            {moduleNames[getValue() as string] || (getValue() as string)}
          </span>
        ),
      },
      {
        accessorKey: 'toModule',
        header: `To ${moduleLabel}`,
        size: 100,
        cell: ({ getValue }) => (
          <span className="text-sm font-mono text-gray-900">
            {moduleNames[getValue() as string] || (getValue() as string)}
          </span>
        ),
      },
      {
        accessorKey: 'dataFlow',
        header: 'Data Flow',
        size: 150,
        cell: ({ getValue, row, column }) => (
          <EditableCell
            value={getValue()}
            row={row}
            column={column}
            label="Data Flow"
            onUpdate={handleUpdate}
            disabled={!canEdit}
          />
        ),
      },
      {
        accessorKey: 'integrationType',
        header: 'Type',
        size: 120,
        cell: ({ getValue, row, column }) => (
          <EditableSelect
            value={getValue()}
            row={row}
            column={column}
            options={[
              { value: 'BAPI', label: 'BAPI' },
              { value: 'IDOC', label: 'iDoc' },
              { value: 'RFC', label: 'RFC' },
              { value: 'API', label: 'API' },
              { value: 'BATCH', label: 'Batch' },
              { value: 'OTHER', label: 'Other' },
            ]}
            onUpdate={handleUpdate}
            disabled={!canEdit}
          />
        ),
      },
      {
        accessorKey: 'trigger',
        header: 'Trigger',
        size: 150,
        cell: ({ getValue, row, column }) => (
          <EditableCell
            value={getValue()}
            row={row}
            column={column}
            label="Trigger"
            onUpdate={handleUpdate}
            disabled={!canEdit}
          />
        ),
      },
      {
        accessorKey: 'timing',
        header: 'Timing',
        size: 120,
        cell: ({ getValue, row, column }) => (
          <EditableSelect
            value={getValue()}
            row={row}
            column={column}
            options={[
              { value: 'SYNC', label: 'Sync' },
              { value: 'ASYNC', label: 'Async' },
              { value: 'BATCH', label: 'Batch' },
            ]}
            onUpdate={handleUpdate}
            disabled={!canEdit}
          />
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 120,
        cell: ({ getValue }) => <StatusBadge status={getValue() as any} />,
      },
      {
        accessorKey: 'manualNotes',
        header: 'Notes',
        size: 200,
        cell: ({ getValue, row, column }) => (
          <EditableCell
            value={getValue()}
            row={row}
            column={column}
            label="Notes"
            onUpdate={handleUpdate}
            disabled={!canEdit}
          />
        ),
      },
    ],
    [canEdit, handleUpdate, moduleLabel, moduleNames]
  )

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div className="space-y-4">
      {/* Search */}
      <div>
        <input
          type="text"
          placeholder="Buscar na matriz..."
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 w-full max-w-md"
        />
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-[24px] border border-ancoro-navy-100 bg-white shadow-[0_12px_28px_rgba(21,45,74,0.06)]">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="sticky top-0 z-10 bg-ancoro-navy-900">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-ancoro-navy-800"
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ width: header.getSize() }}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
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
          <tbody className="divide-y divide-ancoro-navy-100 bg-white">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="group hover:bg-teal-50 transition-colors">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-sm text-gray-900 align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {table.getRowModel().rows.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          Nenhuma integração encontrada
        </div>
      )}

      {/* Footer */}
      <div className="text-sm text-gray-500">
        Total: {table.getRowModel().rows.length} integrações
      </div>
    </div>
  )
}
