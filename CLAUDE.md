# CLAUDE.md — Diretrizes do projeto Ancoro

Instruções específicas deste repositório para o Claude Code. Os padrões pessoais/globais do
Rafael (identidade, filosofia de comunicação, qualidade de código) já vivem em
`~/.claude/CLAUDE.md` e continuam valendo — este arquivo trata apenas do **projeto Ancoro**.

## O que é o projeto
Ancoro é uma aplicação desktop-first (Electron) e web para gestão colaborativa de requisitos
SAP S/4HANA Utilities, implementando o **Ancora ReqOps Method** (5W2H Duplo AS-IS/TO-BE,
Matriz de Cruzamento, pipeline de validação). Backend Express + Prisma + PostgreSQL;
frontend React + Vite + TanStack Query.

## 📍 Mapa da arquitetura — leia primeiro
Antes de implementar qualquer melhoria ou modificação, **consulte
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. Ele é a fonte da verdade do projeto: mapeia
rotas → arquivos, services, modelos Prisma, páginas/hooks do frontend, i18n e traz o guia
prático **"Onde mexer para..."**.

## ⚠️ Diretriz central: manter o mapa atualizado
`docs/ARCHITECTURE.md` deve refletir sempre o estado real do projeto. O fluxo é:

1. Implementar a mudança.
2. Testar (build/testes verdes e validação funcional).
3. **Aguardar o aval do Rafael** de que está aprovado.
4. **Só então** atualizar `docs/ARCHITECTURE.md` na mesma leva de trabalho, refletindo a
   mudança (nova rota, novo campo, novo service, nova página, etc.) e atualizar a data de
   "Última revisão do mapa" no topo do arquivo.

Não atualizar o mapa de forma especulativa antes da aprovação. Não deixar o mapa divergir do
código depois de uma mudança aprovada.

## Comandos essenciais (rodar da raiz)
```bash
npm run install:all      # instala deps (raiz + backend + frontend)
npm run dev              # backend + frontend em dev
npm run demo             # modo demo (auto-seed)
npm run build            # build completo
npm run prisma:migrate   # roda migrations (após mudar schema.prisma)
npm run prisma:seed      # popula dados demo
npm run prisma:studio    # GUI do banco
```
Backend em `http://localhost:3000` (`/health` para checar). Frontend em `http://localhost:5173`.

## Convenções do projeto
- **Backend-first.** Modelar dados (`backend/prisma/schema.prisma`) e API antes da UI.
- **Prisma migrations.** Toda mudança de schema gera migration; nunca editar o banco à mão.
- **Zod** valida entrada nas rotas (`backend/src/schemas`).
- **i18n obrigatório.** Nenhuma string de UI hardcoded: adicionar chave em
  `frontend/src/i18n/locales/pt/*.json` **e** `en/*.json`. Enums/códigos internos permanecem
  em constante (PENDING, ISU, etc.); só o label é traduzido (namespace `enums`).
- **Acesso à API** somente via `frontend/src/services/api.ts` + hooks React Query.
- **Permissões por role** vivem em dois lugares que devem ficar em sincronia:
  `backend/src/middleware/permissions.ts` e `frontend/src/utils/roleCapabilities.ts`.
- **Roles:** ADMIN, MANAGER, CONSULTANT, CLIENT.

## Segurança
- Nunca commitar `.env*` com segredos reais. `JWT_SECRET` ≥ 32 chars em produção.
- CORS, Helmet e rate limiting já configurados em `backend/src/index.ts` — respeitar.
