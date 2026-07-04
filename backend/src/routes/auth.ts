import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { prisma } from '../index'
import { generateToken } from '../middleware/auth'
import { loginSchema, registerSchema } from '../schemas'
import { LoginRequest, LoginResponse, RegisterRequest, UserPublic } from '../types'
import { logger } from '../utils/logger'
import {
  deletePendingProjectMembershipsByEmail,
  listPendingProjectMembershipsByEmail,
} from '../utils/pendingProjectMemberships'

const router = Router()
const PRISMA_RECONNECT_DELAY_MS = 1500

function isTransientDatabaseConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const prismaError = error as { code?: string; message?: string }
  const message = prismaError.message?.toLowerCase() || ''

  return prismaError.code === 'P1001'
    || message.includes("can't reach database server")
    || message.includes('database server')
}

async function reconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect()
  } catch (error) {
    logger.warn({ err: error }, 'Prisma disconnect failed during login recovery')
  }

  await new Promise((resolve) => setTimeout(resolve, PRISMA_RECONNECT_DELAY_MS))
  await prisma.$connect()
}

async function findUserByEmailWithReconnect(email: string) {
  try {
    return await prisma.user.findUnique({
      where: { email },
    })
  } catch (error) {
    if (!isTransientDatabaseConnectionError(error)) {
      throw error
    }

    logger.warn({ email }, 'Transient database error during login, retrying after Prisma reconnect')
    await reconnectPrisma()

    return prisma.user.findUnique({
      where: { email },
    })
  }
}

/**
 * POST /api/auth/login
 * Autentica usuário e retorna JWT token
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    // Validar request body
    const validationResult = loginSchema.safeParse(req.body)
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      })
    }

    const { email, password } = validationResult.data as LoginRequest

    // Buscar usuário por email
    const user = await findUserByEmailWithReconnect(email)

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Email ou senha inválidos',
      })
    }

    // Verificar senha
    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Email ou senha inválidos',
      })
    }

    // Gerar token JWT
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role as any,
    })

    // Remover password antes de retornar
    const userPublic: UserPublic = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as any,
      columnPreferences: user.columnPreferences ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }

    const response: LoginResponse = {
      user: userPublic,
      token,
    }

    res.json(response)
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao fazer login',
    })
  }
})

/**
 * POST /api/auth/register (opcional - para criar novos usuários)
 * Por enquanto, usuários são criados via seed ou diretamente no banco
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const validationResult = registerSchema.safeParse(req.body)
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validationResult.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
      })
    }

    const { name, email, password, role } = validationResult.data as RegisterRequest
    const normalizedEmail = email.trim().toLowerCase()

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (existingUser) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Já existe um usuário cadastrado com este e-mail',
      })
    }

    const pendingMemberships = await listPendingProjectMembershipsByEmail(prisma, normalizedEmail)

    const assignedRole = pendingMemberships[0]?.role || role
    if (!assignedRole) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'O usuário deve ser criado com um perfil específico ou ter um perfil previamente atribuído por e-mail',
      })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: assignedRole,
      },
    })

    if (pendingMemberships.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const membership of pendingMemberships) {
          await tx.projectUser.upsert({
            where: {
              projectId_userId: {
                projectId: membership.projectId,
                userId: user.id,
              },
            },
            update: {
              module: membership.module ?? null,
            },
            create: {
              projectId: membership.projectId,
              userId: user.id,
              module: membership.module ?? null,
            },
          })
        }

        await deletePendingProjectMembershipsByEmail(tx, normalizedEmail)
      })
    }

    const userPublic: UserPublic = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as any,
      columnPreferences: user.columnPreferences ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }

    return res.status(201).json({
      message: 'Usuário criado com sucesso',
      user: userPublic,
      pendingMembershipsApplied: pendingMemberships.length,
    })
  } catch (error) {
    console.error('Register error:', error)
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao criar usuário',
    })
  }
})

export default router
