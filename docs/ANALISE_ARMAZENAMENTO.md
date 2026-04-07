# AnÃ¡lise de Armazenamento: UsuÃ¡rios e Requisitos

## Matriz Executiva

| Ambiente | Banco previsto/em uso | Seed | UsuÃ¡rios | Requisitos | Risco / ObservaÃ§Ã£o |
|---|---|---|---|---|---|
| `development` | SQLite (`file:./dev.db`) com `schema.sqlite.prisma` | Permitido | Seedados via `backend/data/seeds/dev/users.json` | NÃ£o seedados (`requirements.json` vazio) | Baixo risco operacional local; bom para desenvolvimento individual |
| `demo` | SQLite (`file:./demo.db`) com `schema.sqlite.prisma` | Permitido e automÃ¡tico | Seedados | Seedados com 5 requisitos de exemplo | Adequado para demonstraÃ§Ã£o; dados fictÃ­cios e resetÃ¡veis |
| `staging` | PostgreSQL nos `.env`, docs e `schema.prisma` | Bloqueado por cÃ³digo | Devem existir via carga controlada/migraÃ§Ã£o | Devem existir via carga controlada/migraÃ§Ã£o | Risco residual: migrations PostgreSQL ainda precisam ser validadas no ambiente alvo |
| `production` | PostgreSQL por variÃ¡vel externa e `schema.prisma` | Bloqueado por cÃ³digo | Devem existir via processo administrativo/migraÃ§Ã£o | Devem existir via operaÃ§Ã£o normal da aplicaÃ§Ã£o | Risco residual: exigir pipeline de migration consistente e validado |

## Como funciona hoje

### UsuÃ¡rios

Os usuÃ¡rios sÃ£o persistidos na tabela lÃ³gica `users`, definida no Prisma.

Campos principais:
- `id`
- `name`
- `email` (`unique`)
- `password` (hash bcrypt)
- `role`
- `createdAt`
- `updatedAt`

Fluxo atual:
- Login consulta `users` por email.
- Senha Ã© validada com `bcrypt.compare`.
- O endpoint `POST /api/auth/register` ainda nÃ£o cria usuÃ¡rios; retorna `501`.
- Na prÃ¡tica, usuÃ¡rios entram por seed ou inserÃ§Ã£o direta/processo administrativo no banco.

### Requisitos

Os requisitos sÃ£o persistidos na tabela lÃ³gica `requirements`.

Campos centrais:
- `id`
- `reqId`
- `projectId`
- `shortDesc`
- `module`
- `what`
- `why`
- `who`
- `when`
- `where`
- `howToday`
- `howMuch`
- `consultantId`
- `status`
- `observations`
- `createdAt`
- `updatedAt`

Detalhe importante:
- `dependsOn` e `providesFor` sÃ£o armazenados como `String` contendo JSON array.
- O backend serializa antes de gravar e faz parse antes de responder.
- Isso segue existindo por compatibilidade com o caminho SQLite usado em `development/demo`.

## DiferenÃ§as por ambiente

### Development

ConfiguraÃ§Ã£o observada:
- `NODE_ENV=development`
- `DATABASE_URL="file:./dev.db"`
- `DEMO_MODE=false`
- `DEMO_AUTO_SEED=false`

Comportamento:
- Seed permitido.
- Dataset `dev` cria usuÃ¡rios base.
- NÃ£o cria requisitos iniciais.
- Usa `schema.sqlite.prisma`.

### Demo

ConfiguraÃ§Ã£o observada:
- `NODE_ENV=demo`
- `DATABASE_URL="file:./demo.db"`
- `DEMO_MODE=true`
- `DEMO_AUTO_SEED=true`

Comportamento:
- Seed permitido e automÃ¡tico.
- Cria usuÃ¡rios e requisitos fictÃ­cios.
- Usa `schema.sqlite.prisma`.

### Staging

ConfiguraÃ§Ã£o observada:
- `NODE_ENV=staging`
- `DATABASE_URL="postgresql://..."`
- `DEMO_MODE=false`
- `DEMO_AUTO_SEED=false`

Comportamento real inferido pelo cÃ³digo:
- O `schema.prisma` principal agora reflete PostgreSQL.
- O seed Ã© bloqueado por seguranÃ§a.
- `development` e `demo` usam schema SQLite separado (`schema.sqlite.prisma`).
- Portanto, staging estÃ¡ alinhado com o desenho de PostgreSQL no schema principal.

### Production

ConfiguraÃ§Ã£o observada:
- `NODE_ENV=production`
- `DATABASE_URL="${DATABASE_URL}"`
- `DEMO_MODE=false`
- `DEMO_AUTO_SEED=false`

Comportamento real inferido pelo cÃ³digo:
- ProduÃ§Ã£o deve usar PostgreSQL.
- Seed Ã© explicitamente bloqueado.
- UsuÃ¡rios e dados precisam entrar por operaÃ§Ã£o normal, migraÃ§Ãµes e rotinas administrativas.
- O schema principal jÃ¡ estÃ¡ alinhado com PostgreSQL; a atenÃ§Ã£o passa a ser operacional nas migrations e no pipeline.

## ConclusÃ£o objetiva

O armazenamento continua claramente implementado no domÃ­nio atual, com separaÃ§Ã£o explÃ­cita de engine por ambiente: `schema.prisma` para PostgreSQL em `staging/production` e `schema.sqlite.prisma` para SQLite em `development/demo`. Em termos prÃ¡ticos, o desenho multiambiente agora estÃ¡ refletido diretamente nos arquivos de schema e nos scripts do projeto.

## ReferÃªncias

- `backend/prisma/schema.prisma`
- `backend/prisma/schema.sqlite.prisma`
- `backend/src/routes/auth.ts`
- `backend/src/routes/requirements.ts`
- `backend/src/utils/seedData.ts`
- `backend/data/seeds/dev/users.json`
- `backend/data/seeds/dev/requirements.json`
- `backend/data/seeds/demo/users.json`
- `backend/data/seeds/demo/requirements.json`
- `README.md`
- `docs/DEPLOY.md`