import { useMemo } from 'react'
import { useProjectSettings } from './useProjects'

const DEFAULT_MODULE_LABEL = 'Área'

function normalizeLabel(label?: string | null) {
  const normalized = label?.trim()
  return normalized || DEFAULT_MODULE_LABEL
}

export function useProjectTerminology(projectId?: string) {
  const { data: settings } = useProjectSettings(projectId || '')

  return useMemo(() => {
    const moduleLabel = normalizeLabel(settings?.moduleLabel)
    return {
      moduleLabel,
      moduleLabelPlural: `${moduleLabel}s`,
    }
  }, [settings?.moduleLabel])
}
