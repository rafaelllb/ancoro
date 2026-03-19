/**
 * Skeleton - Componentes de loading placeholder para UX
 *
 * Skeleton loaders melhoram a percepção de performance ao mostrar
 * uma prévia da estrutura do conteúdo enquanto carrega.
 *
 * Componentes:
 * - Skeleton: Bloco básico animado
 * - SkeletonText: Linha de texto simulada
 * - SkeletonTable: Tabela com linhas de placeholder
 * - SkeletonCard: Card com conteúdo placeholder
 */

import { ReactNode } from 'react'

// ===== SKELETON BASE =====
// Bloco retangular animado com pulse

interface SkeletonProps {
  className?: string
  width?: string | number
  height?: string | number
  rounded?: 'none' | 'sm' | 'md' | 'lg' | 'full'
}

export function Skeleton({
  className = '',
  width,
  height,
  rounded = 'md',
}: SkeletonProps) {
  const roundedClass = {
    none: '',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  }[rounded]

  return (
    <div
      className={`animate-pulse bg-gray-200 ${roundedClass} ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
      }}
    />
  )
}

// ===== SKELETON TEXT =====
// Simula uma linha de texto

interface SkeletonTextProps {
  lines?: number
  className?: string
}

export function SkeletonText({ lines = 1, className = '' }: SkeletonTextProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          height={16}
          // Última linha mais curta para parecer natural
          className={i === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'}
        />
      ))}
    </div>
  )
}

// ===== SKELETON TABLE ROW =====
// Uma linha da tabela com células de placeholder

interface SkeletonTableRowProps {
  columns: number
  columnWidths?: (string | number)[]
}

function SkeletonTableRow({ columns, columnWidths }: SkeletonTableRowProps) {
  return (
    <tr className="border-b border-gray-100">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-3 py-3">
          <Skeleton
            height={20}
            width={columnWidths?.[i] || '100%'}
            className="max-w-full"
          />
        </td>
      ))}
    </tr>
  )
}

// ===== SKELETON TABLE =====
// Tabela completa com header e linhas de placeholder

interface SkeletonTableProps {
  rows?: number
  columns?: number
  columnWidths?: (string | number)[]
  showHeader?: boolean
  className?: string
}

export function SkeletonTable({
  rows = 5,
  columns = 6,
  columnWidths,
  showHeader = true,
  className = '',
}: SkeletonTableProps) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <table className="min-w-full">
        {showHeader && (
          <thead className="bg-gray-50">
            <tr>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-3 py-3 text-left">
                  <Skeleton
                    height={14}
                    width={columnWidths?.[i] || 80}
                    className="max-w-full"
                  />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="bg-white">
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} columns={columns} columnWidths={columnWidths} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ===== SKELETON REQUIREMENTS GRID =====
// Skeleton específico para a grid de requisitos
// Simula as colunas principais: Req ID, Descrição, Módulo, Status, What, Why, etc.

export function SkeletonRequirementsGrid() {
  // Widths aproximados das colunas da grid real
  const columnWidths = [
    80,   // Req ID
    180,  // Descrição
    80,   // Módulo
    100,  // Status
    150,  // What
    150,  // Why
    100,  // Who
    100,  // When
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Search bar skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton height={40} className="flex-1" />
        <Skeleton height={20} width={100} />
      </div>

      {/* Table skeleton */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <SkeletonTable
          rows={8}
          columns={8}
          columnWidths={columnWidths}
          showHeader={true}
        />
      </div>
    </div>
  )
}

// ===== SKELETON CARD =====
// Card com conteúdo placeholder

interface SkeletonCardProps {
  showImage?: boolean
  lines?: number
  className?: string
}

export function SkeletonCard({
  showImage = false,
  lines = 3,
  className = '',
}: SkeletonCardProps) {
  return (
    <div className={`bg-white rounded-lg shadow p-4 ${className}`}>
      {showImage && (
        <Skeleton height={160} className="w-full mb-4" rounded="lg" />
      )}
      <Skeleton height={24} className="w-3/4 mb-3" />
      <SkeletonText lines={lines} />
    </div>
  )
}

// ===== SKELETON KPI CARDS =====
// Skeleton para cards de KPI do dashboard de métricas

export function SkeletonKPICards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg shadow p-4">
          <Skeleton height={14} width={100} className="mb-2" />
          <Skeleton height={32} width={60} className="mb-1" />
          <Skeleton height={12} width={80} />
        </div>
      ))}
    </div>
  )
}

// ===== SKELETON WRAPPER =====
// Wrapper que mostra skeleton enquanto loading e children quando pronto

interface SkeletonWrapperProps {
  isLoading: boolean
  skeleton: ReactNode
  children: ReactNode
}

export function SkeletonWrapper({
  isLoading,
  skeleton,
  children,
}: SkeletonWrapperProps) {
  return isLoading ? <>{skeleton}</> : <>{children}</>
}

// Exports default para import mais limpo
export default Skeleton
