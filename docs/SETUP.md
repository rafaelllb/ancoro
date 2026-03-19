# Setup Guide - Ancoro Application

## Pré-requisitos

- Node.js 18+ instalado
- npm ou yarn
- Git

## Quick Start

### 1. Clone o repositório

```bash
git clone <repository-url>
cd Ancoro-app
```

### 2. Setup Backend

```bash
cd backend
npm install
```

Configurar `.env` (já existe com valores default):
```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="dev_secret_change_in_production"
PORT=3000
NODE_ENV="development"
```

Criar database e popular com dados de exemplo:
```bash
npx prisma migrate dev --name init
npm run prisma:seed
```

Iniciar servidor:
```bash
npm run dev
```

O backend estará rodando em `http://localhost:3000`

### 3. Setup Frontend

```bash
cd ../frontend
npm install
```

Iniciar dev server:
```bash
npm run dev
```

O frontend estará rodando em `http://localhost:5173`

### 4. Testar

Backend:
- Health check: http://localhost:3000/health
- Test database: http://localhost:3000/api/test-db
- Get projects: http://localhost:3000/api/projects

Frontend:
- Abrir: http://localhost:5173

## Dados de Exemplo (Seed)

O seed cria:
- **5 usuários** (3 consultores, 1 manager, 1 cliente)
- **1 projeto** (Implementação S/4 HANA Utilities)
- **5 requisitos** (CRM, ISU, FI-CA)
- **4 integrações** na matriz de cruzamento
- **4 comentários**
- **2 sprints**

### Credenciais de Login

Todos os usuários têm senha: `demo123`

**Consultores:**
- joao.silva@seidor.com (ISU)
- maria.santos@seidor.com (CRM)
- pedro.oliveira@seidor.com (FI-CA)

**Manager:**
- rafael.brito@seidor.com

**Cliente:**
- ana.costa@cliente.com

## Estrutura de Diretórios

```
Ancoro-app/
├── backend/              # Express + Prisma API
│   ├── prisma/
│   │   ├── schema.prisma # Database schema
│   │   ├── seed.ts       # Dados de exemplo
│   │   └── migrations/   # Histórico de migrations
│   ├── src/
│   │   └── index.ts      # Express server
│   ├── package.json
│   └── .env
├── frontend/             # Electron + React
│   ├── electron/
│   │   ├── main.ts       # Electron main process
│   │   └── preload.ts    # Context bridge
│   ├── src/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
└── docs/                 # Documentação
```

## Comandos Úteis

### Backend

```bash
# Desenvolvimento
npm run dev

# Build para produção
npm run build
npm start

# Prisma
npm run prisma:generate  # Gera Prisma Client
npm run prisma:migrate   # Cria migration
npm run prisma:studio    # Abre GUI do database
npm run prisma:seed      # Popular database
```

### Frontend

```bash
# Desenvolvimento (web)
npm run dev

# Desenvolvimento (Electron)
npm run electron:dev

# Build para produção (Electron)
npm run electron:build
```

## Próximos Passos

Após o setup, consultar o plano de implementação em: `~/.claude/plans/floating-inventing-ullman.md`

### Fase 1 - MVP Core (Semana 1-4)
- [ ] CRUD de Requirements (API + UI)
- [ ] Matriz de Cruzamento (auto-geração)
- [ ] Sistema de Comentários
- [ ] Autenticação JWT

Veja o plano completo para detalhes das próximas fases.

## Troubleshooting

### Erro: "Cannot find module '@prisma/client'"
```bash
cd backend
npx prisma generate
```

### Erro: Port 3000 já em uso
Alterar `PORT` no `.env` do backend

### Frontend não conecta no backend
Verificar se backend está rodando: http://localhost:3000/health

## Stack Tecnológica

**Backend:**
- Node.js + Express
- Prisma ORM
- PostgreSQL (produção) / SQLite (dev)
- Socket.io (real-time)

**Frontend:**
- Electron (desktop)
- React + TypeScript
- Vite
- TanStack Query
- Tailwind CSS

---

**Autor:** Rafael Brito
**Projeto:** Ancoro v2.0
**Data:** Março 2026
