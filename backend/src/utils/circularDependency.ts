/**
 * Circular Dependency Detection
 *
 * Algoritmo DFS (Depth-First Search) com backtracking para detectar ciclos
 * em grafos de dependências entre requisitos.
 *
 * @author Rafael Brito
 */

export interface DependencyEdge {
  fromReqId: string;
  toReqId: string;
}

export interface CircularDependency {
  cycle: string[]; // Array de Req IDs formando o ciclo
  affectedReqIds: Set<string>;
}

/**
 * Detecta dependências circulares em um grafo de requisitos
 *
 * Usa DFS com três estados:
 * - WHITE: não visitado
 * - GRAY: visitado mas ainda em processamento (na stack atual)
 * - BLACK: processamento concluído
 *
 * Ciclo detectado quando encontramos um nó GRAY durante DFS
 */
export function detectCircularDependencies(
  edges: DependencyEdge[]
): CircularDependency[] {
  // Construir adjacency list
  const graph = new Map<string, Set<string>>();
  const allNodes = new Set<string>();

  edges.forEach(({ fromReqId, toReqId }) => {
    if (!graph.has(fromReqId)) {
      graph.set(fromReqId, new Set());
    }
    graph.get(fromReqId)!.add(toReqId);
    allNodes.add(fromReqId);
    allNodes.add(toReqId);
  });

  // Estados dos nós
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const state = new Map<string, number>();

  // Inicializar todos como WHITE
  allNodes.forEach((node) => state.set(node, WHITE));

  const cycles: CircularDependency[] = [];
  const visited = new Set<string>();

  // DFS recursiva
  function dfs(node: string, path: string[]): void {
    if (state.get(node) === BLACK) {
      return; // Já processado
    }

    if (state.get(node) === GRAY) {
      // Ciclo detectado!
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart);
      cycle.push(node); // Fechar o ciclo

      // Verificar se esse ciclo já foi detectado (evitar duplicatas)
      const cycleSet = new Set(cycle);
      const isDuplicate = cycles.some((existing) =>
        existing.cycle.length === cycle.length &&
        cycle.every((reqId) => existing.affectedReqIds.has(reqId))
      );

      if (!isDuplicate) {
        cycles.push({
          cycle,
          affectedReqIds: cycleSet,
        });
      }
      return;
    }

    // Marcar como GRAY (em processamento)
    state.set(node, GRAY);
    path.push(node);

    // Visitar vizinhos
    const neighbors = graph.get(node) || new Set();
    neighbors.forEach((neighbor) => {
      dfs(neighbor, [...path]);
    });

    // Marcar como BLACK (processado)
    state.set(node, BLACK);
  }

  // Executar DFS para cada nó não visitado
  allNodes.forEach((node) => {
    if (state.get(node) === WHITE) {
      dfs(node, []);
    }
  });

  return cycles;
}

/**
 * Formata ciclo detectado para mensagem human-readable
 */
export function formatCycle(cycle: string[]): string {
  return cycle.join(' → ');
}

/**
 * Verifica se um requisito específico está envolvido em algum ciclo
 */
export function isReqInCycle(
  reqId: string,
  cycles: CircularDependency[]
): boolean {
  return cycles.some((cycle) => cycle.affectedReqIds.has(reqId));
}

/**
 * Retorna todos os ciclos que afetam um requisito específico
 */
export function getCyclesForReq(
  reqId: string,
  cycles: CircularDependency[]
): CircularDependency[] {
  return cycles.filter((cycle) => cycle.affectedReqIds.has(reqId));
}
