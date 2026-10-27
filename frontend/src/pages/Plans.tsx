/**
 * Página pública /planos — ramo comercial da landing.
 *
 *  - Médio/grande porte: formulário "Falar com a equipe" (+ contatos diretos por e-mail/telefone).
 *  - Consultor independente / pequena equipe: assinatura self-service AINDA NÃO ABERTA => lista de espera
 *    (mesmo formulário, interest = SELF_SERVICE_WAITLIST).
 *
 * [2026-10-24] Criado: página de planos e captura de leads — Rafael Brito
 *
 * TODO [ESTIGMERGIA]: abrir a assinatura self-service (Stripe Billing) — decisão Rafael Brito: pagamento via Stripe Billing.
 * - Hoje o card "self-service" só leva à lista de espera. Quando o checkout existir, trocar o CTA do card `self`
 *   por um link para o signup/checkout e manter a lista de espera apenas se ainda houver fila.
 * - Pré-requisitos (nesta ordem; detalhes e decisões de infra em docs/SAAS_SELF_SERVICE.md):
 *   1. Multi-tenancy ligado ao request (backend/src/tenancy hoje NÃO está no caminho das requisições).
 *   2. Preço por assento + trial: definir e criar Product/Price no Stripe; guardar os price IDs em env, nunca no front.
 *   3. Endpoint que cria a Checkout Session; webhook (assinatura verificada) provisiona o tenant e liga os entitlements.
 *   4. Customer Portal do Stripe para troca de cartão/cancelamento.
 * - Nunca coletar dados de cartão em formulário próprio: usar Checkout hospedado.
 */
import { FormEvent, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import LanguageSwitcher from '../components/LanguageSwitcher'
import { useAuth } from '../contexts/AuthContext'
import { useCreateLead } from '../hooks/useLeads'
import type { CreateLeadRequest } from '../services/api'

type Interest = CreateLeadRequest['interest']
type TeamSize = NonNullable<CreateLeadRequest['teamSize']>
type Deployment = NonNullable<CreateLeadRequest['deployment']>

const TEAM_SIZES: TeamSize[] = ['1', '2-5', '6-20', '21-100', '100+']
const DEPLOYMENTS: Deployment[] = ['SAAS', 'DEDICATED', 'ONPREMISE', 'UNSURE']

// Contatos diretos vêm do ambiente de build: sem valor, o bloco não aparece (nada hardcoded no código-fonte)
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL?.trim()
const CONTACT_PHONE = import.meta.env.VITE_CONTACT_PHONE?.trim()

type TitleText = { title: string; text: string }
type DeploymentItem = TitleText & { code: string }

const inputClass =
  'mt-1 w-full rounded-xl border border-ancoro-navy-200 bg-white px-4 py-2.5 text-sm text-ancoro-navy-900 outline-none transition focus:border-ancoro-teal-500 focus:ring-2 focus:ring-ancoro-teal-100'
const labelClass = 'block text-sm font-medium text-ancoro-navy-800'

export default function Plans() {
  const { t, i18n } = useTranslation('plans')
  const { isAuthenticated } = useAuth()
  const createLead = useCreateLead()
  const formRef = useRef<HTMLDivElement>(null)

  const [interest, setInterest] = useState<Interest>('ENTERPRISE')
  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    teamSize: '' as TeamSize | '',
    deployment: '' as Deployment | '',
    message: '',
    website: '', // honeypot
  })
  const [consent, setConsent] = useState(false)

  const deployments = t('deployment.items', { returnObjects: true }) as DeploymentItem[]
  const capabilities = t('capabilities.items', { returnObjects: true }) as TitleText[]
  const sapItems = t('sap.items', { returnObjects: true }) as string[]
  const isWaitlist = interest === 'SELF_SERVICE_WAITLIST'

  const set = (field: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  function goToForm(next: Interest) {
    setInterest(next)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    createLead.mutate({
      interest,
      name: form.name.trim(),
      email: form.email.trim(),
      company: form.company.trim() || undefined,
      phone: form.phone.trim() || undefined,
      teamSize: form.teamSize || undefined,
      deployment: !isWaitlist && form.deployment ? form.deployment : undefined,
      message: form.message.trim() || undefined,
      locale: i18n.language?.startsWith('en') ? 'en' : 'pt',
      consent,
      website: form.website || undefined,
    })
  }

  return (
    <div className="min-h-screen ancoro-shell">
      {/* Topo */}
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 sm:px-8 lg:px-12">
        <Link to="/" className="flex items-center gap-3 text-ancoro-navy-900">
          <img src="/logo-new.png" alt="Ancoro" className="h-10 w-auto" />
          <span className="text-lg font-bold">Ancoro</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <LanguageSwitcher />
          <Link to="/" className="font-medium text-ancoro-navy-600 hover:text-ancoro-navy-900">
            {t('nav.back')}
          </Link>
          <Link
            to={isAuthenticated ? '/dashboard' : '/login'}
            className="rounded-xl bg-ancoro-navy-900 px-4 py-2 font-semibold text-white hover:bg-ancoro-navy-800"
          >
            {isAuthenticated ? 'Dashboard' : t('nav.login')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-16 sm:px-8 lg:px-12">
        {/* Hero */}
        <section className="max-w-3xl py-8">
          <p className="text-sm font-semibold uppercase tracking-[0.26em] text-ancoro-teal-600">{t('hero.eyebrow')}</p>
          <h1 className="mt-3 text-4xl font-bold leading-tight text-ancoro-navy-950 sm:text-5xl">{t('hero.title')}</h1>
          <p className="mt-5 text-lg leading-8 text-ancoro-navy-700">{t('hero.subtitle')}</p>
        </section>

        {/* Duas portas de entrada */}
        <section className="grid gap-6 py-6 lg:grid-cols-2">
          <article className="ancoro-panel-strong flex flex-col rounded-[28px] p-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ancoro-teal-600">{t('audiences.self.eyebrow')}</p>
              <span className="rounded-full bg-ancoro-navy-50 px-3 py-1 text-xs font-semibold text-ancoro-navy-600 ring-1 ring-ancoro-navy-100">
                {t('audiences.self.badge')}
              </span>
            </div>
            <h2 className="mt-4 text-2xl font-bold text-ancoro-navy-900">{t('audiences.self.title')}</h2>
            <p className="mt-3 flex-1 text-sm leading-7 text-ancoro-navy-600">{t('audiences.self.text')}</p>
            <button
              type="button"
              onClick={() => goToForm('SELF_SERVICE_WAITLIST')}
              className="mt-6 inline-flex items-center justify-center rounded-2xl border border-ancoro-teal-200 bg-white/85 px-6 py-3 text-sm font-semibold text-ancoro-teal-700 transition hover:bg-ancoro-teal-50"
            >
              {t('audiences.self.cta')}
            </button>
          </article>

          <article className="ancoro-panel-strong flex flex-col rounded-[28px] p-7 ring-2 ring-ancoro-teal-200">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ancoro-teal-600">{t('audiences.enterprise.eyebrow')}</p>
            <h2 className="mt-4 text-2xl font-bold text-ancoro-navy-900">{t('audiences.enterprise.title')}</h2>
            <p className="mt-3 flex-1 text-sm leading-7 text-ancoro-navy-600">{t('audiences.enterprise.text')}</p>
            <button
              type="button"
              onClick={() => goToForm('ENTERPRISE')}
              className="mt-6 inline-flex items-center justify-center rounded-2xl bg-ancoro-navy-900 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-ancoro-navy-900/20 transition hover:bg-ancoro-navy-800"
            >
              {t('audiences.enterprise.cta')}
            </button>
          </article>
        </section>

        {/* Modelos de implantação */}
        <section className="py-12">
          <h2 className="text-3xl font-bold text-ancoro-navy-950">{t('deployment.title')}</h2>
          <p className="mt-2 text-ancoro-navy-700">{t('deployment.subtitle')}</p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {deployments.map((d) => (
              <div key={d.code} className="ancoro-panel-strong rounded-[24px] p-6">
                <h3 className="text-lg font-semibold text-ancoro-navy-900">{d.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ancoro-navy-600">{d.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Capacidades */}
        <section className="pb-12">
          <h2 className="text-3xl font-bold text-ancoro-navy-950">{t('capabilities.title')}</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((c) => (
              <div key={c.title} className="rounded-[24px] bg-white/70 p-6 ring-1 ring-ancoro-navy-100">
                <h3 className="text-base font-semibold text-ancoro-navy-900">{c.title}</h3>
                <p className="mt-2 text-sm leading-6 text-ancoro-navy-600">{c.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Compatibilidade SAP (destaque, sem restringir a SAP) */}
        <section className="mb-12 overflow-hidden rounded-[32px] bg-ancoro-navy-950 px-6 py-10 sm:px-10">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-ancoro-teal-300">{t('sap.eyebrow')}</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white">{t('sap.title')}</h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-ancoro-navy-200">{t('sap.text')}</p>
          <ul className="mt-6 grid gap-3 md:grid-cols-2">
            {sapItems.map((item) => (
              <li key={item} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-ancoro-navy-100">
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs leading-5 text-ancoro-navy-300">{t('sap.disclaimer')}</p>
        </section>

        {/* Formulário + contato direto */}
        <section ref={formRef} id="contato" className="grid scroll-mt-6 gap-6 lg:grid-cols-[1.4fr_0.6fr]">
          <div className="ancoro-panel-strong rounded-[28px] p-7 sm:p-8">
            {createLead.isSuccess ? (
              <div role="status" className="py-10 text-center">
                <h2 className="text-2xl font-bold text-ancoro-navy-900">{t('form.successTitle')}</h2>
                <p className="mt-3 text-ancoro-navy-700">{t('form.successText')}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate={false}>
                <h2 className="text-2xl font-bold text-ancoro-navy-900">
                  {isWaitlist ? t('form.titleWaitlist') : t('form.title')}
                </h2>
                <p className="mt-2 text-sm text-ancoro-navy-600">
                  {isWaitlist ? t('form.subtitleWaitlist') : t('form.subtitle')}
                </p>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="lead-interest" className={labelClass}>{t('form.interestLabel')}</label>
                    <select
                      id="lead-interest"
                      className={inputClass}
                      value={interest}
                      onChange={(e) => setInterest(e.target.value as Interest)}
                    >
                      <option value="ENTERPRISE">{t('form.interestEnterprise')}</option>
                      <option value="SELF_SERVICE_WAITLIST">{t('form.interestWaitlist')}</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="lead-name" className={labelClass}>{t('form.name')}</label>
                    <input id="lead-name" required minLength={2} maxLength={100} autoComplete="name" className={inputClass} value={form.name} onChange={set('name')} />
                  </div>
                  <div>
                    <label htmlFor="lead-email" className={labelClass}>{t('form.email')}</label>
                    <input id="lead-email" type="email" required maxLength={254} autoComplete="email" className={inputClass} value={form.email} onChange={set('email')} />
                  </div>
                  <div>
                    <label htmlFor="lead-company" className={labelClass}>{t('form.company')}</label>
                    <input id="lead-company" maxLength={120} autoComplete="organization" className={inputClass} value={form.company} onChange={set('company')} />
                  </div>
                  <div>
                    <label htmlFor="lead-phone" className={labelClass}>{t('form.phone')}</label>
                    <input id="lead-phone" type="tel" maxLength={40} autoComplete="tel" className={inputClass} value={form.phone} onChange={set('phone')} />
                  </div>
                  <div>
                    <label htmlFor="lead-team" className={labelClass}>{t('form.teamSize')}</label>
                    <select id="lead-team" className={inputClass} value={form.teamSize} onChange={set('teamSize')}>
                      <option value="">{t('form.select')}</option>
                      {TEAM_SIZES.map((size) => (
                        <option key={size} value={size}>{t(`form.teamSizeOptions.${size}`)}</option>
                      ))}
                    </select>
                  </div>
                  {!isWaitlist && (
                    <div>
                      <label htmlFor="lead-deployment" className={labelClass}>{t('form.deployment')}</label>
                      <select id="lead-deployment" className={inputClass} value={form.deployment} onChange={set('deployment')}>
                        <option value="">{t('form.select')}</option>
                        {DEPLOYMENTS.map((d) => (
                          <option key={d} value={d}>{t(`form.deploymentOptions.${d}`)}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="sm:col-span-2">
                    <label htmlFor="lead-message" className={labelClass}>{t('form.message')}</label>
                    <textarea id="lead-message" rows={4} maxLength={2000} placeholder={t('form.messagePlaceholder')} className={inputClass} value={form.message} onChange={set('message')} />
                  </div>

                  {/* Honeypot: fora da tela e do fluxo de foco; humano não preenche, bot preenche */}
                  <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                    <label htmlFor="lead-website">Website</label>
                    <input id="lead-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
                  </div>
                </div>

                <label className="mt-5 flex items-start gap-3 text-sm text-ancoro-navy-700">
                  <input
                    type="checkbox"
                    required
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-ancoro-teal-600"
                  />
                  <span>{t('form.consent')}</span>
                </label>

                {createLead.isError && (
                  <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
                    {t('form.error')}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={createLead.isPending || !consent}
                  className="mt-6 inline-flex items-center justify-center rounded-2xl bg-ancoro-navy-900 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-ancoro-navy-900/20 transition hover:bg-ancoro-navy-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createLead.isPending ? t('form.sending') : t('form.submit')}
                </button>
              </form>
            )}
          </div>

          {(CONTACT_EMAIL || CONTACT_PHONE) && (
            <aside className="ancoro-panel rounded-[28px] p-7 sm:p-8 lg:self-start">
              <h2 className="text-lg font-bold text-ancoro-navy-900">{t('contact.title')}</h2>
              <dl className="mt-5 space-y-4 text-sm">
                {CONTACT_EMAIL && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ancoro-navy-500">{t('contact.email')}</dt>
                    <dd className="mt-1">
                      <a className="font-medium text-ancoro-teal-700 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                    </dd>
                  </div>
                )}
                {CONTACT_PHONE && (
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ancoro-navy-500">{t('contact.phone')}</dt>
                    <dd className="mt-1">
                      <a className="font-medium text-ancoro-teal-700 hover:underline" href={`tel:${CONTACT_PHONE.replace(/[^+\d]/g, '')}`}>{CONTACT_PHONE}</a>
                    </dd>
                  </div>
                )}
              </dl>
            </aside>
          )}
        </section>
      </main>
    </div>
  )
}
