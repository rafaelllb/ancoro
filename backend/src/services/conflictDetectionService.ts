/**
 * Conflict Detection Service
 *
 * Serviço responsável por detectar conflitos semânticos entre requisitos (Ancora Method v2).
 * Detecta:
 * - WHO sobrepostos: dois requisitos com mesmo executor e processos potencialmente conflitantes
 * - WHERE incompatíveis: dois requisitos apontando para mesmo sistema com lógicas diferentes
 * - HOW MUCH contraditórios: volumetrias incompatíveis na mesma integração
 *
 * @author Rafael Brito
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tipos de conflito detectáveis
export type ConflictType = 'WHO_OVERLAP' | 'WHERE_INCOMPATIBLE' | 'HOWMUCH_CONTRADICTORY';

export interface SemanticConflict {
  type: ConflictType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  req1Id: string;
  req1ReqId: string;
  req2Id: string;
  req2ReqId: string;
  field: string;
  value1: string;
  value2: string;
  description: string;
  suggestedAction: string;
}

export interface ConflictDetectionResult {
  projectId: string;
  timestamp: Date;
  totalConflicts: number;
  conflictsByType: Record<ConflictType, number>;
  conflictsBySeverity: Record<string, number>;
  conflicts: SemanticConflict[];
}

/**
 * Normaliza texto para comparação (lowercase, remove acentos, espaços extras)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai palavras-chave relevantes de um texto
 * Remove stopwords comuns em português
 */
function extractKeywords(text: string): Set<string> {
  const stopwords = new Set([
    'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos',
    'em', 'na', 'no', 'nas', 'nos', 'para', 'por', 'com', 'sem', 'que', 'se', 'e',
    'ou', 'mas', 'ao', 'aos', 'pela', 'pelo', 'pelas', 'pelos', 'entre', 'sobre',
    'quando', 'onde', 'como', 'ser', 'estar', 'ter', 'haver', 'fazer', 'ir', 'vir',
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  ]);

  const normalized = normalizeText(text);
  const words = normalized.split(' ').filter(w => w.length > 2 && !stopwords.has(w));
  return new Set(words);
}

/**
 * Calcula similaridade entre dois conjuntos de palavras (Jaccard)
 */
function calculateSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 || set2.size === 0) return 0;

  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}

/**
 * Extrai sistemas mencionados no campo WHERE
 * Padrão suportado: "Sistema A > Sistema B > Sistema C" ou texto livre
 */
function extractSystems(where: string): string[] {
  // Tenta extrair padrão de fluxo: A > B > C
  if (where.includes('>')) {
    return where.split('>').map(s => normalizeText(s.replace(/[()]/g, '')));
  }

  // Tenta extrair padrão com seta: A → B → C
  if (where.includes('→')) {
    return where.split('→').map(s => normalizeText(s.replace(/[()]/g, '')));
  }

  // Fallback: retorna texto normalizado como sistema único
  return [normalizeText(where)];
}

/**
 * Extrai números do campo HOW MUCH
 */
function extractNumbers(howMuch: string): number[] {
  const matches = howMuch.match(/\d+[\d.,]*/g);
  if (!matches) return [];

  return matches.map(m => parseFloat(m.replace(',', '.'))).filter(n => !isNaN(n));
}

/**
 * Detecta conflitos de WHO (executores sobrepostos)
 *
 * Critérios:
 * - Mesmo WHO (normalizado)
 * - Processos (howToday) similares (>40% Jaccard)
 * - Status diferente ou módulos diferentes
 */
async function detectWhoOverlaps(projectId: string): Promise<SemanticConflict[]> {
  const requirements = await prisma.requirement.findMany({
    where: { projectId },
    select: {
      id: true,
      reqId: true,
      who: true,
      howToday: true,
      what: true,
      module: true,
      status: true,
    },
  });

  const conflicts: SemanticConflict[] = [];

  // Agrupa por WHO normalizado
  const whoGroups = new Map<string, typeof requirements>();

  for (const req of requirements) {
    const normalizedWho = normalizeText(req.who);
    const group = whoGroups.get(normalizedWho) || [];
    group.push(req);
    whoGroups.set(normalizedWho, group);
  }

  // Analisa cada grupo com mais de 1 requisito
  for (const [who, group] of whoGroups) {
    if (group.length < 2) continue;

    // Compara pares dentro do grupo
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const req1 = group[i];
        const req2 = group[j];

        // Extrai keywords dos processos
        const keywords1 = extractKeywords(req1.howToday + ' ' + req1.what);
        const keywords2 = extractKeywords(req2.howToday + ' ' + req2.what);

        const similarity = calculateSimilarity(keywords1, keywords2);

        // Se processos são muito similares (>40%), pode haver sobreposição
        if (similarity > 0.4) {
          // Determina severidade
          let severity: SemanticConflict['severity'] = 'LOW';
          if (similarity > 0.7) severity = 'HIGH';
          else if (similarity > 0.55) severity = 'MEDIUM';

          // Só considera conflito se módulos diferentes ou status conflitante
          const sameModule = req1.module === req2.module;
          const hasConflictStatus = req1.status === 'CONFLICT' || req2.status === 'CONFLICT';

          if (!sameModule || hasConflictStatus || similarity > 0.6) {
            conflicts.push({
              type: 'WHO_OVERLAP',
              severity,
              req1Id: req1.id,
              req1ReqId: req1.reqId,
              req2Id: req2.id,
              req2ReqId: req2.reqId,
              field: 'who',
              value1: req1.who,
              value2: req2.who,
              description: `Executor "${who}" aparece em ambos requisitos com processos ${Math.round(similarity * 100)}% similares. Módulos: ${req1.module} vs ${req2.module}.`,
              suggestedAction: sameModule
                ? 'Verificar se os requisitos devem ser consolidados ou se há divisão clara de responsabilidade.'
                : 'Validar com stakeholder se o mesmo executor pode atender ambos os módulos sem conflito de agenda.',
            });
          }
        }
      }
    }
  }

  return conflicts;
}

/**
 * Detecta conflitos de WHERE (sistemas incompatíveis)
 *
 * Critérios:
 * - Mesmo sistema destino
 * - Processos (what + howToday) diferentes
 * - Potencial conflito de lógica
 */
async function detectWhereIncompatibilities(projectId: string): Promise<SemanticConflict[]> {
  const requirements = await prisma.requirement.findMany({
    where: { projectId },
    select: {
      id: true,
      reqId: true,
      where: true,
      what: true,
      howToday: true,
      module: true,
    },
  });

  const conflicts: SemanticConflict[] = [];

  // Agrupa por sistema destino (último sistema no fluxo)
  const destinationGroups = new Map<string, typeof requirements>();

  for (const req of requirements) {
    const systems = extractSystems(req.where);
    const destination = systems[systems.length - 1]; // Último sistema é o destino

    const group = destinationGroups.get(destination) || [];
    group.push(req);
    destinationGroups.set(destination, group);
  }

  // Analisa cada grupo com mais de 1 requisito
  for (const [destination, group] of destinationGroups) {
    if (group.length < 2) continue;

    // Compara pares dentro do grupo
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const req1 = group[i];
        const req2 = group[j];

        // Se são de módulos diferentes apontando para mesmo destino
        if (req1.module !== req2.module) {
          // Verifica se os WHATs são conflitantes (baixa similaridade = operações diferentes)
          const whatKeywords1 = extractKeywords(req1.what);
          const whatKeywords2 = extractKeywords(req2.what);
          const whatSimilarity = calculateSimilarity(whatKeywords1, whatKeywords2);

          // Se WHATs são diferentes mas destino é o mesmo, pode haver conflito
          if (whatSimilarity < 0.3) {
            conflicts.push({
              type: 'WHERE_INCOMPATIBLE',
              severity: 'MEDIUM',
              req1Id: req1.id,
              req1ReqId: req1.reqId,
              req2Id: req2.id,
              req2ReqId: req2.reqId,
              field: 'where',
              value1: req1.where,
              value2: req2.where,
              description: `Ambos requisitos apontam para "${destination}" mas têm operações diferentes (${Math.round((1 - whatSimilarity) * 100)}% divergência). Módulos: ${req1.module} vs ${req2.module}.`,
              suggestedAction: 'Validar ordem de execução e possíveis conflitos de dados. Considerar criar dependência explícita entre os requisitos.',
            });
          }
        }

        // Se são do mesmo módulo com WHEREs similares mas processos muito diferentes
        if (req1.module === req2.module) {
          const processKeywords1 = extractKeywords(req1.howToday);
          const processKeywords2 = extractKeywords(req2.howToday);
          const processSimilarity = calculateSimilarity(processKeywords1, processKeywords2);

          // Processos muito diferentes no mesmo módulo/destino = potencial conflito
          if (processSimilarity < 0.2 && processSimilarity > 0) {
            conflicts.push({
              type: 'WHERE_INCOMPATIBLE',
              severity: 'LOW',
              req1Id: req1.id,
              req1ReqId: req1.reqId,
              req2Id: req2.id,
              req2ReqId: req2.reqId,
              field: 'where',
              value1: req1.where,
              value2: req2.where,
              description: `Mesmo módulo (${req1.module}) e destino "${destination}" mas processos muito diferentes. Verificar se não há duplicação ou conflito.`,
              suggestedAction: 'Revisar se ambos requisitos são necessários ou se podem ser consolidados.',
            });
          }
        }
      }
    }
  }

  return conflicts;
}

/**
 * Detecta conflitos de HOW MUCH (volumetrias contraditórias)
 *
 * Critérios:
 * - Requisitos relacionados (via dependsOn/providesFor ou mesmo módulo)
 * - Números de volumetria incompatíveis (ex: um diz 1000/dia, outro diz 100/dia)
 */
async function detectHowMuchContradictions(projectId: string): Promise<SemanticConflict[]> {
  const requirements = await prisma.requirement.findMany({
    where: { projectId },
    select: {
      id: true,
      reqId: true,
      howMuch: true,
      what: true,
      module: true,
      dependsOn: true,
      providesFor: true,
    },
  });

  const conflicts: SemanticConflict[] = [];

  // Cria mapa de reqId para requisito
  const reqMap = new Map(requirements.map(r => [r.reqId, r]));

  // Analisa requisitos relacionados via dependências
  for (const req of requirements) {
    const dependsOn = JSON.parse(req.dependsOn || '[]') as string[];
    const providesFor = JSON.parse(req.providesFor || '[]') as string[];
    const relatedReqIds = [...dependsOn, ...providesFor];

    for (const relatedReqId of relatedReqIds) {
      const relatedReq = reqMap.get(relatedReqId);
      if (!relatedReq) continue;

      // Extrai números de ambos
      const numbers1 = extractNumbers(req.howMuch);
      const numbers2 = extractNumbers(relatedReq.howMuch);

      if (numbers1.length === 0 || numbers2.length === 0) continue;

      // Compara os maiores números (geralmente volume principal)
      const max1 = Math.max(...numbers1);
      const max2 = Math.max(...numbers2);

      // Se diferença é maior que 10x, pode haver inconsistência
      const ratio = max1 / max2;
      if (ratio > 10 || ratio < 0.1) {
        const bigger = ratio > 1 ? req : relatedReq;
        const smaller = ratio > 1 ? relatedReq : req;

        conflicts.push({
          type: 'HOWMUCH_CONTRADICTORY',
          severity: ratio > 100 || ratio < 0.01 ? 'HIGH' : 'MEDIUM',
          req1Id: bigger.id,
          req1ReqId: bigger.reqId,
          req2Id: smaller.id,
          req2ReqId: smaller.reqId,
          field: 'howMuch',
          value1: bigger.howMuch,
          value2: smaller.howMuch,
          description: `Volumetrias incompatíveis entre requisitos dependentes: ${bigger.reqId} menciona ~${Math.max(...extractNumbers(bigger.howMuch))} enquanto ${smaller.reqId} menciona ~${Math.max(...extractNumbers(smaller.howMuch))} (razão ${Math.round(Math.max(ratio, 1/ratio))}x).`,
          suggestedAction: 'Validar volumetrias com stakeholders. Se corretas, documentar justificativa da diferença (ex: agregação, filtragem).',
        });
      }
    }
  }

  return conflicts;
}

/**
 * Executa detecção completa de conflitos semânticos
 */
export async function detectAllConflicts(projectId: string): Promise<ConflictDetectionResult> {
  const [whoConflicts, whereConflicts, howMuchConflicts] = await Promise.all([
    detectWhoOverlaps(projectId),
    detectWhereIncompatibilities(projectId),
    detectHowMuchContradictions(projectId),
  ]);

  const allConflicts = [...whoConflicts, ...whereConflicts, ...howMuchConflicts];

  // Remove duplicatas (mesmo par de requisitos)
  const uniqueConflicts = allConflicts.filter((conflict, index, self) => {
    return index === self.findIndex(c =>
      (c.req1Id === conflict.req1Id && c.req2Id === conflict.req2Id) ||
      (c.req1Id === conflict.req2Id && c.req2Id === conflict.req1Id)
    );
  });

  // Agrupa por tipo
  const conflictsByType: Record<ConflictType, number> = {
    WHO_OVERLAP: whoConflicts.length,
    WHERE_INCOMPATIBLE: whereConflicts.length,
    HOWMUCH_CONTRADICTORY: howMuchConflicts.length,
  };

  // Agrupa por severidade
  const conflictsBySeverity = uniqueConflicts.reduce((acc, c) => {
    acc[c.severity] = (acc[c.severity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    projectId,
    timestamp: new Date(),
    totalConflicts: uniqueConflicts.length,
    conflictsByType,
    conflictsBySeverity,
    conflicts: uniqueConflicts,
  };
}

/**
 * Detecta apenas conflitos de um tipo específico
 */
export async function detectConflictsByType(
  projectId: string,
  type: ConflictType
): Promise<SemanticConflict[]> {
  switch (type) {
    case 'WHO_OVERLAP':
      return detectWhoOverlaps(projectId);
    case 'WHERE_INCOMPATIBLE':
      return detectWhereIncompatibilities(projectId);
    case 'HOWMUCH_CONTRADICTORY':
      return detectHowMuchContradictions(projectId);
    default:
      throw new Error(`Tipo de conflito desconhecido: ${type}`);
  }
}

/**
 * Verifica se dois requisitos específicos têm conflito
 */
export async function checkConflictBetweenRequirements(
  req1Id: string,
  req2Id: string
): Promise<SemanticConflict | null> {
  const [req1, req2] = await Promise.all([
    prisma.requirement.findUnique({
      where: { id: req1Id },
      select: {
        id: true,
        reqId: true,
        projectId: true,
        who: true,
        where: true,
        what: true,
        howToday: true,
        howMuch: true,
        module: true,
        dependsOn: true,
        providesFor: true,
      },
    }),
    prisma.requirement.findUnique({
      where: { id: req2Id },
      select: {
        id: true,
        reqId: true,
        projectId: true,
        who: true,
        where: true,
        what: true,
        howToday: true,
        howMuch: true,
        module: true,
        dependsOn: true,
        providesFor: true,
      },
    }),
  ]);

  if (!req1 || !req2) {
    throw new Error('Requisito não encontrado');
  }

  if (req1.projectId !== req2.projectId) {
    throw new Error('Requisitos devem ser do mesmo projeto');
  }

  // Verifica WHO overlap
  const normalizedWho1 = normalizeText(req1.who);
  const normalizedWho2 = normalizeText(req2.who);

  if (normalizedWho1 === normalizedWho2) {
    const keywords1 = extractKeywords(req1.howToday + ' ' + req1.what);
    const keywords2 = extractKeywords(req2.howToday + ' ' + req2.what);
    const similarity = calculateSimilarity(keywords1, keywords2);

    if (similarity > 0.4) {
      return {
        type: 'WHO_OVERLAP',
        severity: similarity > 0.7 ? 'HIGH' : similarity > 0.55 ? 'MEDIUM' : 'LOW',
        req1Id: req1.id,
        req1ReqId: req1.reqId,
        req2Id: req2.id,
        req2ReqId: req2.reqId,
        field: 'who',
        value1: req1.who,
        value2: req2.who,
        description: `Mesmo executor com processos ${Math.round(similarity * 100)}% similares.`,
        suggestedAction: 'Verificar sobreposição de responsabilidade.',
      };
    }
  }

  // Verifica WHERE incompatibility
  const systems1 = extractSystems(req1.where);
  const systems2 = extractSystems(req2.where);
  const dest1 = systems1[systems1.length - 1];
  const dest2 = systems2[systems2.length - 1];

  if (dest1 === dest2 && req1.module !== req2.module) {
    return {
      type: 'WHERE_INCOMPATIBLE',
      severity: 'MEDIUM',
      req1Id: req1.id,
      req1ReqId: req1.reqId,
      req2Id: req2.id,
      req2ReqId: req2.reqId,
      field: 'where',
      value1: req1.where,
      value2: req2.where,
      description: `Mesmo destino "${dest1}" de módulos diferentes.`,
      suggestedAction: 'Validar ordem de execução e conflitos de dados.',
    };
  }

  return null;
}
