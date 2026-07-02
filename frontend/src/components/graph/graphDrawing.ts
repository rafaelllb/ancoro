/**
 * Funções puras de desenho do grafo de dependências.
 *
 * Todas recebem ctx + state como parâmetros explícitos — sem closure.
 * Responsabilidades: renderizar nós, arestas, rubber-band e selection box.
 *
 * @author Rafael Brito
 */

import { GraphNode, GraphEdge } from '../../hooks/useGraphData'
import { NodeColors } from '../../utils/colorUtils'
import {
  CanvasState,
  NW, NH, NR, PORT_R,
  STATUS_COLORS, NEUTRAL_COLORS,
} from './graphTypes'
import { toCanvas, nodeVisible } from './graphHitTest'

// ── Retângulo arredondado ──
function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

// ── Desenho dos nós ──
export function drawNodes(
  ctx: CanvasRenderingContext2D,
  s: CanvasState,
  nodes: GraphNode[],
  palette: Record<string, NodeColors>,
  criticalPath: Set<string>,
  showCritical: boolean,
  filterType: string,
) {
  const selectedNodeIds = new Set(s.selectedNodeIds)

  nodes.forEach(n => {
    if (!nodeVisible(n, filterType)) return

    const { x: cx, y: cy } = toCanvas(s, n.x, n.y)
    const cw = (n.width  || NW) * s.scale
    const ch = (n.height || NH) * s.scale
    const cr = NR * s.scale
    const c = palette[n.type] || NEUTRAL_COLORS

    const isCrit = showCritical && criticalPath.has(n.id)
    const isSel = selectedNodeIds.has(n.id)

    // Sombra sutil
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,.08)'
    ctx.shadowBlur = 6 * s.scale
    ctx.shadowOffsetY = 2 * s.scale

    // Fundo do nó
    drawRoundRect(ctx, cx, cy, cw, ch, cr)
    ctx.fillStyle = c.fill
    ctx.fill()
    ctx.restore()

    // Borda
    drawRoundRect(ctx, cx, cy, cw, ch, cr)
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
export function drawEdges(
  ctx: CanvasRenderingContext2D,
  s: CanvasState,
  nodes: GraphNode[],
  edges: GraphEdge[],
  criticalEdges: Set<string>,
  showCritical: boolean,
  filterType: string,
) {
  edges.forEach(e => {
    const fn = nodes.find(nd => nd.id === e.from)
    const tn = nodes.find(nd => nd.id === e.to)
    if (!fn || !tn) return
    if (!nodeVisible(fn, filterType) || !nodeVisible(tn, filterType)) return

    const key = e.from + '\u2192' + e.to
    const isCrit = showCritical && criticalEdges.has(key)
    const isHighlighted = s.selectedNodeIds.length > 0 &&
      (s.selectedNodeIds.includes(e.from) || s.selectedNodeIds.includes(e.to))

    // Estado de seleção/hover de aresta
    const isSelEdge = s.selectedEdge?.from === e.from && s.selectedEdge?.to === e.to
    const isHoverEdge = s.hoverEdge?.from === e.from && s.hoverEdge?.to === e.to
    const edgeActive = isSelEdge || isHoverEdge

    // Pontos centrais em coordenadas canvas (usa dimensões dinâmicas do nó)
    const fp = toCanvas(s, fn.x + (fn.width || NW) / 2, fn.y + (fn.height || NH) / 2)
    const tp = toCanvas(s, tn.x + (tn.width || NW) / 2, tn.y + (tn.height || NH) / 2)

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
export function drawRubberBand(ctx: CanvasRenderingContext2D, s: CanvasState) {
  if (!s.connectSource) return

  // Origem: porta de saída do source (borda direita, meio vertical)
  const srcW = s.connectSource.width  || NW
  const srcH = s.connectSource.height || NH
  const fp = toCanvas(s, s.connectSource.x + srcW, s.connectSource.y + srcH / 2)

  // Destino: snap na porta do target ou posição do mouse
  let tp: { x: number; y: number }
  if (s.connectTarget) {
    const tgtH = s.connectTarget.height || NH
    tp = toCanvas(s, s.connectTarget.x, s.connectTarget.y + tgtH / 2)
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

// ── Selection box ──
export function drawSelectionBox(ctx: CanvasRenderingContext2D, s: CanvasState) {
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

// ── Draw principal (orquestrador) ──
export function drawAll(
  ctx: CanvasRenderingContext2D,
  s: CanvasState,
  nodes: GraphNode[],
  edges: GraphEdge[],
  palette: Record<string, NodeColors>,
  criticalPath: Set<string>,
  criticalEdges: Set<string>,
  showCritical: boolean,
  filterType: string,
) {
  ctx.clearRect(0, 0, s.W, s.H)
  drawEdges(ctx, s, nodes, edges, criticalEdges, showCritical, filterType)
  drawNodes(ctx, s, nodes, palette, criticalPath, showCritical, filterType)
  if (s.isConnecting) drawRubberBand(ctx, s)
  if (s.isSelectingBox) drawSelectionBox(ctx, s)
}
