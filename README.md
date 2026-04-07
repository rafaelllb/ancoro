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

## Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| **Backend** | Node.js 18+, Express 4.18, Prisma 5.9 |
| **Database** | SQLite (dev/demo), PostgreSQL (staging/prod) |
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
│   │   ├── middleware/   # Auth, logging
│   │   ├── schemas/      # Validação Zod
│   │   └── config/       # Bootstrap config
│   └── data/             # SQLite database (dev)
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
├── docs/                 # Documentação adicional
└── package.json          # Scripts do monorepo
```

## Início Rápido

```bash
# Instalar dependências
npm run install:all

# Desenvolvimento (backend + frontend)
npm run dev

# Modo demo (com dados de exemplo)
npm run demo

# Desktop (Electron)
npm run electron
```

## Scripts Disponíveis

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Backend + Frontend em desenvolvimento |
| `npm run demo` | Backend + Frontend em modo demo |
| `npm run electron` | Electron em modo desenvolvimento |
| `npm run electron:demo` | Electron em modo demo |
| `npm run electron:build` | Build do Electron (Windows/Mac/Linux) |
| `npm run build` | Build de produção |
| `npm run prisma:migrate` | Executar migrations |
| `npm run prisma:seed` | Popular dados de exemplo |
| `npm run prisma:studio` | GUI do Prisma (localhost:5555) |

## Configuração de Ambiente

### Arquivos .env

| Arquivo | Uso |
|---------|-----|
| `.env.development` | Desenvolvimento local (SQLite) |
| `.env.demo` | Demo com auto-seed |
| `.env.staging` | Staging (PostgreSQL) |
| `.env.production` | Produção (PostgreSQL) |

### Variáveis Principais

```env
DATABASE_URL=file:./data/dev.db    # SQLite ou PostgreSQL connection string
JWT_SECRET=sua-chave-secreta       # Mínimo 16 chars (32+ em prod)
JWT_EXPIRES_IN=7d                  # Expiração do token
PORT=3000                          # Porta do backend
NODE_ENV=development               # development|demo|staging|production
DEMO_MODE=false                    # Habilita funcionalidades demo
DEMO_AUTO_SEED=false               # Auto-seed no startup
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
- [docs/ROADMAP.md](docs/ROADMAP.md) — Plano de desenvolvimento
- [docs/API_EXAMPLES.md](docs/API_EXAMPLES.md) — Exemplos de uso da API

## Autor

**Rafael Brito** — Consultor SAP Utilities ISU/S4HANA

## Filosofia

> "Estrutura liberta. Cerimônia aprisiona."

Ancoro é ferramenta pragmática, não burocracia.

## Licença

Proprietário
