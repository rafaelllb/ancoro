/**
 * MatrixTable Component
 *
 * Tabela interativa da matriz de cruzamento com edição inline
 * Usa TanStack Table v8
 *
 * @author Rafael Brito
 */

import React, { useMemo, useState } from 'react'
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

interface MatrixTableProps {
  data: CrossMatrixEntry[]
  projectId: string
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

// Input editável
const EditableCell = ({
  value: initialValue,
  row,
  column,
  onUpdate,
}: {
  value: any
  row: any
  column: any
  onUpdate: (rowId: string, columnId: string, value: any) => void
}) => {
  const [value, setValue] = useState(initialValue)

  const onBlur = () => {
    if (value !== initialValue) {
      onUpdate(row.original.id, column.id, value)
    }
  }

  return (
    <input
      value={value || ''}
      onChange={(e) => setValue(e.target.value)}
      onBlur={onBlur}
      className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
    />
  )
}

// Select editável
const EditableSelect = ({
  value: initialValue,
  row,
  column,
  options,
  onUpdate,
}: {
  value: any
  row: any
  column: any
  options: { value: string; label: string }[]
  onUpdate: (rowId: string, columnId: string, value: any) => void
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value
    onUpdate(row.original.id, column.id, newValue)
  }

  return (
    <select
      value={initialValue || ''}
      onChange={handleChange}
      className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
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

export default function MatrixTable({ data, projectId }: MatrixTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const updateMutation = useUpdateCrossMatrixEntry(projectId)

  // Handler de update
  const handleUpdate = (rowId: string, columnId: string, value: any) => {
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
        header: 'From Module',
        size: 100,
      },
      {
        accessorKey: 'toModule',
        header: 'To Module',
        size: 100,
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
            onUpdate={handleUpdate}
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
              { value: 'FILE', label: 'File' },
              { value: 'API', label: 'API' },
              { value: 'BATCH', label: 'Batch' },
              { value: 'OTHER', label: 'Other' },
            ]}
            onUpdate={handleUpdate}
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
            onUpdate={handleUpdate}
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
              { value: 'EVENT', label: 'Event' },
              { value: 'REALTIME', label: 'Real-time' },
            ]}
            onUpdate={handleUpdate}
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
            onUpdate={handleUpdate}
          />
        ),
      },
    ],
    []
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
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 w-full max-w-md"
        />
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={header.column.getToggleSortingHandler()}
                    style={{ width: header.getSize() }}
                  >
                    <div className="flex items-center gap-2">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
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
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-2 whitespace-nowrap">
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
