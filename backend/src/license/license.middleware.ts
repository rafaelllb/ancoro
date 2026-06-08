/**
 * License Middleware
 *
 * Middleware Express para verificação de licença e enforcement de features.
 * Usado em rotas que requerem features específicas do tier de licença.
 */

import { Request, Response, NextFunction } from 'express'
import {
  hasValidLicense,
  isFeatureEnabled,
  checkLimit,
  getLicenseInfo,
  getLicenseFeatures,
} from './license.service'
import { LicenseFeatures } from './license.types'
import { logger } from '../utils/logger'

/**
 * Middleware que bloqueia acesso se não houver licença válida.
 * Usado em rotas críticas que não devem funcionar sem licenciamento.
 *
 * Em modo on-premise: bloqueia se licença expirada/inválida
 * Em modo SaaS: bypassa (licenciamento gerenciado centralmente)
 */
export function requireValidLicense(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Em modo SaaS, licenciamento é por tenant no backend central
  const deploymentMode = process.env.DEPLOYMENT_MODE || 'saas'
  if (deploymentMode === 'saas') {
    return next()
  }

  if (!hasValidLicense()) {
    logger.warn({
      msg: 'Acesso bloqueado - licença inválida',
      path: req.path,
      method: req.method,
    })

    res.status(403).json({
      error: 'LICENSE_REQUIRED',
      message: 'Licença válida necessária para acessar este recurso',
      details: 'Entre em contato com o suporte para renovar sua licença',
    })
    return
  }

  // Verifica se está próximo de expirar (últimos 7 dias)
  const info = getLicenseInfo()
  if (info && info.daysRemaining <= 7 && info.daysRemaining > 0) {
    // Adiciona header de warning (não bloqueia)
    res.setHeader('X-License-Warning', `Licença expira em ${info.daysRemaining} dias`)
  }

  next()
}

/**
 * Factory para criar middleware que verifica uma feature específica.
 *
 * @param feature - Nome da feature a verificar
 * @param errorMessage - Mensagem de erro customizada (opcional)
 * @returns Middleware Express
 *
 * @example
 * router.post('/export/pdf', requireFeature('exportPdf'), exportController.pdf)
 */
export function requireFeature(
  feature: keyof LicenseFeatures,
  errorMessage?: string
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Em modo SaaS, features são controladas por outro mecanismo
    const deploymentMode = process.env.DEPLOYMENT_MODE || 'saas'
    if (deploymentMode === 'saas') {
      return next()
    }

    if (!isFeatureEnabled(feature)) {
      logger.info({
        msg: 'Feature bloqueada pela licença',
        feature,
        path: req.path,
      })

      res.status(403).json({
        error: 'FEATURE_NOT_AVAILABLE',
        message: errorMessage || `A feature "${feature}" não está disponível no seu plano`,
        feature,
        upgrade: 'Entre em contato para fazer upgrade do seu plano',
      })
      return
    }

    next()
  }
}

/**
 * Factory para criar middleware que verifica limites quantitativos.
 *
 * @param limitType - Tipo de limite a verificar
 * @param getCurrentCount - Função que retorna a contagem atual
 * @returns Middleware Express
 *
 * @example
 * router.post('/projects',
 *   requireLimit('maxProjects', async (req) => {
 *     return await prisma.project.count()
 *   }),
 *   projectController.create
 * )
 */
export function requireLimit(
  limitType: 'maxProjects' | 'maxUsersPerProject' | 'maxRequirementsPerProject',
  getCurrentCount: (req: Request) => Promise<number> | number
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Em modo SaaS, limites são controlados por tenant
    const deploymentMode = process.env.DEPLOYMENT_MODE || 'saas'
    if (deploymentMode === 'saas') {
      return next()
    }

    try {
      const currentCount = await getCurrentCount(req)
      const features = getLicenseFeatures()
      const limit = features[limitType]

      if (!checkLimit(limitType, currentCount)) {
        const limitLabels: Record<string, string> = {
          maxProjects: 'projetos',
          maxUsersPerProject: 'usuários por projeto',
          maxRequirementsPerProject: 'requisitos por projeto',
        }

        logger.info({
          msg: 'Limite da licença atingido',
          limitType,
          currentCount,
          limit,
        })

        res.status(403).json({
          error: 'LIMIT_REACHED',
          message: `Limite de ${limitLabels[limitType]} atingido (${currentCount}/${limit})`,
          limitType,
          currentCount,
          limit,
          upgrade: 'Entre em contato para aumentar seus limites',
        })
        return
      }

      next()
    } catch (err) {
      logger.error({ msg: 'Erro ao verificar limite', err })
      next(err)
    }
  }
}

/**
 * Middleware que adiciona informações da licença ao response.
 * Útil para debugging e para o frontend saber quais features estão disponíveis.
 */
export function attachLicenseInfo(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const deploymentMode = process.env.DEPLOYMENT_MODE || 'saas'

  if (deploymentMode === 'onpremise') {
    const info = getLicenseInfo()
    if (info) {
      // Adiciona headers com info da licença
      res.setHeader('X-License-Tier', info.tier)
      res.setHeader('X-License-Expires', info.expiresAt)
    }
  }

  next()
}

/**
 * Endpoint handler para retornar status da licença.
 * Usado pelo frontend para exibir informações do plano.
 */
export function licenseStatusHandler(
  req: Request,
  res: Response
): void {
  const deploymentMode = process.env.DEPLOYMENT_MODE || 'saas'

  if (deploymentMode === 'saas') {
    res.json({
      mode: 'saas',
      message: 'Licenciamento gerenciado centralmente',
    })
    return
  }

  const info = getLicenseInfo()

  if (!info) {
    res.status(400).json({
      mode: 'onpremise',
      valid: false,
      message: 'Nenhuma licença válida encontrada',
    })
    return
  }

  res.json({
    mode: 'onpremise',
    valid: true,
    customerName: info.customerName,
    tier: info.tier,
    expiresAt: info.expiresAt,
    daysRemaining: info.daysRemaining,
    features: info.features,
  })
}
