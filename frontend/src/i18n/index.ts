/**
 * Configuração de internacionalização (i18n) do Ancoro — react-i18next.
 *
 * Filosofia (analogia SAP): o frontend é a camada de apresentação e traduz
 * tudo que o usuário vê. O backend permanece em PT (o "alemão" do SAP) e os
 * códigos/enums internos (PENDING, ISU, DISCOVERY) nunca mudam — apenas o
 * label exibido é traduzido via namespace `enums`.
 *
 * Idioma inicial: lê de localStorage['ancoro_lang'] (fallback 'pt').
 * A troca de idioma é client-side e persistida em localStorage, funcionando
 * offline no empacotamento Electron (sem dependência de rota/URL).
 */

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ptCommon from './locales/pt/common.json'
import ptNav from './locales/pt/nav.json'
import ptProjects from './locales/pt/projects.json'
import ptEnums from './locales/pt/enums.json'
import ptLogin from './locales/pt/login.json'
import ptLanding from './locales/pt/landing.json'
import ptMetrics from './locales/pt/metrics.json'
import ptMatrix from './locales/pt/matrix.json'
import ptGraph from './locales/pt/graph.json'
import ptDashboard from './locales/pt/dashboard.json'

import enCommon from './locales/en/common.json'
import enNav from './locales/en/nav.json'
import enProjects from './locales/en/projects.json'
import enEnums from './locales/en/enums.json'
import enLogin from './locales/en/login.json'
import enLanding from './locales/en/landing.json'
import enMetrics from './locales/en/metrics.json'
import enMatrix from './locales/en/matrix.json'
import enGraph from './locales/en/graph.json'
import enDashboard from './locales/en/dashboard.json'

export const LANGUAGE_STORAGE_KEY = 'ancoro_lang'
export const SUPPORTED_LANGUAGES = ['pt', 'en'] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]
export const DEFAULT_LANGUAGE: SupportedLanguage = 'pt'

// Namespaces registrados. Novos namespaces são adicionados por onda de tradução.
export const NAMESPACES = [
  'common',
  'nav',
  'projects',
  'enums',
  'login',
  'landing',
  'metrics',
  'matrix',
  'graph',
  'dashboard',
] as const

const resources = {
  pt: {
    common: ptCommon,
    nav: ptNav,
    projects: ptProjects,
    enums: ptEnums,
    login: ptLogin,
    landing: ptLanding,
    metrics: ptMetrics,
    matrix: ptMatrix,
    graph: ptGraph,
    dashboard: ptDashboard,
  },
  en: {
    common: enCommon,
    nav: enNav,
    projects: enProjects,
    enums: enEnums,
    login: enLogin,
    landing: enLanding,
    metrics: enMetrics,
    matrix: enMatrix,
    graph: enGraph,
    dashboard: enDashboard,
  },
} as const

// Lê idioma persistido; valida contra a lista de suportados para evitar valores inválidos.
function getInitialLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
    return stored as SupportedLanguage
  }
  return DEFAULT_LANGUAGE
}

i18n.use(initReactI18next).init({
  resources,
  lng: getInitialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  ns: NAMESPACES as unknown as string[],
  defaultNS: 'common',
  interpolation: {
    escapeValue: false, // React já faz escaping contra XSS
  },
})

/** Troca o idioma e persiste a preferência. */
export function changeLanguage(lng: SupportedLanguage): void {
  i18n.changeLanguage(lng)
  localStorage.setItem(LANGUAGE_STORAGE_KEY, lng)
}

export default i18n
