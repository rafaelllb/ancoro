/**
 * License Module
 *
 * Sistema de licenciamento offline para deployments on-premise.
 * Usa JWT assinado com RS256 para validação sem internet.
 */

// Tipos
export * from './license.types'

// Serviço principal
export {
  validateLicenseToken,
  loadLicenseFromFile,
  initializeLicense,
  getCurrentLicense,
  hasValidLicense,
  getLicenseFeatures,
  isFeatureEnabled,
  checkLimit,
  getLicenseInfo,
  resetLicenseState,
  // Ambiente
  getEnvironmentType,
  isEnvironmentAllowed,
  validateEnvironment,
} from './license.service'

// Middlewares
export {
  requireValidLicense,
  requireFeature,
  requireLimit,
  attachLicenseInfo,
  licenseStatusHandler,
} from './license.middleware'
