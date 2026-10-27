/**
 * Envio de e-mail do login. Porta mínima (`Mailer`) para trocar o transporte sem tocar na regra de autenticação.
 * Em dev, sem SMTP, o conteúdo sai no console (NUNCA em produção — config.ts recusa subir assim).
 *
 * [2026-10-16] Criado: Fase 6 — login por código/link enviado por e-mail (decisão Rafael Brito) — Rafael Brito
 */
import nodemailer from 'nodemailer';
import type { Config } from './config.js';

export interface LoginMail { to: string; code: string; link: string; minutes: number }
export interface Mailer { sendLogin(mail: LoginMail): Promise<void> }

export function smtpMailer(cfg: Pick<Config, 'smtpUrl' | 'mailFrom'>): Mailer {
  const transport = nodemailer.createTransport(cfg.smtpUrl!);
  return {
    async sendLogin({ to, code, link, minutes }) {
      await transport.sendMail({
        from: cfg.mailFrom,
        to,
        subject: `Seu código de acesso: ${code}`,
        text: `Código de acesso: ${code}\n\nOu entre direto pelo link (válido por ${minutes} minutos):\n${link}\n\nSe você não pediu este acesso, ignore este e-mail.`,
        html:
          `<p>Código de acesso: <b style="font-size:20px;letter-spacing:3px">${code}</b></p>` +
          `<p>Ou <a href="${link}">entre direto por este link</a> (válido por ${minutes} minutos).</p>` +
          `<p style="color:#666">Se você não pediu este acesso, ignore este e-mail.</p>`,
      });
    },
  };
}

/** Dev: imprime no console. */
export function consoleMailer(): Mailer {
  return {
    async sendLogin({ to, code, link }) {
      console.log(`\n[mail] para ${to}\n[mail] código: ${code}\n[mail] link:   ${link}\n`);
    },
  };
}

/** Testes: guarda as mensagens para o teste ler o código. */
export function memoryMailer(): Mailer & { sent: LoginMail[] } {
  const sent: LoginMail[] = [];
  return { sent, async sendLogin(m) { sent.push(m); } };
}
