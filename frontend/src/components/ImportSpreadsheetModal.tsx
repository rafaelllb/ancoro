/**
 * SpreadsheetModal - Modal para importação e exportação de requisitos via planilha
 *
 * Funcionalidades:
 * - Importação: Upload de arquivo Excel (.xlsx) ou CSV
 * - Exportação: Download de planilha com requisitos existentes
 * - Parse automático com biblioteca xlsx
 * - Preview dos dados com validação por linha
 * - Auto-detecção de colunas baseado em headers conhecidos
 * - Importação em massa via API (upsert: cria ou atualiza se existir)
 */

import { useState, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useBulkImportRequirements } from '../hooks/useBulkImport'
import { BulkImportError, Requirement } from '../services/api'

// Tipos de operação do modal
type SpreadsheetMode = 'import' | 'export'

interface ImportSpreadsheetModalProps {
  isOpen: boolean
  onClose: () => void
  projectId: string
  mode?: SpreadsheetMode  // 'import' (default) ou 'export'
  requirements?: Requirement[]  // Requisitos para exportação
}

// Mapeamento de headers conhecidos para campos do requisito
// Suporta variações em português e inglês
const COLUMN_MAPPING: Record<string, string[]> = {
  reqId: ['reqid', 'req_id', 'id', 'requisito', 'req id', 'código', 'codigo'],
  shortDesc: ['shortdesc', 'short_desc', 'descricao', 'descrição', 'description', 'desc', 'titulo', 'título'],
  module: ['module', 'modulo', 'módulo', 'sap module', 'sap_module'],
  what: ['what', 'o que', 'oque', 'o_que'],
  why: ['why', 'por que', 'porque', 'por_que', 'porquê'],
  who: ['who', 'quem'],
  when: ['when', 'quando'],
  where: ['where', 'onde'],
  howToday: ['howtoday', 'how_today', 'como hoje', 'comohoje', 'como_hoje', 'how today', 'as-is', 'asis'],
  howMuch: ['howmuch', 'how_much', 'quanto', 'how much', 'volume', 'impacto'],
  dependsOn: ['dependson', 'depends_on', 'depende de', 'depende_de', 'dependede', 'dependências', 'dependencias'],
  providesFor: ['providesfor', 'provides_for', 'fornece para', 'fornece_para', 'fornecepara'],
  status: ['status', 'situação', 'situacao'],
  observations: ['observations', 'observacoes', 'observações', 'obs', 'notas', 'notes'],
  consultantNotes: ['consultantnotes', 'consultant_notes', 'duvidas', 'dúvidas', 'questões', 'questoes'],
}

// Campos obrigatórios
const REQUIRED_FIELDS = ['reqId', 'shortDesc', 'module', 'what', 'why', 'who', 'when', 'where', 'howToday', 'howMuch']

// Status válidos
const VALID_STATUS = ['PENDING', 'IN_PROGRESS', 'VALIDATED', 'APPROVED', 'CONFLICT', 'REJECTED']

// Módulos válidos
const VALID_MODULES = ['ISU', 'CRM', 'FICA', 'DEVICE', 'SD', 'MM', 'PM', 'OTHER']

interface ParsedRow {
  data: Record<string, any>
  errors: string[]
  isValid: boolean
  rowNumber: number
}

type Step = 'upload' | 'preview' | 'importing' | 'result'

// Auto-detecta mapeamento de colunas baseado nos headers do arquivo
function autoDetectMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {}

  headers.forEach((header, index) => {
    const normalizedHeader = header.toLowerCase().trim()

    for (const [field, aliases] of Object.entries(COLUMN_MAPPING)) {
      if (aliases.includes(normalizedHeader) || normalizedHeader === field.toLowerCase()) {
        mapping[field] = index
        break
      }
    }
  })

  return mapping
}

// Valida uma linha de dados
function validateRow(data: Record<string, any>, rowNumber: number): ParsedRow {
  const errors: string[] = []

  // Verificar campos obrigatórios
  for (const field of REQUIRED_FIELDS) {
    const value = data[field]
    if (!value || (typeof value === 'string' && !value.trim())) {
      errors.push(`Campo "${field}" obrigatório`)
    }
  }

  // Validar formato do reqId
  if (data.reqId && !/^REQ-\d{3,}$/.test(data.reqId)) {
    errors.push('reqId deve seguir formato REQ-001')
  }

  // Validar module
  if (data.module && !VALID_MODULES.includes(data.module.toUpperCase())) {
    errors.push(`module deve ser um de: ${VALID_MODULES.join(', ')}`)
  }

  // Validar status se fornecido
  if (data.status && !VALID_STATUS.includes(data.status.toUpperCase())) {
    errors.push(`status deve ser um de: ${VALID_STATUS.join(', ')}`)
  }

  // Validar tamanhos mínimos
  if (data.what && data.what.length < 10) errors.push('what deve ter mínimo 10 caracteres')
  if (data.why && data.why.length < 10) errors.push('why deve ter mínimo 10 caracteres')
  if (data.howToday && data.howToday.length < 10) errors.push('howToday deve ter mínimo 10 caracteres')
  if (data.who && data.who.length < 3) errors.push('who deve ter mínimo 3 caracteres')
  if (data.when && data.when.length < 3) errors.push('when deve ter mínimo 3 caracteres')
  if (data.where && data.where.length < 3) errors.push('where deve ter mínimo 3 caracteres')
  if (data.howMuch && data.howMuch.length < 3) errors.push('howMuch deve ter mínimo 3 caracteres')
  if (data.shortDesc && data.shortDesc.length > 50) errors.push('shortDesc deve ter máximo 50 caracteres')

  return {
    data,
    errors,
    isValid: errors.length === 0,
    rowNumber,
  }
}

// Converte string de dependências em array
function parseDependencies(value: any): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  return String(value)
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

// Headers para exportação (ordem das colunas no arquivo Excel)
const EXPORT_HEADERS = [
  'reqId',
  'shortDesc',
  'module',
  'what',
  'why',
  'who',
  'when',
  'where',
  'howToday',
  'howMuch',
  'dependsOn',
  'providesFor',
  'status',
  'observations',
  'consultantNotes',
]

// Labels amigáveis para os headers (primeira linha do Excel)
const HEADER_LABELS: Record<string, string> = {
  reqId: 'Req ID',
  shortDesc: 'Descrição',
  module: 'Módulo',
  what: 'O que',
  why: 'Por que',
  who: 'Quem',
  when: 'Quando',
  where: 'Onde',
  howToday: 'Como Hoje',
  howMuch: 'Quanto',
  dependsOn: 'Depende De',
  providesFor: 'Fornece Para',
  status: 'Status',
  observations: 'Observações',
  consultantNotes: 'Dúvidas',
}

export default function ImportSpreadsheetModal({
  isOpen,
  onClose,
  projectId,
  mode = 'import',
  requirements = [],
}: ImportSpreadsheetModalProps) {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({})
  const [serverErrors, setServerErrors] = useState<BulkImportError[]>([])
  const [importResult, setImportResult] = useState<{ success: boolean; created: number; updated: number; message: string } | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const bulkImportMutation = useBulkImportRequirements()

  // Reset estado ao fechar
  const handleClose = useCallback(() => {
    setStep('upload')
    setFile(null)
    setParsedRows([])
    setColumnMapping({})
    setServerErrors([])
    setImportResult(null)
    onClose()
  }, [onClose])

  // Função para exportar requisitos para Excel
  // Gera arquivo no mesmo formato esperado pela importação
  const handleExport = useCallback(() => {
    if (requirements.length === 0) {
      alert('Nenhum requisito para exportar')
      return
    }

    // Converte requisitos para formato tabular
    const data = requirements.map((req) => ({
      reqId: req.reqId,
      shortDesc: req.shortDesc,
      module: req.module,
      what: req.what,
      why: req.why,
      who: req.who,
      when: req.when,
      where: req.where,
      howToday: req.howToday,
      howMuch: req.howMuch,
      // Arrays são convertidos para string separada por vírgula
      dependsOn: Array.isArray(req.dependsOn) ? req.dependsOn.join(', ') : req.dependsOn || '',
      providesFor: Array.isArray(req.providesFor) ? req.providesFor.join(', ') : req.providesFor || '',
      status: req.status,
      observations: req.observations || '',
      consultantNotes: req.consultantNotes || '',
    }))

    // Cria worksheet com headers amigáveis
    const headers = EXPORT_HEADERS.map((h) => HEADER_LABELS[h] || h)
    const wsData = [headers, ...data.map((row) => EXPORT_HEADERS.map((h) => row[h as keyof typeof row]))]
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // Ajusta largura das colunas
    ws['!cols'] = EXPORT_HEADERS.map((h) => ({
      wch: h === 'what' || h === 'why' || h === 'howToday' ? 40 : 20,
    }))

    // Cria workbook e salva
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Requisitos')

    // Nome do arquivo com data
    const date = new Date().toISOString().split('T')[0]
    const filename = `requisitos_${date}.xlsx`

    XLSX.writeFile(wb, filename)
    handleClose()
  }, [requirements, handleClose])

  // Handler para upload de arquivo
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)

    try {
      const buffer = await selectedFile.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array' })

      // Pega primeira planilha
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]

      // Converte para JSON (primeira linha = headers)
      const jsonData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 })

      if (jsonData.length < 2) {
        throw new Error('Planilha deve ter pelo menos 1 linha de cabeçalho e 1 linha de dados')
      }

      // Primeira linha = headers
      const fileHeaders = (jsonData[0] as string[]).map((h) => String(h || '').trim())

      // Auto-detecta mapeamento
      const mapping = autoDetectMapping(fileHeaders)
      setColumnMapping(mapping)

      // Verifica se campos obrigatórios foram mapeados
      const missingFields = REQUIRED_FIELDS.filter((f) => mapping[f] === undefined)
      if (missingFields.length > 0) {
        console.warn('Campos não encontrados automaticamente:', missingFields)
      }

      // Parse das linhas de dados
      const rows: ParsedRow[] = []
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] as any[]

        // Pular linhas completamente vazias
        if (!row || row.every((cell) => !cell)) continue

        // Mapear valores para campos
        const rowData: Record<string, any> = {}
        for (const [field, colIndex] of Object.entries(mapping)) {
          let value = row[colIndex]

          // Converter para string e limpar
          if (value !== undefined && value !== null) {
            value = String(value).trim()
          } else {
            value = ''
          }

          // Tratamento especial para arrays
          if (field === 'dependsOn' || field === 'providesFor') {
            rowData[field] = parseDependencies(value)
          } else if (field === 'module') {
            rowData[field] = value.toUpperCase()
          } else if (field === 'status') {
            rowData[field] = value ? value.toUpperCase() : 'PENDING'
          } else {
            rowData[field] = value
          }
        }

        const parsedRow = validateRow(rowData, i + 1)
        rows.push(parsedRow)
      }

      setParsedRows(rows)
      setStep('preview')
    } catch (error) {
      console.error('Error parsing file:', error)
      alert(error instanceof Error ? error.message : 'Erro ao processar arquivo')
    }
  }, [])

  // Handler para drag & drop
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile && fileInputRef.current) {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(droppedFile)
      fileInputRef.current.files = dataTransfer.files
      handleFileChange({ target: fileInputRef.current } as any)
    }
  }, [handleFileChange])

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }, [])

  // Handler para importar
  const handleImport = useCallback(async () => {
    const validRows = parsedRows.filter((r) => r.isValid)
    if (validRows.length === 0) {
      alert('Nenhuma linha válida para importar')
      return
    }

    setStep('importing')
    setServerErrors([])

    const requirements = validRows.map((r) => ({
      reqId: r.data.reqId,
      shortDesc: r.data.shortDesc,
      module: r.data.module,
      what: r.data.what,
      why: r.data.why,
      who: r.data.who,
      when: r.data.when,
      where: r.data.where,
      howToday: r.data.howToday,
      howMuch: r.data.howMuch,
      dependsOn: r.data.dependsOn || [],
      providesFor: r.data.providesFor || [],
      status: r.data.status || 'PENDING',
      observations: r.data.observations,
      consultantNotes: r.data.consultantNotes,
    }))

    bulkImportMutation.mutate(
      { projectId, requirements },
      {
        onSuccess: (data) => {
          setImportResult({
            success: true,
            created: data.created,
            updated: data.updated || 0,
            message: data.message,
          })
          setStep('result')
        },
        onError: (error: any) => {
          const response = error.response?.data
          if (response?.errors) {
            setServerErrors(response.errors)
          }
          setImportResult({
            success: false,
            created: 0,
            updated: 0,
            message: response?.message || 'Erro na importação',
          })
          setStep('result')
        },
      }
    )
  }, [parsedRows, projectId, bulkImportMutation])

  if (!isOpen) return null

  const validCount = parsedRows.filter((r) => r.isValid).length
  const invalidCount = parsedRows.length - validCount
  const mappedFieldsCount = Object.keys(columnMapping).length

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-modal-title"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h2 id="import-modal-title" className="text-xl font-semibold text-gray-900">
              {mode === 'export' ? 'Exportar Requisitos para Planilha' : 'Importar Requisitos de Planilha'}
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded transition-colors"
              aria-label="Fechar modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Modo Exportação */}
            {mode === 'export' && (
              <div className="space-y-6">
                <div className="text-center py-8">
                  <svg
                    className="mx-auto h-16 w-16 text-teal-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  <h3 className="mt-4 text-lg font-medium text-gray-900">
                    Exportar {requirements.length} Requisito(s)
                  </h3>
                  <p className="mt-2 text-sm text-gray-500">
                    O arquivo Excel gerado pode ser editado e reimportado para atualizar os requisitos.
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-medium text-blue-900 mb-2">Colunas incluídas:</h4>
                  <div className="text-sm text-blue-700 font-mono bg-blue-100 rounded p-2 overflow-x-auto">
                    {EXPORT_HEADERS.map((h) => HEADER_LABELS[h] || h).join(' | ')}
                  </div>
                  <p className="text-sm text-blue-600 mt-2">
                    Ao reimportar, requisitos com o mesmo Req ID serão atualizados automaticamente.
                  </p>
                </div>
              </div>
            )}

            {/* Step: Upload (apenas para importação) */}
            {mode === 'import' && step === 'upload' && (
              <div className="space-y-6">
                {/* Dropzone */}
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-purple-500 transition-colors cursor-pointer"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg
                    className="mx-auto h-12 w-12 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="mt-4 text-lg text-gray-700">
                    Arraste o arquivo aqui ou clique para selecionar
                  </p>
                  <p className="mt-2 text-sm text-gray-500">
                    Suporta arquivos Excel (.xlsx) e CSV
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {/* Instruções de formato */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-medium text-blue-900 mb-2">Formato esperado:</h3>
                  <p className="text-sm text-blue-800 mb-2">
                    A primeira linha deve conter os cabeçalhos das colunas. Cabeçalhos reconhecidos:
                  </p>
                  <div className="text-sm text-blue-700 font-mono bg-blue-100 rounded p-2 overflow-x-auto">
                    reqId | shortDesc | module | what | why | who | when | where | howToday | howMuch | dependsOn | providesFor | status | observations
                  </div>
                  <p className="text-sm text-blue-600 mt-2">
                    Campos obrigatórios: reqId, shortDesc, module, what, why, who, when, where, howToday, howMuch
                  </p>
                </div>
              </div>
            )}

            {/* Step: Preview (apenas para importação) */}
            {mode === 'import' && step === 'preview' && (
              <div className="space-y-4">
                {/* Info do arquivo */}
                <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div>
                      <p className="font-medium text-gray-900">{file?.name}</p>
                      <p className="text-sm text-gray-500">
                        {parsedRows.length} linhas • {mappedFieldsCount} campos mapeados
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">{validCount}</p>
                      <p className="text-xs text-gray-500">válidas</p>
                    </div>
                    {invalidCount > 0 && (
                      <div className="text-center">
                        <p className="text-2xl font-bold text-red-600">{invalidCount}</p>
                        <p className="text-xs text-gray-500">com erros</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Aviso de campos não mapeados */}
                {REQUIRED_FIELDS.some((f) => columnMapping[f] === undefined) && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-800">
                      <strong>Atenção:</strong> Alguns campos obrigatórios não foram detectados automaticamente:
                      {' '}
                      {REQUIRED_FIELDS.filter((f) => columnMapping[f] === undefined).join(', ')}
                    </p>
                  </div>
                )}

                {/* Tabela de preview */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-96">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">#</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Status</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Req ID</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Descrição</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Módulo</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Erros</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {parsedRows.map((row) => (
                          <tr
                            key={row.rowNumber}
                            className={row.isValid ? '' : 'bg-red-50'}
                          >
                            <td className="px-3 py-2 text-gray-500">{row.rowNumber}</td>
                            <td className="px-3 py-2">
                              {row.isValid ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                  OK
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                  Erro
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 font-mono text-blue-600">{row.data.reqId || '—'}</td>
                            <td className="px-3 py-2 truncate max-w-xs">{row.data.shortDesc || '—'}</td>
                            <td className="px-3 py-2">{row.data.module || '—'}</td>
                            <td className="px-3 py-2 text-red-600 text-xs">
                              {row.errors.length > 0 && (
                                <ul className="list-disc list-inside">
                                  {row.errors.slice(0, 3).map((err, i) => (
                                    <li key={i}>{err}</li>
                                  ))}
                                  {row.errors.length > 3 && (
                                    <li>+{row.errors.length - 3} mais...</li>
                                  )}
                                </ul>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Step: Importing (apenas para importação) */}
            {mode === 'import' && step === 'importing' && (
              <div className="flex flex-col items-center justify-center py-12">
                <svg
                  className="animate-spin h-12 w-12 text-purple-600 mb-4"
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
                <p className="text-lg text-gray-700">Importando {validCount} requisitos...</p>
                <p className="text-sm text-gray-500 mt-2">Isso pode levar alguns segundos</p>
              </div>
            )}

            {/* Step: Result (apenas para importação) */}
            {mode === 'import' && step === 'result' && importResult && (
              <div className="space-y-6">
                {importResult.success ? (
                  <div className="text-center py-8">
                    <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                      <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Importação Concluída!</h3>
                    <p className="text-gray-600">{importResult.message}</p>
                    {/* Detalhes de criados/atualizados */}
                    <div className="flex justify-center gap-6 mt-4">
                      {importResult.created > 0 && (
                        <div className="text-center">
                          <p className="text-2xl font-bold text-green-600">{importResult.created}</p>
                          <p className="text-xs text-gray-500">criado(s)</p>
                        </div>
                      )}
                      {importResult.updated > 0 && (
                        <div className="text-center">
                          <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                          <p className="text-xs text-gray-500">atualizado(s)</p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="text-center py-4">
                      <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">Erro na Importação</h3>
                      <p className="text-gray-600">{importResult.message}</p>
                    </div>

                    {/* Lista de erros do servidor */}
                    {serverErrors.length > 0 && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-h-60 overflow-y-auto">
                        <h4 className="font-medium text-red-900 mb-2">Detalhes dos erros:</h4>
                        <ul className="space-y-2">
                          {serverErrors.map((err, i) => (
                            <li key={i} className="text-sm text-red-800">
                              <strong>Linha {err.row}{err.reqId ? ` (${err.reqId})` : ''}:</strong>
                              <ul className="list-disc list-inside ml-4">
                                {err.errors.map((e, j) => (
                                  <li key={j}>{e}</li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between items-center px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-500">
              {mode === 'import' && step === 'preview' && `${validCount} de ${parsedRows.length} linhas prontas para importar`}
              {mode === 'export' && `${requirements.length} requisito(s) serão exportados`}
            </div>
            <div className="flex gap-3">
              {/* Modo Exportação - botões */}
              {mode === 'export' && (
                <>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={requirements.length === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Exportar Planilha
                  </button>
                </>
              )}

              {/* Modo Importação - botões por step */}
              {mode === 'import' && step === 'upload' && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              )}

              {mode === 'import' && step === 'preview' && (
                <>
                  <button
                    type="button"
                    onClick={() => setStep('upload')}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={validCount === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Importar {validCount} Requisitos
                  </button>
                </>
              )}

              {mode === 'import' && step === 'result' && (
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Fechar
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
