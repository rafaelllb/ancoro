/**
 * Persistência de layout do grafo: debounce, API e migração localStorage → backend.
 *
 * Fluxo de carregamento:
 * 1. GET /api/projects/:projectId/graph-layout (primário, chave = dbId)
 * 2. Se vazio, fallback para localStorage (chave = reqId) com migração automática
 * 3. Após migração, deleta localStorage e salva via API
 *
 * @author Rafael Brito
 */

import api from '../../services/api'
import { GraphNode } from '../../hooks/useGraphData'

function writePositionsToLocalStorage(
  projectId: string,
  positions: Record<string, { x: number; y: number }>,
): void {
  try {
    localStorage.setItem(
      `ancoro_dependency_graph_positions_${projectId}`,
      JSON.stringify(positions),
    )
  } catch {
    // localStorage cheio ou indisponivel — silencia
  }
}

// ===== DEBOUNCE =====

export interface DebouncedPersist {
  /** Agenda persistência com debounce (reseta timer anterior) */
  trigger: () => void
  /** Cancela timer pendente sem executar */
  cancel: () => void
  /** Executa imediatamente se houver timer pendente (cleanup de unmount) */
  flush: () => void
}

/**
 * Cria wrapper de debounce para função de persistência.
 * 300ms padrão — evita gravações excessivas durante drag contínuo.
 */
export function createDebouncedPersist(
  persistFn: () => void,
  delay: number = 300,
): DebouncedPersist {
  let timerId: ReturnType<typeof setTimeout> | null = null
  return {
    trigger() {
      if (timerId !== null) clearTimeout(timerId)
      timerId = setTimeout(() => {
        timerId = null
        persistFn()
      }, delay)
    },
    cancel() {
      if (timerId !== null) {
        clearTimeout(timerId)
        timerId = null
      }
    },
    flush() {
      if (timerId !== null) {
        clearTimeout(timerId)
        timerId = null
        persistFn()
      }
    },
  }
}

// ===== API =====

export async function loadPositionsFromAPI(
  projectId: string,
): Promise<Record<string, { x: number; y: number }>> {
  try {
    const { data } = await api.get<{ positions: Record<string, { x: number; y: number }> }>(
      `/api/projects/${projectId}/graph-layout`,
    )
    const positions = data.positions || {}
    if (Object.keys(positions).length > 0) {
      writePositionsToLocalStorage(projectId, positions)
    }
    return positions
  } catch (error) {
    console.error('Erro ao carregar layout do grafo da API:', error)
    return {}
  }
}

export async function persistNodePositionsAPI(
  projectId: string,
  positions: Record<string, { x: number; y: number }>,
): Promise<void> {
  // Mantem cache local sempre atualizado para sobreviver a refresh/reload
  writePositionsToLocalStorage(projectId, positions)

  try {
    await api.put(`/api/projects/${projectId}/graph-layout`, { positions })
  } catch (error) {
    console.error('Erro ao salvar layout do grafo na API:', error)
  }
}

// ===== LOCALSTORAGE (legacy, para migração) =====

export function loadPositionsFromLocal(
  storageKey: string,
): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, { x: number; y: number }>
    const validated: Record<string, { x: number; y: number }> = {}
    Object.entries(parsed).forEach(([id, pos]) => {
      if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        validated[id] = { x: pos.x, y: pos.y }
      }
    })
    return validated
  } catch {
    return {}
  }
}

// ===== MIGRAÇÃO reqId → dbId =====

/**
 * Converte chaves de posição de reqId (human-readable) para dbId (CUID).
 * Chaves que já parecem CUID (length > 20) são mantidas.
 * Chaves órfãs (sem correspondência) são descartadas.
 */
export function migratePositionKeys(
  localPositions: Record<string, { x: number; y: number }>,
  reqIdToDbId: Map<string, string>,
): Record<string, { x: number; y: number }> {
  const migrated: Record<string, { x: number; y: number }> = {}
  for (const [key, pos] of Object.entries(localPositions)) {
    const dbId = reqIdToDbId.get(key)
    if (dbId) {
      migrated[dbId] = pos
    } else if (key.length > 20) {
      // Já é CUID — mantém
      migrated[key] = pos
    }
    // Chaves não mapeadas são descartadas silenciosamente
  }
  return migrated
}

/**
 * Constrói mapa de posições a partir dos nós atuais, usando dbId como chave.
 * Inclui posições de savedPositions para nós que não estão mais visíveis.
 */
export function buildPositionsMap(
  nodes: GraphNode[],
  savedPositions: Map<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {}

  // Posições salvas previamente (podem incluir nós de outros filtros)
  savedPositions.forEach((pos, dbId) => {
    positions[dbId] = pos
  })

  // Sobrescreve com posições atuais dos nós (podem ter sido movidos)
  nodes.forEach(node => {
    positions[node.dbId] = { x: node.x, y: node.y }
  })

  return positions
}
