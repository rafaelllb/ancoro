import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { JWTPayload } from '../types'

// Extende o tipo Request do Express para incluir user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production'

/**
 * Gera JWT token para usuário
 */
export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: '7d', // Token válido por 7 dias
  })
}

/**
 * Verifica e decodifica JWT token
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload
    return decoded
  } catch (error) {
    throw new Error('Token inválido ou expirado')
  }
}

/**
 * Middleware de autenticação
 * Extrai token do header Authorization e valida
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    // Extrai token do header "Authorization: Bearer <token>"
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token não fornecido. Envie via header: Authorization: Bearer <token>',
      })
    }

    const token = authHeader.substring(7) // Remove "Bearer "

    // Verifica e decodifica token
    const payload = verifyToken(token)

    // Adiciona payload ao request para uso nos controllers
    req.user = payload

    next()
  } catch (error) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: error instanceof Error ? error.message : 'Falha na autenticação',
    })
  }
}

/**
 * Middleware opcional de autenticação
 * Não bloqueia requisição se token não for fornecido, mas adiciona user se token válido
 */
export function optionalAuthenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const payload = verifyToken(token)
      req.user = payload
    }
    next()
  } catch (error) {
    // Ignora erros de token inválido, apenas não adiciona user
    next()
  }
}
