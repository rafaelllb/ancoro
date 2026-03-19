/**
 * Notification Service
 * Gerencia Socket.io server e emissão de eventos em tempo real
 *
 * Arquitetura:
 * - Cada projeto tem uma "room" isolada (project:<projectId>)
 * - Usuários autenticados entram na room do projeto ao conectar
 * - Eventos são emitidos apenas para membros do projeto relevante
 */

import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { JWTPayload } from '../types'
import { prisma } from '../index'

// Tipos de eventos emitidos pelo servidor
export interface NotificationEvent {
  type: 'requirement:conflict' | 'requirement:comment' | 'crossmatrix:circular' | 'requirement:update' | 'requirement:create'
  projectId: string
  data: {
    id: string
    reqId?: string
    title: string
    message: string
    userId?: string
    userName?: string
    severity: 'info' | 'warning' | 'error'
    timestamp: Date
    metadata?: Record<string, any>
  }
}

// Socket.io server global
let io: Server | null = null

/**
 * Inicializa Socket.io server e configura handlers de conexão
 * Chamado uma vez na inicialização do servidor Express
 */
export function initializeSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:5173', 'http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Configurações de performance
    pingTimeout: 60000,
    pingInterval: 25000,
  })

  // Middleware de autenticação para Socket.io
  io.use(async (socket: Socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '')

      if (!token) {
        return next(new Error('Authentication token required'))
      }

      const jwtSecret = process.env.JWT_SECRET || 'fallback-secret-dev-only'
      const decoded = jwt.verify(token, jwtSecret) as JWTPayload

      // Adiciona user info ao socket para uso posterior
      socket.data.user = decoded
      next()
    } catch (error) {
      next(new Error('Invalid authentication token'))
    }
  })

  // Handler de conexão
  io.on('connection', async (socket: Socket) => {
    const user = socket.data.user as JWTPayload
    console.log(`[Socket.io] User connected: ${user.email} (${socket.id})`)

    // Busca projetos do usuário e adiciona às rooms correspondentes
    try {
      const userProjects = await prisma.projectUser.findMany({
        where: { userId: user.userId },
        select: { projectId: true },
      })

      // Entra em todas as rooms dos projetos do usuário
      for (const project of userProjects) {
        const roomName = `project:${project.projectId}`
        socket.join(roomName)
        console.log(`[Socket.io] User ${user.email} joined room: ${roomName}`)
      }

      // Emite evento de confirmação para o cliente
      socket.emit('connected', {
        userId: user.userId,
        rooms: userProjects.map((p) => p.projectId),
      })
    } catch (error) {
      console.error('[Socket.io] Error fetching user projects:', error)
    }

    // Handler para entrar em room específica (manual)
    socket.on('join:project', async (projectId: string) => {
      // Verifica se usuário tem acesso ao projeto
      const hasAccess = await prisma.projectUser.findFirst({
        where: { projectId, userId: user.userId },
      })

      if (hasAccess) {
        const roomName = `project:${projectId}`
        socket.join(roomName)
        socket.emit('joined', { projectId })
        console.log(`[Socket.io] User ${user.email} joined room: ${roomName}`)
      } else {
        socket.emit('error', { message: 'Access denied to project' })
      }
    })

    // Handler para sair de room
    socket.on('leave:project', (projectId: string) => {
      const roomName = `project:${projectId}`
      socket.leave(roomName)
      console.log(`[Socket.io] User ${user.email} left room: ${roomName}`)
    })

    // Handler de desconexão
    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io] User disconnected: ${user.email} - ${reason}`)
    })
  })

  console.log('[Socket.io] Server initialized')
  return io
}

/**
 * Retorna instância do Socket.io server
 */
export function getSocketServer(): Server | null {
  return io
}

/**
 * Emite notificação para todos os membros de um projeto
 */
export function emitToProject(projectId: string, event: NotificationEvent): void {
  if (!io) {
    console.warn('[Socket.io] Server not initialized, cannot emit event')
    return
  }

  const roomName = `project:${projectId}`
  io.to(roomName).emit('notification', event)
  console.log(`[Socket.io] Emitted ${event.type} to room ${roomName}`)
}

/**
 * Emite notificação de conflito em requisito
 * Chamado quando status muda para CONFLICT
 */
export function emitRequirementConflict(
  projectId: string,
  reqId: string,
  requirementId: string,
  title: string,
  userId: string,
  userName: string
): void {
  emitToProject(projectId, {
    type: 'requirement:conflict',
    projectId,
    data: {
      id: requirementId,
      reqId,
      title,
      message: `Requisito ${reqId} marcado como CONFLITO por ${userName}`,
      userId,
      userName,
      severity: 'error',
      timestamp: new Date(),
    },
  })
}

/**
 * Emite notificação de novo comentário
 */
export function emitNewComment(
  projectId: string,
  reqId: string,
  requirementId: string,
  commentType: string,
  userId: string,
  userName: string
): void {
  const typeLabel: Record<string, string> = {
    QUESTION: 'pergunta',
    ANSWER: 'resposta',
    OBSERVATION: 'observacao',
    CONFLICT: 'conflito',
  }

  emitToProject(projectId, {
    type: 'requirement:comment',
    projectId,
    data: {
      id: requirementId,
      reqId,
      title: `Novo comentário em ${reqId}`,
      message: `${userName} adicionou uma ${typeLabel[commentType] || 'comentário'}`,
      userId,
      userName,
      severity: commentType === 'CONFLICT' ? 'warning' : 'info',
      timestamp: new Date(),
      metadata: { commentType },
    },
  })
}

/**
 * Emite notificação de dependência circular detectada
 */
export function emitCircularDependency(
  projectId: string,
  cycles: string[][],
  triggerReqId?: string
): void {
  const cycleCount = cycles.length
  const cycleDesc = cycles.slice(0, 3).map((c) => c.join(' -> ')).join('; ')

  emitToProject(projectId, {
    type: 'crossmatrix:circular',
    projectId,
    data: {
      id: projectId,
      title: 'Dependência Circular Detectada',
      message: `${cycleCount} ciclo(s) encontrado(s): ${cycleDesc}${cycleCount > 3 ? '...' : ''}`,
      severity: 'error',
      timestamp: new Date(),
      metadata: {
        cycles,
        triggerReqId,
      },
    },
  })
}

/**
 * Emite notificação de requisito atualizado
 */
export function emitRequirementUpdate(
  projectId: string,
  reqId: string,
  requirementId: string,
  fields: string[],
  userId: string,
  userName: string
): void {
  emitToProject(projectId, {
    type: 'requirement:update',
    projectId,
    data: {
      id: requirementId,
      reqId,
      title: `Requisito ${reqId} atualizado`,
      message: `${userName} alterou: ${fields.join(', ')}`,
      userId,
      userName,
      severity: 'info',
      timestamp: new Date(),
      metadata: { fields },
    },
  })
}

/**
 * Emite notificação de requisito criado
 */
export function emitRequirementCreate(
  projectId: string,
  reqId: string,
  requirementId: string,
  shortDesc: string,
  userId: string,
  userName: string
): void {
  emitToProject(projectId, {
    type: 'requirement:create',
    projectId,
    data: {
      id: requirementId,
      reqId,
      title: `Novo requisito: ${reqId}`,
      message: `${userName} criou: ${shortDesc}`,
      userId,
      userName,
      severity: 'info',
      timestamp: new Date(),
    },
  })
}
