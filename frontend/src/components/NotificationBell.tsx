/**
 * NotificationBell Component
 * Ícone de sino com badge de contador e dropdown de notificações
 *
 * Features:
 * - Badge com contador de não lidas
 * - Dropdown com lista de notificações recentes
 * - Ações: marcar como lida, marcar todas, limpar
 * - Indicador de status de conexão WebSocket
 * - Clique na notificação navega para o requisito
 */

import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import { Notification } from '../stores/notificationStore'

// Cores por severidade
const SEVERITY_COLORS = {
  info: 'bg-blue-100 text-blue-800 border-blue-200',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  error: 'bg-red-100 text-red-800 border-red-200',
}

// Ícones por tipo de evento
const TYPE_ICONS: Record<string, string> = {
  'requirement:conflict': '🔴',
  'requirement:comment': '💬',
  'crossmatrix:circular': '🔄',
  'requirement:update': '✏️',
  'requirement:create': '✨',
}

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const {
    notifications,
    unreadCount,
    isConnected,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
  } = useNotifications()

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Navega para requisito ao clicar na notificação
  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id)

    // Navega baseado no tipo
    if (notification.type === 'crossmatrix:circular') {
      navigate('/cross-matrix')
    } else if (notification.data.id && notification.data.reqId) {
      // Navega para dashboard com o requisito selecionado
      navigate(`/dashboard?highlight=${notification.data.id}`)
    }

    setIsOpen(false)
  }

  // Formata timestamp relativo
  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - new Date(date).getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)

    if (minutes < 1) return 'agora'
    if (minutes < 60) return `${minutes}m atrás`
    if (hours < 24) return `${hours}h atrás`
    return new Date(date).toLocaleDateString('pt-BR')
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Botão do sino */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
        title={isConnected ? 'Notificações (conectado)' : 'Notificações (desconectado)'}
      >
        {/* Ícone de sino */}
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Badge de contador */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full h-5 min-w-5 flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* Indicador de conexão */}
        <span
          className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`}
          title={isConnected ? 'WebSocket conectado' : 'WebSocket desconectado'}
        />
      </button>

      {/* Dropdown de notificações */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[32rem] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-900">
              Notificações
              {unreadCount > 0 && (
                <span className="ml-2 text-sm text-gray-500">
                  ({unreadCount} não lidas)
                </span>
              )}
            </h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  Marcar todas
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Limpar
                </button>
              )}
            </div>
          </div>

          {/* Lista de notificações */}
          <div className="overflow-y-auto max-h-96">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                <svg
                  className="w-12 h-12 mx-auto mb-3 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                  />
                </svg>
                Nenhuma notificação
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                    !notification.read ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    {/* Ícone do tipo */}
                    <span className="text-xl flex-shrink-0">
                      {TYPE_ICONS[notification.type] || '🔔'}
                    </span>

                    {/* Conteúdo */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm text-gray-900 truncate">
                          {notification.data.title}
                        </p>
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          {formatTime(notification.receivedAt)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
                        {notification.data.message}
                      </p>

                      {/* Badge de severidade */}
                      <span
                        className={`inline-block mt-1.5 px-2 py-0.5 text-xs rounded-full border ${
                          SEVERITY_COLORS[notification.data.severity]
                        }`}
                      >
                        {notification.data.severity === 'error'
                          ? 'Crítico'
                          : notification.data.severity === 'warning'
                            ? 'Atenção'
                            : 'Info'}
                      </span>
                    </div>

                    {/* Botão remover */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeNotification(notification.id)
                      }}
                      className="text-gray-400 hover:text-gray-600 p-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer com status de conexão */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <span
                className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
              />
              {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
            <span>Real-time updates</span>
          </div>
        </div>
      )}
    </div>
  )
}
