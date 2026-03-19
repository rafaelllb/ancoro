/**
 * useNotifications Hook
 * Integra Socket.io com Zustand store e react-hot-toast
 *
 * Responsabilidades:
 * - Conecta/desconecta socket baseado no estado de auth
 * - Adiciona notificações ao store
 * - Exibe toast popups para notificações importantes
 * - Expõe estado e ações para componentes
 */

import { useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from '../contexts/AuthContext'
import {
  connectSocket,
  disconnectSocket,
  onNotification,
  onConnected,
  onError,
  NotificationEvent,
} from '../services/socket'
import { useNotificationStore } from '../stores/notificationStore'

// Configuração de quais eventos mostram toast
const TOAST_CONFIG: Record<string, { show: boolean; duration: number }> = {
  'requirement:conflict': { show: true, duration: 5000 },
  'requirement:comment': { show: true, duration: 4000 },
  'crossmatrix:circular': { show: true, duration: 6000 },
  'requirement:update': { show: false, duration: 3000 }, // Muito frequente, não mostra toast
  'requirement:create': { show: true, duration: 3000 },
}

export function useNotifications() {
  const { token, isAuthenticated, user } = useAuth()
  const {
    notifications,
    unreadCount,
    isConnected,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    setConnected,
  } = useNotificationStore()

  // Handler de notificação recebida
  const handleNotification = useCallback(
    (event: NotificationEvent) => {
      // Ignora notificações do próprio usuário (evita ver suas próprias ações)
      if (event.data.userId === user?.id) {
        return
      }

      // Adiciona ao store
      addNotification(event)

      // Mostra toast se configurado
      const config = TOAST_CONFIG[event.type]
      if (config?.show) {
        const toastFn =
          event.data.severity === 'error'
            ? toast.error
            : event.data.severity === 'warning'
              ? toast
              : toast.success

        toastFn(
          `${event.data.title}\n${event.data.message}`,
          {
            duration: config.duration,
            icon: getEventIcon(event.type),
          }
        )
      }
    },
    [addNotification, user?.id]
  )

  // Conecta/desconecta socket baseado no auth
  useEffect(() => {
    if (isAuthenticated && token) {
      // Conecta ao socket
      connectSocket(token)

      // Registra listeners
      const unsubNotification = onNotification(handleNotification)
      const unsubConnected = onConnected(() => setConnected(true))
      const unsubError = onError((err) => {
        console.error('Socket error:', err)
        setConnected(false)
      })

      // Cleanup
      return () => {
        unsubNotification()
        unsubConnected()
        unsubError()
        disconnectSocket()
        setConnected(false)
      }
    } else {
      // Desconecta se não autenticado
      disconnectSocket()
      setConnected(false)
      clearAll()
    }
  }, [isAuthenticated, token, handleNotification, setConnected, clearAll])

  return {
    // Estado
    notifications,
    unreadCount,
    isConnected,

    // Ações
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
  }
}

// Helper para ícones por tipo de evento
function getEventIcon(type: string): string {
  switch (type) {
    case 'requirement:conflict':
      return '🔴'
    case 'requirement:comment':
      return '💬'
    case 'crossmatrix:circular':
      return '🔄'
    case 'requirement:update':
      return '✏️'
    case 'requirement:create':
      return '✨'
    default:
      return '🔔'
  }
}

/**
 * Hook simplificado para componentes que só precisam do contador
 */
export function useUnreadCount(): number {
  return useNotificationStore((state) => state.unreadCount)
}

/**
 * Hook para verificar status de conexão
 */
export function useSocketStatus(): boolean {
  return useNotificationStore((state) => state.isConnected)
}
