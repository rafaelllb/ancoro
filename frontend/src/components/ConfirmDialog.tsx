/**
 * ConfirmDialog - Modal de confirmação reutilizável
 *
 * Usado para confirmar ações destrutivas como deletar requisitos.
 * Segue o padrão visual do projeto (Tailwind + cores consistentes).
 */

interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
  variant?: 'danger' | 'warning' | 'info'
}

// Configuração de cores por variante
const VARIANT_CONFIG = {
  danger: {
    icon: '⚠️',
    confirmBg: 'bg-red-600 hover:bg-red-700',
    iconBg: 'bg-red-100',
    iconColor: 'text-red-600',
  },
  warning: {
    icon: '⚡',
    confirmBg: 'bg-yellow-600 hover:bg-yellow-700',
    iconBg: 'bg-yellow-100',
    iconColor: 'text-yellow-600',
  },
  info: {
    icon: 'ℹ️',
    confirmBg: 'bg-blue-600 hover:bg-blue-700',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
  },
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  onConfirm,
  onCancel,
  isLoading = false,
  variant = 'danger',
}: ConfirmDialogProps) {
  if (!isOpen) return null

  const config = VARIANT_CONFIG[variant]

  // Bloqueia scroll do body quando modal está aberto
  // Nota: Seria ideal usar useEffect para isso, mas mantemos simples

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Overlay escuro */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* Container centralizado */}
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Modal */}
        <div
          className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6 transform transition-all"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          {/* Header com ícone */}
          <div className="flex items-start gap-4">
            <div
              className={`flex-shrink-0 w-10 h-10 rounded-full ${config.iconBg} flex items-center justify-center`}
            >
              <span className={`text-xl ${config.iconColor}`}>{config.icon}</span>
            </div>
            <div className="flex-1">
              <h3
                id="confirm-dialog-title"
                className="text-lg font-semibold text-gray-900"
              >
                {title}
              </h3>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
            </div>
          </div>

          {/* Botões */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {cancelText}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 ${config.confirmBg}`}
            >
              {isLoading && (
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
