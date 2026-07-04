import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../index'
import { authenticate } from '../middleware/auth'
import { UpdateUserPreferencesRequest, UserPublic } from '../types'

const router = Router()

// Preferências de UI são um JSON stringificado. Validamos que é uma string
// que faz JSON.parse sem erro para evitar persistir lixo no banco.
const updateUserPreferencesSchema = z.object({
  columnPreferences: z
    .string()
    .max(10_000, 'Preferências excedem o tamanho máximo permitido')
    .refine((value) => {
      try {
        JSON.parse(value)
        return true
      } catch {
        return false
      }
    }, 'columnPreferences deve ser um JSON válido'),
})

/**
 * PATCH /api/users/me/preferences
 * Atualiza as preferências de UI (ex.: visibilidade de colunas) do usuário autenticado.
 * As preferências acompanham o usuário em qualquer dispositivo, pois ficam no banco.
 */
router.patch('/users/me/preferences', authenticate, async (req: Request, res: Response) => {
  try {
    const validationResult = updateUserPreferencesSchema.safeParse(req.body)
    if (!validationResult.success) {
      return res.status(400).json({
        error: 'Validation Error',
        message: validationResult.error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', '),
      })
    }

    const { columnPreferences } = validationResult.data as UpdateUserPreferencesRequest
    const userId = req.user!.userId

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { columnPreferences },
    })

    const userPublic: UserPublic = {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role as any,
      columnPreferences: updated.columnPreferences ?? null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    }

    return res.json(userPublic)
  } catch (error) {
    console.error('Error updating user preferences:', error)
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Erro ao atualizar preferências',
    })
  }
})

export default router
