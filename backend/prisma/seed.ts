/**
 * Prisma Seed Entry Point
 * Este arquivo serve como ponto de entrada para o comando prisma db seed
 * A lógica real está em src/utils/seedData.ts
 */
import { PrismaClient } from '@prisma/client'
import { seedDemoData } from '../src/utils/seedData'

const prisma = new PrismaClient()

seedDemoData(prisma)
  .catch((e) => {
    console.error('❌ Seed falhou:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
