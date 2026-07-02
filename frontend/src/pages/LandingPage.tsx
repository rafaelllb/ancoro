import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const features = [
  {
    title: 'Requisitos 5W2H',
    description: 'Estruture decisões críticas com contexto, responsáveis e impactos em um fluxo claro para auditoria e execução.',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    title: 'Matriz de Cruzamento',
    description: 'Encontre dependências, conflitos e impactos entre áreas antes que eles virem retrabalho no projeto.',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
      </svg>
    ),
  },
  {
    title: 'Colaboração Real-time',
    description: 'Acompanhe comentários, notificações e evolução das validações com um ambiente feito para alinhamento contínuo.',
    icon: (
      <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 10h8m-8 4h5m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
]

const highlights = [
  'Governança com menos ruído operacional',
  'Visibilidade entre áreas e stakeholders',
  'Exportação pronta para apresentação e documentação',
]

const steps = [
  {
    number: '01',
    title: 'Estruture o escopo',
    description: 'Registre requisitos com contexto completo, responsáveis e status de evolução.',
  },
  {
    number: '02',
    title: 'Conecte os impactos',
    description: 'Cruze áreas, identifique dependências e trate conflitos com mais antecedência.',
  },
  {
    number: '03',
    title: 'Valide com clareza',
    description: 'Conduza o alinhamento entre times e exporte material executivo com consistência visual.',
  },
]

function HeroSection() {
  const { isAuthenticated } = useAuth()

  return (
    <section className="ancoro-shell relative isolate overflow-hidden">
      <div className="absolute inset-0 ancoro-grid-bg opacity-40" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-6 py-10 sm:px-8 lg:px-12 lg:py-16">
        <div className="ancoro-panel rounded-[32px] px-6 py-6 sm:px-8 lg:px-10">
          <div className="flex flex-col gap-8 border-b border-ancoro-navy-100/70 pb-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-white/80 p-3 shadow-sm ring-1 ring-ancoro-navy-100">
                <img src="/logo-new.png" alt="Ancoro Logo" className="h-14 w-auto sm:h-16" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-ancoro-teal-600">Ancora ReqOps Method</p>
                <h1 className="mt-1 text-2xl font-bold text-ancoro-navy-900 sm:text-3xl">Ancoro</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-ancoro-navy-600">
              <span className="rounded-full bg-white/80 px-4 py-2 ring-1 ring-ancoro-navy-100">Governança de Requisitos</span>
              <span className="rounded-full bg-ancoro-teal-50 px-4 py-2 text-ancoro-teal-700 ring-1 ring-ancoro-teal-100">Foundation-first</span>
            </div>
          </div>

          <div className="grid gap-10 pt-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-ancoro-navy-700 ring-1 ring-ancoro-navy-100">
                <span className="h-2 w-2 rounded-full bg-ancoro-teal-500" />
                Plataforma para transformar requisitos em alinhamento operacional
              </p>
              <h2 className="mt-6 text-4xl font-bold leading-tight text-ancoro-navy-950 sm:text-5xl lg:text-6xl">
                Mais clareza, mais rigor e uma presença visual à altura do projeto.
              </h2>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-ancoro-navy-700">
                A Ancoro organiza requisitos, dependências e validações em uma experiência mais madura, executiva e confiável para projetos complexos.
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  to={isAuthenticated ? '/dashboard' : '/login'}
                  className="inline-flex items-center justify-center rounded-2xl bg-ancoro-navy-900 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-ancoro-navy-900/20 transition hover:-translate-y-0.5 hover:bg-ancoro-navy-800"
                >
                  {isAuthenticated ? 'Abrir Dashboard' : 'Acessar Plataforma'}
                </Link>
                {!isAuthenticated && (
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center rounded-2xl border border-ancoro-teal-200 bg-white/85 px-6 py-3.5 text-base font-semibold text-ancoro-teal-700 transition hover:-translate-y-0.5 hover:bg-ancoro-teal-50"
                  >
                    Ver demonstração
                  </Link>
                )}
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {highlights.map((item) => (
                  <div key={item} className="rounded-2xl bg-white/75 px-4 py-4 text-sm font-medium text-ancoro-navy-700 ring-1 ring-ancoro-navy-100">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="ancoro-panel-strong relative rounded-[28px] p-6 sm:p-8">
              <div className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-ancoro-teal-300 to-transparent" aria-hidden="true" />
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ancoro-teal-600">Painel executivo</p>
              <h3 className="mt-3 text-2xl font-bold text-ancoro-navy-900">Metodologia, rastreabilidade e colaboração no mesmo fluxo.</h3>
              <div className="mt-8 space-y-4">
                {[
                  ['Requisitos organizados', 'Formato estruturado e pronto para revisão'],
                  ['Decisões auditáveis', 'Histórico, comentários e contexto preservados'],
                  ['Visão cross-áreas', 'Menos surpresa entre dependências críticas'],
                ].map(([title, text]) => (
                  <div key={title} className="rounded-2xl bg-ancoro-navy-50/80 p-4 ring-1 ring-ancoro-navy-100">
                    <p className="text-sm font-semibold text-ancoro-navy-900">{title}</p>
                    <p className="mt-1 text-sm leading-6 text-ancoro-navy-600">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  return (
    <section className="px-6 py-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-ancoro-teal-600">Recursos principais</p>
          <h2 className="mt-3 text-3xl font-bold text-ancoro-navy-950 sm:text-4xl">Uma experiência mais profissional para governança de requisitos.</h2>
          <p className="mt-4 text-lg leading-8 text-ancoro-navy-700">
            A plataforma combina profundidade funcional com uma leitura visual mais limpa, segura e institucional.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="ancoro-panel-strong rounded-[28px] p-7 transition hover:-translate-y-1">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ancoro-teal-500/10 text-ancoro-teal-600 ring-1 ring-ancoro-teal-100">
                {feature.icon}
              </div>
              <h3 className="mt-6 text-xl font-semibold text-ancoro-navy-900">{feature.title}</h3>
              <p className="mt-3 text-sm leading-7 text-ancoro-navy-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section className="px-6 pb-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[32px] bg-ancoro-navy-950 px-6 py-10 sm:px-8 lg:px-10 lg:py-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ancoro-teal-300">Fluxo de trabalho</p>
            <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">Do levantamento até a documentação final, com mais controle visual.</h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-ancoro-navy-200">
            A jornada foi desenhada para diminuir fricção e facilitar leitura executiva sem perder densidade técnica.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number} className="rounded-[24px] border border-white/10 bg-white/5 p-6">
              <p className="text-4xl font-bold text-ancoro-teal-300">{step.number}</p>
              <h3 className="mt-5 text-xl font-semibold text-white">{step.title}</h3>
              <p className="mt-3 text-sm leading-7 text-ancoro-navy-200">{step.description}</p>
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
    <footer className="px-6 pb-10 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 rounded-[28px] border border-ancoro-navy-100 bg-white/70 px-6 py-6 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ancoro-teal-600">Ancoro</p>
          <p className="mt-2 text-sm text-ancoro-navy-600">Estabilidade, precisão e confiabilidade para governança de requisitos.</p>
        </div>
        <Link
          to={isAuthenticated ? '/dashboard' : '/login'}
          className="inline-flex items-center justify-center rounded-2xl bg-ancoro-teal-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-ancoro-teal-700"
        >
          {isAuthenticated ? 'Ir para o ambiente' : 'Começar agora'}
        </Link>
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
