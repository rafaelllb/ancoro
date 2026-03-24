/**
 * CreateRequirementModal - Modal para criação de novos requisitos
 *
 * Form completo com todos os campos 5W2H necessários para criar um requisito.
 * Utiliza o hook useCreateRequirement() já existente para a mutação.
 *
 * Suporta padrão de ID flexível por projeto (REQ-001, US-0001, PROJ1_001, etc.)
 */

import { useState, useEffect } from 'react'
import { useCreateRequirement } from '../hooks/useRequirements'
import { useProjectModules, useProjectStatuses } from '../hooks/useProjectLists'
import {
  RequirementIdPattern,
  DEFAULT_PATTERN,
  generateNextId,
  validateReqId,
  generateExample,
} from '../utils/reqIdPattern'

interface CreateRequirementModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  existingReqIds: string[] // Para gerar próximo reqId
  /** Padrão de ID do projeto. Se não fornecido, usa o padrão default (REQ-XXX) */
  reqIdPattern?: RequirementIdPattern
}

// Fallback: Módulos SAP para quando dados do projeto não estão disponíveis
// Alinhado com backend/src/utils/defaultLists.ts e frontend RequirementsGrid.tsx
const DEFAULT_SAP_MODULES = [
  // Financeiro
  { value: 'FI-CA', label: 'FI-CA - Contract Accounting' },
  { value: 'FI-AR', label: 'FI-AR - Accounts Receivable' },
  { value: 'FI-GL', label: 'FI-GL - General Ledger' },
  // ISU
  { value: 'ISU-BILLING', label: 'ISU-BILLING - Faturamento' },
  { value: 'ISU-BPEM', label: 'ISU-BPEM - Business Process Except. Mgmt' },
  { value: 'ISU-IDE', label: 'ISU-IDE - Installation & Device Mgmt' },
  { value: 'ISU-EDM', label: 'ISU-EDM - Energy Data Management' },
  { value: 'ISU-DM', label: 'ISU-DM - Device Management' },
  { value: 'ISU-CS', label: 'ISU-CS - Customer Service' },
  // Outros módulos
  { value: 'CRM', label: 'CRM - Customer Relationship' },
  { value: 'SD', label: 'SD - Sales & Distribution' },
  { value: 'MM', label: 'MM - Materials Management' },
  { value: 'PP', label: 'PP - Production Planning' },
  { value: 'PM', label: 'PM - Plant Maintenance' },
  { value: 'CO', label: 'CO - Controlling' },
  { value: 'HR', label: 'HR - Human Resources' },
  { value: 'CROSS', label: 'CROSS - Cross-Module' },
  { value: 'CUSTOM', label: 'Customizado' },
  { value: 'OTHER', label: 'Outro' },
]

// Fallback: Status para quando dados do projeto não estão disponíveis
const DEFAULT_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pendente' },
  { value: 'IN_PROGRESS', label: 'Em Progresso' },
  { value: 'VALIDATED', label: 'Validado' },
  { value: 'APPROVED', label: 'Aprovado' },
  { value: 'CONFLICT', label: 'Conflito' },
  { value: 'REJECTED', label: 'Rejeitado' },
]


// Estado inicial do formulário
const initialFormState = {
  reqId: '',
  shortDesc: '',
  module: 'ISU-BILLING',
  what: '',
  why: '',
  who: '',
  when: '',
  where: '',
  howToday: '',
  howMuch: '',
  dependsOn: '',
  providesFor: '',
  status: 'PENDING',
  observations: '',
  consultantNotes: '',
}

type FormState = typeof initialFormState

/**
 * Validação simples dos campos obrigatórios
 * @param form - Estado do formulário
 * @param pattern - Padrão de ID do projeto para validação do reqId
 */
function validateForm(form: FormState, pattern: RequirementIdPattern): Record<string, string> {
  const errors: Record<string, string> = {}

  // Valida reqId usando o padrão do projeto
  if (!validateReqId(form.reqId, pattern)) {
    const example = generateExample(pattern)
    errors.reqId = `Formato inválido. Use ${example}`
  }
  if (!form.shortDesc.trim()) {
    errors.shortDesc = 'Descrição obrigatória'
  } else if (form.shortDesc.length > 50) {
    errors.shortDesc = 'Máximo 50 caracteres'
  }
  if (form.what.length < 10) {
    errors.what = 'Mínimo 10 caracteres'
  }
  if (form.why.length < 10) {
    errors.why = 'Mínimo 10 caracteres'
  }
  if (form.who.length < 3) {
    errors.who = 'Mínimo 3 caracteres'
  }
  if (form.when.length < 3) {
    errors.when = 'Mínimo 3 caracteres'
  }
  if (form.where.length < 3) {
    errors.where = 'Mínimo 3 caracteres'
  }
  if (form.howToday.length < 10) {
    errors.howToday = 'Mínimo 10 caracteres'
  }
  if (form.howMuch.length < 3) {
    errors.howMuch = 'Mínimo 3 caracteres'
  }

  return errors
}

export default function CreateRequirementModal({
  isOpen,
  onClose,
  projectId,
  existingReqIds,
  reqIdPattern = DEFAULT_PATTERN,
}: CreateRequirementModalProps) {
  const [form, setForm] = useState<FormState>(initialFormState)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const createMutation = useCreateRequirement()

  // Busca módulos e status configurados para o projeto
  const { data: projectModules } = useProjectModules(projectId)
  const { data: projectStatuses } = useProjectStatuses(projectId)

  // Usa módulos do projeto se disponíveis, senão usa fallback
  const moduleOptions = projectModules?.length
    ? projectModules.map(m => ({ value: m.code, label: m.name }))
    : DEFAULT_SAP_MODULES

  // Usa status do projeto se disponíveis, senão usa fallback
  const statusOptions = projectStatuses?.length
    ? projectStatuses.map(s => ({ value: s.code, label: s.name }))
    : DEFAULT_STATUS_OPTIONS

  // Gera próximo reqId quando modal abre, usando padrão do projeto
  useEffect(() => {
    if (isOpen) {
      const nextReqId = generateNextId(reqIdPattern, existingReqIds)
      setForm({ ...initialFormState, reqId: nextReqId })
      setErrors({})
      setTouched({})
    }
  }, [isOpen, existingReqIds, reqIdPattern])

  // Handler para mudança de campo
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))

    // Valida campo ao modificar (se já foi tocado)
    if (touched[name]) {
      const newForm = { ...form, [name]: value }
      const newErrors = validateForm(newForm, reqIdPattern)
      setErrors((prev) => ({ ...prev, [name]: newErrors[name] || '' }))
    }
  }

  // Handler para blur (marca campo como tocado)
  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name } = e.target
    setTouched((prev) => ({ ...prev, [name]: true }))

    // Valida campo no blur
    const newErrors = validateForm(form, reqIdPattern)
    setErrors((prev) => ({ ...prev, [name]: newErrors[name] || '' }))
  }

  // Handler para submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // Valida todos os campos usando o padrão do projeto
    const formErrors = validateForm(form, reqIdPattern)
    setErrors(formErrors)

    // Marca todos como tocados
    const allTouched = Object.keys(form).reduce(
      (acc, key) => ({ ...acc, [key]: true }),
      {}
    )
    setTouched(allTouched)

    // Se há erros, não submete
    if (Object.keys(formErrors).length > 0) {
      return
    }

    // Prepara dados para envio
    const data = {
      reqId: form.reqId,
      projectId,
      shortDesc: form.shortDesc.trim(),
      module: form.module,
      what: form.what.trim(),
      why: form.why.trim(),
      who: form.who.trim(),
      when: form.when.trim(),
      where: form.where.trim(),
      howToday: form.howToday.trim(),
      howMuch: form.howMuch.trim(),
      dependsOn: form.dependsOn
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      providesFor: form.providesFor
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      status: form.status,
      observations: form.observations.trim() || undefined,
      consultantNotes: form.consultantNotes.trim() || undefined,
    }

    createMutation.mutate(data, {
      onSuccess: () => {
        onClose()
      },
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-requirement-title"
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 id="create-requirement-title" className="text-xl font-semibold text-gray-900">
              Novo Requisito
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded transition-colors"
              aria-label="Fechar modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-6 py-4">
            {/* Grid de 2 colunas para campos básicos */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Req ID */}
              <div>
                <label htmlFor="reqId" className="block text-sm font-medium text-gray-700 mb-1">
                  Req ID *
                </label>
                <input
                  type="text"
                  id="reqId"
                  name="reqId"
                  value={form.reqId}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                    errors.reqId && touched.reqId ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder={generateExample(reqIdPattern)}
                />
                {errors.reqId && touched.reqId && (
                  <p className="mt-1 text-sm text-red-600">{errors.reqId}</p>
                )}
              </div>

              {/* Módulo */}
              <div>
                <label htmlFor="module" className="block text-sm font-medium text-gray-700 mb-1">
                  Módulo SAP *
                </label>
                <select
                  id="module"
                  name="module"
                  value={form.module}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {moduleOptions.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Descrição curta */}
              <div className="md:col-span-2">
                <label htmlFor="shortDesc" className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição Curta * <span className="text-gray-400">(máx. 50 caracteres)</span>
                </label>
                <input
                  type="text"
                  id="shortDesc"
                  name="shortDesc"
                  value={form.shortDesc}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  maxLength={50}
                  className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.shortDesc && touched.shortDesc ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Resumo do requisito"
                />
                {errors.shortDesc && touched.shortDesc && (
                  <p className="mt-1 text-sm text-red-600">{errors.shortDesc}</p>
                )}
              </div>

              {/* Status */}
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {statusOptions.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Seção 5W2H */}
            <div className="border-t border-gray-200 pt-4 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">5W2H</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* What */}
                <div className="md:col-span-2">
                  <label htmlFor="what" className="block text-sm font-medium text-gray-700 mb-1">
                    What (O Que) * <span className="text-gray-400">(mín. 10 caracteres)</span>
                  </label>
                  <textarea
                    id="what"
                    name="what"
                    value={form.what}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.what && touched.what ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="O que precisa ser feito?"
                  />
                  {errors.what && touched.what && (
                    <p className="mt-1 text-sm text-red-600">{errors.what}</p>
                  )}
                </div>

                {/* Why */}
                <div className="md:col-span-2">
                  <label htmlFor="why" className="block text-sm font-medium text-gray-700 mb-1">
                    Why (Por Quê) * <span className="text-gray-400">(mín. 10 caracteres)</span>
                  </label>
                  <textarea
                    id="why"
                    name="why"
                    value={form.why}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.why && touched.why ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Por que isso é necessário?"
                  />
                  {errors.why && touched.why && (
                    <p className="mt-1 text-sm text-red-600">{errors.why}</p>
                  )}
                </div>

                {/* Who */}
                <div>
                  <label htmlFor="who" className="block text-sm font-medium text-gray-700 mb-1">
                    Who (Quem) *
                  </label>
                  <input
                    type="text"
                    id="who"
                    name="who"
                    value={form.who}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.who && touched.who ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Quem é responsável?"
                  />
                  {errors.who && touched.who && (
                    <p className="mt-1 text-sm text-red-600">{errors.who}</p>
                  )}
                </div>

                {/* When */}
                <div>
                  <label htmlFor="when" className="block text-sm font-medium text-gray-700 mb-1">
                    When (Quando) *
                  </label>
                  <input
                    type="text"
                    id="when"
                    name="when"
                    value={form.when}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.when && touched.when ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Quando deve ser feito?"
                  />
                  {errors.when && touched.when && (
                    <p className="mt-1 text-sm text-red-600">{errors.when}</p>
                  )}
                </div>

                {/* Where */}
                <div>
                  <label htmlFor="where" className="block text-sm font-medium text-gray-700 mb-1">
                    Where (Onde) *
                  </label>
                  <input
                    type="text"
                    id="where"
                    name="where"
                    value={form.where}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.where && touched.where ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Onde será implementado?"
                  />
                  {errors.where && touched.where && (
                    <p className="mt-1 text-sm text-red-600">{errors.where}</p>
                  )}
                </div>

                {/* How Much */}
                <div>
                  <label htmlFor="howMuch" className="block text-sm font-medium text-gray-700 mb-1">
                    How Much (Quanto) *
                  </label>
                  <input
                    type="text"
                    id="howMuch"
                    name="howMuch"
                    value={form.howMuch}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.howMuch && touched.howMuch ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Qual o impacto/volume?"
                  />
                  {errors.howMuch && touched.howMuch && (
                    <p className="mt-1 text-sm text-red-600">{errors.howMuch}</p>
                  )}
                </div>

                {/* How Today */}
                <div className="md:col-span-2">
                  <label htmlFor="howToday" className="block text-sm font-medium text-gray-700 mb-1">
                    How Today (Como é Hoje) * <span className="text-gray-400">(mín. 10 caracteres)</span>
                  </label>
                  <textarea
                    id="howToday"
                    name="howToday"
                    value={form.howToday}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    rows={3}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.howToday && touched.howToday ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Como o processo funciona atualmente?"
                  />
                  {errors.howToday && touched.howToday && (
                    <p className="mt-1 text-sm text-red-600">{errors.howToday}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Seção Dependências */}
            <div className="border-t border-gray-200 pt-4 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Dependências</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Depende De */}
                <div>
                  <label htmlFor="dependsOn" className="block text-sm font-medium text-gray-700 mb-1">
                    Depende De <span className="text-gray-400">(separado por vírgula)</span>
                  </label>
                  <input
                    type="text"
                    id="dependsOn"
                    name="dependsOn"
                    value={form.dependsOn}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`${generateExample(reqIdPattern)}, ...`}
                  />
                </div>

                {/* Fornece Para */}
                <div>
                  <label htmlFor="providesFor" className="block text-sm font-medium text-gray-700 mb-1">
                    Fornece Para <span className="text-gray-400">(separado por vírgula)</span>
                  </label>
                  <input
                    type="text"
                    id="providesFor"
                    name="providesFor"
                    value={form.providesFor}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`${generateExample(reqIdPattern)}, ...`}
                  />
                </div>
              </div>
            </div>

            {/* Seção Observações */}
            <div className="border-t border-gray-200 pt-4 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Observações</h3>

              <div className="grid grid-cols-1 gap-4">
                {/* Dúvidas do Consultor */}
                <div>
                  <label htmlFor="consultantNotes" className="block text-sm font-medium text-gray-700 mb-1">
                    Dúvidas / Notas do Consultor
                  </label>
                  <textarea
                    id="consultantNotes"
                    name="consultantNotes"
                    value={form.consultantNotes}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Pontos a esclarecer com o cliente..."
                  />
                </div>

                {/* Observações gerais */}
                <div>
                  <label htmlFor="observations" className="block text-sm font-medium text-gray-700 mb-1">
                    Observações Gerais
                  </label>
                  <textarea
                    id="observations"
                    name="observations"
                    value={form.observations}
                    onChange={handleChange}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Informações adicionais..."
                  />
                </div>
              </div>
            </div>

            {/* Botões */}
            <div className="sticky bottom-0 bg-white border-t border-gray-200 -mx-6 px-6 py-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={createMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {createMutation.isPending && (
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                )}
                Criar Requisito
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
