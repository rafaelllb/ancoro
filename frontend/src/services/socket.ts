/**
 * Socket.io Client Service
 * Gerencia conexão WebSocket com o backend para notificações real-time
 *
 * Arquitetura:
 * - Singleton de conexão (apenas uma instância por app)
 * - Auto-reconexão em caso de falha
 * - Autenticação via JWT token
 * - Rooms por projeto para isolamento de eventos
 */

import { io, Socket } from 'socket.io-client'

// Tipos de eventos recebidos do servidor
export interface NotificationEvent {
  type:
    | 'requirement:conflict'
    | 'requirement:comment'
    | 'crossmatrix:circular'
    | 'requirement:update'
    | 'requirement:create'
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
    metadata?: Record<string, unknown>
  }
}

// Callback para eventos de notificação
type NotificationCallback = (event: NotificationEvent) => void
type ConnectionCallback = (data: { userId: string; rooms: string[] }) => void
type ErrorCallback = (error: { message: string }) => void

// Instância singleton do socket
let socket: Socket | null = null

// Lista de listeners registrados
const notificationListeners: Set<NotificationCallback> = new Set()
const connectionListeners: Set<ConnectionCallback> = new Set()
const errorListeners: Set<ErrorCallback> = new Set()

/**
 * Inicializa conexão Socket.io com o backend
 * Chamado após login bem-sucedido
 */
export function connectSocket(token: string): Socket {
  // Evita múltiplas conexões
  if (socket?.connected) {
    console.log('[Socket.io] Already connected')
    return socket
  }

  // URL do backend (mesmo do Axios)
  const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000'

  socket = io(baseUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  })

  // Handlers de conexão
  socket.on('connect', () => {
    console.log('[Socket.io] Connected:', socket?.id)
  })

  socket.on('connected', (data: { userId: string; rooms: string[] }) => {
    console.log('[Socket.io] Authenticated, joined rooms:', data.rooms)
    connectionListeners.forEach((cb) => cb(data))
  })

  socket.on('disconnect', (reason) => {
    console.log('[Socket.io] Disconnected:', reason)
  })

  socket.on('connect_error', (error) => {
    console.error('[Socket.io] Connection error:', error.message)
    errorListeners.forEach((cb) => cb({ message: error.message }))
  })

  // Handler principal de notificações
  socket.on('notification', (event: NotificationEvent) => {
    console.log('[Socket.io] Notification received:', event.type)
    notificationListeners.forEach((cb) => cb(event))
  })

  // Handlers de confirmação de room
  socket.on('joined', (data: { projectId: string }) => {
    console.log('[Socket.io] Joined project:', data.projectId)
  })

  socket.on('error', (error: { message: string }) => {
    console.error('[Socket.io] Error:', error.message)
    errorListeners.forEach((cb) => cb(error))
  })

  return socket
}

/**
 * Desconecta do servidor Socket.io
 * Chamado no logout
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
    console.log('[Socket.io] Disconnected manually')
  }
}

/**
 * Retorna instância atual do socket (pode ser null se não conectado)
 */
export function getSocket(): Socket | null {
  return socket
}

/**
 * Verifica se está conectado
 */
export function isSocketConnected(): boolean {
  return socket?.connected ?? false
}

/**
 * Entra em uma room de projeto específica
 * Útil quando usuário navega para um projeto diferente
 */
export function joinProject(projectId: string): void {
  if (socket?.connected) {
    socket.emit('join:project', projectId)
  }
}

/**
 * Sai de uma room de projeto
 */
export function leaveProject(projectId: string): void {
  if (socket?.connected) {
    socket.emit('leave:project', projectId)
  }
}

// ===== Subscription API =====

/**
 * Registra callback para receber notificações
 * Retorna função de unsubscribe
 */
export function onNotification(callback: NotificationCallback): () => void {
  notificationListeners.add(callback)
  return () => notificationListeners.delete(callback)
}

/**
 * Registra callback para evento de conexão estabelecida
 */
export function onConnected(callback: ConnectionCallback): () => void {
  connectionListeners.add(callback)
  return () => connectionListeners.delete(callback)
}

/**
 * Registra callback para erros de conexão
 */
export function onError(callback: ErrorCallback): () => void {
  errorListeners.add(callback)
  return () => errorListeners.delete(callback)
}

/**
 * Remove todos os listeners
 * Útil para cleanup em unmount de componentes
 */
export function clearAllListeners(): void {
  notificationListeners.clear()
  connectionListeners.clear()
  errorListeners.clear()
}
