/**
 * Funções de coordenadas e hit-testing do grafo.
 *
 * Converte entre espaço canvas (pixels) e espaço mundo (coordenadas lógicas dos nós).
 * Detecta nós, portas e arestas sob o cursor via AABB, distância e amostragem Bézier.
 *
 * @author Rafael Brito
 */

import { GraphNode, GraphEdge } from '../../hooks/useGraphData'
import { CanvasState, NW, NH, PORT_HIT_R } from './graphTypes'

// ── Coordenadas duplas ──

export function toCanvas(s: CanvasState, wx: number, wy: number) {
  return { x: wx * s.scale + s.offsetX, y: wy * s.scale + s.offsetY }
}

export function toWorld(s: CanvasState, cx: number, cy: number) {
  return { x: (cx - s.offsetX) / s.scale, y: (cy - s.offsetY) / s.scale }
}

// ── Visibilidade (filtro de módulo) ──

export function nodeVisible(n: GraphNode, filterType: string): boolean {
  return filterType === 'all' || n.type === filterType
}

// ── Hit-test: nó sob o cursor (AABB) ──

export function getNodeAt(
  s: CanvasState,
  nodes: GraphNode[],
  canvasX: number,
  canvasY: number,
  filterType: string,
): GraphNode | undefined {
  const w = toWorld(s, canvasX, canvasY)
  return [...nodes].reverse().find(n =>
    nodeVisible(n, filterType) &&
    w.x >= n.x && w.x <= n.x + (n.width  || NW) &&
    w.y >= n.y && w.y <= n.y + (n.height || NH)
  )
}

// ── Nós selecionados e visíveis ──

export function getVisibleSelectedNodes(
  s: CanvasState,
  nodes: GraphNode[],
  filterType: string,
): GraphNode[] {
  const selectedIds = new Set(s.selectedNodeIds)
  return nodes.filter(n => nodeVisible(n, filterType) && selectedIds.has(n.id))
}

// ── Seleção centralizada ──

export function setSelectedNodes(
  s: CanvasState,
  nodes: GraphNode[],
  nodeIds: string[],
  primaryNodeId: string | null | undefined,
  onNodeSelect?: (node: GraphNode | null) => void,
) {
  s.selectedNodeIds = [...new Set(nodeIds)]
  const preferredId = primaryNodeId || s.selectedNodeIds[0] || null
  s.selectedNode = preferredId
    ? nodes.find(n => n.id === preferredId) || null
    : null
  onNodeSelect?.(s.selectedNode)
}

// ── Hit-test: porta de conexão (distância circular) ──

export function getPortAt(
  s: CanvasState,
  nodes: GraphNode[],
  canvasX: number,
  canvasY: number,
  filterType: string,
): { node: GraphNode; portType: 'output' | 'input' } | null {
  const w = toWorld(s, canvasX, canvasY)
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i]
    if (!nodeVisible(n, filterType)) continue
    // Porta de saída (borda direita)
    const ox = n.x + (n.width  || NW), oy = n.y + (n.height || NH) / 2
    if (Math.hypot(w.x - ox, w.y - oy) <= PORT_HIT_R) return { node: n, portType: 'output' }
    // Porta de entrada (borda esquerda)
    const ix = n.x, iy = n.y + (n.height || NH) / 2
    if (Math.hypot(w.x - ix, w.y - iy) <= PORT_HIT_R) return { node: n, portType: 'input' }
  }
  return null
}

// ── Hit-test: aresta (amostragem Bézier, 30 samples) ──

export function getEdgeAt(
  s: CanvasState,
  nodes: GraphNode[],
  edges: GraphEdge[],
  canvasX: number,
  canvasY: number,
  filterType: string,
): GraphEdge | null {
  const THRESHOLD = 6
  const SAMPLES = 30

  for (let i = edges.length - 1; i >= 0; i--) {
    const e = edges[i]
    const fn = nodes.find(nd => nd.id === e.from)
    const tn = nodes.find(nd => nd.id === e.to)
    if (!fn || !tn) continue
    if (!nodeVisible(fn, filterType) || !nodeVisible(tn, filterType)) continue

    const fp = toCanvas(s, fn.x + (fn.width || NW) / 2, fn.y + (fn.height || NH) / 2)
    const tp = toCanvas(s, tn.x + (tn.width || NW) / 2, tn.y + (tn.height || NH) / 2)
    const mx = (fp.x + tp.x) / 2

    // B(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)*t^2*P2 + t^3*P3
    // P0=fp, P1=(mx, fp.y), P2=(mx, tp.y), P3=tp
    for (let si = 0; si <= SAMPLES; si++) {
      const t = si / SAMPLES
      const t1 = 1 - t
      const bx = t1*t1*t1*fp.x + 3*t1*t1*t*mx + 3*t1*t*t*mx + t*t*t*tp.x
      const by = t1*t1*t1*fp.y + 3*t1*t1*t*fp.y + 3*t1*t*t*tp.y + t*t*t*tp.y

      if (Math.hypot(canvasX - bx, canvasY - by) <= THRESHOLD) {
        return e
      }
    }
  }
  return null
}
