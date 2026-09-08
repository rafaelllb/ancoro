/**
 * Hook para transformar Requirement[] em dados do grafo (nodes + edges)
 * e fornecer mutações bidirecionais para criação/remoção de arestas.
 *
 * A sincronização bidirecional funciona assim:
 * - Dados → Grafo: campos dependsOn/providesFor geram edges visuais
 * - Grafo → Dados: criar/remover edge visual chama o endpoint atômico de conexão
 *   (/api/requirements/connections), que sincroniza dependsOn/providesFor dos dois
 *   lados numa única transação — evitando o antigo problema de conexão "pela metade".
 *
 * @author Rafael Brito
 */

import { useMemo, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { Requirement } from '../services/api'
import { ProjectListItem } from '../hooks/useProjectLists'
import { useCreateConnection, useDeleteConnection } from '../hooks/useRequirements'
import { generateNodeColors, getFallbackColor, NodeColors } from '../utils/colorUtils'

// ===== TIPOS DO GRAFO =====

export interface GraphNode {
  id: string       // requirement.reqId (ex: "REQ-001")
  dbId: string     // requirement.id (cuid, para chamadas API)
  type: string     // requirement.module (ex: "ISU", "FICA")
  label: string    // requirement.shortDesc com quebra de linha
  x: number        // posição computada pelo auto-layout
  y: number        // posição computada pelo auto-layout
  width: number    // largura calculada pelo tamanho do texto (dinâmica)
  height: number   // altura calculada pelo tamanho do texto (dinâmica)
  desc: string     // requirement.what
  status: 'done' | 'in-progress' | 'pending'
}

export interface GraphEdge {
  from: string     // reqId que fornece (source)
  to: string       // reqId que depende (target)
}

// ===== CONSTANTES DE LAYOUT =====

const PADDING_X = 80    // margem horizontal inicial
const PADDING_Y = 60    // margem vertical inicial
const GAP_H     = 80    // gap horizontal entre níveis DAG
const GAP_V     = 20    // gap vertical entre nós no mesmo nível

// Dimensões mínimas de nó (texto curto não encolhe abaixo disso)
const MIN_NODE_W = 120
const MIN_NODE_H = 52

// Métricas de texto para cálculo de tamanho de nó (deve refletir as fontes do canvas)
const FONT_SIZE  = 11      // px — mesma constante usada em drawNodes
const LINE_H     = FONT_SIZE * 1.3
const PAD_H_NODE = 16     // padding horizontal interno total
const PAD_V_NODE = 20     // padding vertical interno total (reserva espaço para badge no topo)

// ===== MAPEAMENTO DE STATUS =====

/**
 * Mapeia status do requisito para status visual do grafo.
 * Status do projeto são configuráveis (ProjectListItem), mas os defaults são:
 * APPROVED/VALIDATED → done, IN_PROGRESS → in-progress, resto → pending
 */
function mapStatus(status: string): GraphNode['status'] {
  const upper = status.toUpperCase()
  if (upper === 'VALIDATED' || upper === 'APPROVED') return 'done'
  if (upper === 'IN_PROGRESS') return 'in-progress'
  // PENDING, CONFLICT, REJECTED, ou qualquer status customizado
  return 'pending'
}

// ===== FORMATAÇÃO DE LABEL =====

/**
 * Quebra shortDesc em 2 linhas para caber no nó (largura ~100px).
 * Divide no espaço mais próximo do meio se > 18 caracteres.
 */
function formatLabel(shortDesc: string): string {
  const text = shortDesc.trim()
  if (text.length <= 18) return text

  // Encontra o espaço mais próximo do meio
  const mid = Math.floor(text.length / 2)
  let bestSplit = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') {
      if (bestSplit === -1 || Math.abs(i - mid) < Math.abs(bestSplit - mid)) {
        bestSplit = i
      }
    }
  }

  if (bestSplit === -1) return text // sem espaço para quebrar
  return text.substring(0, bestSplit) + '\n' + text.substring(bestSplit + 1)
}

// ===== AUTO-LAYOUT (DAG HIERÁRQUICO) =====

/**
 * Layout esquerda→direita baseado em longest-path topological sort.
 * Nível X de um nó = profundidade máxima na cadeia de dependência (X semântico).
 * Dentro de cada nível, nós são agrupados por módulo e ordenados por reqId.
 *
 * Trata ciclos de forma segura: nós em ciclos não resolvidos pelo DFS são
 * colocados no nível max+1 (não travam o algoritmo).
 */
function computeLayout(nodes: GraphNode[], edges: GraphEdge[]): void {
  if (nodes.length === 0) return

  const nodeIds = new Set(nodes.map(n => n.id))

  // Mapa reqId → sucessores diretos (arestas válidas dentro do conjunto visível)
  const successors = new Map<string, string[]>()
  for (const n of nodes) successors.set(n.id, [])
  for (const e of edges) {
    if (nodeIds.has(e.from) && nodeIds.has(e.to))
      successors.get(e.from)!.push(e.to)
  }

  // DFS pós-ordem para topological sort com detecção de ciclo
  // "visiting" rastreia o caminho atual da recursão — back-edges indicam ciclos
  const visited   = new Set<string>()
  const topoOrder: string[] = []

  function dfs(id: string, visiting: Set<string>) {
    if (visiting.has(id) || visited.has(id)) return
    visiting.add(id)
    for (const s of successors.get(id)!) dfs(s, visiting)
    visiting.delete(id)
    visited.add(id)
    topoOrder.unshift(id)  // pré-pende: raízes topológicas chegam primeiro
  }

  for (const n of nodes) dfs(n.id, new Set())

  // Longest-path leveling: propaga nível máximo via ordem topológica
  const level = new Map<string, number>()
  for (const n of nodes) level.set(n.id, 0)

  for (const id of topoOrder) {
    const lv = level.get(id)!
    for (const s of successors.get(id)!) {
      if (nodeIds.has(s))
        level.set(s, Math.max(level.get(s)!, lv + 1))
    }
  }

  // Nós em ciclos (não alcançados pelo DFS) ficam no nível max+1
  const maxLevel = level.size > 0 ? Math.max(0, ...level.values()) : 0
  for (const n of nodes) {
    if (!visited.has(n.id)) level.set(n.id, maxLevel + 1)
  }

  // Agrupa por nível; ordena cada grupo por módulo depois reqId
  const groups = new Map<number, GraphNode[]>()
  for (const n of nodes) {
    const lv = level.get(n.id)!
    const g = groups.get(lv) || []
    g.push(n)
    groups.set(lv, g)
  }
  for (const g of groups.values()) {
    g.sort((a, b) =>
      a.type !== b.type
        ? a.type.localeCompare(b.type)
        : a.id.localeCompare(b.id, undefined, { numeric: true })
    )
  }

  // Largura máxima por nível — garante que o próximo nível não sobreponha o anterior
  const levelMaxWidth = new Map<number, number>()
  for (const n of nodes) {
    const lv = level.get(n.id)!
    levelMaxWidth.set(lv, Math.max(levelMaxWidth.get(lv) ?? 0, n.width))
  }

  // Posição X cumulativa por nível (cada nível começa após o mais largo do anterior + gap)
  const levelX = new Map<number, number>()
  let cumX = PADDING_X
  for (const lv of [...levelMaxWidth.keys()].sort((a, b) => a - b)) {
    levelX.set(lv, cumX)
    cumX += (levelMaxWidth.get(lv) ?? MIN_NODE_W) + GAP_H
  }

  // Atribui posições finais: X = posição do nível, Y = empilhado pela altura real do nó
  for (const [lv, group] of groups) {
    const xPos = levelX.get(lv) ?? PADDING_X
    let yPos = PADDING_Y
    for (const n of group) {
      n.x = xPos
      n.y = yPos
      yPos += n.height + GAP_V
    }
  }
}

// ===== PALETA DINÂMICA =====

/**
 * Constrói paleta de cores a partir dos módulos configurados no projeto.
 * Módulos sem cor recebem fallback determinístico.
 */
function buildColorPalette(
  modules: ProjectListItem[],
  usedModules: Set<string>
): Record<string, NodeColors> {
  const palette: Record<string, NodeColors> = {}
  let fallbackIndex = 0

  // Primeiro: módulos com cor configurada
  for (const mod of modules) {
    if (usedModules.has(mod.code)) {
      const baseColor = mod.color || getFallbackColor(fallbackIndex++)
      palette[mod.code] = generateNodeColors(baseColor)
    }
  }

  // Segundo: módulos presentes nos requisitos mas não na lista do projeto
  // (dados legados ou módulos removidos)
  for (const code of usedModules) {
    if (!palette[code]) {
      palette[code] = generateNodeColors(getFallbackColor(fallbackIndex++))
    }
  }

  return palette
}

// ===== HOOK PRINCIPAL =====

interface UseGraphDataReturn {
  nodes: GraphNode[]
  edges: GraphEdge[]
  colorPalette: Record<string, NodeColors>
  createEdge: (fromReqId: string, toReqId: string) => Promise<void>
  deleteEdge: (fromReqId: string, toReqId: string) => Promise<void>
}

export function useGraphData(
  requirements: Requirement[],
  projectModules: ProjectListItem[],
  showOnlyConnected: boolean = true
): UseGraphDataReturn {
  const createConnection = useCreateConnection()
  const deleteConnection = useDeleteConnection()

  // Mapa reqId → Requirement para lookups rápidos nas mutações
  const reqMap = useMemo(() => {
    const map = new Map<string, Requirement>()
    for (const req of requirements) {
      map.set(req.reqId, req)
    }
    return map
  }, [requirements])

  // Transforma requirements em nodes + edges
  const { nodes, edges, colorPalette } = useMemo(() => {
    // Canvas temporário para medir largura real do texto antes de criar os nós.
    // Evita overflow no canvas principal: o nó é dimensionado para caber o conteúdo.
    // Nota: getContext('2d') retorna o mesmo objeto para o mesmo canvas, por isso trocamos
    // a font explicitamente antes de cada medição (text body vs. badge ID).
    const tempCanvas = document.createElement('canvas')
    const ctx2d = tempCanvas.getContext('2d')!
    const FONT_BODY  = `500 ${FONT_SIZE}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    const FONT_BADGE = '700 8px monospace'

    // Mapeia requisitos para nós do grafo com dimensões calculadas pelo texto
    const graphNodes: GraphNode[] = requirements.map(req => {
      const label = formatLabel(req.shortDesc)
      const lines = label.split('\n')

      ctx2d.font = FONT_BODY
      const textW  = Math.max(...lines.map(l => ctx2d.measureText(l).width))

      ctx2d.font = FONT_BADGE
      const badgeW = ctx2d.measureText(req.reqId).width + 8  // +8 margem do badge

      const nodeW  = Math.max(MIN_NODE_W, Math.ceil(Math.max(textW, badgeW)) + PAD_H_NODE)
      const nodeH  = Math.max(MIN_NODE_H, Math.ceil(lines.length * LINE_H) + PAD_V_NODE)

      return {
        id: req.reqId,
        dbId: req.id,
        type: req.module,
        label,
        x: 0,
        y: 0,
        width: nodeW,
        height: nodeH,
        desc: req.what || req.shortDesc,
        status: mapStatus(req.status),
      }
    })

    // Deriva arestas apenas de dependsOn para evitar duplicatas
    // dependsOn[R] = [A, B] → edges: {from: A, to: R}, {from: B, to: R}
    const reqIdSet = new Set(requirements.map(r => r.reqId))
    const graphEdges: GraphEdge[] = []
    const edgeSet = new Set<string>() // previne duplicatas

    for (const req of requirements) {
      if (req.dependsOn && Array.isArray(req.dependsOn)) {
        for (const depId of req.dependsOn) {
          // Só cria edge se o requisito referenciado existe no projeto
          if (reqIdSet.has(depId)) {
            const key = `${depId}→${req.reqId}`
            if (!edgeSet.has(key)) {
              edgeSet.add(key)
              graphEdges.push({ from: depId, to: req.reqId })
            }
          }
        }
      }
    }

    // Filtra nós: quando showOnlyConnected, exibe apenas os que participam de ao menos uma aresta.
    // Isso mantém o grafo limpo por padrão; o usuário alterna para "Mostrar Todos" para criar novas relações.
    const connectedIds = new Set<string>()
    for (const edge of graphEdges) {
      connectedIds.add(edge.from)
      connectedIds.add(edge.to)
    }
    const visibleNodes = showOnlyConnected
      ? graphNodes.filter(n => connectedIds.has(n.id))
      : graphNodes

    // Computa posições apenas dos nós visíveis usando layout hierárquico DAG
    computeLayout(visibleNodes, graphEdges)

    // Constrói paleta de cores dinâmica
    const usedModules = new Set(requirements.map(r => r.module))
    const palette = buildColorPalette(projectModules, usedModules)

    return { nodes: visibleNodes, edges: graphEdges, colorPalette: palette }
  }, [requirements, projectModules, showOnlyConnected])

  // ===== MUTAÇÕES BIDIRECIONAIS =====

  /**
   * Cria uma aresta visual e sincroniza com o banco:
   * - Adiciona toReqId ao providesFor do source
   * - Adiciona fromReqId ao dependsOn do target
   */
  const createEdge = useCallback(async (fromReqId: string, toReqId: string) => {
    const sourceReq = reqMap.get(fromReqId)
    const targetReq = reqMap.get(toReqId)

    if (!sourceReq || !targetReq) {
      toast.error('Requisito não encontrado para criar conexão')
      return
    }

    // Verifica se a conexão já existe
    const sourceProvides = sourceReq.providesFor || []
    const targetDepends = targetReq.dependsOn || []

    if (sourceProvides.includes(toReqId) || targetDepends.includes(fromReqId)) {
      toast.error('Conexão já existe')
      return
    }

    try {
      // Endpoint atômico: sincroniza providesFor/dependsOn dos dois lados numa transação
      await createConnection.mutateAsync({
        projectId: sourceReq.projectId,
        fromReqId,
        toReqId,
      })
      toast.success(`Conexão criada: ${fromReqId} → ${toReqId}`)
    } catch (error) {
      // O toast de erro (incl. 403 de permissão) já é exibido pelo hook useCreateConnection
      console.error('Erro ao criar conexão:', error)
    }
  }, [reqMap, createConnection])

  /**
   * Remove uma aresta visual e sincroniza com o banco:
   * - Remove toReqId do providesFor do source
   * - Remove fromReqId do dependsOn do target
   */
  const deleteEdge = useCallback(async (fromReqId: string, toReqId: string) => {
    const sourceReq = reqMap.get(fromReqId)
    const targetReq = reqMap.get(toReqId)

    if (!sourceReq || !targetReq) {
      toast.error('Requisito não encontrado para remover conexão')
      return
    }

    try {
      // Endpoint atômico: remove providesFor/dependsOn dos dois lados numa transação
      await deleteConnection.mutateAsync({
        projectId: sourceReq.projectId,
        fromReqId,
        toReqId,
      })
      toast.success(`Conexão removida: ${fromReqId} → ${toReqId}`)
    } catch (error) {
      // O toast de erro (incl. 403 de permissão) já é exibido pelo hook useDeleteConnection
      console.error('Erro ao remover conexão:', error)
    }
  }, [reqMap, deleteConnection])

  return { nodes, edges, colorPalette, createEdge, deleteEdge }
}
