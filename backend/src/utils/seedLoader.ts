import { z } from 'zod'
import path from 'path'
import fs from 'fs/promises'
import config from '../config'

// ============================================================================
// SCHEMAS ZOD - Validação dos JSONs de seed
// ============================================================================

const MetadataSchema = z.object({
  version: z.string(),
  name: z.string(),
  description: z.string(),
  defaultPassword: z.string().min(4),
  created: z.string(),
  updated: z.string(),
})

const UserSchema = z.object({
  key: z.string(),
  name: z.string(),
  email: z.string().email(),
  role: z.enum(['CONSULTANT', 'CLIENT', 'MANAGER', 'ADMIN']),
})

const UsersFileSchema = z.object({
  users: z.array(UserSchema),
})

const ProjectSchema = z.object({
  key: z.string(),
  name: z.string(),
  client: z.string(),
  startDate: z.string(),
  status: z.enum(['DISCOVERY', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD']),
})

const ProjectUserSchema = z.object({
  projectKey: z.string(),
  userKey: z.string(),
  module: z.string().nullable(),
})

const ProjectsFileSchema = z.object({
  projects: z.array(ProjectSchema),
  projectUsers: z.array(ProjectUserSchema),
})

const RequirementSchema = z.object({
  key: z.string(),
  reqId: z.string(),
  projectKey: z.string(),
  shortDesc: z.string(),
  module: z.string(),
  what: z.string(),
  why: z.string(),
  who: z.string(),
  when: z.string(),
  where: z.string(),
  howToday: z.string(),
  howMuch: z.string(),
  dependsOn: z.array(z.string()),
  providesFor: z.array(z.string()),
  consultantKey: z.string(),
  consultantNotes: z.string().nullable(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'VALIDATED', 'CONFLICT']),
  observations: z.string().nullable(),
})

const RequirementsFileSchema = z.object({
  requirements: z.array(RequirementSchema),
})

const CrossMatrixEntrySchema = z.object({
  projectKey: z.string(),
  fromReqKey: z.string(),
  toReqKey: z.string(),
  fromModule: z.string(),
  toModule: z.string(),
  dataFlow: z.string(),
  dataFlowBack: z.string().nullable(),
  integrationType: z.enum(['BAPI', 'BATCH', 'API', 'IDOC', 'RFC', 'OTHER']),
  trigger: z.string(),
  timing: z.enum(['SYNC', 'ASYNC', 'BATCH']),
  ownerKey: z.string(),
  status: z.enum(['OK', 'PENDING', 'CONFLICT']),
  manualNotes: z.string().nullable(),
})

const CrossMatrixFileSchema = z.object({
  entries: z.array(CrossMatrixEntrySchema),
})

const CommentSchema = z.object({
  requirementKey: z.string(),
  userKey: z.string(),
  content: z.string(),
  type: z.enum(['QUESTION', 'ANSWER', 'CONFLICT', 'OBSERVATION']),
})

const CommentsFileSchema = z.object({
  comments: z.array(CommentSchema),
})

const SprintSchema = z.object({
  projectKey: z.string(),
  sprintNumber: z.number().int().positive(),
  startDate: z.string(),
  endDate: z.string(),
  goals: z.string(),
  retrospective: z.string().nullable(),
})

const SprintsFileSchema = z.object({
  sprints: z.array(SprintSchema),
})

// ============================================================================
// TIPOS EXPORTADOS
// ============================================================================

export type Metadata = z.infer<typeof MetadataSchema>
export type User = z.infer<typeof UserSchema>
export type Project = z.infer<typeof ProjectSchema>
export type ProjectUser = z.infer<typeof ProjectUserSchema>
export type Requirement = z.infer<typeof RequirementSchema>
export type CrossMatrixEntry = z.infer<typeof CrossMatrixEntrySchema>
export type Comment = z.infer<typeof CommentSchema>
export type Sprint = z.infer<typeof SprintSchema>

export interface SeedDataset {
  metadata: Metadata
  users: User[]
  projects: Project[]
  projectUsers: ProjectUser[]
  requirements: Requirement[]
  crossMatrix: CrossMatrixEntry[]
  comments: Comment[]
  sprints: Sprint[]
}

// ============================================================================
// FUNÇÕES DE CARREGAMENTO
// ============================================================================

/**
 * Carrega e valida um arquivo JSON usando schema Zod.
 * Falha rápido se o arquivo não existir ou dados forem inválidos.
 */
async function loadAndValidate<T>(filePath: string, schema: z.ZodSchema<T>): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8')
  const data = JSON.parse(content)

  const result = schema.safeParse(data)
  if (!result.success) {
    const errors = result.error.format()
    throw new Error(
      `Validação falhou para ${path.basename(filePath)}:\n` +
      JSON.stringify(errors, null, 2)
    )
  }

  return result.data
}

/**
 * Carrega um dataset de seed completo a partir do diretório especificado.
 *
 * @param datasetName Nome do dataset (corresponde ao subdiretório em data/seeds/)
 * @returns SeedDataset completo com todos os dados validados
 * @throws Error se estiver em produção ou dados inválidos
 *
 * Exemplo de uso:
 *   const dataset = await loadSeedDataset('demo')
 *   // dataset.users, dataset.projects, etc.
 */
export async function loadSeedDataset(datasetName: string): Promise<SeedDataset> {
  // Guard: NUNCA carregar seeds em produção
  if (config.isProduction) {
    throw new Error(
      'CRÍTICO: Carregamento de seed data está DESABILITADO em produção.\n' +
      'Seeds devem ser usados apenas em ambientes de desenvolvimento/demo.'
    )
  }

  // Resolve caminho relativo a este arquivo (src/utils/) → ../../data/seeds/
  const basePath = path.resolve(__dirname, '../../data/seeds', datasetName)

  // Verifica se diretório existe
  try {
    await fs.access(basePath)
  } catch {
    throw new Error(
      `Dataset '${datasetName}' não encontrado em: ${basePath}\n` +
      `Verifique se o diretório data/seeds/${datasetName}/ existe.`
    )
  }

  console.log(`[SeedLoader] Carregando dataset: ${datasetName}`)

  // Carrega todos os arquivos em paralelo para performance
  const [metadata, usersFile, projectsFile, requirementsFile, crossMatrixFile, commentsFile, sprintsFile] =
    await Promise.all([
      loadAndValidate(path.join(basePath, 'metadata.json'), MetadataSchema),
      loadAndValidate(path.join(basePath, 'users.json'), UsersFileSchema),
      loadAndValidate(path.join(basePath, 'projects.json'), ProjectsFileSchema),
      loadAndValidate(path.join(basePath, 'requirements.json'), RequirementsFileSchema),
      loadAndValidate(path.join(basePath, 'crossMatrix.json'), CrossMatrixFileSchema),
      loadAndValidate(path.join(basePath, 'comments.json'), CommentsFileSchema),
      loadAndValidate(path.join(basePath, 'sprints.json'), SprintsFileSchema),
    ])

  console.log(`[SeedLoader] Dataset '${datasetName}' carregado com sucesso`)
  console.log(`  - Usuários: ${usersFile.users.length}`)
  console.log(`  - Projetos: ${projectsFile.projects.length}`)
  console.log(`  - Requisitos: ${requirementsFile.requirements.length}`)
  console.log(`  - CrossMatrix: ${crossMatrixFile.entries.length}`)
  console.log(`  - Comentários: ${commentsFile.comments.length}`)
  console.log(`  - Sprints: ${sprintsFile.sprints.length}`)

  return {
    metadata,
    users: usersFile.users,
    projects: projectsFile.projects,
    projectUsers: projectsFile.projectUsers,
    requirements: requirementsFile.requirements,
    crossMatrix: crossMatrixFile.entries,
    comments: commentsFile.comments,
    sprints: sprintsFile.sprints,
  }
}

/**
 * Lista datasets disponíveis no diretório de seeds.
 * Útil para ferramentas administrativas ou CLI.
 */
export async function listAvailableDatasets(): Promise<string[]> {
  const seedsPath = path.resolve(__dirname, '../../data/seeds')

  try {
    const entries = await fs.readdir(seedsPath, { withFileTypes: true })
    return entries
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
  } catch {
    return []
  }
}
