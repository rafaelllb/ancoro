# Ancoro

Sistema de gestão colaborativa de requisitos.

## Visão Geral

Ancoro implementa o **Ancora ReqOps Method** — sistema operacional de requisitos que aplica princípios de DevOps ao ciclo de vida dos requisitos.

### Pilares
1. **Pensamento Estruturado** — Requisitos em formato 5W2H Duplo
2. **Integração Explícita** — Cross-Module Awareness entre módulos SAP
3. **Melhoria Contínua Pragmática** — Métricas e colaboração em tempo real
4. **Pipeline de Validação** — Requisitos só avançam se passarem em todas as checagens

## Funcionalidades

### Core
- **Gestão de Requisitos** — Criação, edição e validação com formato 5W2H (what, why, who, when, where, howToday, howMuch)
- **Sistema de Projetos** — Múltiplos projetos com configuração dinâmica de ID de requisitos
- **Matriz de Cruzamento** — Auto-geração de dependências + validação manual de integrações
- **Colaboração Real-time** — Comentários, notificações via Socket.io, histórico de mudanças

### ReqOps (Ancora Method v2)
- **Objetivos de Projeto** — Cadastro de objetivos de negócio com keywords para matching
- **Requisitos Órfãos** — Detecção automática de WHY sem correspondência a objetivos
- **Conflitos Semânticos** — Detecção de WHO sobrepostos, WHERE incompatíveis, HOW MUCH contraditórios
- **Sistema de Evidências** — Anexar evidências (commit, teste, screenshot) para fechamento
- **Pipeline de Validação** — Validação completa antes de promoção (ciclos + conflitos + órfãos)
- **Campos AS IS / TO BE** — Separação do processo atual e futuro com versionamento
- **HOW MUCH Prometido/Realizado** — Rastreabilidade de critérios de aceitação

### Métricas ReqOps
- **Lead Time** — Tempo médio da criação até aprovação
- **Taxa de Rejeição** — % de requisitos que voltaram no pipeline
- **Iterações de Refinamento** — Contagem de edições por requisito
- **Cobertura de Objetivos** — % de requisitos vinculados a objetivos
- **Cobertura de Evidências** — % de requisitos com evidência anexada

### Dados
- **Import/Export** — Planilhas Excel com upsert inteligente
- **Métricas** — Dashboard com KPIs do projeto
- **Configurações Dinâmicas** — Listas configuráveis por projeto (módulos, status, tipos de integração)

### Infraestrutura
- **Multi-ambiente** — development, demo, staging, production
- **Modo Demo** — Auto-seed com dados de exemplo, reset de banco
- **Multi-Tenancy** — Database-per-client com tenant registry criptografado
- **Security Hardening** — Helmet, rate limiting, structured logging (Pino)
- **CI/CD** — GitHub Actions para PR checks, deploy QA e produção

## Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| **Backend** | Node.js 18+, Express 4.18, Prisma 5.9 |
| **Database** | PostgreSQL 16 (via Docker em dev), Neon (staging/prod) |
| **Frontend** | Electron 28.1, React 18.2, Vite 5.0 |
| **State** | Zustand 4.4, TanStack Query 5.17 |
| **Real-time** | Socket.io 4.6 |
| **Auth** | JWT + bcrypt |
| **Validação** | Zod |
| **Styling** | Tailwind CSS 3.4 |

## Estrutura do Projeto

```
ancoro/
├── backend/
│   ├── prisma/           # Schema e migrations
│   ├── src/
│   │   ├── routes/       # API endpoints
│   │   ├── services/     # Lógica de negócio
│   │   ├── middleware/   # Auth, permissions, changelog
│   │   ├── tenancy/      # Multi-tenant (crypto, cache, resolver)
│   │   ├── schemas/      # Validação Zod
│   │   ├── utils/        # Logger (Pino), helpers
│   │   └── config/       # Bootstrap config
│   └── Dockerfile        # Container para deploy
│
├── frontend/
│   ├── electron/         # Main process
│   ├── src/
│   │   ├── pages/        # Dashboard, CrossMatrix, Metrics, Login
│   │   ├── components/   # UI components
│   │   ├── stores/       # Zustand stores
│   │   ├── services/     # API calls
│   │   └── hooks/        # Custom hooks
│   └── build/            # Electron assets
│
├── .github/workflows/    # CI/CD (pr-checks, deploy-qa, deploy-prod)
├── docs/                 # Documentação adicional
├── docker-compose.yml    # PostgreSQL local para dev
└── package.json          # Scripts do monorepo
```

## Início Rápido

```bash
# Instalar dependências
npm run install:all

# Iniciar PostgreSQL local (requer Docker)
cd backend && npm run db:start

# Executar migrations
npx prisma migrate dev --schema prisma/schema.prisma

# Desenvolvimento (backend + frontend)
npm run dev

# Modo demo (com dados de exemplo)
npm run demo

# Desktop (Electron)
npm run electron
```

### Pré-requisitos
- Node.js 18+
- Docker Desktop (para PostgreSQL local)
- Git

## Scripts Disponíveis

### Desenvolvimento
| Script | Descrição |
|--------|-----------|
| `npm run dev` | Backend + Frontend em desenvolvimento |
| `npm run demo` | Backend + Frontend em modo demo |
| `npm run electron` | Electron em modo desenvolvimento |
| `npm run electron:demo` | Electron em modo demo |
| `npm run build` | Build de produção |

### Database (backend/)
| Script | Descrição |
|--------|-----------|
| `npm run db:start` | Inicia PostgreSQL via Docker |
| `npm run db:stop` | Para PostgreSQL |
| `npm run db:reset` | Remove volume e reinicia (dados limpos) |
| `npm run prisma:migrate` | Executar migrations (SQLite) |
| `npm run prisma:migrate:prod` | Executar migrations (PostgreSQL) |
| `npm run prisma:seed` | Popular dados de exemplo |
| `npm run prisma:studio` | GUI do Prisma (localhost:5555) |

### Build
| Script | Descrição |
|--------|-----------|
| `npm run electron:build` | Build do Electron (Windows/Mac/Linux) |
| `npm run build` | Build de produção |

## Configuração de Ambiente

### Arquivos .env

| Arquivo | Uso |
|---------|-----|
| `.env.development` | Desenvolvimento local (PostgreSQL via Docker) |
| `.env.development.sqlite` | Fallback SQLite (sem Docker) |
| `.env.demo` | Demo com auto-seed |
| `.env.staging` | Staging (Neon PostgreSQL) |
| `.env.production` | Produção (Neon PostgreSQL) |

### Variáveis Principais

```env
# Database
DATABASE_URL=postgresql://ancoro:ancoro@localhost:5432/ancoro_dev

# Auth
JWT_SECRET=sua-chave-secreta       # Mínimo 16 chars (32+ em prod)
JWT_EXPIRES_IN=7d                  # Expiração do token

# Server
PORT=3000
NODE_ENV=development               # development|demo|staging|production
LOG_LEVEL=debug                    # debug|info|warn|error

# Demo Mode
DEMO_MODE=false
DEMO_AUTO_SEED=false

# Multi-Tenancy (produção)
TENANT_REGISTRY_DATABASE_URL=      # URL do banco de registro de tenants
TENANT_REGISTRY_ENCRYPTION_KEY=    # Chave AES-256 em base64
```

## API Endpoints

### Autenticação
- `POST /api/auth/register` — Registrar usuário
- `POST /api/auth/login` — Login

### Projetos
- `GET /api/projects` — Listar projetos
- `POST /api/projects` — Criar projeto
- `GET /api/projects/:id` — Detalhes
- `PUT /api/projects/:id` — Atualizar

### Requisitos
- `GET /api/projects/:id/requirements` — Listar
- `POST /api/projects/:id/requirements` — Criar
- `PUT /api/projects/:id/requirements/:reqId` — Atualizar
- `GET /api/projects/:id/requirements/:reqId/comments` — Comentários

### Matriz de Cruzamento
- `GET /api/projects/:id/cross-matrix` — Listar integrações
- `PUT /api/projects/:id/cross-matrix/:entryId` — Atualizar
- `GET /api/projects/:id/semantic-conflicts` — Detectar conflitos semânticos
- `POST /api/projects/:id/validate-pipeline` — Validação completa ReqOps

### Objetivos (ReqOps)
- `GET /api/projects/:id/objectives` — Listar objetivos
- `POST /api/projects/:id/objectives` — Criar objetivo
- `PUT /api/projects/:id/objectives/:objId` — Atualizar
- `POST /api/projects/:id/objectives/validate-requirements` — Validar WHY vs objetivos
- `GET /api/projects/:id/orphan-requirements` — Listar requisitos órfãos

### Evidências (ReqOps)
- `GET /api/requirements/:id/evidences` — Listar evidências
- `POST /api/requirements/:id/evidences` — Criar evidência
- `POST /api/evidences/:id/verify` — Verificar evidência
- `GET /api/requirements/:id/can-approve` — Verificar se pode aprovar

### Dados
- `GET /api/projects/:id/metrics` — KPIs (inclui métricas ReqOps)
- `GET /api/projects/:id/metrics/lead-time` — Lead time por requisito
- `GET /api/projects/:id/metrics/rejections` — Requisitos rejeitados
- `GET /api/projects/:id/metrics/refinements` — Iterações de refinamento
- `GET /api/projects/:id/export` — Export XLSX
- `POST /api/projects/:id/import` — Import planilha

### Sistema
- `GET /health` — Health check
- `GET /api/demo/status` — Status do modo demo

## Documentação Adicional

- [docs/SETUP.md](docs/SETUP.md) — Guia detalhado de instalação
- [docs/INFRASTRUCTURE_GUIDE.md](docs/INFRASTRUCTURE_GUIDE.md) — Arquitetura de banco, deploy e DevOps
- [docs/ROADMAP.md](docs/ROADMAP.md) — Plano de desenvolvimento
- [docs/API_EXAMPLES.md](docs/API_EXAMPLES.md) — Exemplos de uso da API

## Arquitetura de Infraestrutura

### Ambientes

| Ambiente | Database | Backend | Custo |
|----------|----------|---------|-------|
| dev (local) | PostgreSQL (Docker) | localhost | $0 |
| demo | Neon Free | Northflank Free | $0 |
| qa | Neon Free | Northflank Free | $0 |
| prod | Neon Launch | Railway Hobby | ~$24/mês |

### Multi-Tenancy

Modelo **database-per-client** para isolamento máximo de dados:

1. **Tenant Registry** — Banco central com mapeamento slug → database URL (criptografado)
2. **LRU Cache** — Pool de até 10 Prisma Clients simultâneos
3. **Middleware** — Resolve tenant do JWT e injeta `req.prisma`

### Security

- **Helmet** — HTTP security headers
- **Rate Limiting** — 100 req/15min global, 5 tentativas login/15min
- **Pino** — Structured logging com redação automática de dados sensíveis
- **AES-256-GCM** — Criptografia de URLs de banco no tenant registry

### CI/CD (GitHub Actions)

| Workflow | Trigger | Ação |
|----------|---------|------|
| `pr-checks.yml` | PR para main/develop | Lint, TypeCheck, Tests, Build |
| `deploy-qa.yml` | Push em develop | Migrate + Deploy QA automático |
| `deploy-prod.yml` | Push em main | Aprovação manual → Backup → Migrate → Deploy |

Ver [docs/INFRASTRUCTURE_GUIDE.md](docs/INFRASTRUCTURE_GUIDE.md) para detalhes completos.

## Autor

**Rafael Brito** — Consultor SAP Utilities ISU/S4HANA

## Filosofia

> "Estrutura liberta. Cerimônia aprisiona."

Ancoro é ferramenta pragmática, não burocracia.

## Licença

Proprietário
