# Ancoro — Guia de Deploy

> Passo a passo para deploy em todos os ambientes.

**Autor:** Rafael Brito
**Versão:** 2.0
**Data:** Abril 2026
**Status:** Atualizado com infraestrutura multi-tenant

---

## Sumário

1. [Pré-requisitos](#1-pré-requisitos)
2. [Ambiente Local (dev)](#2-ambiente-local-dev)
3. [Ambiente Demo](#3-ambiente-demo)
4. [Ambiente QA](#4-ambiente-qa)
5. [Ambiente Produção](#5-ambiente-produção)
6. [Configuração de Secrets](#6-configuração-de-secrets)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Pré-requisitos

### Ferramentas Locais

```bash
# Verificar versões
node --version    # >= 18.0.0
npm --version     # >= 9.0.0
docker --version  # >= 24.0.0
git --version     # >= 2.40.0
```

### Contas Externas (criar antes do primeiro deploy)

| Serviço | URL | Plano | Uso |
|---------|-----|-------|-----|
| **Neon** | [neon.tech](https://neon.tech) | Free | PostgreSQL gerenciado |
| **Northflank** | [northflank.com](https://northflank.com) | Sandbox | Backend dev/demo/qa |
| **Railway** | [railway.app](https://railway.app) | Hobby ($5/mês) | Backend produção |
| **Sentry** | [sentry.io](https://sentry.io) | Free | Error tracking |
| **UptimeRobot** | [uptimerobot.com](https://uptimerobot.com) | Free | Monitoring |
| **Backblaze B2** | [backblaze.com](https://backblaze.com) | Free (10GB) | Backups |

### O que já está implementado

- [x] Docker Compose para PostgreSQL local
- [x] Helmet.js (security headers)
- [x] Rate limiting (global + auth)
- [x] Pino logging estruturado
- [x] Módulo de multi-tenancy (crypto, cache, resolver)
- [x] GitHub Actions workflows (pr-checks, deploy-qa, deploy-prod)
- [x] Modelos Tenant/TenantUser no schema

---

## 2. Ambiente Local (dev)

### 2.1 Primeira Configuração

```bash
# 1. Clonar repositório
git clone <repo-url> ancoro
cd ancoro

# 2. Instalar dependências
npm run install:all

# 3. Iniciar PostgreSQL via Docker
cd backend
npm run db:start

# 4. Verificar se PostgreSQL está rodando
docker ps
# Deve mostrar: ancoro-postgres

# 5. Gerar Prisma Client
npm run prisma:generate:postgres

# 6. Criar banco e aplicar migrations
npx prisma migrate dev --schema prisma/schema.prisma --name init

# 7. (Opcional) Popular com dados de exemplo
npm run prisma:seed
```

### 2.2 Desenvolvimento Diário

```bash
# Terminal 1: Backend
cd backend
npm run db:start  # Se Docker não estiver rodando
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Ou usar comando combinado (da raiz)
npm run dev
```

### 2.3 URLs Locais

| Serviço | URL |
|---------|-----|
| Backend API | http://localhost:3000 |
| Health Check | http://localhost:3000/health |
| Frontend (Vite) | http://localhost:5173 |
| Prisma Studio | http://localhost:5555 |
| WebSocket | ws://localhost:3000 |

### 2.4 Comandos Úteis

```bash
# Resetar banco (apaga todos os dados)
npm run db:reset

# Ver logs do PostgreSQL
docker logs ancoro-postgres

# Abrir Prisma Studio (GUI do banco)
npm run prisma:studio:postgres

# Parar PostgreSQL
npm run db:stop

# Usar SQLite ao invés de PostgreSQL (sem Docker)
npm run dev:sqlite
```

---

## 3. Ambiente Demo

### 3.1 Criar Projeto Neon

1. Acesse [console.neon.tech](https://console.neon.tech)
2. Criar novo projeto: `ancoro-demo`
3. Região: `US East (Ohio)` (menor latência para Brasil)
4. Copiar connection string (formato pooler):
   ```
   postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

### 3.2 Criar Serviço Northflank

1. Acesse [app.northflank.com](https://app.northflank.com)
2. Criar novo projeto: `ancoro`
3. Criar serviço: `backend-demo`
   - Tipo: **Combined** (build + run)
   - Source: GitHub (conectar repositório)
   - Branch: `develop`
   - Build context: `backend`
   - Dockerfile path: `backend/Dockerfile`
   - Port: 3000

4. Configurar variáveis de ambiente:
   ```env
   NODE_ENV=demo
   PORT=3000
   DATABASE_URL=<connection string do Neon>
   JWT_SECRET=<gerar: openssl rand -base64 32>
   JWT_EXPIRES_IN=7d
   DEMO_MODE=true
   DEMO_AUTO_SEED=true
   LOG_LEVEL=info
   CORS_ORIGIN=*
   ```

5. Deploy manual para testar

### 3.3 Configurar Auto-Deploy

No Northflank:
- Settings → Builds → Enable auto-build on push
- Branch: `develop`

### 3.4 Testar Deploy

```bash
# Health check
curl https://backend-demo.northflank.app/health

# Resposta esperada:
{
  "status": "ok",
  "environment": "demo",
  "isDemoMode": true
}
```

---

## 4. Ambiente QA

### 4.1 Criar Projeto Neon

1. Criar projeto: `ancoro-qa`
2. Copiar connection string

### 4.2 Criar Serviço Northflank

1. Criar serviço: `backend-qa`
2. Branch: `develop`
3. Variáveis:
   ```env
   NODE_ENV=staging
   PORT=3000
   DATABASE_URL=<connection string do Neon QA>
   JWT_SECRET=<diferente do demo>
   JWT_EXPIRES_IN=7d
   DEMO_MODE=false
   LOG_LEVEL=info
   CORS_ORIGIN=<URL do frontend QA>
   ```

### 4.3 Configurar GitHub Environment

1. GitHub → Settings → Environments → New: `qa`
2. Não requer aprovação (deploy automático)

### 4.4 Adicionar Secrets no GitHub

Settings → Secrets → Actions:

```
NEON_QA_DATABASE_URL=postgresql://...
```

### 4.5 Deploy Automático

O workflow `.github/workflows/deploy-qa.yml` já está configurado.

```bash
# Push em develop triggera deploy automático
git checkout develop
git merge feature/minha-feature
git push origin develop

# Verificar no GitHub Actions
```

---

## 5. Ambiente Produção

### 5.1 Arquitetura Multi-Tenant

```
┌─────────────────────────────────────────────────────────┐
│                    Railway (Backend)                     │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Tenant Resolver Middleware                       │    │
│  │ JWT → tenantSlug → Registry → Database URL      │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
          │                    │
          ▼                    ▼
┌──────────────────┐  ┌──────────────────┐
│ Tenant Registry  │  │ Tenant Database  │
│ (Neon Free)      │  │ (Neon Launch)    │
│                  │  │                  │
│ - slug           │  │ - projects       │
│ - db_url_enc     │  │ - requirements   │
│ - plan           │  │ - users          │
│ - status         │  │ - ...            │
└──────────────────┘  └──────────────────┘
```

### 5.2 Criar Projetos Neon

```bash
# 1. Tenant Registry (metadados de todos os clientes)
Projeto: ancoro-prod-tenant-registry
Plano: Free → Launch quando tiver clientes

# 2. Primeiro cliente (piloto)
Projeto: ancoro-prod-piloto
Plano: Launch ($19/mês)
```

### 5.3 Aplicar Schema no Registry

```bash
# Conectar ao registry e aplicar migrations
DATABASE_URL="<NEON_REGISTRY_URL>" npx prisma migrate deploy --schema prisma/schema.prisma
```

### 5.4 Criar Serviço Railway

1. Acesse [railway.app](https://railway.app)
2. New Project → Deploy from GitHub
3. Selecionar repositório, branch `main`
4. Settings:
   - Root Directory: `backend`
   - Build Command: `npm ci && npx prisma generate --schema prisma/schema.prisma && npm run build`
   - Start Command: `npm run start:prod`

5. Variables (todas obrigatórias):
   ```env
   NODE_ENV=production
   PORT=3000

   # Tenant Registry
   TENANT_REGISTRY_DATABASE_URL=<URL do registry>
   TENANT_REGISTRY_ENCRYPTION_KEY=<ver seção 6.1>

   # Auth
   JWT_SECRET=<gerar: openssl rand -base64 48>
   JWT_EXPIRES_IN=1d

   # Server
   LOG_LEVEL=info
   CORS_ORIGIN=https://app.ancoro.com.br
   ```

### 5.5 Configurar GitHub Environment

1. GitHub → Settings → Environments → New: `production`
2. **Required reviewers**: Adicionar seu username
3. **Deployment branches**: Only `main`

### 5.6 Adicionar Secrets de Produção

```
NEON_PROD_REGISTRY_URL=postgresql://...
TENANT_REGISTRY_ENCRYPTION_KEY=<base64 de 32 bytes>
RAILWAY_TOKEN=<token da API Railway>
BACKBLAZE_KEY_ID=<key id>
BACKBLAZE_APPLICATION_KEY=<app key>
BACKBLAZE_BUCKET_NAME=ancoro-backups
```

### 5.7 Registrar Primeiro Tenant

```bash
cd backend

# 1. Gerar chave de criptografia (se ainda não tiver)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# Salvar como TENANT_REGISTRY_ENCRYPTION_KEY

# 2. Criptografar URL do banco do cliente
TENANT_REGISTRY_ENCRYPTION_KEY="<sua_chave>" node -e "
const { encrypt } = require('./dist/tenancy/crypto');
const url = 'postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require';
console.log(encrypt(url));
"

# 3. Inserir no registry
DATABASE_URL="<REGISTRY_URL>" npx prisma studio --schema prisma/schema.prisma
```

No Prisma Studio, criar registro em `tenants`:
```json
{
  "slug": "piloto",
  "name": "Cliente Piloto",
  "databaseUrlEncrypted": "<output do passo 2>",
  "plan": "pilot",
  "status": "active"
}
```

### 5.8 Deploy para Produção

```bash
# 1. Garantir que develop está testado
git checkout develop
npm test

# 2. Merge para main
git checkout main
git merge develop
git push origin main

# 3. Aguardar aprovação no GitHub Actions
# GitHub → Actions → Deploy Production → Review deployments → Approve

# 4. Monitorar deploy
# Railway Dashboard → Deployments → View logs

# 5. Verificar
curl https://api.ancoro.com.br/health
```

---

## 6. Configuração de Secrets

### 6.1 Gerar Chaves Seguras

```bash
# JWT Secret (48 bytes)
openssl rand -base64 48

# Encryption Key para Tenant Registry (32 bytes para AES-256)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Senha forte para banco
openssl rand -base64 24
```

### 6.2 Checklist de Secrets por Ambiente

| Secret | Local | Demo | QA | Prod |
|--------|-------|------|----|----- |
| `DATABASE_URL` | .env | Northflank | Northflank | Railway |
| `JWT_SECRET` | .env | Northflank | Northflank | Railway |
| `NEON_DEMO_DATABASE_URL` | - | GitHub | - | - |
| `NEON_QA_DATABASE_URL` | - | - | GitHub | - |
| `NEON_PROD_REGISTRY_URL` | - | - | - | GitHub |
| `TENANT_REGISTRY_ENCRYPTION_KEY` | - | - | - | GitHub + Railway |
| `RAILWAY_TOKEN` | - | - | - | GitHub |
| `BACKBLAZE_*` | - | - | - | GitHub |

### 6.3 Rotação de Secrets

| Secret | Frequência | Procedimento |
|--------|------------|--------------|
| JWT_SECRET | Anual | Trocar variável → todos os tokens ativos são invalidados |
| ENCRYPTION_KEY | Anual | Re-criptografar todas URLs no registry ANTES de trocar |
| Database passwords | Anual | Trocar no Neon → atualizar connection strings |
| API Tokens | Anual | Gerar novo → atualizar secret → revogar antigo |

---

## 7. Troubleshooting

### 7.1 Docker não inicia

```bash
# Verificar se Docker Desktop está rodando
docker info

# Verificar porta 5432
netstat -an | findstr 5432

# Se ocupada, parar outro PostgreSQL
# Ou editar docker-compose.yml para usar outra porta
```

### 7.2 Erro de conexão com banco

```bash
# Testar conexão
DATABASE_URL="postgresql://..." npx prisma db pull --schema prisma/schema.prisma

# Para Neon: verificar se IP está liberado
# Dashboard → Settings → IP Allow → Add current IP
```

### 7.3 Migration falha

```bash
# Ver estado atual
npx prisma migrate status --schema prisma/schema.prisma

# Forçar reset (CUIDADO: apaga dados)
npx prisma migrate reset --force --schema prisma/schema.prisma

# Marcar migration como aplicada (se já existe no banco)
npx prisma migrate resolve --applied "20260421_xxx" --schema prisma/schema.prisma
```

### 7.4 Deploy Northflank falha

1. Dashboard → Services → backend-xxx → Logs
2. Verificar build: Dashboard → Builds
3. Erros comuns:
   - `prisma generate` falha: schema com erro de sintaxe
   - `Cannot find module`: dependência faltando no package.json
   - Port binding: verificar PORT=3000

### 7.5 Deploy Railway falha

1. Dashboard → Project → Deployments → View logs
2. Erros comuns:
   - Health check timeout: `/health` não responde em 30s
   - Memory limit: app usando mais que o plano permite
   - Build timeout: `npm ci` muito lento (limpar cache)

### 7.6 Tenant não resolve

```bash
# 1. Verificar se tenant existe
psql $TENANT_REGISTRY_DATABASE_URL -c "SELECT slug, status FROM tenants"

# 2. Verificar JWT (decodificar em jwt.io)
# Deve conter: { "userId": "...", "tenantSlug": "piloto" }

# 3. Verificar logs com debug
LOG_LEVEL=debug npm run dev
```

### 7.7 Rate limit bloqueando

```bash
# Verificar headers
curl -I https://api.ancoro.com.br/health

# Headers de rate limit:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 99
# X-RateLimit-Reset: <timestamp>

# Se bloqueado: aguardar 15 minutos
# Ou ajustar limites em backend/src/index.ts
```

---

## Checklist de Deploy

### Antes do Primeiro Deploy

- [ ] Conta Neon criada
- [ ] Projetos Neon: demo, qa, registry
- [ ] Conta Northflank criada
- [ ] Serviços Northflank: backend-demo, backend-qa
- [ ] GitHub Environments: qa, production
- [ ] Secrets configurados no GitHub Actions
- [ ] UptimeRobot monitorando /health

### Antes de Cada Deploy para Produção

- [ ] Testes passando localmente
- [ ] Testes passando no CI (PR checks)
- [ ] Migrations testadas em QA
- [ ] CHANGELOG atualizado
- [ ] Aprovador disponível

### Após Deploy para Produção

- [ ] Health check respondendo 200
- [ ] Logs sem erros (Railway → Logs)
- [ ] Sentry sem novos erros
- [ ] UptimeRobot verde
- [ ] Testar login com usuário real

---

## URLs e Status Pages

### Ambientes

| Ambiente | API | Frontend |
|----------|-----|----------|
| Local | http://localhost:3000 | http://localhost:5173 |
| Demo | https://backend-demo.northflank.app | - |
| QA | https://backend-qa.northflank.app | - |
| Prod | https://api.ancoro.com.br | https://app.ancoro.com.br |

### Status Pages (monitorar em caso de problemas)

- Neon: https://status.neon.tech
- Railway: https://status.railway.com
- Northflank: https://status.northflank.com
- GitHub: https://www.githubstatus.com

---

## Custos por Ambiente

| Ambiente | Neon | Backend | Total |
|----------|------|---------|-------|
| dev (local) | $0 | $0 | **$0** |
| demo | Free | Northflank Free | **$0** |
| qa | Free | Northflank Free | **$0** |
| prod (piloto) | $19 | Railway ~$5 | **~$24/mês** |
| prod (+ cliente) | +$19 | incluso | **+$19/mês** |

---

**Fim do documento.**

Para detalhes de arquitetura, ver [INFRASTRUCTURE_GUIDE.md](./INFRASTRUCTURE_GUIDE.md).
