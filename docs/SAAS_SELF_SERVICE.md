# SaaS Self-Service — decisões e trilha estigmérgica

> Criado em 2026-10-24 (Rafael Brito). Registro de decisões + o que falta para abrir a assinatura
> self-service (consultor independente / pequena equipe). Médio e grande porte seguem por contato
> comercial (`/planos` → `POST /api/leads`) e por implantação dedicada/on-premise.

## Decisões já tomadas

| Tema | Decisão |
|---|---|
| Pagamento | **Stripe Billing** (Checkout hospedado + Customer Portal; nunca formulário de cartão próprio) |
| Modelo comercial | Plano **único**, todas as funcionalidades (ver `config/entitlements.ts`); cobrança por assento a definir |
| Médio/grande porte | Formulário + e-mail/telefone diretos; implantação SaaS, dedicada ou on-premise (licença JWT) |
| Posicionamento | Ferramenta para **qualquer projeto**, com compatibilidade SAP destacada (seção em `/planos`) |
| Topologia | **Não** fazer "backend do fornecedor + banco do cliente": exigiria expor o banco do cliente à internet e adiciona latência por query. Quem quer dado no cliente usa on-premise completo |

## Infraestrutura alvo (recomendação)

Critérios: uso gratuito mensal generoso, segurança, escalabilidade. Os números de camada gratuita abaixo
são os que eu conhecia e **mudam com frequência — confirme nas páginas de preço antes de contratar**.

| Camada | Escolha | Por quê | Ressalva |
|---|---|---|---|
| Borda / front | **Cloudflare** (Pages, DNS, WAF, Turnstile, R2) | Estático com banda generosa, DDoS/WAF na frente, Turnstile (CAPTCHA grátis) substitui o honeypot, R2 sem custo de egress para backups | Origem da API deve aceitar tráfego só da Cloudflare |
| API | **Google Cloud Run** (região São Paulo) | Container pronto (Dockerfile existe), escala a zero, camada gratuita mensal, IAM e Secret Manager | Socket.io: usar `session-affinity` e, com mais de 1 instância, adapter Redis. Para sockets estáveis, `min-instances=1` (custa) |
| Banco | **Neon Postgres** (AWS sa-east-1, se disponível) | Escala a zero, PITR, branches (testar migration em cópia), API para criar projeto/banco por tenant | Limite de projetos por plano; acima de ~200 tenants avaliar schema compartilhado + RLS |
| E-mail | Resend ou Amazon SES | Transacional barato; SPF/DKIM/DMARC obrigatórios | — |
| Observabilidade | Sentry + uptime (Better Stack) + logs Pino do Cloud Run | Camadas gratuitas cobrem o início | — |
| Backup | `pg_dump` noturno → R2 com credencial separada + restore testado mensalmente | PITR do Neon não protege contra erro de conta/credencial | **Hoje inexistente** (job comentado em `deploy-prod.yml`) |

Alternativa descartada para produção paga: VM "always free" (Oracle) — generosa, mas é uma máquina única
sob sua administração, com risco de reclaim de conta; serve para staging.

## Trilha — o que falta para abrir o self-service (ordem sugerida)

- [ ] **Segurança/deploy primeiro:** `docker-entrypoint.sh` ainda usa `prisma db push --accept-data-loss`; criar migration baseline e
      usar `migrate deploy`. Backup automatizado com restore testado.
- [ ] **Multi-tenancy no request:** `backend/src/tenancy/` existe (resolver, cache de Prisma por tenant, criptografia da URL)
      mas **não está montado em `index.ts`**; hoje há um único `PrismaClient` global.
- [ ] **Entitlements por tenant:** `config/entitlements.ts` decide por variável de ambiente do deploy; passar a ler `Tenant.plan/status`.
- [ ] **Stripe:** Product/Price (assento), Checkout Session (endpoint autenticado), **webhook com assinatura verificada**
      (`checkout.session.completed`, `invoice.payment_failed`, `customer.subscription.deleted`) → provisiona/suspende tenant.
      Idempotência por `event.id`. Customer Portal para cartão/cancelamento.
- [ ] **Provisionamento:** criar banco/projeto do tenant, aplicar migrations, criar o admin, enviar e-mail de boas-vindas.
- [ ] **Ciclo de vida:** inadimplência → somente leitura → suspenso; **nunca apagar de imediato**; exportação de dados no cancelamento.
- [ ] **Trial:** definir (ex.: 14 dias sem cartão) e como o modo demo se relaciona com ele.
- [ ] **Jurídico/fiscal:** Termos, Privacidade (LGPD), DPA para empresas, emissão de NFS-e por cobrança (Stripe não emite).
- [ ] **Front:** em `pages/Plans.tsx`, trocar o CTA do card self-service pelo signup/checkout (ver TODO no topo do arquivo).
- [ ] **Antiabuso:** trocar o honeypot do formulário por Turnstile quando o tráfego justificar.

## Desenho da cobrança Stripe (decidido em 2026-10-24; ainda não implementado)

Base de padrões já provados em produção no ProsperIA (`C:\Users\rafae\OneDrive\Documentos\prosperIA_app`, backend Dart/Mercado Pago):
`backend/lib/services/billing_service.dart` (regras), `billing/webhook_verifier.dart` + `test/unit/services/webhook_verifier_test.dart`
(casos de teste: forjado, replay, duplicado), `test/integration/billing_test.dart`, `.github/workflows/backup-db.yml` (backup → R2),
`backend/deploy-cloudrun.ps1` (Secret Manager + Scheduler). **Não há código reaproveitável** (outra linguagem); reaproveita-se o desenho.

Regras a replicar com Stripe:
1. **Preço só no servidor.** O front escolhe um plano; os `price_...` do Stripe vêm de env (`STRIPE_PRICE_ID_*`), nunca do cliente.
2. **Webhook só "acorda".** Verificar a assinatura com `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)` — exige
   `express.raw` nessa rota, montada ANTES do `express.json()` em `index.ts` — e então **reconsultar** a subscription na API
   (`stripe.subscriptions.retrieve`) antes de alterar qualquer coisa. Nunca confiar no corpo do evento.
3. **Idempotência:** tabela `BillingEvent(eventId UNIQUE)`; evento já visto => 200 sem efeito. Resposta 5xx só para falha transitória (Stripe reenvia).
4. **Eventos:** `checkout.session.completed` (provisiona), `customer.subscription.updated|deleted`, `invoice.paid`,
   `invoice.payment_failed` (aviso por e-mail + carência), `charge.refunded` e `charge.dispute.created` (revogam).
5. **Direito calculado na hora:** tenant ativo se `status ∈ {active, trialing}` OU `past_due` dentro de N dias de carência; derivado de
   `currentPeriodEnd`, sem job de expiração. Implementar em `getEntitlements()` (hoje por env).
6. **Reconciliação** por hora (Cloud Run Job + Scheduler): webhooks se perdem. Compara subscriptions locais com a API do Stripe.
7. **Checkout:** reaproveitar sessão aberta recente e limitar tentativas por usuário (ProsperIA: 20 min e 5/dia). `client_reference_id` = id do tenant.
8. **Portal do cliente** (`billingPortal.sessions.create`) para cartão, fatura e cancelamento — não construir tela própria.
9. **Chaves:** `STRIPE_SECRET_KEY` (preferir *restricted key* `rk_` só com Checkout, Customers, Subscriptions, Portal), `STRIPE_WEBHOOK_SECRET`;
   ambas no Secret Manager. Desenvolver 100% em modo de teste; testar local com `stripe listen --forward-to localhost:3000/api/billing/webhook`.
10. **Pix/boleto:** confirmar na conta Stripe se estão habilitados para BRL antes de prometer; senão, só cartão.
11. **NFS-e:** o Stripe não emite nota fiscal brasileira. Integrar um emissor (ex.: eNotas, Focus NFe) ao evento `invoice.paid`, ou emitir manualmente no início.
12. **Âncora do billing:** usar `Tenant` (registro central, já com `plan`/`status`) + `stripeCustomerId`, `stripeSubscriptionId`,
    `currentPeriodEnd`, `seats`. Vale para banco-por-tenant e para RLS; a escolha entre os dois ainda está aberta (ver trilha).

## E-mail transacional (reaproveitar a conta Resend do ProsperIA)
O `leadNotifier` já fala SMTP. Com Resend: `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=587`, `SMTP_USER=resend`, `SMTP_PASS=<API key do Ancoro>`.
Usar **API key separada** e **domínio próprio do Ancoro** verificado (SPF/DKIM/DMARC); não enviar pelo domínio do ProsperIA.
