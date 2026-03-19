import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

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
  await prisma.user.deleteMany()
  await prisma.project.deleteMany()
}

/**
 * Popula o banco com dados de demonstração
 * Cenário: Implementação S/4 HANA Utilities para distribuidora de energia
 *
 * Exportada para uso programático (auto-seed em modo demo)
 */
export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  // Guard: impede execução em produção/staging
  assertCanSeed()

  console.log('Iniciando seed de dados demo...')

  // Limpa dados existentes
  await clearDatabase(prisma)

  // ===== USERS =====
  console.log('Criando usuários...')

  const hashedPassword = await bcrypt.hash('demo123', 10)

  const user1 = await prisma.user.create({
    data: {
      name: 'João Silva',
      email: 'joao.silva@seidor.com',
      password: hashedPassword,
      role: 'CONSULTANT',
    },
  })

  const user2 = await prisma.user.create({
    data: {
      name: 'Maria Santos',
      email: 'maria.santos@seidor.com',
      password: hashedPassword,
      role: 'CONSULTANT',
    },
  })

  const user3 = await prisma.user.create({
    data: {
      name: 'Pedro Oliveira',
      email: 'pedro.oliveira@seidor.com',
      password: hashedPassword,
      role: 'CONSULTANT',
    },
  })

  const manager = await prisma.user.create({
    data: {
      name: 'Rafael Brito',
      email: 'rafael.brito@seidor.com',
      password: hashedPassword,
      role: 'MANAGER',
    },
  })

  const client = await prisma.user.create({
    data: {
      name: 'Ana Costa (Cliente)',
      email: 'ana.costa@cliente.com',
      password: hashedPassword,
      role: 'CLIENT',
    },
  })

  // ===== PROJECT =====
  console.log('Criando projeto...')

  const project = await prisma.project.create({
    data: {
      name: 'Implementação S/4 HANA Utilities - Distribuidora Nordeste',
      client: 'Distribuidora de Energia Nordeste S.A.',
      startDate: new Date('2026-01-01'),
      status: 'DISCOVERY',
    },
  })

  // ===== PROJECT USERS =====
  console.log('Atribuindo usuários ao projeto...')

  await prisma.projectUser.createMany({
    data: [
      { projectId: project.id, userId: user1.id, module: 'ISU' },
      { projectId: project.id, userId: user2.id, module: 'CRM' },
      { projectId: project.id, userId: user3.id, module: 'FICA' },
      { projectId: project.id, userId: manager.id, module: null },
      { projectId: project.id, userId: client.id, module: null },
    ],
  })

  // ===== REQUIREMENTS =====
  console.log('Criando requisitos...')

  const req1 = await prisma.requirement.create({
    data: {
      reqId: 'REQ-001',
      projectId: project.id,
      shortDesc: 'Criar contrato de cliente',
      module: 'CRM',
      what: 'Criar contrato de fornecimento de energia elétrica para novo cliente',
      why: 'Permitir que clientes contratem serviço de fornecimento de energia',
      who: 'Analista de cadastro comercial',
      when: 'Sempre que houver solicitação de novo cliente (média 150/mês)',
      where: 'Sistema legado (SAP ECC) → SAP S/4 HANA',
      howToday: '1. Cliente solicita via call center\n2. Analista valida documentação\n3. Cria BP no CRM\n4. Cria service order\n5. Envia para instalação',
      howMuch: '~150 contratos/mês, pico de 250 em dezembro',
      dependsOn: JSON.stringify([]),
      providesFor: JSON.stringify(['REQ-002', 'REQ-003']),
      consultantId: user2.id,
      consultantNotes: '- Preciso entender fluxo de aprovação de crédito\n- CRM valida BP antes ou ISU faz isso?',
      status: 'VALIDATED',
      observations: 'Processo aprovado em workshop 15/03/2026',
    },
  })

  const req2 = await prisma.requirement.create({
    data: {
      reqId: 'REQ-002',
      projectId: project.id,
      shortDesc: 'Instalar medidor no local',
      module: 'ISU',
      what: 'Instalar medidor de energia no endereço do cliente',
      why: 'Habilitar medição de consumo para faturamento',
      who: 'Técnico de campo',
      when: 'Após aprovação do contrato (3-5 dias)',
      where: 'Sistema legado (planilha Excel) → Device Management ISU',
      howToday: '1. Service order criada pelo CRM\n2. Técnico recebe ordem\n3. Instala medidor\n4. Registra número do medidor manualmente\n5. Ativa no sistema',
      howMuch: '~140 instalações/mês (10% dos contratos não finalizam)',
      dependsOn: JSON.stringify(['REQ-001']),
      providesFor: JSON.stringify(['REQ-003']),
      consultantId: user1.id,
      consultantNotes: '- Como sincronizar master data do medidor com Device Mgmt?\n- Preciso de workflow de aprovação?',
      status: 'IN_PROGRESS',
      observations: null,
    },
  })

  const req3 = await prisma.requirement.create({
    data: {
      reqId: 'REQ-003',
      projectId: project.id,
      shortDesc: 'Executar faturamento mensal',
      module: 'ISU',
      what: 'Processar billing run mensal para gerar faturas',
      why: 'Faturar clientes pelo consumo de energia',
      who: 'Sistema automático (batch job)',
      when: 'Todo dia 1º de cada mês às 2h da manhã',
      where: 'SAP ECC ISU → S/4 HANA Billing',
      howToday: '1. Batch job lê leituras de medidores\n2. Aplica tarifas (rates)\n3. Calcula impostos\n4. Gera documento de faturamento\n5. Envia para FI-CA',
      howMuch: '~15.000 faturas/mês, processamento leva 3h',
      dependsOn: JSON.stringify(['REQ-002']),
      providesFor: JSON.stringify(['REQ-004']),
      consultantId: user1.id,
      consultantNotes: '- Device Mgmt fornece readings via interface ou batch?\n- Preciso validar pricing antes?',
      status: 'CONFLICT',
      observations: 'CONFLITO: Operação disse que batch roda dia 5, diretoria disse dia 1. Resolver!',
    },
  })

  const req4 = await prisma.requirement.create({
    data: {
      reqId: 'REQ-004',
      projectId: project.id,
      shortDesc: 'Gerar documento contábil',
      module: 'FICA',
      what: 'Criar documento contábil no FI-CA a partir do faturamento',
      why: 'Registrar receita contábil e contas a receber',
      who: 'Sistema automático (trigger do billing)',
      when: 'Imediatamente após billing run',
      where: 'FI-CA',
      howToday: '1. Billing envia dados via Z-program\n2. FI-CA cria documento\n3. Atualiza AR (accounts receivable)\n4. Envia para cobrança',
      howMuch: '~15.000 documentos/mês',
      dependsOn: JSON.stringify(['REQ-003']),
      providesFor: JSON.stringify([]),
      consultantId: user3.id,
      consultantNotes: null,
      status: 'PENDING',
      observations: null,
    },
  })

  const req5 = await prisma.requirement.create({
    data: {
      reqId: 'REQ-005',
      projectId: project.id,
      shortDesc: 'Validar crédito do cliente',
      module: 'CRM',
      what: 'Verificar score de crédito antes de aprovar contrato',
      why: 'Reduzir inadimplência',
      who: 'Sistema + Analista de crédito',
      when: 'Durante processo de criação de contrato',
      where: 'Sistema externo (Serasa) → CRM',
      howToday: '1. CRM consulta API Serasa\n2. Recebe score\n3. Se score < 500, requer aprovação manual\n4. Analista aprova/rejeita',
      howMuch: '~150 consultas/mês, 20% requerem aprovação manual',
      dependsOn: JSON.stringify([]),
      providesFor: JSON.stringify(['REQ-001']),
      consultantId: user2.id,
      consultantNotes: '- API Serasa já está contratada?\n- Preciso de fallback se API cair?',
      status: 'PENDING',
      observations: null,
    },
  })

  // ===== CROSS MATRIX ENTRIES =====
  console.log('Criando matriz de cruzamento...')

  await prisma.crossMatrixEntry.createMany({
    data: [
      {
        projectId: project.id,
        fromReqId: req1.id,
        toReqId: req2.id,
        fromModule: 'CRM',
        toModule: 'ISU',
        dataFlow: 'BP number, contract data, service order ID',
        dataFlowBack: 'Installation confirmation',
        integrationType: 'BAPI',
        trigger: 'Service order OK',
        timing: 'SYNC',
        ownerUserId: user1.id,
        status: 'OK',
        manualNotes: 'Integração via BAPI_CONTRACT_CREATE',
      },
      {
        projectId: project.id,
        fromReqId: req2.id,
        toReqId: req3.id,
        fromModule: 'ISU',
        toModule: 'ISU',
        dataFlow: 'Installation object, device number, readings',
        dataFlowBack: null,
        integrationType: 'BATCH',
        trigger: 'Monthly batch',
        timing: 'BATCH',
        ownerUserId: user1.id,
        status: 'PENDING',
        manualNotes: 'Precisa validar estrutura de dados',
      },
      {
        projectId: project.id,
        fromReqId: req3.id,
        toReqId: req4.id,
        fromModule: 'ISU',
        toModule: 'FICA',
        dataFlow: 'Invoice document, amount, customer account',
        dataFlowBack: 'FI document number',
        integrationType: 'BATCH',
        trigger: 'Post billing',
        timing: 'ASYNC',
        ownerUserId: user3.id,
        status: 'OK',
        manualNotes: 'Z-program customizado necessário',
      },
      {
        projectId: project.id,
        fromReqId: req5.id,
        toReqId: req1.id,
        fromModule: 'CRM',
        toModule: 'CRM',
        dataFlow: 'Credit score, approval status',
        dataFlowBack: null,
        integrationType: 'API',
        trigger: 'Contract creation',
        timing: 'SYNC',
        ownerUserId: user2.id,
        status: 'PENDING',
        manualNotes: 'Depende de integração com Serasa',
      },
    ],
  })

  // ===== COMMENTS =====
  console.log('Criando comentários...')

  await prisma.comment.createMany({
    data: [
      {
        requirementId: req3.id,
        userId: client.id,
        content: 'O batch deve rodar dia 1º porque precisamos fechar contabilidade no dia 5. Quem disse dia 5 está errado.',
        type: 'CONFLICT',
      },
      {
        requirementId: req3.id,
        userId: user1.id,
        content: 'Entendido. Vou atualizar o requisito para dia 1º e documentar a decisão.',
        type: 'ANSWER',
      },
      {
        requirementId: req1.id,
        userId: user1.id,
        content: 'Pergunta: CRM valida BP antes de criar contrato ou ISU faz essa validação?',
        type: 'QUESTION',
      },
      {
        requirementId: req1.id,
        userId: user2.id,
        content: 'CRM valida BP via BAPI_BUPA_EXISTENCE_CHECK antes de criar service order. ISU não precisa re-validar.',
        type: 'ANSWER',
      },
    ],
  })

  // ===== SPRINTS =====
  console.log('Criando sprints...')

  await prisma.sprint.createMany({
    data: [
      {
        projectId: project.id,
        sprintNumber: 1,
        startDate: new Date('2026-01-15'),
        endDate: new Date('2026-01-29'),
        goals: 'Discovery: mapear processos AS-IS de CRM e ISU',
        retrospective: null,
      },
      {
        projectId: project.id,
        sprintNumber: 2,
        startDate: new Date('2026-01-30'),
        endDate: new Date('2026-02-13'),
        goals: 'Discovery: validar TO-BE e matriz de cruzamento',
        retrospective: null,
      },
    ],
  })

  console.log('✅ Seed completado com sucesso!')
  console.log('\nResumo:')
  console.log(`  - Usuários: 5 (3 consultores, 1 manager, 1 cliente)`)
  console.log(`  - Projetos: 1`)
  console.log(`  - Requisitos: 5`)
  console.log(`  - Entradas cross-matrix: 4`)
  console.log(`  - Comentários: 4`)
  console.log(`  - Sprints: 2`)
  console.log('\nCredenciais de login (todos os usuários):')
  console.log('  Email: [usuario]@[dominio].com')
  console.log('  Senha: demo123')
  console.log('\nExemplo: joao.silva@seidor.com / demo123\n')
}
