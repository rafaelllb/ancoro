/**
 * Tipos e constantes compartilhados do grafo de dependências.
 *
 * Centraliza CanvasState, props e constantes visuais usados por
 * graphDrawing, graphHitTest, graphPersistence e RequirementsGraph.
 *
 * @author Rafael Brito
 */

import { GraphNode, GraphEdge } from '../../hooks/useGraphData'
import { NodeColors } from '../../utils/colorUtils'

// ===== CONSTANTES DE LAYOUT =====

export const NW = 120         // largura mínima de fallback (nós têm width dinâmica via n.width)
export const NH = 52          // altura mínima de fallback (nós têm height dinâmica via n.height)
export const NR = 8           // border-radius do nó
export const PORT_R = 5       // raio visual da porta de conexão
export const PORT_HIT_R = 12  // raio generoso de hit-test para portas

// Cores de status
export const STATUS_COLORS: Record<string, string> = {
  'done':        '#1D9E75',
  'in-progress': '#EF9F27',
  'pending':     '#B4B2A9',
}

// Cor neutra fallback para módulos sem paleta
export const NEUTRAL_COLORS: NodeColors = {
  fill: '#F3F4F6',
  stroke: '#6B7280',
  text: '#374151',
  badge: '#D1D5DB',
}

// ===== ESTADO INTERNO DO CANVAS (mutável, sem re-render) =====

export interface CanvasState {
  scale: number
  offsetX: number
  offsetY: number
  draggingNode: GraphNode | null
  draggingSelectionIds: string[]
  dragOffX: number
  dragOffY: number
  selectionDragOffsets: Record<string, { x: number; y: number }>
  isPanning: boolean
  isSelectingBox: boolean
  panStartX: number
  panStartY: number
  panOffX: number
  panOffY: number
  selectedNode: GraphNode | null
  selectedNodeIds: string[]
  isConnecting: boolean
  connectSource: GraphNode | null
  connectTarget: GraphNode | null
  connectMouseX: number
  connectMouseY: number
  hoverPort: { node: GraphNode; portType: 'output' | 'input' } | null
  selectedEdge: GraphEdge | null
  hoverEdge: GraphEdge | null
  clickStart: { x: number; y: number }
  selectionBoxStart: { x: number; y: number } | null
  selectionBoxEnd: { x: number; y: number } | null
  W: number
  H: number
}

// ===== FACTORY =====

export function createInitialCanvasState(): CanvasState {
  return {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    draggingNode: null,
    draggingSelectionIds: [],
    dragOffX: 0,
    dragOffY: 0,
    selectionDragOffsets: {},
    isPanning: false,
    isSelectingBox: false,
    panStartX: 0,
    panStartY: 0,
    panOffX: 0,
    panOffY: 0,
    selectedNode: null,
    selectedNodeIds: [],
    isConnecting: false,
    connectSource: null,
    connectTarget: null,
    connectMouseX: 0,
    connectMouseY: 0,
    hoverPort: null,
    selectedEdge: null,
    hoverEdge: null,
    clickStart: { x: 0, y: 0 },
    selectionBoxStart: null,
    selectionBoxEnd: null,
    W: 0,
    H: 0,
  }
}

// ===== PROPS DO COMPONENTE =====

export interface RequirementsGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  colorPalette: Record<string, NodeColors>
  projectId: string
  filterType: string
  showCritical: boolean
  criticalPath?: Set<string>
  criticalEdges?: Set<string>
  onEdgeCreate?: (fromReqId: string, toReqId: string) => Promise<void>
  onEdgeDelete?: (fromReqId: string, toReqId: string) => Promise<void>
  onNodeSelect?: (node: GraphNode | null) => void
  onZoomChange?: (zoomPercent: number) => void
}
