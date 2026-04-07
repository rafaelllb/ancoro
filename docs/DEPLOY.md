# Deploy Ancoro - Staging e Produção

## Sumário

| Fase | Estado | Esforço |
|------|--------|---------|
| **Staging/Demo** | Pronto | 1-2 dias |
| **Produção MVP** | Precisa ajustes | 3-4 semanas |
| **Produção Enterprise** | Não pronto | 6-8 semanas |

---

## Estado Atual - Pronto para Staging

A aplicação já tem:
- Configuração multi-ambiente pronta (`.env.demo`, `.env.staging`)
- Build scripts funcionais (`npm run build`)
- SQLite como banco (simplifica staging)
- Autenticação JWT funcional
- Features core completas

---

## Opções de Deploy - Staging (Free Tier)

### Opção A: Render + Neon (Recomendado - 100% Free)
- **Servidor:** Render free tier (750h/mês)
- **Banco:** Neon PostgreSQL (512MB, sem expiração)
- **Trade-off:** Cold start ~30s, aceitável para staging

### Opção B: Fly.io + Supabase
- **Servidor:** Fly.io (3 VMs grátis, sem cold start)
- **Banco:** Supabase PostgreSQL (500MB)
- **Trade-off:** Fly requer cartão, Supabase pausa após 7 dias inativo

### Opção C: Railway Trial
- $5 crédito inicial sem cartão
- Banco incluído, setup mais simples
- Temporário (algumas semanas)

### Opção D: Electron Desktop Only
- Sem servidor, distribui app direto
- Cada usuário tem banco local (sem colaboração)

---

## Plano de Execução - Staging (Render + Neon + Vercel)

### Passo 1: Ajustar CORS do Socket.io

Modificar `backend/src/services/notificationService.ts`:

```typescript
cors: {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  methods: ['GET', 'POST'],
  credentials: true,
}
```

### Passo 2: Criar Dockerfile (backend)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY prisma ./prisma
RUN npx prisma generate
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

### Passo 3: Provisionar Neon PostgreSQL

1. Criar conta em https://neon.tech
2. Criar projeto "ancoro-staging"
3. Copiar connection string (formato: `postgresql://user:pass@host/db?sslmode=require`)

### Passo 4: Deploy Backend no Render

1. Criar conta em https://render.com
2. New → Web Service → Connect GitHub repo
3. **Root Directory:** `backend`
4. **Build Command:** `npm install && npm run build && npx prisma migrate deploy`
5. **Start Command:** `npm run start:staging`
6. **Environment Variables:**
   - `NODE_ENV=staging`
   - `DATABASE_URL=[connection string do Neon]`
   - `JWT_SECRET=[gerar com: openssl rand -base64 32]`
   - `CORS_ORIGIN=https://seu-app.vercel.app`
   - `PORT=3001`
   - `LOG_LEVEL=info`

### Passo 5: Deploy Frontend no Vercel

1. Criar conta em https://vercel.com
2. Import → GitHub repo
3. **Root Directory:** `frontend`
4. **Framework:** Vite
5. **Environment Variables:**
   - `VITE_API_URL=https://seu-backend.onrender.com`
   - `VITE_SOCKET_URL=https://seu-backend.onrender.com`

### Passo 6: Rodar Migration + Seed

No Render, após primeiro deploy:

```bash
# Via Render Shell ou localmente com DATABASE_URL apontando para Neon
npx prisma migrate deploy
npx prisma db seed
```

### Passo 7: Testar

- [ ] `GET https://backend.onrender.com/health` → status ok
- [ ] Login no frontend → JWT funciona
- [ ] Criar requisito → Socket.io notifica
- [ ] Cross-Matrix gera corretamente

---

## Arquivos a Criar/Modificar (Staging)

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `backend/Dockerfile` | Criar | Container para Render |
| `backend/src/services/notificationService.ts` | Modificar | CORS via env var |
| `frontend/.env.staging` | Atualizar | URLs do Render |

---

# FASE 2: PRODUÇÃO

## O Que Falta para Produção

### Blockers Críticos

#### 1. Testes (2-3 semanas)

- Zero cobertura atual
- Necessário: unitários + integração (mínimo 70%)
- Arquivos críticos a testar:
  - `crossMatrixService.ts` - Lógica complexa de dependências
  - `auth.ts` - Autenticação
  - `requirements.ts` - CRUD principal

#### 2. Segurança Operacional (1 semana)

**JWT Fallback Perigoso** em `auth.ts`:

```typescript
// ATUAL - Se ENV falhar, usa secret hardcoded
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production'

// CORRIGIR - Fail fast em produção
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET required in production')
}
```

**Rate Limiting** - Adicionar em `/api/auth/login`:

```typescript
import rateLimit from 'express-rate-limit'
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 5 })
app.use('/api/auth', authLimiter)
```

**Headers de Segurança** - Adicionar helmet.js:

```typescript
import helmet from 'helmet'
app.use(helmet())
```

#### 3. Logging Estruturado (3-4 dias)

- Substituir `console.log` por Winston/Pino
- Adicionar correlation IDs
- Integrar error tracking (Sentry)

#### 4. CI/CD (2-3 dias)

- GitHub Actions para:
  - Rodar testes em cada PR
  - Build automático
  - Deploy para staging/prod

#### 5. Infraestrutura (1 semana)

- Dockerfile otimizado (multi-stage)
- PostgreSQL com connection pooling
- Backup automatizado do banco
- SSL/TLS configurado

---

## Plano de Execução - Produção

### Semana 1-2: Segurança + Observabilidade

- [ ] Remover JWT fallback (fail fast)
- [ ] Adicionar rate limiting
- [ ] Adicionar helmet.js
- [ ] Implementar Winston/Pino logging
- [ ] Integrar Sentry

### Semana 3-4: Testes

- [ ] Setup Jest com cobertura
- [ ] Testes unitários para services
- [ ] Testes de integração para API routes
- [ ] Testes de componentes React críticos

### Semana 5: Infraestrutura

- [ ] Dockerfile multi-stage otimizado
- [ ] GitHub Actions CI/CD
- [ ] PostgreSQL com pooling (PgBouncer ou Prisma Data Proxy)
- [ ] Configurar backups automatizados

### Semana 6: Hardening

- [ ] Load testing (k6)
- [ ] Documentação de deploy/runbook
- [ ] Health checks com métricas
- [ ] Plano de rollback documentado

---

## Escolha de Plataforma - Produção

| Plataforma | Custo/mês | Prós | Contras |
|------------|-----------|------|---------|
| **Railway** | $20-50 | Fácil, PostgreSQL incluído | Menos controle |
| **Render** | $25-50 | Boa DX, auto-scaling | Cold start no free |
| **Fly.io** | $15-40 | Edge global, bom para Socket.io | Curva de aprendizado |
| **DigitalOcean App Platform** | $12-25 | Simples, previsível | Menos features |
| **VPS (DO/Contabo)** | $5-15 | Controle total, mais barato | Você gerencia tudo |

**Recomendação para produção:** Railway ou DigitalOcean App Platform - balanço entre controle e facilidade.

---

## Arquivos a Criar/Modificar (Produção)

### Novos Arquivos

- `Dockerfile` - Multi-stage build
- `.github/workflows/ci.yml` - Pipeline CI/CD
- `.github/workflows/deploy.yml` - Deploy automático
- `backend/src/__tests__/` - Estrutura de testes
- `backend/src/utils/logger.ts` - Winston/Pino config

### Modificações

- `backend/src/index.ts` - helmet, rate limit, logging
- `backend/src/routes/auth.ts` - JWT fail fast
- `backend/src/services/notificationService.ts` - CORS via env
- `backend/package.json` - Adicionar deps de prod (helmet, winston, express-rate-limit)

---

## Checklist Final - Produção

### Segurança

- [ ] JWT secret fail fast
- [ ] Rate limiting auth
- [ ] Helmet.js headers
- [ ] CORS configurável
- [x] Input validation (já tem Zod)

### Testes

- [ ] Jest configurado
- [ ] Cobertura > 70%
- [ ] CI rodando testes

### Observabilidade

- [ ] Logging estruturado
- [ ] Error tracking (Sentry)
- [ ] Health check com métricas
- [ ] Request tracing

### Infraestrutura

- [ ] Dockerfile
- [ ] CI/CD pipeline
- [ ] PostgreSQL com pooling
- [ ] Backups automatizados
- [ ] SSL/TLS
- [ ] Domínio configurado

### Documentação

- [ ] Runbook de deploy
- [ ] Variáveis de ambiente documentadas
- [ ] Plano de rollback
