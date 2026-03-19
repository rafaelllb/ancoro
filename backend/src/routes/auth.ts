import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { prisma } from '../index'
import { generateToken } from '../middleware/auth'
import { loginSchema } from '../schemas'
import { LoginRequest, LoginResponse, UserPublic } from '../types'

const router = Router()

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
    const user = await prisma.user.findUnique({
      where: { email },
    })

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
  res.status(501).json({
    error: 'Not Implemented',
    message: 'Registro de novos usuários ainda não implementado. Contate o administrador.',
  })
})

export default router
