import { useState, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login({ email, password })
      navigate('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Email ou senha inválidos')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Painel esquerdo — branding */}
      <div className="relative lg:w-1/2 bg-ancoro-navy-50 flex items-center justify-center px-6 py-16 sm:px-10 lg:px-12 lg:py-12 overflow-hidden">
        <div className="w-full max-w-3xl flex flex-col items-center justify-center text-center">
          {/* Lockup horizontal — logo + título/subtítulo */}
          <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:justify-center lg:gap-5">
            <img
              src="/logo-new.png"
              alt="Ancoro Logo"
              className="h-40 sm:h-44 lg:h-52 flex-shrink-0"
            />
            <div className="text-center">
              <h1 className="text-6xl sm:text-7xl lg:text-8xl font-extrabold text-ancoro-navy-800 leading-none tracking-tight" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Ancoro
              </h1>
              <p className="text-ancoro-navy-600 text-sm sm:text-base leading-snug mt-2" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                Governança de Requisitos
              </p>
            </div>
          </div>

          <div className="mt-16 lg:mt-20 text-center text-sm text-ancoro-teal-500 lg:absolute lg:left-1/2 lg:bottom-6 lg:mt-0 lg:-translate-x-1/2">
            <p>Foundation-first . Estabilidade, Precisão e Confiabilidade</p>
            <p className="mt-1">Ancora ReqOps Method</p>
          </div>
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="lg:w-1/2 bg-ancoro-navy-800 flex items-center justify-center px-8 py-16 lg:py-0">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-semibold text-white mb-8">Entrar na sua conta</h2>

          {error && (
            <div className="mb-5 bg-red-500/20 border border-red-400/40 text-red-200 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-5">
              <label htmlFor="email" className="block text-sm font-medium text-ancoro-navy-200 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                className="w-full px-4 py-2.5 bg-ancoro-navy-700/50 border border-ancoro-navy-600 rounded-lg text-white placeholder-ancoro-navy-400 focus:ring-2 focus:ring-ancoro-teal-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="seu.email@exemplo.com"
              />
            </div>

            <div className="mb-7">
              <label htmlFor="password" className="block text-sm font-medium text-ancoro-navy-200 mb-2">
                Senha
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                className="w-full px-4 py-2.5 bg-ancoro-navy-700/50 border border-ancoro-navy-600 rounded-lg text-white placeholder-ancoro-navy-400 focus:ring-2 focus:ring-ancoro-teal-400 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-ancoro-teal-500 hover:bg-ancoro-teal-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-8 pt-6 border-t border-ancoro-navy-700">
            <p className="text-sm text-ancoro-navy-300 mb-3">Credenciais de demonstração:</p>
            <div className="bg-ancoro-navy-900/50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-mono text-xs">
                <span className="inline-block w-24 text-ancoro-teal-300 font-semibold">Admin:</span>
                <span className="text-ancoro-navy-200">admin@ancoro.app</span>
              </p>
              <p className="font-mono text-xs">
                <span className="inline-block w-24 text-ancoro-teal-400 font-semibold">Manager:</span>
                <span className="text-ancoro-navy-200">rafael.brito@ancoro.com</span>
              </p>
              <p className="font-mono text-xs">
                <span className="inline-block w-24 text-ancoro-teal-500 font-semibold">Consultant:</span>
                <span className="text-ancoro-navy-200">joao.silva@ancoro.com</span>
              </p>
              <p className="font-mono text-xs">
                <span className="inline-block w-24 text-gray-300 font-semibold">Client:</span>
                <span className="text-ancoro-navy-200">ana.costa@cliente.com</span>
              </p>
              <p className="font-mono text-xs mt-2 pt-2 border-t border-ancoro-navy-700">
                <span className="text-ancoro-navy-300 font-semibold">Senha (todos):</span>
                <span className="text-ancoro-navy-200"> demo123</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
