import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import { Notification } from '../stores/notificationStore'

const severityColors = {
  info: 'bg-blue-100 text-blue-800 border-blue-200',
  warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  error: 'bg-red-100 text-red-800 border-red-200',
}

const typeIcons: Record<string, string> = {
  'requirement:conflict': '●',
  'requirement:comment': '◦',
  'crossmatrix:circular': '↺',
  'requirement:update': '✎',
  'requirement:create': '+',
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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id)

    if (notification.type === 'crossmatrix:circular') {
      navigate('/cross-matrix')
    } else if (notification.data.id && notification.data.reqId) {
      navigate(`/dashboard?highlight=${notification.data.id}`)
    }

    setIsOpen(false)
  }

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
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-2xl border border-ancoro-navy-100 bg-white/80 p-2.5 text-ancoro-navy-600 shadow-sm transition hover:bg-ancoro-navy-50 hover:text-ancoro-navy-900"
        title={isConnected ? 'Notificações (conectado)' : 'Notificações (desconectado)'}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        <span
          className={`absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full ring-2 ring-white ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`}
          title={isConnected ? 'WebSocket conectado' : 'WebSocket desconectado'}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-96 overflow-hidden rounded-[24px] border border-ancoro-navy-100 bg-white/95 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between border-b border-ancoro-navy-100 bg-ancoro-navy-50/70 px-4 py-3">
            <h3 className="font-semibold text-ancoro-navy-950">
              Notificações
              {unreadCount > 0 && <span className="ml-2 text-sm font-normal text-ancoro-navy-500">({unreadCount} não lidas)</span>}
            </h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllAsRead} className="text-xs text-ancoro-teal-700 transition hover:text-ancoro-teal-800">
                  Marcar todas
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearAll} className="text-xs text-ancoro-navy-500 transition hover:text-ancoro-navy-700">
                  Limpar
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-ancoro-navy-500">
                <svg className="mx-auto mb-3 h-12 w-12 text-ancoro-navy-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                Nenhuma notificação
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`cursor-pointer border-b border-ancoro-navy-100 px-4 py-3 transition hover:bg-ancoro-navy-50 ${!notification.read ? 'bg-ancoro-teal-50/70' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-ancoro-navy-50 text-sm font-semibold text-ancoro-teal-700">
                      {typeIcons[notification.type] || '•'}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-ancoro-navy-950">{notification.data.title}</p>
                        <span className="flex-shrink-0 text-xs text-ancoro-navy-400">{formatTime(notification.receivedAt)}</span>
                      </div>
                      <p className="mt-1 text-sm text-ancoro-navy-600 line-clamp-2">{notification.data.message}</p>
                      <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-xs ${severityColors[notification.data.severity]}`}>
                        {notification.data.severity === 'error'
                          ? 'Crítico'
                          : notification.data.severity === 'warning'
                            ? 'Atenção'
                            : 'Info'}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeNotification(notification.id)
                      }}
                      className="p-1 text-ancoro-navy-400 transition hover:text-ancoro-navy-700"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-ancoro-navy-100 bg-ancoro-navy-50/70 px-4 py-2 text-xs text-ancoro-navy-500">
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
            <span>Real-time updates</span>
          </div>
        </div>
      )}
    </div>
  )
}
