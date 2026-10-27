/**
 * Notificação de novos leads comerciais (e-mail SMTP e/ou webhook Slack/Teams).
 *
 * Princípio: o lead é SEMPRE gravado no banco antes de notificar. Notificação é melhor-esforço —
 * se SMTP/webhook falhar, o lead não se perde (Lead.notifiedAt fica null e dá para reenviar).
 *
 * Variáveis de ambiente (todas opcionais; sem nenhuma, só loga):
 *  - LEADS_NOTIFY_TO      destinatário(s) do aviso, separados por vírgula
 *  - SMTP_HOST/PORT/USER/PASS/SECURE e SMTP_FROM
 *  - LEADS_WEBHOOK_URL    webhook (Slack/Teams/Discord: payload `{ text }`)
 *
 * [2026-10-24] Criado: aviso de lead por e-mail/webhook — Rafael Brito
 */
import nodemailer, { Transporter } from 'nodemailer'
import { logger } from '../utils/logger'

export interface LeadNotification {
  id: string
  interest: string
  name: string
  email: string
  company?: string | null
  phone?: string | null
  teamSize?: string | null
  deployment?: string | null
  message?: string | null
}

let transporter: Transporter | null | undefined

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env
  if (!SMTP_HOST) {
    transporter = null
    return transporter
  }
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: SMTP_SECURE === 'true', // 465 = true; 587 usa STARTTLS (secure=false)
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
    // Não deixa o request do formulário pendurado se o SMTP estiver fora
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  })
  return transporter
}

/** Remove quebras de linha: evita header injection em Subject/Reply-To vindos do usuário. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

function toText(lead: LeadNotification): string {
  return [
    `Novo lead (${lead.interest})`,
    `Nome: ${oneLine(lead.name)}`,
    `E-mail: ${lead.email}`,
    `Empresa: ${lead.company ?? '-'}`,
    `Telefone: ${lead.phone ?? '-'}`,
    `Equipe: ${lead.teamSize ?? '-'}`,
    `Implantação: ${lead.deployment ?? '-'}`,
    '',
    lead.message ?? '(sem mensagem)',
    '',
    `ID: ${lead.id}`,
  ].join('\n')
}

/**
 * Dispara os avisos configurados. Retorna true se ao menos um canal entregou.
 * Nunca lança: erros viram log.
 */
export async function notifyNewLead(lead: LeadNotification): Promise<boolean> {
  const text = toText(lead)
  let delivered = false

  const to = process.env.LEADS_NOTIFY_TO
  const mailer = getTransporter()
  if (mailer && to) {
    try {
      await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        replyTo: lead.email, // responder o aviso já endereça o lead
        subject: oneLine(`[Ancoro] Novo lead ${lead.interest}: ${lead.company || lead.name}`),
        text,
      })
      delivered = true
    } catch (err) {
      logger.error({ err, leadId: lead.id }, 'Lead e-mail notification failed')
    }
  }

  const webhook = process.env.LEADS_WEBHOOK_URL
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      delivered = true
    } catch (err) {
      logger.error({ err, leadId: lead.id }, 'Lead webhook notification failed')
    }
  }

  if (!mailer && !webhook) {
    logger.warn({ leadId: lead.id }, 'Lead saved but no notification channel configured (SMTP/webhook)')
  }
  return delivered
}
