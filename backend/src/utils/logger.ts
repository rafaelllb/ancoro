import pino, { Logger } from 'pino'
import { Request, Response } from 'express'

// Determina o nível de log baseado no ambiente
// Em produção, só info e acima. Em dev, tudo.
const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

// Transport formatado para dev, JSON puro para produção
// pino-pretty só é carregado se instalado (devDependency)
const transport = process.env.NODE_ENV !== 'production'
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    }
  : undefined

export const logger: Logger = pino({
  level,
  transport,
  // Base context que aparece em todo log
  base: {
    env: process.env.NODE_ENV,
  },
  // Redação automática de campos sensíveis
  redact: {
    paths: ['req.headers.authorization', 'password', 'token', 'secret'],
    censor: '[REDACTED]',
  },
})

// Helpers tipados para contextos comuns
export const createChildLogger = (context: Record<string, unknown>): Logger => {
  return logger.child(context)
}

// Extensão do Express Request para propriedades injetadas por middlewares
interface ExtendedRequest extends Request {
  tenantSlug?: string
  userId?: string
}

// Logger específico para requisições HTTP (usado com pino-http)
export const httpLoggerOptions = {
  logger,
  // Não logar health checks para reduzir ruído
  autoLogging: {
    ignore: (req: Request) => req.url === '/health',
  },
  // Campos customizados no log de request
  customProps: (req: Request, _res: Response) => {
    const extReq = req as ExtendedRequest
    return {
      tenantSlug: extReq.tenantSlug,
      userId: extReq.userId,
    }
  },
}

export default logger
