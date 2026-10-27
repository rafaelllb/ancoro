/**
 * Entitlements — o que a instalação/assinatura atual tem direito de usar.
 *
 * Modelo comercial (decisão Rafael Brito, 2026-10-16): contratação ÚNICA com todas as funcionalidades
 * (sem tiers por feature). Logo o Process Studio é um liga/desliga binário: assinante vê, não-assinante
 * (free/trial) não vê nada — nem menu, nem aba, nem rota.
 *
 * Regras (da mais forte para a mais fraca):
 *  1. On-premise: exige licença válida (o JWT da licença É a assinatura).
 *  2. `PROCESS_STUDIO_ENABLED=true|false` decide explicitamente (provisionamento do deploy/tenant).
 *  3. Sem a variável: ligado em dev/demo/test, DESLIGADO em produção (fail-closed: ninguém ganha o
 *     módulo por esquecimento de configuração).
 *
 * [2026-10-16] Criado: gate de assinatura do Process Studio — Rafael Brito
 */
import { deploymentMode } from './deployment-mode'
import { hasValidLicense } from '../license'

export interface Entitlements {
  processStudio: boolean
}

/** Lê booleano de env; `undefined` quando ausente/inválido (para cair no default do ambiente). */
function envFlag(name: string): boolean | undefined {
  const raw = process.env[name]?.trim().toLowerCase()
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return undefined
}

export function isProcessStudioEnabled(): boolean {
  if (deploymentMode === 'onpremise' && !hasValidLicense()) return false
  const explicit = envFlag('PROCESS_STUDIO_ENABLED')
  if (explicit !== undefined) return explicit
  return process.env.NODE_ENV !== 'production'
}

// TODO [ESTIGMERGIA]: assinatura por tenant no SaaS
// - Hoje o plano é por deploy (env). Quando o tenant registry (Tenant.plan/status) entrar no caminho
//   das requisições, resolver aqui por req.tenant (status === 'active' && assinatura paga) e manter
//   esta função como fallback. O contrato com o frontend (GET /api/entitlements) não muda.
//   [2026-10-24] Contexto: o self-service (Stripe Billing) depende disto — o webhook de pagamento grava plan/status em Tenant e esta
//   função passa a ser a única ponte entre "pagou" e "vê o módulo". Trilha completa em docs/SAAS_SELF_SERVICE.md.
export function getEntitlements(): Entitlements {
  return { processStudio: isProcessStudioEnabled() }
}
