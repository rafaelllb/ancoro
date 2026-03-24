import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'
import { loadSeedDataset, SeedDataset } from './seedLoader'
import { generateDefaultListItemsData } from './defaultLists'

/**
 * Guard de segurança: impede seed em produção
 * Verifica NODE_ENV antes de qualquer operação destrutiva
 */
export function assertCanSeed(): void {
  const env = process.env.NODE_ENV || 'development'

  if (env === 'production') {
    throw new Error(
      'CRÍTICO: Tentativa de seed em ambiente de PRODUÇÃO bloqueada!\n' +
      'O seed apaga todos os dados existentes e não deve ser executado em produção.\n' +
      'Se você realmente precisa popular dados em produção, use migrations ou scripts específicos.'
    )
  }

  if (env === 'staging') {
    throw new Error(
      'BLOQUEADO: Seed não permitido em ambiente de STAGING.\n' +
      'Use dados de teste específicos ou migrations para staging.'
    )
  }

  console.log(`✓ Ambiente permitido para seed: ${env}`)
}

/**
 * Limpa todas as tabelas do banco
 * Ordem importa devido a foreign keys
 */
async function clearDatabase(prisma: PrismaClient): Promise<void> {
  console.log('Limpando database...')
  await prisma.changeLog.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.crossMatrixEntry.deleteMany()
  await prisma.requirement.deleteMany()
  await prisma.sprint.deleteMany()
  await prisma.projectUser.deleteMany()
  await prisma.projectListItem.deleteMany()
  await prisma.user.deleteMany()
  await prisma.project.deleteMany()
}

/**
 * Aplica um dataset de seed no banco de dados.
 * Resolve referências key → id em runtime.
 *
 * @param prisma Cliente Prisma conectado
 * @param datasetName Nome do dataset (default: 'demo')
 */
export async function seedFromDataset(
  prisma: PrismaClient,
  datasetName: string = 'demo'
): Promise<void> {
  assertCanSeed()

  console.log(`Iniciando seed com dataset: ${datasetName}`)

  // Carrega dataset dos arquivos JSON
  const dataset = await loadSeedDataset(datasetName)

  // Limpa dados existentes
  await clearDatabase(prisma)

  // Mapeamento key → id gerado pelo banco
  // Permite resolver referências entre entidades
  const idMap: Record<string, string> = {}

  // ===== USERS =====
  console.log('Criando usuários...')
  const hashedPassword = await bcrypt.hash(dataset.metadata.defaultPassword, 10)

  for (const user of dataset.users) {
    const created = await prisma.user.create({
      data: {
        name: user.name,
        email: user.email,
        password: hashedPassword,
        role: user.role,
      },
    })
    idMap[user.key] = created.id
  }

  // ===== PROJECTS =====
  console.log('Criando projetos...')

  for (const project of dataset.projects) {
    const created = await prisma.project.create({
      data: {
        name: project.name,
        client: project.client,
        startDate: new Date(project.startDate),
        status: project.status,
      },
    })
    idMap[project.key] = created.id

    // Cria listas default (módulos, status, tipos integração) para o projeto
    const listItems = generateDefaultListItemsData(created.id)
    await prisma.projectListItem.createMany({ data: listItems })
  }
  console.log('  - Listas configuráveis criadas para cada projeto')

  // ===== PROJECT USERS =====
  console.log('Atribuindo usuários aos projetos...')

  for (const pu of dataset.projectUsers) {
    await prisma.projectUser.create({
      data: {
        projectId: idMap[pu.projectKey],
        userId: idMap[pu.userKey],
        module: pu.module,
      },
    })
  }

  // ===== REQUIREMENTS =====
  console.log('Criando requisitos...')

  for (const req of dataset.requirements) {
    const created = await prisma.requirement.create({
      data: {
        reqId: req.reqId,
        projectId: idMap[req.projectKey],
        shortDesc: req.shortDesc,
        module: req.module,
        what: req.what,
        why: req.why,
        who: req.who,
        when: req.when,
        where: req.where,
        howToday: req.howToday,
        howMuch: req.howMuch,
        // dependsOn e providesFor armazenam reqIds (REQ-001, etc.), não keys
        dependsOn: JSON.stringify(req.dependsOn),
        providesFor: JSON.stringify(req.providesFor),
        consultantId: idMap[req.consultantKey],
        consultantNotes: req.consultantNotes,
        status: req.status,
        observations: req.observations,
      },
    })
    idMap[req.key] = created.id
  }

  // ===== CROSS MATRIX ENTRIES =====
  console.log('Criando matriz de cruzamento...')

  for (const entry of dataset.crossMatrix) {
    await prisma.crossMatrixEntry.create({
      data: {
        projectId: idMap[entry.projectKey],
        fromReqId: idMap[entry.fromReqKey],
        toReqId: idMap[entry.toReqKey],
        fromModule: entry.fromModule,
        toModule: entry.toModule,
        dataFlow: entry.dataFlow,
        dataFlowBack: entry.dataFlowBack,
        integrationType: entry.integrationType,
        trigger: entry.trigger,
        timing: entry.timing,
        ownerUserId: idMap[entry.ownerKey],
        status: entry.status,
        manualNotes: entry.manualNotes,
      },
    })
  }

  // ===== COMMENTS =====
  console.log('Criando comentários...')

  for (const comment of dataset.comments) {
    await prisma.comment.create({
      data: {
        requirementId: idMap[comment.requirementKey],
        userId: idMap[comment.userKey],
        content: comment.content,
        type: comment.type,
      },
    })
  }

  // ===== SPRINTS =====
  console.log('Criando sprints...')

  for (const sprint of dataset.sprints) {
    await prisma.sprint.create({
      data: {
        projectId: idMap[sprint.projectKey],
        sprintNumber: sprint.sprintNumber,
        startDate: new Date(sprint.startDate),
        endDate: new Date(sprint.endDate),
        goals: sprint.goals,
        retrospective: sprint.retrospective,
      },
    })
  }

  // ===== RESUMO =====
  console.log('✅ Seed completado com sucesso!')
  console.log('\nResumo:')
  console.log(`  - Usuários: ${dataset.users.length}`)
  console.log(`  - Projetos: ${dataset.projects.length}`)
  console.log(`  - Requisitos: ${dataset.requirements.length}`)
  console.log(`  - Entradas cross-matrix: ${dataset.crossMatrix.length}`)
  console.log(`  - Comentários: ${dataset.comments.length}`)
  console.log(`  - Sprints: ${dataset.sprints.length}`)
  console.log('\nCredenciais de login (todos os usuários):')
  console.log(`  Senha: ${dataset.metadata.defaultPassword}`)
  console.log(`\nExemplo: ${dataset.users[0]?.email} / ${dataset.metadata.defaultPassword}\n`)
}

/**
 * Determina qual dataset usar baseado no ambiente.
 * - demo: dataset completo com distribuidora fictícia
 * - development: apenas usuários base, sem projetos (admin cria manualmente)
 *
 * Staging e production são bloqueados por assertCanSeed(), então não precisam de dataset.
 */
function getDatasetForEnvironment(): string {
  const env = process.env.NODE_ENV || 'development'

  switch (env) {
    case 'demo':
      return 'demo' // Dataset completo com dados fictícios
    case 'development':
      return 'dev' // Apenas usuários, sem projetos
    default:
      // Fallback para demo (assertCanSeed bloqueará staging/production)
      return 'demo'
  }
}

/**
 * Seed usando o dataset apropriado para o ambiente atual.
 * - demo → dataset 'demo' (completo)
 * - development → dataset 'dev' (apenas usuários)
 */
export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  const datasetName = getDatasetForEnvironment()
  console.log(`Ambiente: ${process.env.NODE_ENV || 'development'} → dataset: ${datasetName}`)
  return seedFromDataset(prisma, datasetName)
}

/**
 * Re-exporta loadSeedDataset para uso em rotas (ex: /api/demo/credentials)
 */
export { loadSeedDataset } from './seedLoader'
