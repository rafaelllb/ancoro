/**
 * RequirementsGraph — Componente Canvas 2D interativo para visualização
 * de dependências entre requisitos.
 *
 * Port direto do sap_isu_graph_test.html para React, usando useRef + useEffect
 * para gerenciar o canvas e evitar re-renders em operações de mouse.
 *
 * Funcionalidades:
 * - Arrastar nós com offset correto
 * - Zoom com scroll centrado no cursor (0.3x–2.5x)
 * - Pan com drag no fundo do canvas
 * - Curvas Bézier com setas para arestas
 * - Criação de conexão via drag porta-saída → porta-entrada
 * - Remoção de aresta via clique + Delete/Backspace
 * - Hit-test de portas, nós e arestas
 * - Suporte HiDPI (devicePixelRatio)
 * - Auto-center na inicialização
 *
 * @author Rafael Brito
 */

import { useRef, useEffect } from 'react'
import { GraphNode, GraphEdge } from '../hooks/useGraphData'
import { NodeColors } from '../utils/colorUtils'

// ===== CONSTANTES DE LAYOUT =====

const NW = 120      // largura mínima de fallback (nós têm width dinâmica via n.width)
const NH = 52       // altura mínima de fallback (nós têm height dinâmica via n.height)
const NR = 8        // border-radius do nó
const PORT_R = 5    // raio visual da porta de conexão
const PORT_HIT_R = 12  // raio generoso de hit-test para portas

// Cores de status
const STATUS_COLORS: Record<string, string> = {
  'done':        '#1D9E75',
  'in-progress': '#EF9F27',
  'pending':     '#B4B2A9',
}

// Cor neutra fallback para módulos sem paleta
const NEUTRAL_COLORS: NodeColors = {
  fill: '#F3F4F6',
  stroke: '#6B7280',
  text: '#374151',
  badge: '#D1D5DB',
}

// ===== ESTADO INTERNO DO CANVAS (mutável, sem re-render) =====

interface CanvasState {
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

// ===== PROPS =====

interface RequirementsGraphProps {
  nodes: GraphNode[]
  edges: GraphEdge[]
  colorPalette: Record<string, NodeColors>
  positionStorageKey?: string
  filterType: string
  showCritical: boolean
  criticalPath?: Set<string>
  criticalEdges?: Set<string>
  onEdgeCreate?: (fromReqId: string, toReqId: string) => Promise<void>
  onEdgeDelete?: (fromReqId: string, toReqId: string) => Promise<void>
  onNodeSelect?: (node: GraphNode | null) => void
  onZoomChange?: (zoomPercent: number) => void
}

export default function RequirementsGraph({
  nodes: propNodes,
  edges: propEdges,
  colorPalette,
  positionStorageKey,
  filterType,
  showCritical,
  criticalPath = new Set(),
  criticalEdges = new Set(),
  onEdgeCreate,
  onEdgeDelete,
  onNodeSelect,
  onZoomChange,
}: RequirementsGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const savedPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  // Cópias mutáveis dos dados (permitem drag sem re-render)
  const nodesRef = useRef<GraphNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])

  // Estado do canvas (mutável, sem setState)
  const stateRef = useRef<CanvasState>({
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
  })

  // Refs para props que mudam sem re-montar o canvas
  const filterTypeRef = useRef(filterType)
  const showCriticalRef = useRef(showCritical)
  const colorPaletteRef = useRef(colorPalette)
  const criticalPathRef = useRef(criticalPath)
  const criticalEdgesRef = useRef(criticalEdges)
  const onEdgeCreateRef = useRef(onEdgeCreate)
  const onEdgeDeleteRef = useRef(onEdgeDelete)
  const onNodeSelectRef = useRef(onNodeSelect)
  const onZoomChangeRef = useRef(onZoomChange)

  // Atualiza refs quando props mudam (sem re-montar o effect)
  useEffect(() => { filterTypeRef.current = filterType }, [filterType])
  useEffect(() => { showCriticalRef.current = showCritical }, [showCritical])
  useEffect(() => { colorPaletteRef.current = colorPalette }, [colorPalette])
  useEffect(() => { criticalPathRef.current = criticalPath }, [criticalPath])
  useEffect(() => { criticalEdgesRef.current = criticalEdges }, [criticalEdges])
  useEffect(() => { onEdgeCreateRef.current = onEdgeCreate }, [onEdgeCreate])
  useEffect(() => { onEdgeDeleteRef.current = onEdgeDelete }, [onEdgeDelete])
  useEffect(() => { onNodeSelectRef.current = onNodeSelect }, [onNodeSelect])
  useEffect(() => { onZoomChangeRef.current = onZoomChange }, [onZoomChange])

  // Função draw exposta via ref para redraw externo (ex: mudança de filtro)
  const drawRef = useRef<() => void>(() => {})

  // Redraw quando filterType ou showCritical mudam
  useEffect(() => {
    drawRef.current()
  }, [filterType, showCritical])

  useEffect(() => {
    const positions = new Map<string, { x: number; y: number }>()
    if (positionStorageKey) {
      try {
        const raw = localStorage.getItem(positionStorageKey)
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>
          Object.entries(parsed).forEach(([id, pos]) => {
            if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
              positions.set(id, { x: pos.x, y: pos.y })
            }
          })
        }
      } catch (error) {
        console.error('Erro ao carregar posições salvas do grafo:', error)
      }
    }
    savedPositionsRef.current = positions
  }, [positionStorageKey])

  // ===== SETUP DO CANVAS =====

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    if (!canvas || !wrap) return

    const ctx = canvas.getContext('2d')!
    if (!ctx) return

    const s = stateRef.current

    // Copia dados para refs mutáveis (preserva posições de drag se nós são os mesmos)
    const prevNodes = nodesRef.current
    const prevPositions = new Map<string, { x: number; y: number }>()
    prevNodes.forEach(n => prevPositions.set(n.id, { x: n.x, y: n.y }))
    let hasPersistedPositions = false

    nodesRef.current = propNodes.map(n => {
      const prev = prevPositions.get(n.id)
      const saved = savedPositionsRef.current.get(n.id)
      // Preserva posição se o nó já existia (evita reset após edição de edge)
      if (prev) return { ...n, x: prev.x, y: prev.y }
      if (saved) {
        hasPersistedPositions = true
        return { ...n, x: saved.x, y: saved.y }
      }
      return { ...n }
    })
    edgesRef.current = [...propEdges]

    function persistNodePositions() {
      if (!positionStorageKey) return

      const serialized: Record<string, { x: number; y: number }> = {}
      nodesRef.current.forEach(node => {
        savedPositionsRef.current.set(node.id, { x: node.x, y: node.y })
      })
      savedPositionsRef.current.forEach((pos, id) => {
        serialized[id] = pos
      })

      try {
        localStorage.setItem(positionStorageKey, JSON.stringify(serialized))
      } catch (error) {
        console.error('Erro ao salvar posições do grafo:', error)
      }
    }

    // ── Coordenadas duplas ──
    function toCanvas(wx: number, wy: number) {
      return { x: wx * s.scale + s.offsetX, y: wy * s.scale + s.offsetY }
    }

    function toWorld(cx: number, cy: number) {
      return { x: (cx - s.offsetX) / s.scale, y: (cy - s.offsetY) / s.scale }
    }

    // ── Visibilidade (filtro) ──
    function nodeVisible(n: GraphNode): boolean {
      return filterTypeRef.current === 'all' || n.type === filterTypeRef.current
    }

    // ── Retângulo arredondado ──
    function drawRoundRect(x: number, y: number, w: number, h: number, r: number) {
      ctx.beginPath()
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r)
      ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
      ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r)
      ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r)
      ctx.closePath()
    }

    // ── Desenho dos nós ──
    function drawNodes() {
      const nodes = nodesRef.current
      const palette = colorPaletteRef.current
      const showCrit = showCriticalRef.current
      const critPath = criticalPathRef.current
      const selectedNodeIds = new Set(s.selectedNodeIds)

      nodes.forEach(n => {
        if (!nodeVisible(n)) return

        const { x: cx, y: cy } = toCanvas(n.x, n.y)
        const cw = (n.width  || NW) * s.scale
        const ch = (n.height || NH) * s.scale
        const cr = NR * s.scale
        const c = palette[n.type] || NEUTRAL_COLORS

        const isCrit = showCrit && critPath.has(n.id)
        const isSel = selectedNodeIds.has(n.id)

        // Sombra sutil
        ctx.save()
        ctx.shadowColor = 'rgba(0,0,0,.08)'
        ctx.shadowBlur = 6 * s.scale
        ctx.shadowOffsetY = 2 * s.scale

        // Fundo do nó
        drawRoundRect(cx, cy, cw, ch, cr)
        ctx.fillStyle = c.fill
        ctx.fill()
        ctx.restore()

        // Borda
        drawRoundRect(cx, cy, cw, ch, cr)
        ctx.strokeStyle = isCrit ? '#E24B4A' : isSel ? '#378ADD' : c.stroke
        ctx.lineWidth = (isCrit || isSel) ? 2 : 0.5
        ctx.stroke()

        // Texto — nó é dimensionado pelo texto em useGraphData, não precisa clip
        const fontSize = Math.max(9, 11 * s.scale)
        ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
        ctx.fillStyle = c.text
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        const lines = n.label.split('\n')
        const lh = fontSize * 1.3
        const startY = cy + ch / 2 - (lines.length - 1) * lh / 2
        lines.forEach((line, i) => {
          ctx.fillText(line, cx + cw / 2, startY + i * lh)
        })

        // Ponto de status (canto superior direito)
        const dotR = 4 * s.scale
        const dotX = cx + cw - dotR * 1.5
        const dotY = cy + dotR * 1.5
        ctx.beginPath()
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2)
        ctx.fillStyle = STATUS_COLORS[n.status] || '#B4B2A9'
        ctx.fill()

        // ID badge (canto superior esquerdo)
        const badgeFontSize = Math.max(7, 8 * s.scale)
        ctx.font = `700 ${badgeFontSize}px monospace`
        ctx.fillStyle = c.stroke
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(n.id, cx + 4 * s.scale, cy + 3 * s.scale)

        // ── Portas de conexão ──
        const pr = PORT_R * s.scale

        const isSourceNode = s.isConnecting && s.connectSource?.id === n.id
        const isTargetNode = s.isConnecting && s.connectTarget?.id === n.id
        const isHoverOut = s.hoverPort?.node.id === n.id && s.hoverPort?.portType === 'output'
        const isHoverIn = s.hoverPort?.node.id === n.id && s.hoverPort?.portType === 'input'

        // Porta de saída (borda direita)
        const outX = cx + cw
        const outY = cy + ch / 2
        ctx.beginPath()
        ctx.arc(outX, outY, pr, 0, Math.PI * 2)
        ctx.fillStyle = isSourceNode ? c.stroke : (isHoverOut ? c.badge : '#fff')
        ctx.fill()
        ctx.strokeStyle = c.stroke
        ctx.lineWidth = isHoverOut || isSourceNode ? 2 : 1
        ctx.stroke()

        // Porta de entrada (borda esquerda)
        const inX = cx
        const inY = cy + ch / 2
        ctx.beginPath()
        ctx.arc(inX, inY, pr, 0, Math.PI * 2)
        ctx.fillStyle = isTargetNode ? '#1D9E75' : (isHoverIn ? c.badge : '#fff')
        ctx.fill()
        ctx.strokeStyle = isTargetNode ? '#1D9E75' : c.stroke
        ctx.lineWidth = isHoverIn || isTargetNode ? 2 : 1
        ctx.stroke()
      })
    }

    // ── Desenho das arestas ──
    function drawEdges() {
      const nodes = nodesRef.current
      const edges = edgesRef.current
      const showCrit = showCriticalRef.current
      const critEdges = criticalEdgesRef.current

      edges.forEach(e => {
        const fn = nodes.find(nd => nd.id === e.from)
        const tn = nodes.find(nd => nd.id === e.to)
        if (!fn || !tn) return
        if (!nodeVisible(fn) || !nodeVisible(tn)) return

        const key = e.from + '\u2192' + e.to
        const isCrit = showCrit && critEdges.has(key)
        const isHighlighted = s.selectedNodeIds.length > 0 &&
          (s.selectedNodeIds.includes(e.from) || s.selectedNodeIds.includes(e.to))

        // Estado de seleção/hover de aresta
        const isSelEdge = s.selectedEdge?.from === e.from && s.selectedEdge?.to === e.to
        const isHoverEdge = s.hoverEdge?.from === e.from && s.hoverEdge?.to === e.to
        const edgeActive = isSelEdge || isHoverEdge

        // Pontos centrais em coordenadas canvas (usa dimensões dinâmicas do nó)
        const fp = toCanvas(fn.x + (fn.width || NW) / 2, fn.y + (fn.height || NH) / 2)
        const tp = toCanvas(tn.x + (tn.width || NW) / 2, tn.y + (tn.height || NH) / 2)

        ctx.save()

        // Prioridade visual: seleção > hover > crítico > highlight nó > default
        if (isSelEdge) {
          ctx.strokeStyle = '#E24B4A'
          ctx.lineWidth = 3
          ctx.globalAlpha = 1
        } else if (isHoverEdge) {
          ctx.strokeStyle = '#378ADD'
          ctx.lineWidth = 2.5
          ctx.globalAlpha = 1
        } else {
          ctx.strokeStyle = isCrit ? '#E24B4A' : isHighlighted ? '#378ADD' : '#888780'
          ctx.lineWidth = isCrit ? 2.5 : isHighlighted ? 2 : 1
          ctx.globalAlpha = isHighlighted || isCrit ? 1 : 0.4
        }

        if (!isCrit && !isHighlighted && !edgeActive) ctx.setLineDash([4, 3])

        // Curva Bézier horizontal
        const mx = (fp.x + tp.x) / 2
        ctx.beginPath()
        ctx.moveTo(fp.x, fp.y)
        ctx.bezierCurveTo(mx, fp.y, mx, tp.y, tp.x, tp.y)
        ctx.stroke()
        ctx.setLineDash([])

        // Seta na ponta
        const angle = Math.atan2(tp.y - fp.y, tp.x - fp.x)
        const arr = 7 * s.scale
        ctx.fillStyle = ctx.strokeStyle
        ctx.beginPath()
        ctx.moveTo(tp.x, tp.y)
        ctx.lineTo(tp.x - arr * Math.cos(angle - 0.4), tp.y - arr * Math.sin(angle - 0.4))
        ctx.lineTo(tp.x - arr * Math.cos(angle + 0.4), tp.y - arr * Math.sin(angle + 0.4))
        ctx.closePath()
        ctx.fill()

        ctx.restore()
      })
    }

    // ── Rubber-band (linha temporária durante criação de conexão) ──
    function drawRubberBand() {
      if (!s.connectSource) return

      // Origem: porta de saída do source (borda direita, meio vertical)
      const srcW = s.connectSource.width  || NW
      const srcH = s.connectSource.height || NH
      const fp = toCanvas(s.connectSource.x + srcW, s.connectSource.y + srcH / 2)

      // Destino: snap na porta do target ou posição do mouse
      let tp: { x: number; y: number }
      if (s.connectTarget) {
        const tgtH = s.connectTarget.height || NH
        tp = toCanvas(s.connectTarget.x, s.connectTarget.y + tgtH / 2)
      } else {
        tp = { x: s.connectMouseX, y: s.connectMouseY }
      }

      ctx.save()
      ctx.strokeStyle = s.connectTarget ? '#1D9E75' : '#378ADD'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.globalAlpha = 0.8

      const mx = (fp.x + tp.x) / 2
      ctx.beginPath()
      ctx.moveTo(fp.x, fp.y)
      ctx.bezierCurveTo(mx, fp.y, mx, tp.y, tp.x, tp.y)
      ctx.stroke()
      ctx.setLineDash([])

      // Seta
      const angle = Math.atan2(tp.y - fp.y, tp.x - fp.x)
      const arr = 7 * s.scale
      ctx.fillStyle = ctx.strokeStyle
      ctx.beginPath()
      ctx.moveTo(tp.x, tp.y)
      ctx.lineTo(tp.x - arr * Math.cos(angle - 0.4), tp.y - arr * Math.sin(angle - 0.4))
      ctx.lineTo(tp.x - arr * Math.cos(angle + 0.4), tp.y - arr * Math.sin(angle + 0.4))
      ctx.closePath()
      ctx.fill()

      ctx.restore()
    }

    // ── Draw principal ──
    function drawSelectionBox() {
      if (!s.isSelectingBox || !s.selectionBoxStart || !s.selectionBoxEnd) return

      const x = Math.min(s.selectionBoxStart.x, s.selectionBoxEnd.x)
      const y = Math.min(s.selectionBoxStart.y, s.selectionBoxEnd.y)
      const w = Math.abs(s.selectionBoxEnd.x - s.selectionBoxStart.x)
      const h = Math.abs(s.selectionBoxEnd.y - s.selectionBoxStart.y)

      ctx.save()
      ctx.fillStyle = 'rgba(55, 138, 221, 0.14)'
      ctx.strokeStyle = '#378ADD'
      ctx.lineWidth = 1
      ctx.setLineDash([6, 4])
      ctx.fillRect(x, y, w, h)
      ctx.strokeRect(x, y, w, h)
      ctx.restore()
    }

    function draw() {
      ctx.clearRect(0, 0, s.W, s.H)
      drawEdges()
      drawNodes()
      if (s.isConnecting) drawRubberBand()
      if (s.isSelectingBox) drawSelectionBox()
    }

    // Expõe draw para redraw externo
    drawRef.current = draw

    // ── Hit-test: nó sob o cursor ──
    function getNodeAt(canvasX: number, canvasY: number): GraphNode | undefined {
      const w = toWorld(canvasX, canvasY)
      const nodes = nodesRef.current
      return [...nodes].reverse().find(n =>
        nodeVisible(n) &&
        w.x >= n.x && w.x <= n.x + (n.width  || NW) &&
        w.y >= n.y && w.y <= n.y + (n.height || NH)
      )
    }

    function getVisibleSelectedNodes(): GraphNode[] {
      const selectedIds = new Set(s.selectedNodeIds)
      return nodesRef.current.filter(n => nodeVisible(n) && selectedIds.has(n.id))
    }

    function setSelectedNodes(nodeIds: string[], primaryNodeId?: string | null) {
      s.selectedNodeIds = [...new Set(nodeIds)]
      const preferredId = primaryNodeId || s.selectedNodeIds[0] || null
      s.selectedNode = preferredId
        ? nodesRef.current.find(n => n.id === preferredId) || null
        : null
      onNodeSelectRef.current?.(s.selectedNode)
    }

    // ── Hit-test: porta de conexão ──
    function getPortAt(canvasX: number, canvasY: number): { node: GraphNode; portType: 'output' | 'input' } | null {
      const w = toWorld(canvasX, canvasY)
      const nodes = nodesRef.current
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i]
        if (!nodeVisible(n)) continue
        // Porta de saída (borda direita)
        const ox = n.x + (n.width  || NW), oy = n.y + (n.height || NH) / 2
        if (Math.hypot(w.x - ox, w.y - oy) <= PORT_HIT_R) return { node: n, portType: 'output' }
        // Porta de entrada (borda esquerda)
        const ix = n.x, iy = n.y + (n.height || NH) / 2
        if (Math.hypot(w.x - ix, w.y - iy) <= PORT_HIT_R) return { node: n, portType: 'input' }
      }
      return null
    }

    // ── Hit-test: aresta (amostragem Bézier) ──
    function getEdgeAt(canvasX: number, canvasY: number): GraphEdge | null {
      const THRESHOLD = 6
      const SAMPLES = 30
      const nodes = nodesRef.current
      const edges = edgesRef.current

      for (let i = edges.length - 1; i >= 0; i--) {
        const e = edges[i]
        const fn = nodes.find(nd => nd.id === e.from)
        const tn = nodes.find(nd => nd.id === e.to)
        if (!fn || !tn) continue
        if (!nodeVisible(fn) || !nodeVisible(tn)) continue

        const fp = toCanvas(fn.x + (fn.width || NW) / 2, fn.y + (fn.height || NH) / 2)
        const tp = toCanvas(tn.x + (tn.width || NW) / 2, tn.y + (tn.height || NH) / 2)
        const mx = (fp.x + tp.x) / 2

        // B(t) = (1-t)³P0 + 3(1-t)²t·P1 + 3(1-t)t²·P2 + t³P3
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

    // ── Resize / HiDPI ──
    function resize() {
      s.W = wrap.clientWidth
      s.H = wrap.clientHeight

      canvas.width = s.W * devicePixelRatio
      canvas.height = s.H * devicePixelRatio
      canvas.style.width = s.W + 'px'
      canvas.style.height = s.H + 'px'

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(devicePixelRatio, devicePixelRatio)
      draw()
    }

    // ── Auto-center na inicialização ──
    function centerGraph() {
      const nodes = nodesRef.current
      if (nodes.length === 0) return

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      nodes.forEach(n => {
        if (n.x < minX) minX = n.x
        if (n.y < minY) minY = n.y
        if (n.x + (n.width  || NW) > maxX) maxX = n.x + (n.width  || NW)
        if (n.y + (n.height || NH) > maxY) maxY = n.y + (n.height || NH)
      })

      const graphW = maxX - minX
      const graphH = maxY - minY
      const centerX = minX + graphW / 2
      const centerY = minY + graphH / 2

      const scaleX = (s.W * 0.85) / graphW
      const scaleY = (s.H * 0.85) / graphH
      s.scale = Math.min(scaleX, scaleY, 1.5)

      s.offsetX = s.W / 2 - centerX * s.scale
      s.offsetY = s.H / 2 - centerY * s.scale

      onZoomChangeRef.current?.(Math.round(s.scale * 100))
    }

    // ── Eventos de mouse ──

    function onMouseDown(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      s.clickStart = { x: e.clientX, y: e.clientY }
      const isMultiSelectModifier = e.ctrlKey || e.metaKey

      // Prioridade 1: porta de saída → iniciar conexão
      const port = getPortAt(cx, cy)
      if (port && port.portType === 'output') {
        s.isConnecting = true
        s.connectSource = port.node
        s.connectTarget = null
        s.connectMouseX = cx
        s.connectMouseY = cy
        canvas.style.cursor = 'crosshair'
        return
      }

      // Prioridade 2: drag de nó
      const n = getNodeAt(cx, cy)
      if (n) {
        if (isMultiSelectModifier) {
          const alreadySelected = s.selectedNodeIds.includes(n.id)
          const nextIds = alreadySelected
            ? s.selectedNodeIds.filter(id => id !== n.id)
            : [...s.selectedNodeIds, n.id]
          setSelectedNodes(nextIds, alreadySelected ? nextIds[0] || null : n.id)
          s.selectedEdge = null
          draw()
          return
        }

        const groupIds = s.selectedNodeIds.includes(n.id) ? s.selectedNodeIds : [n.id]
        if (!s.selectedNodeIds.includes(n.id)) {
          setSelectedNodes(groupIds, n.id)
        }

        s.draggingNode = n
        const w = toWorld(cx, cy)
        s.dragOffX = n.x - w.x
        s.dragOffY = n.y - w.y
        s.draggingSelectionIds = groupIds
        s.selectionDragOffsets = Object.fromEntries(
          groupIds.map(id => {
            const node = nodesRef.current.find(item => item.id === id)
            return [id, { x: (node?.x || 0) - w.x, y: (node?.y || 0) - w.y }]
          })
        )
        canvas.style.cursor = 'grabbing'
      } else {
        if (e.altKey) {
          s.isPanning = true
          s.panStartX = e.clientX
          s.panStartY = e.clientY
          s.panOffX = s.offsetX
          s.panOffY = s.offsetY
          canvas.style.cursor = 'grabbing'
        } else {
          s.isSelectingBox = true
          s.selectionBoxStart = { x: cx, y: cy }
          s.selectionBoxEnd = { x: cx, y: cy }
          s.selectedEdge = null
          canvas.style.cursor = 'crosshair'
          draw()
        }
      }
    }

    function onMouseMove(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top

      if (s.isConnecting) {
        s.connectMouseX = cx
        s.connectMouseY = cy

        const port = getPortAt(cx, cy)
        if (port && port.portType === 'input' && port.node.id !== s.connectSource?.id) {
          s.connectTarget = port.node
        } else {
          s.connectTarget = null
        }
        canvas.style.cursor = s.connectTarget ? 'copy' : 'crosshair'
        draw()
      } else if (s.isSelectingBox) {
        s.selectionBoxEnd = { x: cx, y: cy }
        draw()
      } else if (s.draggingNode) {
        const w = toWorld(cx, cy)
        s.draggingSelectionIds.forEach(id => {
          const node = nodesRef.current.find(item => item.id === id)
          const offset = s.selectionDragOffsets[id]
          if (!node || !offset) return
          node.x = w.x + offset.x
          node.y = w.y + offset.y
        })
        draw()
      } else if (s.isPanning) {
        s.offsetX = s.panOffX + (e.clientX - s.panStartX)
        s.offsetY = s.panOffY + (e.clientY - s.panStartY)
        draw()
      } else {
        // Hover: detectar portas e arestas
        const port = getPortAt(cx, cy)
        const prevHover = s.hoverPort
        s.hoverPort = port

        const prevHoverEdge = s.hoverEdge
        if (!port && !getNodeAt(cx, cy)) {
          s.hoverEdge = getEdgeAt(cx, cy)
        } else {
          s.hoverEdge = null
        }

        // Cursor contextual
        if (port?.portType === 'output') {
          canvas.style.cursor = 'crosshair'
        } else if (port?.portType === 'input') {
          canvas.style.cursor = 'cell'
        } else if (getNodeAt(cx, cy)) {
          canvas.style.cursor = 'pointer'
        } else if (s.hoverEdge) {
          canvas.style.cursor = 'pointer'
        } else {
          canvas.style.cursor = 'grab'
        }

        // Redesenha se hover mudou
        const portChanged = (!prevHover && port) || (prevHover && !port) ||
          (prevHover && port && (prevHover.node.id !== port.node.id || prevHover.portType !== port.portType))
        const edgeChanged = (!prevHoverEdge && s.hoverEdge) || (prevHoverEdge && !s.hoverEdge) ||
          (prevHoverEdge && s.hoverEdge && (prevHoverEdge.from !== s.hoverEdge.from || prevHoverEdge.to !== s.hoverEdge.to))
        if (portChanged || edgeChanged) draw()
      }
    }

    function onMouseUp(e: MouseEvent) {
      const hadDraggedNodes = s.draggingSelectionIds.length > 0

      // Finalizar criação de conexão
      if (s.isConnecting) {
        if (s.connectTarget && s.connectSource && s.connectTarget.id !== s.connectSource.id) {
          // Previne edge duplicada
          const exists = edgesRef.current.some(
            ed => ed.from === s.connectSource!.id && ed.to === s.connectTarget!.id
          )
          if (!exists) {
            // Adiciona edge local imediatamente (feedback visual)
            edgesRef.current.push({ from: s.connectSource.id, to: s.connectTarget.id })
            // Chama callback para persistir no banco
            onEdgeCreateRef.current?.(s.connectSource.id, s.connectTarget.id)
          }
        }
        s.isConnecting = false
        s.connectSource = null
        s.connectTarget = null
        canvas.style.cursor = 'grab'
        draw()
        return
      }

      if (s.isSelectingBox) {
        const start = s.selectionBoxStart
        const end = s.selectionBoxEnd
        if (start && end) {
          const minX = Math.min(start.x, end.x)
          const maxX = Math.max(start.x, end.x)
          const minY = Math.min(start.y, end.y)
          const maxY = Math.max(start.y, end.y)
          const w1 = toWorld(minX, minY)
          const w2 = toWorld(maxX, maxY)
          const idsInBox = nodesRef.current
            .filter(n =>
              nodeVisible(n) &&
              n.x >= w1.x &&
              n.y >= w1.y &&
              n.x + (n.width || NW) <= w2.x &&
              n.y + (n.height || NH) <= w2.y
            )
            .map(n => n.id)

          setSelectedNodes(idsInBox, idsInBox[0] || null)
          s.selectedEdge = null
        }

        s.isSelectingBox = false
        s.selectionBoxStart = null
        s.selectionBoxEnd = null
        canvas.style.cursor = 'grab'
        draw()
        return
      }

      const moved = Math.abs(e.clientX - s.clickStart.x) +
                    Math.abs(e.clientY - s.clickStart.y) > 4

      if (!moved) {
        const rect = canvas.getBoundingClientRect()
        const mcx = e.clientX - rect.left
        const mcy = e.clientY - rect.top

        const n = getNodeAt(mcx, mcy)
        if (n) {
          // Clique em nó
          if (s.selectedNodeIds.includes(n.id) && s.selectedNodeIds.length > 1) {
            setSelectedNodes(s.selectedNodeIds, n.id)
          } else {
            setSelectedNodes([n.id], n.id)
          }
          s.selectedEdge = null
        } else {
          const edge = getEdgeAt(mcx, mcy)
          if (edge) {
            // Clique em aresta
            s.selectedEdge = edge
            s.selectedNode = null
            s.selectedNodeIds = []
            onNodeSelectRef.current?.(null)
          } else {
            // Clique no vazio
            s.selectedNode = null
            s.selectedNodeIds = []
            s.selectedEdge = null
            onNodeSelectRef.current?.(null)
          }
        }
      }

      s.draggingNode = null
      s.draggingSelectionIds = []
      s.selectionDragOffsets = {}
      s.isPanning = false
      canvas.style.cursor = 'grab'
      if (hadDraggedNodes) {
        persistNodePositions()
      }
      draw()
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault()

      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      const delta = e.deltaY > 0 ? 0.9 : 1.1

      const newScale = Math.min(2.5, Math.max(0.3, s.scale * delta))

      // Zoom centrado no cursor
      s.offsetX = cx - (cx - s.offsetX) * (newScale / s.scale)
      s.offsetY = cy - (cy - s.offsetY) * (newScale / s.scale)
      s.scale = newScale

      onZoomChangeRef.current?.(Math.round(s.scale * 100))
      draw()
    }

    function onKeyDown(e: KeyboardEvent) {
      const selectedNodes = getVisibleSelectedNodes()
      const arrowDelta = e.shiftKey ? 10 : 1

      if (selectedNodes.length > 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault()

        const dx = e.key === 'ArrowLeft' ? -arrowDelta : e.key === 'ArrowRight' ? arrowDelta : 0
        const dy = e.key === 'ArrowUp' ? -arrowDelta : e.key === 'ArrowDown' ? arrowDelta : 0

        selectedNodes.forEach(node => {
          node.x += dx
          node.y += dy
        })

        if (s.selectedNodeIds.length > 0) {
          s.selectedNode = nodesRef.current.find(n => n.id === s.selectedNodeIds[0]) || null
          onNodeSelectRef.current?.(s.selectedNode)
        }
        persistNodePositions()
        draw()
        return
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedEdge) {
        e.preventDefault()

        const edge = s.selectedEdge
        // Remove localmente
        const idx = edgesRef.current.findIndex(
          ed => ed.from === edge.from && ed.to === edge.to
        )
        if (idx !== -1) edgesRef.current.splice(idx, 1)

        // Chama callback para persistir no banco
        onEdgeDeleteRef.current?.(edge.from, edge.to)

        s.selectedEdge = null
        draw()
      }
    }

    // ── Registra eventos ──
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    document.addEventListener('keydown', onKeyDown)

    // ResizeObserver para containers flex (melhor que window.resize)
    const observer = new ResizeObserver(() => resize())
    observer.observe(wrap)

    // Inicialização
    resize()
    if (!hasPersistedPositions) {
      centerGraph()
    }
    draw()

    // Cleanup
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('wheel', onWheel)
      document.removeEventListener('keydown', onKeyDown)
      observer.disconnect()
    }
  }, [propNodes, propEdges]) // Re-monta quando dados mudam

  return (
    <div ref={wrapRef} className="w-full h-full relative">
      <canvas ref={canvasRef} style={{ display: 'block', cursor: 'grab' }} />
    </div>
  )
}
