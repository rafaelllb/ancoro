# Ancoro — Guia de Arquitetura de Banco de Dados e Deploy

> **Documento operacional para Claude Code.** Este arquivo é a fonte da verdade sobre estratégia de bancos de dados, ambientes, deploy e DevOps do projeto Ancoro. Use como referência ao implementar qualquer mudança de infraestrutura.

**Autor:** Rafael Brito
**Versão:** 1.0
**Data:** Abril 2026
**Status:** Aprovado para implementação

---

## 0. Como Claude Code deve usar este documento

1. **Antes de qualquer mudança de infraestrutura**, releia a seção relevante deste documento.
2. **Não improvise** decisões arquiteturais. Se surgir um caso não coberto aqui, pergunte ao Rafael antes de agir.
3. **Princípio orientador**: maximizar uso de free tier durante validação do produto; pagar apenas quando houver uso real (clientes pagantes ou volume de dados que justifique).
4. **Princípio de segurança**: separação total entre dev/demo (descartáveis) e QA/produção (dados que importam).
5. **Princípio multi-tenant**: cada cliente tem seu próprio banco de dados. Sempre.
6. **Tarefas de implementação estão na seção 12** com checkboxes prontos para serem marcados.

---

## 1. Decisões arquiteturais já tomadas

Estas decisões NÃO devem ser questionadas sem conversa explícita com Rafael:

| Decisão | Escolha | Razão |
|---------|---------|-------|
| Modelo de tenancy | Banco-por-cliente | Isolamento máximo de dados de cliente SAP (confidencialidade) |
| Offline-first | Adiado para v2 | Validar produto online primeiro, evitar complexidade de sync engine |
| Real-time | Mantido (Socket.io) | Colaboração simultânea é diferencial chave |
| Banco em todos os ambientes | PostgreSQL (não SQLite) | Eliminar bugs do tipo "funciona em dev, quebra em QA" |
| ORM | Prisma (já adotado) | Mantém abstração e migrações versionadas |
| Estratégia de custo | Free tier máximo até primeiros pagantes | Validação antes de investimento |
| Plataforma de banco | Neon (todos os ambientes) | Free tier generoso (20 projetos, 0.5 GB cada), branching nativo, pooler embutido |
| Plataforma de backend | Northflank (free) → Railway (pago) | Northflank tem free tier 24/7 com WebSocket; Railway quando cliente real |
| CI/CD | GitHub Actions | Padrão de mercado, gratuito para projeto privado |

---

## 2. Mapa de ambientes

### 2.1 Visão geral

| Ambiente | Banco | Hospedagem backend | Custo/mês | Propósito |
|----------|-------|--------------------|-----------|-----------|
| **demo (local)** | PostgreSQL via Docker | localhost | US$ 0 | Desenvolvimento individual do Rafael |
| **demo** | Neon free (projeto `ancoro-demo`) | Northflank free | US$ 0 | Apresentações a prospects |
| **dev (compartilhado)** | Neon free (projeto `ancoro-dev`) | Northflank free | US$ 0 | Ambiente compartilhado para testes integrados |
| **qa** | Neon free (projeto `ancoro-qa`) | Northflank free | US$ 0 | Validação pré-produção, deve espelhar prod |
| **prod (piloto)** | Neon Launch (projeto `ancoro-prod-piloto`) | Railway Hobby | US$ 24 | Cliente piloto pagante |
| **prod (cliente N)** | Neon Launch (projeto `ancoro-prod-{cliente}`) | Mesmo Railway | +US$ 19/cliente | Clientes adicionais |

### 2.2 Características de cada ambiente

#### demo (local)
- **Bootstrap**: `docker compose up -d postgres` (script já existe ou deve ser criado)
- **String de conexão**: `postgresql://ancoro:ancoro@localhost:5432/ancoro_dev`
- **Seeds**: completo, incluindo cenários de teste
- **Reset**: comando `npm run db:reset` deve dropar e recriar do zero
- **Quem usa**: somente Rafael (ou outros devs no futuro)

#### dev (compartilhado)
- **Quando criar**: somente quando houver mais de uma pessoa desenvolvendo
- **Dados**: sintéticos, podem ser resetados a qualquer momento
- **Migrações**: aplicadas automaticamente em push para branch `develop`

#### demo
- **Dados**: dataset curado de cenário SAP Utilities (concessionária fictícia "Energia Vitalis")
- **Reset programado**: GitHub Actions toda segunda-feira 06:00 UTC restaura estado inicial
- **Schema**: pode estar uma versão à frente da produção (para demonstrar features novas)
- **Acesso**: somente time interno + Rafael
- **Branding**: banner "DEMO ENVIRONMENT" sempre visível no frontend

#### qa
- **Dados**: anonimizados a partir de produção, ou sintéticos volumosos
- **Schema**: deve ser idêntico a produção (mesma versão de migração aplicada)
- **Migrações**: aplicadas automaticamente em merge para `develop`
- **Smoke tests**: rodam após cada deploy
- **Acesso**: time + cliente piloto pode validar features pré-release

#### produção
- **Banco por cliente**: cada cliente é um projeto Neon separado
- **Migrações**: aplicadas via pipeline orquestrada (ver seção 6)
- **Backups**: Neon faz automaticamente (PITR de 24h no plano Launch, 7 dias no Scale)
- **Aprovação manual**: deploy só após aprovação no GitHub Environments
- **Acesso**: somente usuários autorizados pelo cliente

---

## 3. Estratégia de banco de dados

### 3.1 Tecnologia

**PostgreSQL 16** em todos os ambientes. Sem exceções.

**Por que NÃO SQLite mesmo em dev:**
- Comportamento divergente em transações concorrentes
- Tipos JSON funcionam diferente
- Full-text search incompatível
- Bugs encontrados em QA que não apareceram em dev custam mais que rodar Postgres local
- Custo de rodar Postgres local: 200 MB de RAM e um arquivo `docker-compose.yml`

### 3.2 Plataforma de banco gerenciado: Neon

**Por que Neon e não Supabase, Railway Postgres ou AWS RDS:**

1. **Free tier generoso e perene**: 20 projetos, 0.5 GB cada, 100 CU-hours por projeto, sem expirar
2. **Branching nativo**: criar branch do banco como branch no Git — perfeito para preview environments e debug de bugs reproduzíveis
3. **Scale-to-zero**: bancos inativos não cobram (ideal para clientes em fase de blueprint que usam pouco)
4. **Pooler embutido**: PgBouncer-compatible, sem necessidade de configurar separadamente
5. **API para criar databases programaticamente**: essencial para banco-por-cliente
6. **Backup automático**: PITR (Point In Time Recovery) incluso
7. **Pricing previsível**: por compute-hour real, não por instância provisionada
8. **Pós-Databricks (2025)**: redução de 15-25% nos custos de compute, storage caiu para US$ 0,35/GB-mês

**Limites do free tier (importante saber):**
- 0.5 GB por projeto (suficiente para dev/demo/qa de Ancoro)
- 100 CU-hours por projeto/mês (suficiente para uso intermitente)
- 10 branches por projeto
- 24h de history de PITR
- Sem cartão de crédito necessário, uso comercial permitido

**Quando migrar para Launch (US$ 19/projeto/mês):**
- Quando o projeto Neon precisar rodar 24/7 sob carga (cliente real em produção)
- Quando passar de 0.5 GB de storage
- Quando precisar de mais de 24h de PITR
- Quando precisar de SLA

### 3.3 Estrutura de projetos Neon

Use a convenção:

```
ancoro-dev          (Free)    — dev compartilhado
ancoro-demo         (Free)    — apresentações a prospects
ancoro-qa           (Free)    — validação pré-prod
ancoro-prod-tenant-registry  (Free→Launch)  — registro de tenants (qual tenant aponta para qual banco)
ancoro-prod-piloto  (Launch)  — cliente piloto
ancoro-prod-{cliente-slug}  (Launch)  — cada cliente novo
```

### 3.4 Tenant Registry (decisão importante)

Crie uma database **separada e pequena** chamada `ancoro-prod-tenant-registry` no Neon que armazena:

```sql
-- Schema do tenant registry
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  database_url_encrypted TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'pilot',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tenant_users (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, user_email)
);

CREATE INDEX idx_tenant_users_email ON tenant_users(user_email);
```

**Por que separar:**
- Lookup rápido de "qual banco usar" sem carregar Prisma client de tenant
- Auditoria centralizada de quem entrou em que tenant
- Possibilita um único usuário ter acesso a múltiplos tenants (consultor que atende 3 clientes)
- Evita acoplamento entre tenants (drop de cliente não afeta lookup de outros)

**Criptografia da `database_url_encrypted`:**
- Use AES-256-GCM com chave em variável de ambiente `TENANT_REGISTRY_ENCRYPTION_KEY`
- Chave deve ser rotacionada anualmente
- Nunca logar a string descriptografada

### 3.5 Resolução de tenant em runtime

Fluxo no backend:

1. Request chega com JWT contendo `userId` e `tenantSlug`
2. Middleware busca no tenant registry: `tenantSlug` → `database_url_encrypted`
3. Descriptografa a URL
4. Cria/recupera Prisma Client cacheado para aquela URL (pool de clients por tenant, max 10 clients vivos com LRU eviction)
5. Anexa o Prisma Client no `req.prisma`
6. Handler usa `req.prisma` normalmente — nunca acessa `prisma` global

**Crítico**: nunca instancie `new PrismaClient()` por request. Use cache LRU com tamanho limitado para evitar memory leak.

### 3.6 Migrações

**Ferramenta**: Prisma Migrate (já no stack).

**Workflow de schema:**

```
1. Rafael cria migração local: npx prisma migrate dev --name add_xxx
2. Commit da migração no Git
3. PR aprovada e merge para `develop`
4. CI aplica migração em ancoro-dev e ancoro-qa
5. Validação manual em qa
6. PR de develop → main
7. Aprovação manual no GitHub Environment "production"
8. CI aplica migração em ancoro-demo, depois em todos os tenants de produção em sequência
9. Se qualquer tenant falhar, pipeline para e notifica
```

**Script de migração orquestrada** (a ser criado em `scripts/migrate-all-tenants.ts`):

```typescript
// Pseudocódigo
async function migrateAllTenants() {
  const tenants = await registry.tenants.findMany({ where: { status: 'active' } });

  for (const tenant of tenants) {
    const dbUrl = decrypt(tenant.database_url_encrypted);
    console.log(`Migrating tenant: ${tenant.slug}`);

    try {
      await execSync(`DATABASE_URL=${dbUrl} npx prisma migrate deploy`);
      console.log(`✓ ${tenant.slug} migrated successfully`);
    } catch (err) {
      console.error(`✗ ${tenant.slug} FAILED: ${err}`);
      throw new Error(`Migration failed for tenant ${tenant.slug}. Pipeline halted.`);
    }
  }
}
```

**Nunca** use `prisma migrate dev` em ambientes não-locais. Sempre `prisma migrate deploy`.

### 3.7 Estratégia de dados entre ambientes

| De | Para | Permitido? | Como |
|----|------|------------|------|
| dev local | qa | ❌ Nunca | Dados descartáveis |
| qa | prod | ❌ Nunca | QA tem dados sintéticos/anonimizados |
| prod | qa | ✅ Sim, anonimizado | Neon branching + script de anonimização |
| prod | demo | ❌ Nunca | Demo tem dataset curado próprio |
| prod cliente A | prod cliente B | ❌ Absolutamente nunca | Isolamento legal |

**Script de anonimização** (a ser criado em `scripts/anonymize-prod-snapshot.ts`):

- Substitui nomes de usuários por nomes fakes (faker.js)
- Substitui emails por `user{id}@example.test`
- Mantém estrutura de requisitos mas substitui campos textuais (`what`, `why`, `howAsIs`, etc.) por lorem ipsum técnico
- Mantém IDs e relacionamentos (para reproduzir bugs estruturais)
- Remove evidências (arquivos externos não são copiados)

### 3.8 Backup e disaster recovery

**Para QA, demo, dev**: backup do Neon free tier (24h PITR) é suficiente. Se perder dados, recria do seed.

**Para produção**:

1. **Neon PITR**: ativo automaticamente (24h no Launch, 7 dias no Scale)
2. **Backup adicional semanal**: GitHub Action toda madrugada de domingo:
   - Para cada tenant ativo
   - Executa `pg_dump` para arquivo comprimido
   - Faz upload para Backblaze B2 (10 GB gratuitos) ou Cloudflare R2 (10 GB gratuitos, sem egress fee)
   - Retém 4 backups semanais (rolling)
3. **Teste de restore mensal**: Action automática que pega backup mais recente, restaura em projeto Neon temporário, valida integridade, deleta projeto

**Importante**: backup que nunca foi testado para restore não é backup. É tarefa de hope-driven engineering.

---

## 4. Plataforma de deploy do backend

### 4.1 Northflank (fase free, ambientes não-prod)

**Por que Northflank para dev compartilhado, demo, qa:**
- Free Sandbox tier com **always-on** (não tem cold start como Render)
- Suporta WebSocket nativamente (Socket.io funciona sem hack)
- Deploy via Git (GitHub integration)
- 2 services free + 2 databases free + 2 cron jobs free
- Requer cartão de crédito mas não cobra durante uso do free tier
- Métricas e logs incluídos

**Limitações a saber:**
- Egress: US$ 0,15/GB (atenção se houver upload/download pesado de evidências)
- Sem suporte garantido (comunidade ajuda)
- Comunidade menor que Railway/Render

### 4.2 Railway (produção, quando houver cliente pagante)

**Por que Railway para produção:**
- Hobby plan: US$ 5/mês com US$ 5 de créditos inclusos (cobre uso pequeno)
- Pro plan: US$ 20/mês quando precisar de mais recursos ou colaboradores
- Suporte robusto a WebSocket
- Excelente DX (deploy via Git, observabilidade integrada)
- Auto-rollback se health check falhar
- Logs por 7 dias (Hobby) ou 30 dias (Pro)

**Custo estimado por cliente em produção:**
- Backend: ~US$ 5-15/mês (Hobby cobre piloto)
- Banco Neon Launch: US$ 19/mês
- **Total por cliente**: ~US$ 24-34/mês

**Margem operacional alvo**: cliente pagando US$ 100/mês (5 usuários × US$ 20) = ~US$ 70/mês de margem por cliente.

### 4.3 Por que NÃO outras opções

- **Vercel**: serverless, não suporta WebSocket persistente. Use só para frontend web (se houver versão web futuramente).
- **Render free tier**: cold start de 15min e Socket.io desconecta após 5min. Inviável para colaboração real-time.
- **Fly.io**: removeu free tier. Considerar futuramente se precisar de multi-region (latência Brasil↔Espanha).
- **AWS/GCP/Azure**: overkill nesta fase. Considerar após 10+ clientes ou contratos enterprise.
- **Heroku**: removeu free tier em 2022 e ficou caro.
- **DigitalOcean App Platform**: alternativa válida (US$ 5-12/mês), mas Railway tem melhor DX.

### 4.4 Configuração do backend para multi-tenant

Variáveis de ambiente do backend:

```bash
# Conexão ao tenant registry (sempre obrigatória)
TENANT_REGISTRY_DATABASE_URL=postgresql://...

# Chave de criptografia do registry
TENANT_REGISTRY_ENCRYPTION_KEY=<base64 de 32 bytes>

# Para ambientes single-tenant (dev local, demo, qa) — opcional
DEFAULT_TENANT_DATABASE_URL=postgresql://...
DEFAULT_TENANT_SLUG=demo

# JWT
JWT_SECRET=<32+ chars>
JWT_REFRESH_SECRET=<32+ chars>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d

# Server
NODE_ENV=production
PORT=3000

# CORS
CORS_ORIGIN=https://app.ancoro.com.br

# Observability
LOG_LEVEL=info
SENTRY_DSN=https://...
```

---

## 5. Frontend (Electron)

### 5.1 Distribuição

- **Build**: `npm run electron:build` gera instaladores para Windows, macOS, Linux
- **Hospedagem dos binários**: GitHub Releases (gratuito, ilimitado para repos privados)
- **Auto-update**: implementar via `electron-updater` apontando para GitHub Releases
- **Assinatura de código**: certificado de code signing custa ~US$ 100/ano. Adiar até primeiros usuários reclamarem de aviso de "publisher unknown" no Windows.

### 5.2 Variáveis de ambiente do frontend

Build-time (definidas no GitHub Actions ao gerar o instalador):

```bash
VITE_API_URL=https://api-prod.ancoro.com.br  # ou api-qa, api-demo
VITE_APP_ENV=production|qa|demo|development
VITE_SHOW_ENV_INDICATOR=false  # true para qa/demo
VITE_SENTRY_DSN=https://...
```

### 5.3 Versão web (opcional, futuro)

Quando surgir demanda por uso pelo navegador (consultores em cliente sem permissão para instalar Electron):
- Hospedar em **Vercel free tier** (build do mesmo código React)
- Custo zero até 100 GB de bandwidth

---

## 6. CI/CD com GitHub Actions

### 6.1 Estrutura de pipelines

Três workflows distintos:

#### Workflow 1: `pr-checks.yml`
Trigger: toda PR aberta ou atualizada

```yaml
# Pseudo-estrutura
jobs:
  lint:
    - npm install
    - npm run lint
    - npm run typecheck

  test:
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: test }
    steps:
      - npm install
      - npx prisma migrate deploy
      - npm test -- --coverage
      - upload coverage to Codecov

  build:
    - npm run build:backend
    - npm run build:frontend
```

Bloqueia merge se qualquer job falhar.

#### Workflow 2: `deploy-qa.yml`
Trigger: push em `develop`

```yaml
jobs:
  migrate-qa:
    - npx prisma migrate deploy
    env: { DATABASE_URL: ${{ secrets.NEON_QA_URL }} }

  deploy-backend-qa:
    needs: migrate-qa
    - deploy to Northflank QA service via API

  smoke-tests:
    needs: deploy-backend-qa
    - run smoke test suite against QA URL

  notify:
    if: failure()
    - send Slack/Discord notification
```

#### Workflow 3: `deploy-prod.yml`
Trigger: push em `main`

```yaml
jobs:
  approval:
    environment: production  # exige aprovação manual configurada no GitHub
    - echo "Approved"

  backup-all-tenants:
    needs: approval
    - script que faz pg_dump de todos os tenants ativos
    - upload para Backblaze B2

  migrate-demo:
    needs: backup-all-tenants
    - npx prisma migrate deploy contra Neon demo

  migrate-all-tenants:
    needs: migrate-demo
    - executa scripts/migrate-all-tenants.ts
    - se qualquer tenant falhar, pipeline para

  deploy-backend-prod:
    needs: migrate-all-tenants
    - deploy to Railway production via API

  build-electron:
    needs: deploy-backend-prod
    - electron-builder para Windows/Mac/Linux
    - upload para GitHub Releases

  smoke-tests-prod:
    needs: deploy-backend-prod
    - smoke tests contra produção

  rollback:
    if: failure() && needs.deploy-backend-prod.result == 'success'
    - Railway rollback automático
    - notificação crítica
```

### 6.2 Secrets necessários no GitHub

```
NEON_API_KEY                         (criar bancos novos para clientes)
NEON_DEV_DATABASE_URL
NEON_DEMO_DATABASE_URL
NEON_QA_DATABASE_URL
NEON_PROD_REGISTRY_URL
TENANT_REGISTRY_ENCRYPTION_KEY

NORTHFLANK_API_TOKEN
RAILWAY_TOKEN

BACKBLAZE_KEY_ID
BACKBLAZE_APPLICATION_KEY
BACKBLAZE_BUCKET_NAME

SENTRY_AUTH_TOKEN

CODE_SIGNING_CERT_BASE64           (futuro)
CODE_SIGNING_CERT_PASSWORD         (futuro)

SLACK_WEBHOOK_URL                  (notificações)
```

### 6.3 GitHub Environments

Configurar três environments no GitHub:
- `qa`: deploy automático
- `demo`: deploy manual via workflow_dispatch
- `production`: requer aprovação manual de Rafael

---

## 7. Hardening de segurança

### 7.1 Obrigatório antes do primeiro cliente real

| Item | Implementação | Prioridade |
|------|---------------|------------|
| Helmet | `app.use(helmet())` | Crítica |
| Rate limiting global | `express-rate-limit` 100 req/15min por IP | Crítica |
| Rate limiting auth | 5 tentativas de login/15min por IP | Crítica |
| CORS estrito | Whitelist de origens, não `*` | Crítica |
| JWT refresh rotation | Refresh token rotaciona a cada uso | Crítica |
| Bcrypt rounds | 12 (já no stack) | OK |
| Logs estruturados | Pino com níveis | Alta |
| Error tracking | Sentry backend + frontend | Alta |
| Secrets management | Nunca em `.env` versionado | Crítica |
| HTTPS forçado | Northflank/Railway fazem nativamente | OK |
| SQL injection | Prisma protege por default | OK |
| XSS | React escape automático + CSP via Helmet | OK |
| Audit log | Já existe `change_logs`, expandir para auth events | Alta |
| Tenant isolation tests | Testes que tentam ler dados cross-tenant | Crítica |

### 7.2 Testes de isolamento de tenant

**O bug mais crítico possível** num produto B2B multi-tenant é vazamento de dados entre clientes. Implementar suite específica:

```typescript
// Pseudocódigo
describe('Tenant isolation', () => {
  it('user from tenant A cannot read data from tenant B', async () => {
    const userA = await createUserInTenant('tenant-a');
    const reqInB = await createRequirementInTenant('tenant-b');

    const response = await fetchWithAuth(`/api/requirements/${reqInB.id}`, userA.token);
    expect(response.status).toBe(404);  // ou 403, mas NUNCA 200
  });

  it('JWT signed for tenant A cannot be used to access tenant B endpoints', async () => {
    // ...
  });

  it('SQL injection attempting cross-tenant access is blocked', async () => {
    // ...
  });
});
```

### 7.3 Cobertura mínima de testes

Antes de qualquer cliente real em produção:
- **Auth**: 90%+
- **Tenant resolution**: 95%+
- **Requirements service**: 70%+
- **Cross-matrix**: 70%+
- **Outros services**: 50%+

Estado atual: 0%. **Este é o gap mais urgente.**

---

## 8. Observabilidade

### 8.1 Logs

- **Ferramenta**: Pino (estruturado, performático)
- **Destino**:
  - Northflank/Railway: logs nativos da plataforma (suficiente nas primeiras fases)
  - Futuro (quando volume crescer): Better Stack ou Axiom (free tiers generosos)

Padrão de log:

```typescript
logger.info({
  event: 'requirement.created',
  tenantId: req.tenantId,
  userId: req.userId,
  requirementId: result.id,
  durationMs: Date.now() - startTime
}, 'Requirement created');
```

**Nunca logar**: senhas, tokens, dados pessoais sensíveis (LGPD).

### 8.2 Métricas

- **Free**: dashboards nativos do Northflank/Railway
- **Próximo nível**: Grafana Cloud free tier (10k séries, 14 dias retenção)

Métricas-chave a monitorar:
- Latência p50/p95/p99 por endpoint
- Erros por minuto
- Conexões Socket.io ativas
- Conexões de banco por tenant
- Memória do processo (alerta se > 80%)

### 8.3 Erros

- **Sentry** (free tier: 5k erros/mês)
- Configurar tanto no backend quanto no frontend Electron
- Tag `tenant_slug` em todo evento para isolar issues por cliente

### 8.4 Uptime

- **UptimeRobot** ou **Better Stack** (free tier)
- Pingar `/health` a cada 5 minutos
- Alertar via email + Slack se downtime > 2 minutos

---

## 9. Estimativa de custos por fase

### Fase 1 — Validação (mês 0-3)
**Cenário**: dev + demo + qa em free tiers, sem cliente pagante ainda.

| Serviço | Plano | Custo |
|---------|-------|-------|
| Neon (dev, demo, qa, registry) | Free × 4 projetos | US$ 0 |
| Northflank (backend dev, qa, demo) | Free Sandbox | US$ 0 |
| GitHub Actions | Free (até 2000 min/mês em repo privado) | US$ 0 |
| Sentry | Free (5k events/mês) | US$ 0 |
| UptimeRobot | Free (50 monitors) | US$ 0 |
| Backblaze B2 | Free (10 GB) | US$ 0 |
| **TOTAL** | | **US$ 0/mês** |

### Fase 2 — Piloto (mês 3-6)
**Cenário**: 1 cliente real, validação interna.

| Serviço | Plano | Custo |
|---------|-------|-------|
| Neon (dev, demo, qa, registry) | Free | US$ 0 |
| Neon (`ancoro-prod-piloto`) | Launch | US$ 19 |
| Northflank (não-prod) | Free | US$ 0 |
| Railway (prod) | Hobby | US$ 5 |
| Demais serviços | Free | US$ 0 |
| **TOTAL** | | **~US$ 24/mês** |

### Fase 3 — Primeiros pagantes (mês 6-12)
**Cenário**: 3 clientes pagantes (2 early adopters).

| Serviço | Plano | Custo |
|---------|-------|-------|
| Neon (não-prod) | Free | US$ 0 |
| Neon (3 projetos prod) | Launch × 3 | US$ 57 |
| Railway | Hobby ou Pro | US$ 5-20 |
| Sentry | Free ou Team | US$ 0-26 |
| **TOTAL** | | **~US$ 60-100/mês** |

**Receita projetada Fase 3**: 3 clientes × 5 usuários × US$ 20 = **US$ 300/mês** (Pro tier)
**Margem operacional**: ~US$ 200-240/mês (saudável para SaaS B2B em validação)

### Fase 4 — Escala (mês 12+)
**Cenário**: 10+ clientes, considerar consolidação.

A partir de ~10 clientes, avaliar:
- Migrar tenant registry para plano pago (Launch)
- Considerar Northflank pago para colocar tudo num só vendor
- Avaliar reserved compute em vez de pay-as-you-go
- Adicionar Grafana Cloud para observabilidade unificada

---

## 10. Disaster recovery

### 10.1 Cenários a cobrir

| Cenário | RTO (Recovery Time) | RPO (Recovery Point) | Como |
|---------|---------------------|----------------------|------|
| Backend down | < 15 min | 0 | Railway auto-rollback ou redeploy manual |
| Banco de 1 tenant corrompido | < 1 hora | 24h (Launch) ou último backup semanal | Neon PITR ou restore de pg_dump |
| Banco de 1 tenant deletado por engano | < 2 horas | 24h ou último backup semanal | Restore de Backblaze B2 |
| Neon inteiro fora do ar | < 4 horas | 7 dias (último backup semanal) | Restore para outro provider (Supabase emergencial) |
| GitHub fora do ar | < 24 horas | Último push | Aguardar (impacto: sem deploys) |
| Comprometimento de credenciais | < 1 hora | 0 | Rotacionar todos os secrets, invalidar JWTs, forçar re-login |

### 10.2 Runbook básico (criar `docs/runbooks/` no repo)

Documentar passo-a-passo para cada cenário acima. Quando for 3 da manhã e algo quebrar, ninguém vai inventar solução elegante.

---

## 11. LGPD e compliance

### 11.1 Pontos de atenção

- **Dados pessoais coletados**: nome, email, senha (hash), papel
- **Dados de cliente armazenados**: requisitos de negócio (podem conter informação confidencial do cliente do cliente)
- **Base legal**: execução de contrato (cliente) e consentimento (futuros clientes)
- **Direito de exclusão**: implementar endpoint para exportar e deletar todos os dados de um usuário
- **DPA (Data Processing Agreement)**: necessário com cada cliente. Template a ser criado.
- **Localização dos dados**: Neon oferece regiões US East, US West, Europe (Frankfurt), Asia Pacific. Para cliente Brasil, considerar US East (latência ~150ms). Quando houver demanda regulatória, avaliar AWS São Paulo.

### 11.2 Próximos passos LGPD (não urgente até primeiro cliente externo)

- [ ] Política de privacidade pública
- [ ] Termo de uso
- [ ] DPA template
- [ ] Endpoint de exportação de dados pessoais (LGPD Art. 18)
- [ ] Endpoint de exclusão de dados pessoais
- [ ] Log de acessos a dados pessoais (auditoria)

---

## 12. Plano de implementação (checklist)

### Sprint 1 — Fundação (Semana 1-2)

- [ ] Criar `docker-compose.yml` na raiz com Postgres 16
- [ ] Atualizar `package.json` scripts: `db:start`, `db:stop`, `db:reset`
- [ ] Migrar Prisma schema de SQLite para PostgreSQL (verificar tipos `Int @id @default(autoincrement())`, JSON fields, etc.)
- [ ] Atualizar `.env.development` para apontar para Postgres local
- [ ] Rodar `prisma migrate dev` para gerar migração inicial em Postgres
- [ ] Testar que o app roda end-to-end com Postgres local
- [ ] Criar conta Neon
- [ ] Criar projetos: `ancoro-dev`, `ancoro-demo`, `ancoro-qa`, `ancoro-prod-tenant-registry`
- [ ] Aplicar schema do tenant registry no projeto `ancoro-prod-tenant-registry`
- [ ] Documentar URLs em `docs/CONNECTIONS.md` (privado, fora do Git)

### Sprint 2 — Multi-tenancy (Semana 2-3)

- [ ] Criar módulo `src/tenancy/` no backend
  - [ ] `tenant-registry.client.ts` — Prisma client para o registry
  - [ ] `tenant-resolver.middleware.ts` — middleware Express
  - [ ] `tenant-prisma-cache.ts` — cache LRU de Prisma clients
  - [ ] `crypto.ts` — encrypt/decrypt de database URLs
- [ ] Refatorar todos os services para receber `prisma` via dependency injection (não importar global)
- [ ] Criar suite de testes de isolamento de tenant
- [ ] Criar seed do tenant registry com tenants de dev/demo/qa
- [ ] Testar fluxo completo: login → JWT → resolução → query no banco do tenant correto

### Sprint 3 — CI/CD (Semana 3-4)

- [ ] Criar `.github/workflows/pr-checks.yml`
- [ ] Criar `.github/workflows/deploy-qa.yml`
- [ ] Criar `.github/workflows/deploy-prod.yml`
- [ ] Configurar GitHub Environments: `qa`, `demo`, `production`
- [ ] Adicionar todos os secrets necessários
- [ ] Criar conta Northflank, deploy do backend qa
- [ ] Testar pipeline completo: PR → merge develop → deploy QA automático
- [ ] Criar `scripts/migrate-all-tenants.ts`
- [ ] Criar `scripts/anonymize-prod-snapshot.ts`
- [ ] Criar `scripts/backup-all-tenants.ts`

### Sprint 4 — Hardening e demo (Semana 4-5)

- [ ] Implementar Helmet
- [ ] Implementar express-rate-limit
- [ ] Implementar Pino logging estruturado
- [ ] Configurar Sentry backend e frontend
- [ ] Implementar refresh token rotation
- [ ] Escrever testes para auth (90% coverage)
- [ ] Escrever testes para tenant resolution (95% coverage)
- [ ] Curar dataset de demo (cenário Energia Vitalis)
- [ ] Criar GitHub Action de reset semanal do demo
- [ ] Configurar UptimeRobot

### Sprint 5 — Pré-produção (Semana 5-6)

- [ ] Criar conta Railway, configurar projeto produção
- [ ] Criar conta Backblaze B2, bucket de backups
- [ ] Implementar GitHub Action de backup semanal
- [ ] Implementar GitHub Action de teste mensal de restore
- [ ] Criar runbooks em `docs/runbooks/`
- [ ] Criar projeto Neon Launch para piloto: `ancoro-prod-piloto`
- [ ] Inserir piloto no tenant registry
- [ ] Deploy de produção com aprovação manual
- [ ] Smoke tests em produção
- [ ] Onboarding do primeiro usuário

---

## 13. Decisões a revisitar no futuro

Não tomar agora, mas marcar para reavaliar em momentos específicos:

| Decisão | Reavaliar quando |
|---------|------------------|
| Implementar offline-first | Cliente pedir explicitamente OU validação de mercado completa |
| Migrar para Fly.io (multi-region) | Latência Brasil↔Espanha virar problema concreto |
| Code signing certificate | Primeira reclamação de usuário sobre aviso de "publisher unknown" |
| Migrar para AWS/GCP | Atingir 20+ clientes OU contrato enterprise exigir |
| Versão web do frontend | Cliente pedir acesso por navegador |
| Certificação ISO 27001 / SOC 2 | Cliente enterprise exigir |
| Implementar SSO (SAML/OIDC) | Cliente enterprise exigir |
| Cache distribuído (Redis) | Latência de queries virar problema |
| CDN para assets | Frontend web lançar |

---

## 14. Glossário

- **Tenant**: cliente do Ancoro (uma empresa que contratou o produto)
- **Tenant slug**: identificador URL-safe do tenant (ex: `seidor`, `petrobras`)
- **Tenant registry**: banco central que mapeia slug → connection string do banco do tenant
- **PITR**: Point In Time Recovery, restaurar banco para um momento específico no passado
- **Cold start**: tempo de "acordar" um servidor que estava em sleep (problema do free tier do Render)
- **CU-hours**: Compute Unit hours, métrica de cobrança do Neon
- **Branch (Neon)**: cópia instantânea de uma database, copy-on-write
- **Sandbox**: ambiente isolado, no contexto Northflank é o nome do free tier

---

## 15. Contatos e referências

**Documentação oficial:**
- Neon: https://neon.tech/docs
- Northflank: https://docs.northflank.com
- Railway: https://docs.railway.com
- Prisma multi-tenancy: https://www.prisma.io/docs/guides/database/multi-tenancy
- Socket.io scaling: https://socket.io/docs/v4/using-multiple-nodes/

**Status pages para monitorar:**
- https://status.neon.tech
- https://status.northflank.com
- https://status.railway.com
- https://www.githubstatus.com

---

**Fim do documento.**

Para mudanças em qualquer decisão arquitetural deste guia, abrir PR alterando este arquivo e marcar Rafael para review. Mudanças não-documentadas geram dívida arquitetural.
