# Ancoro

Sistema de gestão colaborativa de requisitos.

## Visão Geral

Ancoro implementa três pilares:
1. **Pensamento Estruturado** — Requisitos em formato 5W2H Duplo
2. **Integração Explícita** — Cross-Module Awareness entre módulos SAP
3. **Melhoria Contínua Pragmática** — Métricas e colaboração em tempo real

## Funcionalidades

### Core
- **Gestão de Requisitos** — Criação, edição e validação com formato 5W2H (what, why, who, when, where, howToday, howMuch)
- **Sistema de Projetos** — Múltiplos projetos com configuração dinâmica de ID de requisitos
- **Matriz de Cruzamento** — Auto-geração de dependências + validação manual de integrações
- **Colaboração Real-time** — Comentários, notificações via Socket.io, histórico de mudanças

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

### Dados
- `GET /api/projects/:id/metrics` — KPIs
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
