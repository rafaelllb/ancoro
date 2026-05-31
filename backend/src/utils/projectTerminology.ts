import { PrismaClient } from '@prisma/client'

export const DEFAULT_MODULE_LABEL = 'Área'

type ProjectTerminologyDb = {
  appConfig: PrismaClient['appConfig']
}

export function buildModuleLabelConfigKey(projectId: string) {
  return `project.${projectId}.moduleLabel`
}

export async function getProjectModuleLabel(prisma: ProjectTerminologyDb, projectId: string) {
  const config = await prisma.appConfig.findUnique({
    where: { key: buildModuleLabelConfigKey(projectId) },
    select: { value: true },
  })

  if (!config?.value) {
    return DEFAULT_MODULE_LABEL
  }

  const label = config.value.trim()
  return label || DEFAULT_MODULE_LABEL
}

export async function upsertProjectModuleLabel(
  prisma: ProjectTerminologyDb,
  projectId: string,
  label: string,
  userId?: string
) {
  const normalizedLabel = label.trim() || DEFAULT_MODULE_LABEL

  return prisma.appConfig.upsert({
    where: { key: buildModuleLabelConfigKey(projectId) },
    create: {
      key: buildModuleLabelConfigKey(projectId),
      value: normalizedLabel,
      valueType: 'STRING',
      category: 'UI',
      description: `Rótulo configurável do campo module para o projeto ${projectId}`,
      createdBy: userId,
      updatedBy: userId,
    },
    update: {
      value: normalizedLabel,
      updatedBy: userId,
      description: `Rótulo configurável do campo module para o projeto ${projectId}`,
    },
  })
}
