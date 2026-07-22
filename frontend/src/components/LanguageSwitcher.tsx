/**
 * LanguageSwitcher - Alternador de idioma (PT/EN).
 *
 * Troca o idioma via i18next e persiste a preferência em localStorage.
 * A mudança é reativa: todos os componentes que usam useTranslation()
 * re-renderizam automaticamente.
 */

import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  changeLanguage,
  SUPPORTED_LANGUAGES,
  SupportedLanguage,
} from '../i18n'

// Rótulo curto exibido no botão para cada idioma
const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  pt: 'PT',
  en: 'EN',
}

export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation('common')
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const current = (i18n.language.split('-')[0] as SupportedLanguage) || 'pt'

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (lng: SupportedLanguage) => {
    changeLanguage(lng)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-ancoro-navy-100 bg-white/85 px-2.5 py-2 text-sm font-medium text-ancoro-navy-700 shadow-sm transition hover:bg-ancoro-navy-50"
        aria-label={t('language.label')}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <svg className="h-4 w-4 text-ancoro-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
        </svg>
        {LANGUAGE_LABELS[current] ?? current.toUpperCase()}
        <svg className={`h-3.5 w-3.5 text-ancoro-navy-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 z-50 mt-2 w-36 overflow-hidden rounded-xl border border-ancoro-navy-100 bg-white/95 p-1 shadow-xl backdrop-blur"
          role="listbox"
        >
          {SUPPORTED_LANGUAGES.map((lng) => (
            <button
              key={lng}
              type="button"
              role="option"
              aria-selected={current === lng}
              onClick={() => handleSelect(lng)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                current === lng ? 'bg-ancoro-teal-50 text-ancoro-teal-700' : 'text-ancoro-navy-700 hover:bg-ancoro-navy-50'
              }`}
            >
              {t(`language.${lng}`)}
              <span className="text-xs font-semibold text-ancoro-navy-400">{LANGUAGE_LABELS[lng]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
