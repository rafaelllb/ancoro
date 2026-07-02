/**
 * RequirementsGraph — Componente Canvas 2D interativo para visualização
 * de dependências entre requisitos.
 *
 * Refatorado de componente monolítico (~980 linhas) para shell de ~350 linhas.
 * Lógica de desenho, hit-test e persistência extraídas para módulos dedicados.
 *
 * @author Rafael Brito
 */

import { useRef, useEffect } from 'react'
import { GraphNode, GraphEdge } from '../../hooks/useGraphData'
import {
  CanvasState,
  RequirementsGraphProps,
  createInitialCanvasState,
  NW, NH,
} from './graphTypes'
import { drawAll } from './graphDrawing'
import {
  toWorld,
  nodeVisible,
  getNodeAt,
  getPortAt,
  getEdgeAt,
  getVisibleSelectedNodes,
  setSelectedNodes,
} from './graphHitTest'
import {
  createDebouncedPersist,
  loadPositionsFromAPI,
  persistNodePositionsAPI,
  loadPositionsFromLocal,
  migratePositionKeys,
  buildPositionsMap,
} from './graphPersistence'

export default function RequirementsGraph({
  nodes: propNodes,
  edges: propEdges,
  colorPalette,
  projectId,
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

  // Posições salvas indexadas por dbId (CUID imutável)
  const savedPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  // Cópias mutáveis dos dados (permitem drag sem re-render)
  const nodesRef = useRef<GraphNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])

  // Estado do canvas (mutável, sem setState)
  const stateRef = useRef<CanvasState>(createInitialCanvasState())

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

  // ===== SETUP DO CANVAS =====
  // Leitura de posições é SÍNCRONA (localStorage) para evitar race condition.
  // Upgrade assíncrono da API acontece em background após o render inicial.

  useEffect(() => {
    const canvas = canvasRef.current!
    const wrap = wrapRef.current!
    if (!canvas || !wrap) return

    const ctx = canvas.getContext('2d')!
    if (!ctx) return

    const s = stateRef.current
    const localKey = `ancoro_dependency_graph_positions_${projectId}`

    // 1. Leitura SÍNCRONA do localStorage (imediato, garante posições antes do render)
    const localPositions = loadPositionsFromLocal(localKey)
    Object.entries(localPositions).forEach(([id, pos]) => {
      savedPositionsRef.current.set(id, pos)
    })

    // Copia dados para refs mutáveis (preserva posições de drag se nós são os mesmos)
    const prevNodes = nodesRef.current
    const prevPositions = new Map<string, { x: number; y: number }>()
    prevNodes.forEach(n => prevPositions.set(n.id, { x: n.x, y: n.y }))
    let hasPersistedPositions = false

    nodesRef.current = propNodes.map(n => {
      const prev = prevPositions.get(n.id)
      // Busca por dbId (novo, já migrado) e por reqId (legacy localStorage)
      const savedByDbId = savedPositionsRef.current.get(n.dbId)
      const savedById = savedPositionsRef.current.get(n.id)
      // Preserva posição se o nó já existia (evita reset após edição de edge)
      if (prev) return { ...n, x: prev.x, y: prev.y }
      if (savedByDbId) {
        hasPersistedPositions = true
        return { ...n, x: savedByDbId.x, y: savedByDbId.y }
      }
      if (savedById) {
        hasPersistedPositions = true
        return { ...n, x: savedById.x, y: savedById.y }
      }
      return { ...n }
    })
    edgesRef.current = [...propEdges]

    // ── Persistência com debounce ──
    function persistPositions() {
      const positions = buildPositionsMap(nodesRef.current, savedPositionsRef.current)
      // Atualiza cache local para preservar entre re-renders
      nodesRef.current.forEach(node => {
        savedPositionsRef.current.set(node.dbId, { x: node.x, y: node.y })
      })
      persistNodePositionsAPI(projectId, positions)
    }

    const debouncedPersist = createDebouncedPersist(persistPositions, 300)

    // ── Draw ──
    function draw() {
      drawAll(
        ctx, s,
        nodesRef.current, edgesRef.current,
        colorPaletteRef.current,
        criticalPathRef.current, criticalEdgesRef.current,
        showCriticalRef.current, filterTypeRef.current,
      )
    }

    // Expõe draw para redraw externo
    drawRef.current = draw

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

    // ── Helpers locais de hit-test (curried com filterType atual) ──
    const ft = () => filterTypeRef.current
    const nodes = () => nodesRef.current
    const edges = () => edgesRef.current

    // ── Eventos de mouse ──

    function onMouseDown(e: MouseEvent) {
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top
      s.clickStart = { x: e.clientX, y: e.clientY }
      const isMultiSelectModifier = e.ctrlKey || e.metaKey

      // Prioridade 1: porta de saída → iniciar conexão
      const port = getPortAt(s, nodes(), cx, cy, ft())
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
      const n = getNodeAt(s, nodes(), cx, cy, ft())
      if (n) {
        if (isMultiSelectModifier) {
          const alreadySelected = s.selectedNodeIds.includes(n.id)
          const nextIds = alreadySelected
            ? s.selectedNodeIds.filter(id => id !== n.id)
            : [...s.selectedNodeIds, n.id]
          setSelectedNodes(s, nodes(), nextIds, alreadySelected ? nextIds[0] || null : n.id, onNodeSelectRef.current)
          s.selectedEdge = null
          draw()
          return
        }

        const groupIds = s.selectedNodeIds.includes(n.id) ? s.selectedNodeIds : [n.id]
        if (!s.selectedNodeIds.includes(n.id)) {
          setSelectedNodes(s, nodes(), groupIds, n.id, onNodeSelectRef.current)
        }

        s.draggingNode = n
        const w = toWorld(s, cx, cy)
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

        const port = getPortAt(s, nodes(), cx, cy, ft())
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
        const w = toWorld(s, cx, cy)
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
        const port = getPortAt(s, nodes(), cx, cy, ft())
        const prevHover = s.hoverPort
        s.hoverPort = port

        const prevHoverEdge = s.hoverEdge
        if (!port && !getNodeAt(s, nodes(), cx, cy, ft())) {
          s.hoverEdge = getEdgeAt(s, nodes(), edges(), cx, cy, ft())
        } else {
          s.hoverEdge = null
        }

        // Cursor contextual
        if (port?.portType === 'output') {
          canvas.style.cursor = 'crosshair'
        } else if (port?.portType === 'input') {
          canvas.style.cursor = 'cell'
        } else if (getNodeAt(s, nodes(), cx, cy, ft())) {
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
          const w1 = toWorld(s, minX, minY)
          const w2 = toWorld(s, maxX, maxY)
          const idsInBox = nodesRef.current
            .filter(n =>
              nodeVisible(n, ft()) &&
              n.x >= w1.x &&
              n.y >= w1.y &&
              n.x + (n.width || NW) <= w2.x &&
              n.y + (n.height || NH) <= w2.y
            )
            .map(n => n.id)

          setSelectedNodes(s, nodes(), idsInBox, idsInBox[0] || null, onNodeSelectRef.current)
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

        const n = getNodeAt(s, nodes(), mcx, mcy, ft())
        if (n) {
          // Clique em nó
          if (s.selectedNodeIds.includes(n.id) && s.selectedNodeIds.length > 1) {
            setSelectedNodes(s, nodes(), s.selectedNodeIds, n.id, onNodeSelectRef.current)
          } else {
            setSelectedNodes(s, nodes(), [n.id], n.id, onNodeSelectRef.current)
          }
          s.selectedEdge = null
        } else {
          const edge = getEdgeAt(s, nodes(), edges(), mcx, mcy, ft())
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
        debouncedPersist.trigger()
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
      const selectedNodes = getVisibleSelectedNodes(s, nodes(), ft())
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
        debouncedPersist.trigger()
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

    // 3. Upgrade ASSÍNCRONO: carrega da API em background e sobrescreve se houver dados
    let cancelled = false
    loadPositionsFromAPI(projectId).then(apiPositions => {
      if (cancelled) return

      if (Object.keys(apiPositions).length > 0) {
        // API tem dados → sobrescreve savedPositions e reaaplica nos nós
        Object.entries(apiPositions).forEach(([dbId, pos]) => {
          if (Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
            savedPositionsRef.current.set(dbId, pos)
          }
        })
        nodesRef.current.forEach(n => {
          const saved = savedPositionsRef.current.get(n.dbId)
          if (saved) {
            n.x = saved.x
            n.y = saved.y
          }
        })
        draw()
      } else if (Object.keys(localPositions).length > 0) {
        // API vazia + localStorage tem dados → migrar reqId→dbId e salvar na API
        const reqIdToDbId = new Map<string, string>()
        nodesRef.current.forEach(n => reqIdToDbId.set(n.id, n.dbId))
        const migrated = migratePositionKeys(localPositions, reqIdToDbId)
        persistNodePositionsAPI(projectId, migrated)
      }
    })

    // Cleanup
    return () => {
      cancelled = true
      // Flush posições pendentes antes de desmontar
      debouncedPersist.flush()

      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('wheel', onWheel)
      document.removeEventListener('keydown', onKeyDown)
      observer.disconnect()
    }
  }, [propNodes, propEdges, projectId]) // Re-monta quando dados mudam

  return (
    <div ref={wrapRef} className="w-full h-full relative">
      <canvas ref={canvasRef} style={{ display: 'block', cursor: 'grab' }} />
    </div>
  )
}
