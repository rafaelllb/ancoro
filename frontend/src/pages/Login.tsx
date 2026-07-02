import { useState, FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

const demoProfiles = [
  { role: 'Admin', email: 'admin@ancoro.app', tone: 'text-ancoro-teal-300' },
  { role: 'Manager', email: 'rafael.brito@ancoro.com', tone: 'text-ancoro-teal-400' },
  { role: 'Consultant', email: 'joao.silva@ancoro.com', tone: 'text-ancoro-teal-500' },
  { role: 'Client', email: 'ana.costa@cliente.com', tone: 'text-ancoro-navy-200' },
]

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
    <div className="ancoro-shell min-h-screen overflow-hidden bg-transparent">
      <div className="absolute inset-0 ancoro-grid-bg opacity-30" aria-hidden="true" />
      <div className="relative mx-auto flex min-h-screen max-w-7xl items-center px-6 py-8 sm:px-8 lg:px-12">
        <div className="grid w-full overflow-hidden rounded-[32px] border border-white/40 bg-white/45 shadow-[0_30px_80px_rgba(13,27,46,0.16)] backdrop-blur-xl lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative overflow-hidden bg-ancoro-navy-950 px-7 py-10 sm:px-10 lg:px-12 lg:py-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,149,150,0.28),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(74,155,191,0.18),transparent_28%)]" aria-hidden="true" />
            <div className="relative flex h-full flex-col">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
                  <img src="/logo-new.png" alt="Ancoro Logo" className="h-14 w-auto" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.28em] text-ancoro-teal-300">Ancora ReqOps Method</p>
                  <h1 className="mt-1 text-3xl font-bold text-white">Ancoro</h1>
                </div>
              </div>

              <div className="mt-16 max-w-xl">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-ancoro-teal-300">Governança de requisitos</p>
                <h2 className="mt-4 text-4xl font-bold leading-tight text-white sm:text-5xl">
                  Um acesso mais elegante para uma operação mais confiável.
                </h2>
                <p className="mt-5 text-base leading-8 text-ancoro-navy-200">
                  Centralize requisitos, decisões e dependências em uma experiência mais executiva, limpa e preparada para projetos complexos.
                </p>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                {[
                  ['Rastreabilidade', 'Histórico, comentários e evolução preservados'],
                  ['Visão cross-áreas', 'Conflitos e impactos com leitura mais clara'],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-[24px] border border-white/10 bg-white/5 p-5 backdrop-blur">
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="mt-2 text-sm leading-6 text-ancoro-navy-200">{text}</p>
                  </div>
                ))}
              </div>

              <div className="mt-auto pt-12 text-sm text-ancoro-navy-300">
                <p>Foundation-first · Estabilidade, Precisão e Confiabilidade</p>
              </div>
            </div>
          </div>

          <div className="flex items-center bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(244,250,251,0.92))] px-7 py-10 sm:px-10 lg:px-12 lg:py-14">
            <div className="w-full">
              <div className="max-w-md">
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ancoro-teal-600">Acesso seguro</p>
                <h2 className="mt-3 text-3xl font-bold text-ancoro-navy-950">Entrar na plataforma</h2>
                <p className="mt-3 text-sm leading-7 text-ancoro-navy-600">
                  Use suas credenciais para acessar o ambiente de gestão e colaboração dos requisitos.
                </p>
              </div>

              {error && (
                <div className="mt-8 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-medium text-ancoro-navy-700">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="w-full rounded-2xl border border-ancoro-navy-100 bg-white/85 px-4 py-3 text-ancoro-navy-900 shadow-sm outline-none transition placeholder:text-ancoro-navy-300 focus:border-ancoro-teal-400 focus:ring-4 focus:ring-ancoro-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="seu.email@exemplo.com"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-medium text-ancoro-navy-700">
                    Senha
                  </label>
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="w-full rounded-2xl border border-ancoro-navy-100 bg-white/85 px-4 py-3 text-ancoro-navy-900 shadow-sm outline-none transition placeholder:text-ancoro-navy-300 focus:border-ancoro-teal-400 focus:ring-4 focus:ring-ancoro-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="Digite sua senha"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full rounded-2xl bg-ancoro-navy-900 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-ancoro-navy-900/20 transition hover:-translate-y-0.5 hover:bg-ancoro-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>

              <div className="mt-8 rounded-[24px] border border-ancoro-navy-100 bg-white/80 p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-ancoro-navy-900">Credenciais de demonstração</p>
                  <span className="rounded-full bg-ancoro-teal-50 px-3 py-1 text-xs font-medium text-ancoro-teal-700">Senha: `demo123`</span>
                </div>
                <div className="mt-4 space-y-3">
                  {demoProfiles.map((profile) => (
                    <div key={profile.email} className="flex items-center justify-between gap-3 rounded-2xl bg-ancoro-navy-50/80 px-4 py-3">
                      <span className={`text-sm font-semibold ${profile.tone}`}>{profile.role}</span>
                      <span className="text-right font-mono text-xs text-ancoro-navy-700">{profile.email}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
