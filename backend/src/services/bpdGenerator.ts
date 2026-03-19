/**
 * BPD Generator Service
 *
 * Gera documentos BPD (Business Process Design) a partir dos requisitos
 * e matriz de cruzamento do projeto.
 *
 * Formatos suportados:
 * - Markdown (.md)
 * - Word (.docx)
 *
 * @author Rafael Brito
 */

import { PrismaClient } from '@prisma/client';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  PageBreak,
} from 'docx';

const prisma = new PrismaClient();

// Tipos internos
interface RequirementForBPD {
  id: string;
  reqId: string;
  module: string;
  shortDesc: string;
  what: string;
  why: string;
  who: string;
  when: string;
  where: string;
  howToday: string;
  howMuch: string;
  dependsOn: string;
  providesFor: string;
  status: string;
  consultantNotes: string | null;
  observations: string | null;
  consultant: {
    name: string;
  };
  comments: {
    type: string;
    content: string;
    user: { name: string };
  }[];
}

interface CrossMatrixForBPD {
  fromReqId: string;
  toReqId: string;
  fromModule: string;
  toModule: string;
  dataFlow: string | null;
  integrationType: string;
  timing: string;
  status: string;
}

interface ProjectForBPD {
  id: string;
  name: string;
  client: string;
  status: string;
  startDate: Date;
}

interface BPDGenerationResult {
  markdown: string;
  docxBuffer?: Buffer;
}

// Mapeamento de status para display
const STATUS_DISPLAY: Record<string, string> = {
  PENDING: '⏳ Pendente',
  IN_PROGRESS: '🚧 Em Progresso',
  VALIDATED: '✅ Validado',
  CONFLICT: '🔴 Conflito',
  REJECTED: '❌ Rejeitado',
  APPROVED: '✔️ Aprovado',
};

const MATRIX_STATUS_DISPLAY: Record<string, string> = {
  OK: '✅ OK',
  PENDING: '⚠️ Pendente',
  CONFLICT: '🔴 Conflito',
  CIRCULAR: '🔄 Circular',
};

// Mapeamento de módulos SAP para nomes completos
const MODULE_NAMES: Record<string, string> = {
  ISU: 'IS-U (Industry Solution Utilities)',
  CRM: 'CRM (Customer Relationship Management)',
  FICA: 'FI-CA (Contract Accounting)',
  DEVICE: 'Device Management',
  SD: 'SD (Sales & Distribution)',
  MM: 'MM (Materials Management)',
  PM: 'PM (Plant Maintenance)',
  OTHER: 'Outros',
};

/**
 * Busca dados do projeto para geração do BPD
 */
async function fetchProjectData(
  projectId: string,
  moduleFilter?: string
): Promise<{
  project: ProjectForBPD;
  requirements: RequirementForBPD[];
  crossMatrix: CrossMatrixForBPD[];
}> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      client: true,
      status: true,
      startDate: true,
    },
  });

  if (!project) {
    throw new Error(`Projeto não encontrado: ${projectId}`);
  }

  // Filtro de requisitos por módulo (se especificado)
  const requirementsWhere: any = { projectId };
  if (moduleFilter) {
    requirementsWhere.module = moduleFilter;
  }

  const requirements = await prisma.requirement.findMany({
    where: requirementsWhere,
    include: {
      consultant: {
        select: { name: true },
      },
      comments: {
        select: {
          type: true,
          content: true,
          user: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: [{ module: 'asc' }, { reqId: 'asc' }],
  });

  // Filtro de matriz por módulo (se especificado)
  const matrixWhere: any = { projectId };
  if (moduleFilter) {
    matrixWhere.OR = [{ fromModule: moduleFilter }, { toModule: moduleFilter }];
  }

  const crossMatrix = await prisma.crossMatrixEntry.findMany({
    where: matrixWhere,
    select: {
      fromReqId: true,
      toReqId: true,
      fromModule: true,
      toModule: true,
      dataFlow: true,
      integrationType: true,
      timing: true,
      status: true,
    },
    orderBy: [{ fromModule: 'asc' }, { fromReqId: 'asc' }],
  });

  return { project, requirements, crossMatrix };
}

/**
 * Gera sumário executivo
 */
function generateSummary(
  project: ProjectForBPD,
  requirements: RequirementForBPD[],
  crossMatrix: CrossMatrixForBPD[],
  moduleFilter?: string
): string {
  const totalReqs = requirements.length;
  const byStatus = requirements.reduce((acc, req) => {
    acc[req.status] = (acc[req.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const byModule = requirements.reduce((acc, req) => {
    acc[req.module] = (acc[req.module] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalIntegrations = crossMatrix.length;
  const pendingIntegrations = crossMatrix.filter((e) => e.status === 'PENDING').length;
  const conflictIntegrations = crossMatrix.filter((e) => e.status === 'CONFLICT' || e.status === 'CIRCULAR').length;

  // Verifica se há requisitos não validados
  const validationRate =
    totalReqs > 0
      ? ((byStatus['VALIDATED'] || 0) + (byStatus['APPROVED'] || 0)) / totalReqs
      : 0;

  let summary = `## Sumário Executivo

**Projeto:** ${project.name}
**Cliente:** ${project.client}
**Status:** ${project.status}
**Data de Início:** ${project.startDate.toLocaleDateString('pt-BR')}
**Data do Documento:** ${new Date().toLocaleDateString('pt-BR')}
${moduleFilter ? `**Módulo Filtrado:** ${MODULE_NAMES[moduleFilter] || moduleFilter}\n` : ''}

### Métricas Gerais

| Métrica | Valor |
|---------|-------|
| Total de Requisitos | ${totalReqs} |
| Taxa de Validação | ${(validationRate * 100).toFixed(1)}% |
| Integrações Mapeadas | ${totalIntegrations} |
| Integrações Pendentes | ${pendingIntegrations} |
| Conflitos/Circulares | ${conflictIntegrations} |

### Requisitos por Status

| Status | Quantidade |
|--------|------------|
${Object.entries(byStatus)
  .map(([status, count]) => `| ${STATUS_DISPLAY[status] || status} | ${count} |`)
  .join('\n')}

### Requisitos por Módulo

| Módulo | Quantidade |
|--------|------------|
${Object.entries(byModule)
  .map(([module, count]) => `| ${MODULE_NAMES[module] || module} | ${count} |`)
  .join('\n')}

`;

  // Warning se taxa de validação é baixa
  if (validationRate < 0.8 && totalReqs > 0) {
    summary += `
> ⚠️ **Atenção:** A taxa de validação está abaixo de 80%. Recomenda-se revisar os requisitos pendentes antes de prosseguir.

`;
  }

  // Warning se há conflitos
  if (conflictIntegrations > 0) {
    summary += `
> 🔴 **Atenção:** Existem ${conflictIntegrations} integrações com conflito ou dependência circular que precisam ser resolvidas.

`;
  }

  return summary;
}

/**
 * Gera seção de requisitos detalhados
 */
function generateRequirementsSection(requirements: RequirementForBPD[]): string {
  if (requirements.length === 0) {
    return '## Requisitos\n\n_Nenhum requisito encontrado._\n\n';
  }

  // Agrupa por módulo
  const byModule = requirements.reduce((acc, req) => {
    if (!acc[req.module]) acc[req.module] = [];
    acc[req.module].push(req);
    return acc;
  }, {} as Record<string, RequirementForBPD[]>);

  let markdown = '## Requisitos Detalhados\n\n';

  for (const [module, reqs] of Object.entries(byModule)) {
    markdown += `### ${MODULE_NAMES[module] || module}\n\n`;

    for (const req of reqs) {
      markdown += `#### ${req.reqId}: ${req.shortDesc}\n\n`;
      markdown += `**Status:** ${STATUS_DISPLAY[req.status] || req.status}  \n`;
      markdown += `**Consultor:** ${req.consultant.name}\n\n`;

      markdown += `| Campo | Descrição |\n`;
      markdown += `|-------|----------|\n`;
      markdown += `| **O QUE (What)** | ${escapeMarkdown(req.what)} |\n`;
      markdown += `| **POR QUE (Why)** | ${escapeMarkdown(req.why)} |\n`;
      markdown += `| **QUEM (Who)** | ${escapeMarkdown(req.who)} |\n`;
      markdown += `| **QUANDO (When)** | ${escapeMarkdown(req.when)} |\n`;
      markdown += `| **ONDE (Where)** | ${escapeMarkdown(req.where)} |\n`;
      markdown += `| **COMO HOJE (How Today)** | ${escapeMarkdown(req.howToday)} |\n`;
      markdown += `| **QUANTO (How Much)** | ${escapeMarkdown(req.howMuch)} |\n`;

      if (req.dependsOn) {
        markdown += `| **Depende De** | ${escapeMarkdown(req.dependsOn)} |\n`;
      }
      if (req.providesFor) {
        markdown += `| **Fornece Para** | ${escapeMarkdown(req.providesFor)} |\n`;
      }

      markdown += '\n';

      // Observações do consultor
      if (req.consultantNotes) {
        markdown += `**Dúvidas do Consultor:**\n> ${req.consultantNotes}\n\n`;
      }

      // Observações gerais
      if (req.observations) {
        markdown += `**Observações:**\n> ${req.observations}\n\n`;
      }

      // Comentários relevantes (apenas CONFLICT e QUESTION para BPD)
      const relevantComments = req.comments.filter(
        (c) => c.type === 'CONFLICT' || c.type === 'QUESTION'
      );
      if (relevantComments.length > 0) {
        markdown += `**Pontos de Atenção:**\n`;
        for (const comment of relevantComments) {
          const icon = comment.type === 'CONFLICT' ? '🔴' : '❓';
          markdown += `- ${icon} ${comment.user.name}: ${comment.content}\n`;
        }
        markdown += '\n';
      }

      markdown += '---\n\n';
    }
  }

  return markdown;
}

/**
 * Gera tabela da matriz de cruzamento
 */
function generateMatrixSection(crossMatrix: CrossMatrixForBPD[]): string {
  if (crossMatrix.length === 0) {
    return '## Matriz de Cruzamento\n\n_Nenhuma integração mapeada._\n\n';
  }

  let markdown = `## Matriz de Cruzamento

Esta seção documenta todas as integrações identificadas entre requisitos e módulos.

| De | Para | Módulo Origem | Módulo Destino | Tipo | Timing | Status |
|----|------|---------------|----------------|------|--------|--------|
`;

  for (const entry of crossMatrix) {
    const status = MATRIX_STATUS_DISPLAY[entry.status] || entry.status;
    markdown += `| ${entry.fromReqId} | ${entry.toReqId} | ${entry.fromModule} | ${entry.toModule} | ${entry.integrationType} | ${entry.timing} | ${status} |\n`;
  }

  markdown += '\n';

  // Sumário por tipo de integração
  const byType = crossMatrix.reduce((acc, e) => {
    acc[e.integrationType] = (acc[e.integrationType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  markdown += `### Integrações por Tipo

| Tipo | Quantidade |
|------|------------|
${Object.entries(byType)
  .map(([type, count]) => `| ${type} | ${count} |`)
  .join('\n')}

`;

  return markdown;
}

/**
 * Gera seção de observações/conclusão
 */
function generateConclusionSection(
  requirements: RequirementForBPD[],
  crossMatrix: CrossMatrixForBPD[]
): string {
  const conflicts = requirements.filter((r) => r.status === 'CONFLICT');
  const circularDeps = crossMatrix.filter((e) => e.status === 'CIRCULAR');
  const pendingReqs = requirements.filter(
    (r) => r.status === 'PENDING' || r.status === 'IN_PROGRESS'
  );

  let markdown = '## Conclusões e Próximos Passos\n\n';

  if (conflicts.length === 0 && circularDeps.length === 0 && pendingReqs.length === 0) {
    markdown += '✅ Todos os requisitos foram validados e não há conflitos identificados.\n\n';
  } else {
    if (conflicts.length > 0) {
      markdown += `### Conflitos a Resolver (${conflicts.length})\n\n`;
      for (const req of conflicts) {
        markdown += `- **${req.reqId}:** ${req.shortDesc}\n`;
      }
      markdown += '\n';
    }

    if (circularDeps.length > 0) {
      markdown += `### Dependências Circulares (${circularDeps.length})\n\n`;
      const cycles = new Set<string>();
      for (const entry of circularDeps) {
        cycles.add(`${entry.fromReqId} ↔ ${entry.toReqId}`);
      }
      for (const cycle of cycles) {
        markdown += `- ${cycle}\n`;
      }
      markdown += '\n';
    }

    if (pendingReqs.length > 0) {
      markdown += `### Requisitos Pendentes de Validação (${pendingReqs.length})\n\n`;
      for (const req of pendingReqs.slice(0, 10)) {
        markdown += `- **${req.reqId}:** ${req.shortDesc} (${req.consultant.name})\n`;
      }
      if (pendingReqs.length > 10) {
        markdown += `- _... e mais ${pendingReqs.length - 10} requisitos_\n`;
      }
      markdown += '\n';
    }
  }

  markdown += `---

_Documento gerado automaticamente pelo Ancoro em ${new Date().toLocaleString('pt-BR')}_
`;

  return markdown;
}

/**
 * Escapa caracteres especiais do Markdown
 */
function escapeMarkdown(text: string): string {
  if (!text) return '';
  return text
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}

/**
 * Gera BPD completo em formato Markdown
 */
export async function generateBPDMarkdown(
  projectId: string,
  moduleFilter?: string
): Promise<string> {
  const { project, requirements, crossMatrix } = await fetchProjectData(
    projectId,
    moduleFilter
  );

  const title = moduleFilter
    ? `# BPD - ${project.name} (${MODULE_NAMES[moduleFilter] || moduleFilter})`
    : `# BPD - ${project.name}`;

  const sections = [
    title + '\n\n',
    generateSummary(project, requirements, crossMatrix, moduleFilter),
    generateRequirementsSection(requirements),
    generateMatrixSection(crossMatrix),
    generateConclusionSection(requirements, crossMatrix),
  ];

  return sections.join('\n');
}

/**
 * Converte Markdown para documento Word (.docx)
 * Usa a biblioteca docx para gerar um documento estruturado
 */
export async function generateBPDDocx(
  projectId: string,
  moduleFilter?: string
): Promise<Buffer> {
  const { project, requirements, crossMatrix } = await fetchProjectData(
    projectId,
    moduleFilter
  );

  // Cria documento Word
  const doc = new Document({
    title: `BPD - ${project.name}`,
    creator: 'Ancoro',
    description: 'Business Process Design Document',
    sections: [
      {
        properties: {},
        children: [
          // Título principal
          new Paragraph({
            text: `BPD - ${project.name}`,
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: moduleFilter
              ? `Módulo: ${MODULE_NAMES[moduleFilter] || moduleFilter}`
              : 'Documento Completo',
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({ text: '' }),

          // Sumário executivo
          new Paragraph({
            text: 'Sumário Executivo',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Projeto: ', bold: true }),
              new TextRun({ text: project.name }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Cliente: ', bold: true }),
              new TextRun({ text: project.client }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Status: ', bold: true }),
              new TextRun({ text: project.status }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Data de Início: ', bold: true }),
              new TextRun({ text: project.startDate.toLocaleDateString('pt-BR') }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Data do Documento: ', bold: true }),
              new TextRun({ text: new Date().toLocaleDateString('pt-BR') }),
            ],
          }),
          new Paragraph({ text: '' }),

          // Métricas gerais
          new Paragraph({
            text: 'Métricas Gerais',
            heading: HeadingLevel.HEADING_2,
          }),
          createMetricsTable(requirements, crossMatrix),
          new Paragraph({ text: '' }),

          // Requisitos
          new Paragraph({
            text: 'Requisitos Detalhados',
            heading: HeadingLevel.HEADING_1,
          }),
          ...createRequirementsParagraphs(requirements),

          // Matriz de Cruzamento
          new Paragraph({
            children: [new PageBreak()],
          }),
          new Paragraph({
            text: 'Matriz de Cruzamento',
            heading: HeadingLevel.HEADING_1,
          }),
          createCrossMatrixTable(crossMatrix),
          new Paragraph({ text: '' }),

          // Rodapé
          new Paragraph({
            text: `Documento gerado automaticamente pelo Ancoro em ${new Date().toLocaleString('pt-BR')}`,
            alignment: AlignmentType.CENTER,
            spacing: { before: 400 },
          }),
        ],
      },
    ],
  });

  // Gera buffer do documento
  const buffer = await Packer.toBuffer(doc);
  return buffer;
}

/**
 * Cria tabela de métricas para o documento Word
 */
function createMetricsTable(
  requirements: RequirementForBPD[],
  crossMatrix: CrossMatrixForBPD[]
): Table {
  const totalReqs = requirements.length;
  const validated = requirements.filter(
    (r) => r.status === 'VALIDATED' || r.status === 'APPROVED'
  ).length;
  const validationRate = totalReqs > 0 ? ((validated / totalReqs) * 100).toFixed(1) : '0';
  const totalIntegrations = crossMatrix.length;
  const pendingIntegrations = crossMatrix.filter((e) => e.status === 'PENDING').length;

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      createTableRow(['Métrica', 'Valor'], true),
      createTableRow(['Total de Requisitos', String(totalReqs)]),
      createTableRow(['Taxa de Validação', `${validationRate}%`]),
      createTableRow(['Integrações Mapeadas', String(totalIntegrations)]),
      createTableRow(['Integrações Pendentes', String(pendingIntegrations)]),
    ],
  });
}

/**
 * Cria parágrafos de requisitos para o documento Word
 */
function createRequirementsParagraphs(requirements: RequirementForBPD[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  // Agrupa por módulo
  const byModule = requirements.reduce((acc, req) => {
    if (!acc[req.module]) acc[req.module] = [];
    acc[req.module].push(req);
    return acc;
  }, {} as Record<string, RequirementForBPD[]>);

  for (const [module, reqs] of Object.entries(byModule)) {
    paragraphs.push(
      new Paragraph({
        text: MODULE_NAMES[module] || module,
        heading: HeadingLevel.HEADING_2,
      })
    );

    for (const req of reqs) {
      paragraphs.push(
        new Paragraph({
          text: `${req.reqId}: ${req.shortDesc}`,
          heading: HeadingLevel.HEADING_3,
        })
      );
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: 'Status: ', bold: true }),
            new TextRun({ text: req.status }),
            new TextRun({ text: '  |  Consultor: ', bold: true }),
            new TextRun({ text: req.consultant.name }),
          ],
        })
      );
      paragraphs.push(new Paragraph({ text: '' }));

      // Campos 5W2H
      const fields = [
        ['O QUE (What)', req.what],
        ['POR QUE (Why)', req.why],
        ['QUEM (Who)', req.who],
        ['QUANDO (When)', req.when],
        ['ONDE (Where)', req.where],
        ['COMO HOJE (How Today)', req.howToday],
        ['QUANTO (How Much)', req.howMuch],
      ];

      for (const [label, value] of fields) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${label}: `, bold: true }),
              new TextRun({ text: value || '-' }),
            ],
          })
        );
      }

      if (req.dependsOn) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Depende De: ', bold: true }),
              new TextRun({ text: req.dependsOn }),
            ],
          })
        );
      }
      if (req.providesFor) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Fornece Para: ', bold: true }),
              new TextRun({ text: req.providesFor }),
            ],
          })
        );
      }

      paragraphs.push(new Paragraph({ text: '' }));
    }
  }

  return paragraphs;
}

/**
 * Cria tabela da matriz de cruzamento para o documento Word
 */
function createCrossMatrixTable(crossMatrix: CrossMatrixForBPD[]): Table {
  const headerRow = createTableRow(
    ['De', 'Para', 'Módulo Origem', 'Módulo Destino', 'Tipo', 'Timing', 'Status'],
    true
  );

  const dataRows = crossMatrix.map((entry) =>
    createTableRow([
      entry.fromReqId,
      entry.toReqId,
      entry.fromModule,
      entry.toModule,
      entry.integrationType,
      entry.timing,
      entry.status,
    ])
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

/**
 * Cria uma linha de tabela
 */
function createTableRow(cells: string[], isHeader: boolean = false): TableRow {
  return new TableRow({
    children: cells.map(
      (text) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text,
                  bold: isHeader,
                }),
              ],
            }),
          ],
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1 },
            bottom: { style: BorderStyle.SINGLE, size: 1 },
            left: { style: BorderStyle.SINGLE, size: 1 },
            right: { style: BorderStyle.SINGLE, size: 1 },
          },
        })
    ),
  });
}

/**
 * Valida se o projeto está pronto para exportação
 * Retorna warnings sobre requisitos não validados ou conflitos
 */
export async function validateExportReadiness(
  projectId: string,
  moduleFilter?: string
): Promise<{
  ready: boolean;
  warnings: string[];
  stats: {
    total: number;
    validated: number;
    conflicts: number;
    pending: number;
  };
}> {
  const { requirements, crossMatrix } = await fetchProjectData(projectId, moduleFilter);

  const total = requirements.length;
  const validated = requirements.filter(
    (r) => r.status === 'VALIDATED' || r.status === 'APPROVED'
  ).length;
  const conflicts = requirements.filter((r) => r.status === 'CONFLICT').length;
  const pending = requirements.filter(
    (r) => r.status === 'PENDING' || r.status === 'IN_PROGRESS'
  ).length;
  const circularDeps = crossMatrix.filter((e) => e.status === 'CIRCULAR').length;

  const warnings: string[] = [];

  if (conflicts > 0) {
    warnings.push(`${conflicts} requisito(s) com conflito`);
  }
  if (circularDeps > 0) {
    warnings.push(`${circularDeps} dependência(s) circular(es)`);
  }
  if (pending > 0) {
    warnings.push(`${pending} requisito(s) pendente(s) de validação`);
  }
  if (total > 0 && validated / total < 0.5) {
    warnings.push(`Menos de 50% dos requisitos estão validados`);
  }

  return {
    ready: warnings.length === 0,
    warnings,
    stats: { total, validated, conflicts, pending },
  };
}
