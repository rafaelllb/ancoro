import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authAPI, usersAPI, User, LoginRequest } from '../services/api'

interface AuthContextType {
  user: User | null
  token: string | null
  login: (credentials: LoginRequest) => Promise<void>
  logout: () => void
  updateColumnPreferences: (columnPreferences: string) => void
  isAuthenticated: boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restaura sessão do localStorage ao carregar
  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')

    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser)
        setToken(storedToken)
        setUser(parsedUser)
      } catch (error) {
        console.error('Failed to parse stored user:', error)
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      }
    }

    setIsLoading(false)
  }, [])

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await authAPI.login(credentials)
      const { user: userData, token: userToken } = response.data

      // Salva no localStorage
      localStorage.setItem('token', userToken)
      localStorage.setItem('user', JSON.stringify(userData))

      // Atualiza state
      setToken(userToken)
      setUser(userData)
    } catch (error: any) {
      console.error('Login failed:', error)
      throw new Error(error.response?.data?.message || 'Login failed')
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
  }

  // Atualiza preferências de coluna localmente (state + localStorage) e persiste no backend.
  // Persistência é fire-and-forget: a UI reflete a mudança imediatamente; erro de rede é logado
  // sem reverter, já que o estado local mantém a experiência consistente na sessão.
  const updateColumnPreferences = (columnPreferences: string) => {
    setUser((prev) => {
      if (!prev) return prev
      const next = { ...prev, columnPreferences }
      localStorage.setItem('user', JSON.stringify(next))
      return next
    })

    usersAPI.updatePreferences(columnPreferences).catch((error) => {
      console.error('Failed to persist column preferences:', error)
    })
  }

  const value: AuthContextType = {
    user,
    token,
    login,
    logout,
    updateColumnPreferences,
    isAuthenticated: !!token && !!user,
    isLoading,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook personalizado
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
