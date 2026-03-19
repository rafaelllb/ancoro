/**
 * MetricsCharts - Componente com gráficos de métricas
 *
 * Usa Recharts para renderizar:
 * - Line chart: Progressão temporal de validações
 * - Bar chart: Requisitos por status/módulo
 * - Heatmap: Matriz de integrações módulo × módulo
 *
 * @author Rafael Brito
 */

import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts'
import { metricsAPI, ModuleHeatmapCell } from '../services/api'

interface MetricsChartsProps {
  projectId: string
}

// Cores para o heatmap
const HEATMAP_COLORS: Record<string, string> = {
  OK: '#10B981', // green-500
  PENDING: '#F59E0B', // yellow-500
  CONFLICT: '#EF4444', // red-500
  MIXED: '#8B5CF6', // purple-500
}

// Mapeamento de módulos para nomes curtos
const MODULE_NAMES: Record<string, string> = {
  ISU: 'IS-U',
  CRM: 'CRM',
  FICA: 'FI-CA',
  DEVICE: 'Device',
  SD: 'SD',
  MM: 'MM',
  PM: 'PM',
  OTHER: 'Outros',
}

export default function MetricsCharts({ projectId }: MetricsChartsProps) {
  // Query de timeline
  const timelineQuery = useQuery({
    queryKey: ['metrics-timeline', projectId],
    queryFn: async () => {
      const response = await metricsAPI.getTimeline(projectId, 12)
      return response.data.data
    },
    enabled: !!projectId,
    staleTime: 60000,
  })

  // Query de heatmap
  const heatmapQuery = useQuery({
    queryKey: ['metrics-heatmap', projectId],
    queryFn: async () => {
      const response = await metricsAPI.getHeatmap(projectId)
      return response.data.data
    },
    enabled: !!projectId,
    staleTime: 60000,
  })

  const timeline = timelineQuery.data || []
  const heatmapData = heatmapQuery.data

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Line Chart - Progressão Temporal */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Progressão Semanal</h3>
        {timelineQuery.isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <svg
              className="animate-spin h-6 w-6 text-blue-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        ) : timeline.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={timeline} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => {
                  // Formata YYYY-WXX para WXX
                  const week = value.split('-W')[1]
                  return `S${week}`
                }}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                labelFormatter={(value) => `Semana ${value.split('-W')[1]}`}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line
                type="monotone"
                dataKey="validated"
                name="Validados"
                stroke="#10B981"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="pending"
                name="Pendentes"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="conflicts"
                name="Conflitos"
                stroke="#EF4444"
                strokeWidth={2}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400">
            Sem dados de timeline disponíveis
          </div>
        )}
      </div>

      {/* Heatmap - Integrações Módulo × Módulo */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Matriz de Integrações por Módulo
        </h3>
        {heatmapQuery.isLoading ? (
          <div className="h-64 flex items-center justify-center">
            <svg
              className="animate-spin h-6 w-6 text-blue-500"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        ) : heatmapData && heatmapData.cells.length > 0 ? (
          <HeatmapGrid data={heatmapData} />
        ) : (
          <div className="h-64 flex items-center justify-center text-gray-400">
            Sem integrações mapeadas
          </div>
        )}
      </div>

      {/* Bar Chart - Integrações por Status */}
      {heatmapData && heatmapData.cells.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Integrações por Status</h3>
          <IntegrationBarChart data={heatmapData.cells} />
        </div>
      )}
    </div>
  )
}

/**
 * Componente de Heatmap Grid
 * Renderiza matriz visual de integrações módulo × módulo
 */
function HeatmapGrid({ data }: { data: { cells: ModuleHeatmapCell[]; modules: string[] } }) {
  const { cells, modules } = data

  // Cria mapa de células para lookup rápido
  const cellMap = new Map<string, ModuleHeatmapCell>()
  cells.forEach((cell) => {
    cellMap.set(`${cell.fromModule}->${cell.toModule}`, cell)
  })

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr>
            <th className="px-2 py-1 text-xs font-medium text-gray-500">De / Para</th>
            {modules.map((module) => (
              <th key={module} className="px-2 py-1 text-xs font-medium text-gray-500 text-center">
                {MODULE_NAMES[module] || module}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((fromModule) => (
            <tr key={fromModule}>
              <td className="px-2 py-1 text-xs font-medium text-gray-500">
                {MODULE_NAMES[fromModule] || fromModule}
              </td>
              {modules.map((toModule) => {
                const cell = cellMap.get(`${fromModule}->${toModule}`)

                return (
                  <td key={toModule} className="px-1 py-1 text-center">
                    {cell ? (
                      <div
                        className="w-10 h-10 rounded flex items-center justify-center text-white text-xs font-medium mx-auto cursor-pointer transition-transform hover:scale-110"
                        style={{ backgroundColor: HEATMAP_COLORS[cell.status] }}
                        title={`${fromModule} → ${toModule}: ${cell.count} integração(ões) - ${cell.status}`}
                      >
                        {cell.count}
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-100 mx-auto" />
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Legenda */}
      <div className="mt-4 flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: HEATMAP_COLORS.OK }} />
          <span>OK</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: HEATMAP_COLORS.PENDING }} />
          <span>Pendente</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: HEATMAP_COLORS.CONFLICT }} />
          <span>Conflito</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: HEATMAP_COLORS.MIXED }} />
          <span>Misto</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Bar Chart de integrações por status
 */
function IntegrationBarChart({ data }: { data: ModuleHeatmapCell[] }) {
  // Agrupa por status
  const statusCounts = data.reduce(
    (acc, cell) => {
      acc[cell.status] = (acc[cell.status] || 0) + cell.count
      return acc
    },
    {} as Record<string, number>
  )

  const chartData = Object.entries(statusCounts).map(([status, count]) => ({
    status,
    count,
    fill: HEATMAP_COLORS[status] || '#6B7280',
  }))

  const STATUS_LABELS: Record<string, string> = {
    OK: 'OK',
    PENDING: 'Pendente',
    CONFLICT: 'Conflito',
    MIXED: 'Misto',
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="status"
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => STATUS_LABELS[value] || value}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            fontSize: '12px',
          }}
          formatter={(value: number) => [`${value} integrações`, 'Quantidade']}
          labelFormatter={(value) => STATUS_LABELS[value] || value}
        />
        <Bar dataKey="count" name="Integrações" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
