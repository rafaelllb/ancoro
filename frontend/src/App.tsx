import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query'
import { Toaster, toast } from 'react-hot-toast'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { EnvironmentBanner } from './components/EnvironmentBanner'
import { config } from './config'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import CrossMatrix from './pages/CrossMatrix'
import Metrics from './pages/Metrics'

/**
 * Extrai mensagem de erro amigável de diferentes formatos de erro
 * Suporta erros do Axios, erros padrão JS, e erros customizados do backend
 */
function getErrorMessage(error: unknown): string {
  // Erro do Axios com resposta do servidor
  if (typeof error === 'object' && error !== null) {
    const axiosError = error as any
    if (axiosError.response?.data?.message) {
      return axiosError.response.data.message
    }
    if (axiosError.response?.data?.error) {
      return axiosError.response.data.error
    }
    // Erro de rede (sem resposta do servidor)
    if (axiosError.code === 'ERR_NETWORK') {
      return 'Erro de conexão. Verifique sua internet.'
    }
  }
  // Erro padrão JS
  if (error instanceof Error) {
    return error.message
  }
  return 'Ocorreu um erro inesperado'
}

/**
 * Determina se o erro é recuperável (deve tentar retry)
 * Não faz retry em erros de autenticação/autorização
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const maxRetries = 3

  // Não ultrapassa limite de retries
  if (failureCount >= maxRetries) return false

  // Erro do Axios - verifica status code
  const status = (error as any)?.response?.status
  if (status) {
    // Não faz retry em erros de cliente (4xx)
    // 401 = não autenticado, 403 = não autorizado, 404 = não encontrado, 422 = validação
    if (status === 401 || status === 403 || status === 404 || status === 422) {
      return false
    }
    // Retry apenas em erros de servidor (5xx) ou timeout
    return status >= 500 || status === 408
  }

  // Erro de rede - tenta retry
  if ((error as any)?.code === 'ERR_NETWORK') {
    return true
  }

  return false
}

// QueryClient com configuração otimizada para UX
const queryClient = new QueryClient({
  // Cache global para queries - tratamento de erros centralizado
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Toast de erro apenas para queries que já tinham dados (refetch falhou)
      // Evita spam de toasts em primeira carga
      if (query.state.data !== undefined) {
        toast.error(`Erro ao atualizar: ${getErrorMessage(error)}`)
      }
    },
  }),
  // Cache global para mutations - tratamento de erros centralizado
  mutationCache: new MutationCache({
    onError: (error) => {
      // Mutations já tratam erros individualmente nos hooks
      // Este é um fallback para mutations sem onError próprio
      console.error('Mutation error:', error)
    },
  }),
  defaultOptions: {
    queries: {
      // Não refetch automático ao voltar para a janela (evita flickering)
      refetchOnWindowFocus: false,
      // Retry inteligente baseado no tipo de erro
      retry: shouldRetry,
      // Delay exponencial entre retries (1s, 2s, 4s)
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
      // Cache válido por 30 segundos
      staleTime: 30000,
      // Mantém dados anteriores enquanto refetch (evita skeleton desnecessário)
      placeholderData: (previousData: any) => previousData,
    },
    mutations: {
      // Retry em mutations apenas para erros de servidor
      retry: (failureCount, error) => {
        if (failureCount >= 2) return false
        const status = (error as any)?.response?.status
        return status >= 500
      },
    },
  },
})

// Componente de rota protegida
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

// Rota pública (redireciona se já autenticado)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            {/* Banner de ambiente (demo/dev/staging) */}
            <EnvironmentBanner />

            {/* Container principal com padding para o banner */}
            <div className={config.showEnvIndicator ? 'pt-6' : ''}>
            <Routes>
            {/* Rota pública */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />

            {/* Rotas protegidas */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/cross-matrix"
              element={
                <ProtectedRoute>
                  <CrossMatrix />
                </ProtectedRoute>
              }
            />

            <Route
              path="/metrics"
              element={
                <ProtectedRoute>
                  <Metrics />
                </ProtectedRoute>
              }
            />

            {/* Redirect raiz para dashboard */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />

            {/* 404 */}
            <Route
              path="*"
              element={
                <div className="min-h-screen flex items-center justify-center">
                  <div className="text-center">
                    <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
                    <p className="text-gray-600">Página não encontrada</p>
                  </div>
                </div>
              }
            />
          </Routes>
            </div>
          </BrowserRouter>

          {/* Toast notifications (global) */}
          <Toaster
            position="bottom-right"
            toastOptions={{
              // Estilo padrão para toasts
              duration: 4000,
              style: {
                borderRadius: '8px',
                background: '#333',
                color: '#fff',
              },
              // Estilos específicos por tipo
              success: {
                duration: 3000,
                iconTheme: {
                  primary: '#10B981',
                  secondary: '#fff',
                },
              },
              error: {
                duration: 5000,
                iconTheme: {
                  primary: '#EF4444',
                  secondary: '#fff',
                },
              },
            }}
          />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
