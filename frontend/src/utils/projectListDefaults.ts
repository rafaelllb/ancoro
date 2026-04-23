export const DEFAULT_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pendente', color: '#64748B' },
  { value: 'IN_PROGRESS', label: 'Em Progresso', color: '#2563EB' },
  { value: 'VALIDATED', label: 'Validado', color: '#059669' },
  { value: 'APPROVED', label: 'Aprovado', color: '#0F766E' },
  { value: 'CONFLICT', label: 'Conflito', color: '#DC2626' },
  { value: 'REJECTED', label: 'Rejeitado', color: '#E11D48' },
] as const

export const DEFAULT_MODULE_OPTIONS = [
  { value: 'FI-CA', label: 'FI-CA - Contract Accounting' },
  { value: 'FI-AR', label: 'FI-AR - Accounts Receivable' },
  { value: 'FI-GL', label: 'FI-GL - General Ledger' },
  { value: 'ISU-BILLING', label: 'ISU-BILLING - Faturamento' },
  { value: 'ISU-BPEM', label: 'ISU-BPEM - Business Process Except. Mgmt' },
  { value: 'ISU-IDE', label: 'ISU-IDE - Installation & Device Mgmt' },
  { value: 'ISU-EDM', label: 'ISU-EDM - Energy Data Management' },
  { value: 'ISU-DM', label: 'ISU-DM - Device Management' },
  { value: 'ISU-CS', label: 'ISU-CS - Customer Service' },
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
] as const

export const DEFAULT_INTEGRATION_TYPE_OPTIONS = [
  { value: 'BAPI', label: 'BAPI' },
  { value: 'IDOC', label: 'iDoc' },
  { value: 'FILE', label: 'File' },
  { value: 'API', label: 'API' },
  { value: 'BATCH', label: 'Batch' },
  { value: 'OTHER', label: 'Other' },
] as const

export const DEFAULT_INTEGRATION_TIMING_OPTIONS = [
  { value: 'SYNC', label: 'Sync' },
  { value: 'ASYNC', label: 'Async' },
  { value: 'BATCH', label: 'Batch' },
  { value: 'EVENT', label: 'Event' },
  { value: 'REALTIME', label: 'Real-time' },
] as const

export function getStatusPresentation(code: string) {
  return (
    DEFAULT_STATUS_OPTIONS.find((status) => status.value === code) ?? {
      value: code,
      label: code,
      color: '#64748B',
    }
  )
}
