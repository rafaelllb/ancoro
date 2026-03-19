/**
 * Notification Store (Zustand)
 * Gerencia estado global de notificações real-time
 *
 * Features:
 * - Lista de notificações não lidas
 * - Contador de unread
 * - Persistência opcional em sessionStorage
 * - Auto-cleanup de notificações antigas
 */

import { create } from 'zustand'
import { NotificationEvent } from '../services/socket'

// Notificação com metadados adicionais para UI
export interface Notification extends NotificationEvent {
  id: string
  read: boolean
  receivedAt: Date
}

interface NotificationState {
  // Estado
  notifications: Notification[]
  unreadCount: number
  isConnected: boolean

  // Actions
  addNotification: (event: NotificationEvent) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  removeNotification: (id: string) => void
  clearAll: () => void
  setConnected: (connected: boolean) => void
}

// Limite máximo de notificações armazenadas
const MAX_NOTIFICATIONS = 50

// Gera ID único para notificação
function generateId(): string {
  return `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isConnected: false,

  addNotification: (event: NotificationEvent) => {
    const notification: Notification = {
      ...event,
      id: generateId(),
      read: false,
      receivedAt: new Date(),
    }

    set((state) => {
      // Adiciona no início da lista (mais recentes primeiro)
      const updated = [notification, ...state.notifications]

      // Remove notificações antigas se exceder limite
      const trimmed = updated.slice(0, MAX_NOTIFICATIONS)

      return {
        notifications: trimmed,
        unreadCount: state.unreadCount + 1,
      }
    })
  },

  markAsRead: (id: string) => {
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      )

      const unreadCount = notifications.filter((n) => !n.read).length

      return { notifications, unreadCount }
    })
  },

  markAllAsRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }))
  },

  removeNotification: (id: string) => {
    set((state) => {
      const notifications = state.notifications.filter((n) => n.id !== id)
      const unreadCount = notifications.filter((n) => !n.read).length
      return { notifications, unreadCount }
    })
  },

  clearAll: () => {
    set({ notifications: [], unreadCount: 0 })
  },

  setConnected: (connected: boolean) => {
    set({ isConnected: connected })
  },
}))

// Seletores para uso otimizado
export const selectUnreadCount = (state: NotificationState) => state.unreadCount
export const selectNotifications = (state: NotificationState) => state.notifications
export const selectIsConnected = (state: NotificationState) => state.isConnected
