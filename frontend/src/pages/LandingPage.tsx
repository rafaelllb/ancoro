import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import LanguageSwitcher from '../components/LanguageSwitcher'

// Ícones dos features na ordem dos itens em landing.features.items
const featureIcons = [
  (
    <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  (
    <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
    </svg>
  ),
  (
    <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 10h8m-8 4h5m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
]

// Tipos auxiliares para leitura dos arrays traduzidos via returnObjects
type FeatureItem = { title: string; description: string }
type PanelItem = { title: string; text: string }
type StepItem = { number: string; title: string; description: string }
type StatItem = { value: string; label: string; source: string }
type RoiExample = { budget: string; saving: string }
type BeforeAfterRow = { question: string; before: string; after: string }
type Persona = { role: string; pain: string; gain: string }
type Demo = { tag: string; title: string; description: string }

// Fatores do modelo de ROI (ver landing.roi.methodology):
// retrabalho ~30% do orçamento × 70% originado em requisitos = ~21% do orçamento;
// Ancoro reduz de 30% (conservador) a 50% (otimista) dessa parcela → 6%–12% do orçamento.
const ROI_CONSERVATIVE = 0.06
const ROI_OPTIMISTIC = 0.12

function HeroSection() {
  const { t } = useTranslation('landing')
  const { isAuthenticated } = useAuth()

  const highlights = t('hero.highlights', { returnObjects: true }) as string[]
  const panelItems = t('hero.panel.items', { returnObjects: true }) as PanelItem[]

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
                <p className="text-sm font-semibold uppercase tracking-[0.28em] text-ancoro-teal-600">{t('brandMethod')}</p>
                <h1 className="mt-1 text-2xl font-bold text-ancoro-navy-900 sm:text-3xl">Ancoro</h1>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-ancoro-navy-600">
              <span className="rounded-full bg-white/80 px-4 py-2 ring-1 ring-ancoro-navy-100">{t('badges.governance')}</span>
              <span className="rounded-full bg-ancoro-teal-50 px-4 py-2 text-ancoro-teal-700 ring-1 ring-ancoro-teal-100">{t('badges.foundation')}</span>
              <LanguageSwitcher />
            </div>
          </div>

          <div className="grid gap-10 pt-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
            <div className="max-w-3xl">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-medium text-ancoro-navy-700 ring-1 ring-ancoro-navy-100">
                <span className="h-2 w-2 rounded-full bg-ancoro-teal-500" />
                {t('hero.pill')}
              </p>
              <h2 className="mt-6 text-4xl font-bold leading-tight text-ancoro-navy-950 sm:text-5xl lg:text-6xl">
                {t('hero.headline')}
              </h2>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-ancoro-navy-700">
                {t('hero.subtitle')}
              </p>

              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Link
                  to={isAuthenticated ? '/dashboard' : '/login'}
                  className="inline-flex items-center justify-center rounded-2xl bg-ancoro-navy-900 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-ancoro-navy-900/20 transition hover:-translate-y-0.5 hover:bg-ancoro-navy-800"
                >
                  {isAuthenticated ? t('hero.ctaAuthenticated') : t('hero.ctaGuest')}
                </Link>
                {!isAuthenticated && (
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center rounded-2xl border border-ancoro-teal-200 bg-white/85 px-6 py-3.5 text-base font-semibold text-ancoro-teal-700 transition hover:-translate-y-0.5 hover:bg-ancoro-teal-50"
                  >
                    {t('hero.ctaDemo')}
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
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ancoro-teal-600">{t('hero.panel.eyebrow')}</p>
              <h3 className="mt-3 text-2xl font-bold text-ancoro-navy-900">{t('hero.panel.title')}</h3>
              <div className="mt-8 space-y-4">
                {panelItems.map((item) => (
                  <div key={item.title} className="rounded-2xl bg-ancoro-navy-50/80 p-4 ring-1 ring-ancoro-navy-100">
                    <p className="text-sm font-semibold text-ancoro-navy-900">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-ancoro-navy-600">{item.text}</p>
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

function ProblemSection() {
  const { t } = useTranslation('landing')
  const stats = t('problem.stats', { returnObjects: true }) as StatItem[]

  return (
    <section className="px-6 pt-6 pb-16 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-ancoro-teal-600">{t('problem.eyebrow')}</p>
          <h2 className="mt-3 text-3xl font-bold text-ancoro-navy-950 sm:text-4xl">{t('problem.title')}</h2>
          <p className="mt-4 text-lg leading-8 text-ancoro-navy-700">{t('problem.subtitle')}</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="ancoro-panel-strong flex flex-col rounded-[28px] p-6">
              <p className="text-4xl font-bold text-ancoro-navy-950 sm:text-5xl">{stat.value}</p>
              <p className="mt-3 text-sm font-medium leading-6 text-ancoro-navy-700">{stat.label}</p>
              <p className="mt-auto pt-4 text-xs leading-5 text-ancoro-navy-500">{stat.source}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-[24px] border-l-4 border-ancoro-teal-500 bg-ancoro-teal-50/70 px-6 py-5">
          <p className="text-base font-semibold text-ancoro-navy-900">{t('problem.closing')}</p>
        </div>
      </div>
    </section>
  )
}

function RoiSection() {
  const { t, i18n } = useTranslation('landing')
  const examples = t('roi.examples', { returnObjects: true }) as RoiExample[]

  const isPt = i18n.language?.startsWith('pt')
  const currency = isPt ? 'BRL' : 'USD'
  const locale = isPt ? 'pt-BR' : 'en-US'
  const maxBudget = isPt ? 10_000_000 : 2_000_000
  const step = isPt ? 100_000 : 20_000
  const [budget, setBudget] = useState(isPt ? 2_000_000 : 400_000)

  const formatCurrency = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0,
      }),
    [locale, currency],
  )

  const conservative = Math.round(budget * ROI_CONSERVATIVE)
  const optimistic = Math.round(budget * ROI_OPTIMISTIC)

  return (
    <section className="px-6 pb-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-ancoro-teal-600">{t('roi.eyebrow')}</p>
          <h2 className="mt-3 text-3xl font-bold text-ancoro-navy-950 sm:text-4xl">{t('roi.title')}</h2>
          <p className="mt-4 text-lg leading-8 text-ancoro-navy-700">{t('roi.subtitle')}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <div className="ancoro-panel-strong rounded-[28px] p-7 sm:p-8">
            <label htmlFor="roi-budget" className="text-sm font-semibold text-ancoro-navy-900">
              {t('roi.inputLabel')}
            </label>
            <p className="mt-2 text-3xl font-bold text-ancoro-navy-950">{formatCurrency.format(budget)}</p>
            <input
              id="roi-budget"
              type="range"
              min={0}
              max={maxBudget}
              step={step}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="mt-5 w-full accent-ancoro-teal-600"
            />

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-ancoro-navy-50/80 p-5 ring-1 ring-ancoro-navy-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-ancoro-navy-500">{t('roi.rangeConservative')}</p>
                <p className="mt-2 text-2xl font-bold text-ancoro-navy-900">{formatCurrency.format(conservative)}</p>
              </div>
              <div className="rounded-2xl bg-ancoro-teal-50 p-5 ring-1 ring-ancoro-teal-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-ancoro-teal-700">{t('roi.rangeOptimistic')}</p>
                <p className="mt-2 text-2xl font-bold text-ancoro-teal-700">{formatCurrency.format(optimistic)}</p>
              </div>
            </div>
            <p className="mt-4 text-sm font-medium text-ancoro-navy-600">{t('roi.resultLabel')}</p>
          </div>

          <div className="ancoro-panel rounded-[28px] p-7 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ancoro-teal-600">{t('roi.examplesTitle')}</p>
            <div className="mt-5 space-y-3">
              {examples.map((ex) => (
                <div key={ex.budget} className="flex items-center justify-between rounded-2xl bg-white/75 px-4 py-3 ring-1 ring-ancoro-navy-100">
                  <span className="text-sm font-medium text-ancoro-navy-700">{ex.budget}</span>
                  <span className="text-sm font-bold text-ancoro-teal-700">{ex.saving}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 border-t border-ancoro-navy-100 pt-5">
              <p className="text-sm font-semibold text-ancoro-navy-900">{t('roi.methodologyTitle')}</p>
              <p className="mt-2 text-xs leading-5 text-ancoro-navy-500">{t('roi.methodology')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function FeaturesSection() {
  const { t } = useTranslation('landing')
  const items = t('features.items', { returnObjects: true }) as FeatureItem[]

  return (
    <section className="px-6 py-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-ancoro-teal-600">{t('features.eyebrow')}</p>
          <h2 className="mt-3 text-3xl font-bold text-ancoro-navy-950 sm:text-4xl">{t('features.title')}</h2>
          <p className="mt-4 text-lg leading-8 text-ancoro-navy-700">
            {t('features.subtitle')}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {items.map((feature, index) => (
            <div key={feature.title} className="ancoro-panel-strong rounded-[28px] p-7 transition hover:-translate-y-1">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ancoro-teal-500/10 text-ancoro-teal-600 ring-1 ring-ancoro-teal-100">
                {featureIcons[index]}
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

function BeforeAfterSection() {
  const { t } = useTranslation('landing')
  const rows = t('beforeAfter.rows', { returnObjects: true }) as BeforeAfterRow[]

  return (
    <section className="px-6 pb-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-ancoro-teal-600">{t('beforeAfter.eyebrow')}</p>
          <h2 className="mt-3 text-3xl font-bold text-ancoro-navy-950 sm:text-4xl">{t('beforeAfter.title')}</h2>
          <p className="mt-4 text-lg leading-8 text-ancoro-navy-700">{t('beforeAfter.subtitle')}</p>
        </div>

        <div className="ancoro-panel-strong overflow-hidden rounded-[28px]">
          <div className="hidden grid-cols-[1.1fr_1fr_1fr] gap-px bg-ancoro-navy-100 sm:grid">
            <div className="bg-white px-6 py-4" />
            <div className="bg-ancoro-navy-50/80 px-6 py-4 text-sm font-semibold text-ancoro-navy-600">{t('beforeAfter.columnBefore')}</div>
            <div className="bg-ancoro-teal-50 px-6 py-4 text-sm font-semibold text-ancoro-teal-700">{t('beforeAfter.columnAfter')}</div>
          </div>
          {rows.map((row) => (
            <div key={row.question} className="grid grid-cols-1 gap-px border-t border-ancoro-navy-100 bg-ancoro-navy-100 sm:grid-cols-[1.1fr_1fr_1fr]">
              <div className="bg-white px-6 py-5 text-sm font-semibold text-ancoro-navy-900">{row.question}</div>
              <div className="bg-white px-6 py-5 text-sm leading-6 text-ancoro-navy-600">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ancoro-navy-400 sm:hidden">{t('beforeAfter.columnBefore')}</span>
                {row.before}
              </div>
              <div className="bg-ancoro-teal-50/40 px-6 py-5 text-sm leading-6 text-ancoro-navy-800">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ancoro-teal-600 sm:hidden">{t('beforeAfter.columnAfter')}</span>
                {row.after}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  const { t } = useTranslation('landing')
  const steps = t('howItWorks.steps', { returnObjects: true }) as StepItem[]

  return (
    <section className="px-6 pb-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[32px] bg-ancoro-navy-950 px-6 py-10 sm:px-8 lg:px-10 lg:py-12">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ancoro-teal-300">{t('howItWorks.eyebrow')}</p>
            <h2 className="mt-3 text-3xl font-bold text-white sm:text-4xl">{t('howItWorks.title')}</h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-ancoro-navy-200">
            {t('howItWorks.subtitle')}
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

function ForWhomSection() {
  const { t } = useTranslation('landing')
  const personas = t('forWhom.personas', { returnObjects: true }) as Persona[]

  return (
    <section className="px-6 pb-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-ancoro-teal-600">{t('forWhom.eyebrow')}</p>
          <h2 className="mt-3 text-3xl font-bold text-ancoro-navy-950 sm:text-4xl">{t('forWhom.title')}</h2>
          <p className="mt-4 text-lg leading-8 text-ancoro-navy-700">{t('forWhom.subtitle')}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {personas.map((persona) => (
            <div key={persona.role} className="ancoro-panel-strong rounded-[28px] p-7">
              <h3 className="text-lg font-semibold text-ancoro-navy-900">{persona.role}</h3>
              <div className="mt-5 rounded-2xl bg-ancoro-navy-50/80 p-4 ring-1 ring-ancoro-navy-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-ancoro-navy-400">—</p>
                <p className="mt-1 text-sm leading-6 text-ancoro-navy-600">{persona.pain}</p>
              </div>
              <div className="mt-3 rounded-2xl bg-ancoro-teal-50 p-4 ring-1 ring-ancoro-teal-100">
                <p className="text-xs font-semibold uppercase tracking-wide text-ancoro-teal-600">+</p>
                <p className="mt-1 text-sm leading-6 text-ancoro-navy-800">{persona.gain}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProofSection() {
  const { t } = useTranslation('landing')
  const { isAuthenticated } = useAuth()
  const demos = t('proof.demos', { returnObjects: true }) as Demo[]

  return (
    <section className="px-6 pb-20 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.26em] text-ancoro-teal-600">{t('proof.eyebrow')}</p>
            <h2 className="mt-3 text-3xl font-bold text-ancoro-navy-950 sm:text-4xl">{t('proof.title')}</h2>
            <p className="mt-4 text-lg leading-8 text-ancoro-navy-700">{t('proof.subtitle')}</p>
          </div>
          <Link
            to={isAuthenticated ? '/dashboard' : '/login'}
            className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-ancoro-navy-900 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-ancoro-navy-900/20 transition hover:-translate-y-0.5 hover:bg-ancoro-navy-800"
          >
            {t('proof.cta')}
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {demos.map((demo) => (
            <div key={demo.title} className="ancoro-panel-strong rounded-[28px] p-7">
              <span className="inline-flex rounded-full bg-ancoro-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ancoro-teal-700 ring-1 ring-ancoro-teal-100">
                {demo.tag}
              </span>
              <h3 className="mt-5 text-xl font-semibold text-ancoro-navy-900">{demo.title}</h3>
              <p className="mt-3 text-sm leading-7 text-ancoro-navy-600">{demo.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function MethodologyNote() {
  const { t } = useTranslation('landing')

  return (
    <section className="px-6 pb-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl rounded-[24px] border border-ancoro-navy-100 bg-white/60 px-6 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-ancoro-navy-500">{t('methodologyNote.title')}</p>
        <p className="mt-2 text-xs leading-5 text-ancoro-navy-500">{t('methodologyNote.text')}</p>
      </div>
    </section>
  )
}

function FooterSection() {
  const { t } = useTranslation('landing')
  const { isAuthenticated } = useAuth()

  return (
    <footer className="px-6 pb-10 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 rounded-[28px] border border-ancoro-navy-100 bg-white/70 px-6 py-6 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ancoro-teal-600">Ancoro</p>
          <p className="mt-2 text-sm text-ancoro-navy-600">{t('footer.tagline')}</p>
        </div>
        <Link
          to={isAuthenticated ? '/dashboard' : '/login'}
          className="inline-flex items-center justify-center rounded-2xl bg-ancoro-teal-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-ancoro-teal-700"
        >
          {isAuthenticated ? t('footer.ctaAuthenticated') : t('footer.ctaGuest')}
        </Link>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <ProblemSection />
      <RoiSection />
      <FeaturesSection />
      <BeforeAfterSection />
      <HowItWorksSection />
      <ForWhomSection />
      <ProofSection />
      <MethodologyNote />
      <FooterSection />
    </div>
  )
}
