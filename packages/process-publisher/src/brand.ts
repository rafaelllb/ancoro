/**
 * Marca/tema do portal como CONFIGURAÇÃO (substitui o rebrand.ps1 + troca manual de CSS do Bizagi).
 *
 * [2026-10-14] Criado: Fase 3 — brand.json validado; vira variáveis CSS no <style> do index.html — Rafael Brito
 * Segurança: `tokens` só aceita nomes `--kebab-case` e valores de cor/medida simples (sem `;{}<>` nem url()),
 * porque o conteúdo vai para dentro de um <style>. Logo é lido do disco no publish (não vem de URL).
 */
import { z } from 'zod';

const TOKEN_NAME = /^--[a-z][a-z0-9-]*$/;
// cor (#abc, #aabbcc, rgb()/hsl()), medida simples, ou lista de fontes; nada de url(), expression(), ;, {}, <, >
const TOKEN_VALUE = /^[#a-zA-Z0-9 ,.%()'"\/-]{1,120}$/;
const UNSAFE = /url\s*\(|expression\s*\(|javascript:|@import/i;

export const BrandSchema = z.object({
  /** título no cabeçalho e no <title> */
  title: z.string().min(1).default('Process Portal'),
  subtitle: z.string().optional(),
  /** idioma inicial da interface do portal; o visitante pode trocar */
  lang: z.enum(['pt', 'en']).default('pt'),
  /** caminho (relativo ao brand.json ou absoluto) de uma imagem de logo; é otimizada no publish */
  logo: z.string().optional(),
  /** cor de destaque (atalho p/ --accent) */
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** sobrescrita de tokens CSS (inclui as cores dos shapes BPMN: --user, --service, --gateway...) — valem para o tema claro */
  tokens: z.record(z.string(), z.string()).default({}),
  /** sobrescrita só para o tema escuro */
  tokensDark: z.record(z.string(), z.string()).default({}),
  fontFamily: z.string().regex(TOKEN_VALUE).optional(),
  footer: z.string().max(300).optional(),
  /** data de publicação (ISO) mostrada no rodapé; EXPLÍCITA para o publish continuar determinístico (nada de "agora") */
  publishedAt: z.string().optional(),
  /** analytics só carrega se informado (opt-in) e respeita Do-Not-Track */
  analytics: z.object({ ga4: z.string().regex(/^G-[A-Z0-9]{4,}$/) }).optional(),
}).superRefine((b, ctx) => {
  for (const [group, map] of [['tokens', b.tokens], ['tokensDark', b.tokensDark]] as const) {
    for (const [k, v] of Object.entries(map)) {
      if (!TOKEN_NAME.test(k)) ctx.addIssue({ code: 'custom', path: [group, k], message: `nome de token inválido: ${k}` });
      if (!TOKEN_VALUE.test(v) || UNSAFE.test(v)) ctx.addIssue({ code: 'custom', path: [group, k], message: `valor de token não permitido em ${k}` });
    }
  }
});
export type Brand = z.infer<typeof BrandSchema>;
export type BrandInput = z.input<typeof BrandSchema>;

/**
 * CSS (para <style>) com os overrides da marca. Ordem estável => saída determinística.
 * Especificidade: os tokens do tema escuro do diagram.css têm (0,2,0) (`:root:not([data-theme=light])`, `:root[data-theme=dark]`).
 * `:root:root` (0,2,0, vindo DEPOIS) faz a marca valer nos DOIS temas; `tokensDark` usa (0,3,0) e vence só no escuro.
 */
export function brandCss(b: Brand): string {
  const light: Record<string, string> = { ...(b.accent ? { '--accent': b.accent } : {}), ...b.tokens };
  const dark: Record<string, string> = { ...b.tokensDark };
  const decl = (m: Record<string, string>) => Object.keys(m).sort().map((k) => `${k}:${m[k]}`).join(';');
  const font = b.fontFamily ? `body{font-family:${b.fontFamily}}` : '';
  const l = decl(light), d = decl(dark);
  return [
    l ? `:root:root{${l}}` : '',
    d ? `@media (prefers-color-scheme:dark){:root:not([data-theme=light]):root{${d}}}:root[data-theme=dark]:root{${d}}` : '',
    font,
  ].filter(Boolean).join(String.fromCharCode(10));
}

export const parseBrand = (input: unknown): Brand => BrandSchema.parse(input ?? {});
