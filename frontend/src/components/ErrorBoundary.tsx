/**
 * ErrorBoundary - Fallback UI para erros críticos
 *
 * Captura erros de renderização em componentes filhos e exibe
 * uma UI de fallback amigável ao invés de quebrar toda a aplicação.
 *
 * Uso:
 * <ErrorBoundary fallback={<MinhaUIDeErro />}>
 *   <ComponenteQuePoderQuebrar />
 * </ErrorBoundary>
 */

import { Component, ReactNode } from 'react'

// ===== TIPOS =====

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

// ===== ERROR BOUNDARY CLASS COMPONENT =====
// Necessário ser class component para usar componentDidCatch

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Atualiza state para mostrar fallback UI na próxima renderização
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log do erro para debugging/monitoramento
    console.error('ErrorBoundary caught error:', error)
    console.error('Component stack:', errorInfo.componentStack)

    // Callback opcional para logging externo (ex: Sentry)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      // Fallback customizado ou default
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      )
    }

    return this.props.children
  }
}

// ===== DEFAULT ERROR FALLBACK =====

interface DefaultErrorFallbackProps {
  error: Error | null
  onRetry?: () => void
}

function DefaultErrorFallback({ error, onRetry }: DefaultErrorFallbackProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center">
        {/* Ícone de erro */}
        <div className="mx-auto w-16 h-16 mb-6 text-red-500">
          <svg
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            className="w-full h-full"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Mensagem */}
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Algo deu errado
        </h2>
        <p className="text-gray-600 mb-6">
          Ocorreu um erro inesperado. Tente recarregar a página ou voltar mais tarde.
        </p>

        {/* Detalhes do erro (apenas em dev) */}
        {import.meta.env.DEV && error && (
          <div className="mb-6 p-4 bg-red-50 rounded-lg text-left">
            <p className="text-sm font-mono text-red-700 break-all">
              {error.message}
            </p>
          </div>
        )}

        {/* Ações */}
        <div className="flex gap-3 justify-center">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Tentar novamente
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors"
          >
            Recarregar página
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== ERROR CARD =====
// Card menor para erros em seções específicas

interface ErrorCardProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function ErrorCard({
  title = 'Erro ao carregar',
  message = 'Não foi possível carregar os dados. Tente novamente.',
  onRetry,
}: ErrorCardProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
      <div className="mx-auto w-10 h-10 mb-3 text-red-500">
        <svg
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          className="w-full h-full"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-red-800 mb-1">{title}</h3>
      <p className="text-sm text-red-600 mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700 transition-colors"
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}

// ===== QUERY ERROR HANDLER =====
// Componente para exibir erros de React Query

interface QueryErrorProps {
  error: Error | null
  isError: boolean
  refetch?: () => void
  compact?: boolean
}

export function QueryError({
  error,
  isError,
  refetch,
  compact = false,
}: QueryErrorProps) {
  if (!isError) return null

  // Extrai mensagem do erro (pode vir do axios)
  const errorMessage =
    (error as any)?.response?.data?.error ||
    (error as any)?.response?.data?.message ||
    error?.message ||
    'Erro desconhecido'

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-red-600 text-sm py-2">
        <svg
          className="w-4 h-4 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span>{errorMessage}</span>
        {refetch && (
          <button
            onClick={() => refetch()}
            className="text-blue-600 hover:text-blue-800 underline ml-2"
          >
            Tentar novamente
          </button>
        )}
      </div>
    )
  }

  return (
    <ErrorCard
      title="Erro ao carregar dados"
      message={errorMessage}
      onRetry={refetch}
    />
  )
}

export default ErrorBoundary
