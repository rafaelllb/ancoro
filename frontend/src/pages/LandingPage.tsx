import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Ícones inline para evitar dependência externa
// Cada feature tem um ícone representativo em SVG
const icons = {
  // Ícone de checklist/documento para 5W2H
  document: (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  // Ícone de grid/matriz para Cross-Matrix
  matrix: (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  ),
  // Ícone de chat/colaboração
  collaboration: (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" />
    </svg>
  ),
  // Ícone de gráfico/métricas
  metrics: (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  // Ícone de download/exportação
  export: (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
}

// Features da plataforma com descrições objetivas
const features = [
  {
    icon: icons.document,
    title: 'Requisitos 5W2H',
    description: 'Formato estruturado que garante documentação completa: What, Why, Who, When, Where, How Today, How Much.',
  },
  {
    icon: icons.matrix,
    title: 'Matriz de Cruzamento',
    description: 'Detecção automática de dependências entre módulos. Identifica conflitos e dependências circulares.',
  },
  {
    icon: icons.collaboration,
    title: 'Colaboração Real-time',
    description: 'Comentários, notificações e histórico de mudanças. Múltiplos stakeholders validando simultaneamente.',
  },
  {
    icon: icons.metrics,
    title: 'Métricas e KPIs',
    description: 'Dashboard de validação, taxa de conflitos e saúde da integração entre módulos.',
  },
  {
    icon: icons.export,
    title: 'Exportação BPD',
    description: 'Gere Business Process Documents em Markdown e Word prontos para apresentação.',
  },
]

// Passos do fluxo de trabalho
const steps = [
  {
    number: '01',
    title: 'Cadastre os Requisitos',
    description: 'Documente requisitos no formato 5W2H com campos estruturados e metadados organizados.',
  },
  {
    number: '02',
    title: 'Analise Dependências',
    description: 'A matriz identifica automaticamente cruzamentos entre módulos e alerta sobre conflitos potenciais.',
  },
  {
    number: '03',
    title: 'Valide e Exporte',
    description: 'Colabore com a equipe para validar requisitos e exporte documentação formatada para stakeholders.',
  },
]

function HeroSection() {
  const { isAuthenticated } = useAuth()

  return (
    <section className="bg-ancoro-navy-50 min-h-[80vh] flex items-center">
      <div className="max-w-6xl mx-auto px-6 py-16 lg:py-24">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <img
              src="/logo-new.png"
              alt="Ancoro Logo"
              className="h-48 sm:h-56 lg:h-64"
            />
          </div>

          {/* Texto e CTAs */}
          <div className="text-center lg:text-left">
            <h1
              className="text-5xl sm:text-6xl lg:text-7xl font-extrabold text-ancoro-navy-800 leading-tight tracking-tight"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Ancoro
            </h1>
            <p
              className="text-xl sm:text-2xl text-ancoro-navy-600 mt-3"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Governança de Requisitos
            </p>
            <p className="text-ancoro-teal-600 font-medium mt-4 text-lg">
              Ancora ReqOps Method para projetos
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link
                to={isAuthenticated ? '/dashboard' : '/login'}
                className="inline-flex items-center justify-center px-8 py-3.5 bg-ancoro-teal-500 hover:bg-ancoro-teal-600 text-white font-semibold rounded-lg transition-colors text-lg"
              >
                {isAuthenticated ? 'Ir para Dashboard' : 'Acessar Plataforma'}
              </Link>
              {!isAuthenticated && (
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center px-8 py-3.5 bg-ancoro-navy-800 hover:bg-ancoro-navy-700 text-white font-semibold rounded-lg transition-colors text-lg"
                >
                  Ver Demo
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Tagline */}
        <div className="mt-16 text-center">
          <p className="text-ancoro-teal-500 text-sm tracking-wide">
            Foundation-first · Estabilidade, Precisão e Confiabilidade
          </p>
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2
            className="text-3xl sm:text-4xl font-bold text-ancoro-navy-800"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Por que Ancoro?
          </h2>
          <p className="text-ancoro-navy-600 mt-4 text-lg max-w-2xl mx-auto">
            Operacionalize a governança de requisitos com a metodologia ReqOps.
            Reduza retrabalho e aumente a previsibilidade em projetos.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-ancoro-navy-50 rounded-xl p-6 hover:shadow-lg transition-shadow"
            >
              <div className="w-14 h-14 bg-ancoro-teal-500/10 rounded-lg flex items-center justify-center text-ancoro-teal-500 mb-4">
                {feature.icon}
              </div>
              <h3 className="text-xl font-semibold text-ancoro-navy-800 mb-2">
                {feature.title}
              </h3>
              <p className="text-ancoro-navy-600 text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section className="bg-ancoro-navy-800 py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2
            className="text-3xl sm:text-4xl font-bold text-white"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Como Funciona
          </h2>
          <p className="text-ancoro-navy-300 mt-4 text-lg max-w-2xl mx-auto">
            Três passos para transformar a governança de requisitos do seu projeto.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
          {steps.map((step, index) => (
            <div key={index} className="text-center">
              <div className="text-5xl font-bold text-ancoro-teal-400 mb-4">
                {step.number}
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">
                {step.title}
              </h3>
              <p className="text-ancoro-navy-300 text-sm leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FooterSection() {
  const { isAuthenticated } = useAuth()

  return (
    <footer className="bg-ancoro-navy-900 py-12">
      <div className="max-w-6xl mx-auto px-6 text-center">
        <Link
          to={isAuthenticated ? '/dashboard' : '/login'}
          className="inline-flex items-center justify-center px-8 py-3 bg-ancoro-teal-500 hover:bg-ancoro-teal-600 text-white font-semibold rounded-lg transition-colors"
        >
          {isAuthenticated ? 'Ir para Dashboard' : 'Começar Agora'}
        </Link>

        <div className="mt-10 pt-8 border-t border-ancoro-navy-700">
          <p className="text-ancoro-teal-400 text-sm font-medium">
            Ancora ReqOps Method
          </p>
          <p className="text-ancoro-navy-500 text-xs mt-2">
            Governança de Requisitos
          </p>
        </div>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <FooterSection />
    </div>
  )
}
