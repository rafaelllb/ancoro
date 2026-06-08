import { randomUUID } from 'crypto'
import { Prisma, PrismaClient } from '@prisma/client'

type PrismaExecutor = PrismaClient | Prisma.TransactionClient

export interface PendingProjectMembershipRecord {
  id: string
  projectId: string
  email: string
  role: string
  module: string | null
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

export async function listPendingProjectMembershipsByEmail(
  client: PrismaExecutor,
  email: string
) {
  return client.$queryRaw<PendingProjectMembershipRecord[]>`
    SELECT "id", "projectId", "email", "role", "module", "createdBy", "createdAt", "updatedAt"
    FROM "pending_project_memberships"
    WHERE "email" = ${email}
    ORDER BY "createdAt" ASC
  `
}

export async function listPendingProjectMembershipsByProject(
  client: PrismaExecutor,
  projectId: string
) {
  return client.$queryRaw<PendingProjectMembershipRecord[]>`
    SELECT "id", "projectId", "email", "role", "module", "createdBy", "createdAt", "updatedAt"
    FROM "pending_project_memberships"
    WHERE "projectId" = ${projectId}
    ORDER BY "createdAt" ASC
  `
}

export async function deletePendingProjectMembershipsByEmail(
  client: PrismaExecutor,
  email: string
) {
  return client.$executeRaw`
    DELETE FROM "pending_project_memberships"
    WHERE "email" = ${email}
  `
}

export async function upsertPendingProjectMembership(
  client: PrismaExecutor,
  data: {
    projectId: string
    email: string
    role: string
    module: string | null
    createdBy: string | null
  }
) {
  const existing = await client.$queryRaw<PendingProjectMembershipRecord[]>`
    SELECT "id", "projectId", "email", "role", "module", "createdBy", "createdAt", "updatedAt"
    FROM "pending_project_memberships"
    WHERE "projectId" = ${data.projectId} AND "email" = ${data.email}
    LIMIT 1
  `

  if (existing.length > 0) {
    await client.$executeRaw`
      UPDATE "pending_project_memberships"
      SET
        "role" = ${data.role},
        "module" = ${data.module},
        "createdBy" = ${data.createdBy},
        "updatedAt" = ${new Date()}
      WHERE "id" = ${existing[0].id}
    `

    return (
      await client.$queryRaw<PendingProjectMembershipRecord[]>`
        SELECT "id", "projectId", "email", "role", "module", "createdBy", "createdAt", "updatedAt"
        FROM "pending_project_memberships"
        WHERE "id" = ${existing[0].id}
        LIMIT 1
      `
    )[0]
  }

  const id = randomUUID()
  const now = new Date()

  await client.$executeRaw`
    INSERT INTO "pending_project_memberships"
      ("id", "projectId", "email", "role", "module", "createdBy", "createdAt", "updatedAt")
    VALUES
      (${id}, ${data.projectId}, ${data.email}, ${data.role}, ${data.module}, ${data.createdBy}, ${now}, ${now})
  `

  return (
    await client.$queryRaw<PendingProjectMembershipRecord[]>`
      SELECT "id", "projectId", "email", "role", "module", "createdBy", "createdAt", "updatedAt"
      FROM "pending_project_memberships"
      WHERE "id" = ${id}
      LIMIT 1
    `
  )[0]
}
