# Ancoro — Mapa de Arquitetura

> **Fonte da verdade** da arquitetura do projeto. Use este documento como mapa de navegação
> para localizar onde fica cada informação antes de implementar melhorias ou modificações.
>
> **Manutenção:** este arquivo deve ser atualizado sempre que uma mudança for aprovada após
> testes (ver `CLAUDE.md` na raiz). Última revisão do mapa: 2026-10-27 (Process Studio: criar a partir do elemento, resize do pool, lista recolhível, versão manual com `r`).

---

## 1. Visão geral

Ancoro é uma aplicação **desktop-first** (Electron) e web para **gestão colaborativa de
requisitos** em projetos SAP S/4HANA Utilities (ISU). Implementa o **Ancora ReqOps Method**:
aplica princípios de DevOps ao ciclo de vida dos requisitos.

**Pilares:**
1. **Pensamento estruturado** — requisitos em formato **5W2H Duplo** (AS-IS + TO-BE).
2. **Integração explícita** — *cross-module awareness* entre módulos SAP (Matriz de Cruzamento).
3. **Melhoria contínua pragmática** — métricas e colaboração em tempo real.
4. **Pipeline de validação** — requisitos só avançam se passarem em todas as checagens
   (ciclos + conflitos semânticos + órfãos + evidências).

Visão de negócio detalhada: `docs/Ancora_Method_Guide_v2_0.docx` e [README.md](../README.md).

---

## 2. Stack tecnológica

| Camada | Tecnologias |
|---|---|
| **Backend** | Node.js 18+, Express 4, Prisma 5, PostgreSQL 16, JWT + bcrypt, Zod, Socket.io 4, Pino (logging), Helmet + express-rate-limit |
| **Frontend** | React 18, TypeScript, Vite 5, React Router 6, TanStack Query 5 (server state), Zustand 4 (notificações), Tailwind CSS 3, i18next (PT/EN), TanStack Table 8, Recharts, XLSX |
| **Desktop** | Electron 28 (empacotamento NSIS/DMG/AppImage) |
| **Infra** | Docker, Neon (PostgreSQL gerenciado), nginx (on-premise), GitHub Actions (CI/CD) |

Convenção de idioma: **backend e enums internos permanecem em código PT/constantes** (ex.:
`PENDING`, `ISU`, `DISCOVERY`); apenas o **label exibido** é traduzido no frontend via i18n
(analogia: o backend é o "alemão do SAP", o frontend é a camada de apresentação).

---

## 3. Estrutura de diretórios (monorepo)

```
ancoro/
├── backend/              # API Express + Prisma
│   ├── src/
│   │   ├── index.ts      # Entry point (registro de rotas, middlewares, Socket.io)
│   │   ├── config/       # Config por ambiente + deployment-mode
│   │   ├── routes/        # Endpoints REST (1 arquivo por recurso)
│   │   ├── services/      # Lógica de negócio (conflitos, matriz, métricas, etc.)
│   │   ├── middleware/    # auth, permissions, changelog
│   │   ├── tenancy/       # Roteamento multi-tenant (database-per-client)
│   │   ├── license/       # Validação de licença (on-premise)
│   │   ├── schemas/       # Validação Zod
│   │   ├── types/         # Interfaces e enums TS
│   │   └── utils/         # logger, seed, permissões
│   └── prisma/
│       ├── schema.prisma # Schema PostgreSQL (fonte da verdade dos dados)
│       └── seed.ts       # Dados de exemplo/demo
├── frontend/             # React + Vite + Electron
│   ├── src/
│   │   ├── main.tsx      # Entry (bootstrap i18n + render)
│   │   ├── App.tsx       # Router + providers (QueryClient, Auth, ErrorBoundary)
│   │   ├── pages/        # Telas (rotas)
│   │   ├── components/   # Componentes reutilizáveis
│   │   ├── hooks/        # React Query hooks (dados) + capabilities
│   │   ├── services/api.ts # Cliente Axios (única camada de acesso à API)
│   │   ├── contexts/     # AuthContext
│   │   ├── stores/       # Zustand (notificações)
│   │   ├── i18n/         # Traduções (namespaces PT/EN)
│   │   └── utils/        # helpers (roles, cores, padrão de ID, etc.)
│   └── electron/         # Processo main + preload do Electron
├── packages/             # Process Studio (módulo BPMN) — pacotes independentes, NÃO importam o Ancoro
│   ├── process-core/     # Modelo, BPMN XML, validação, layout, edição pura (+ ports)
│   ├── process-render/   # Renderer SVG compartilhado (editor + portal)
│   ├── process-editor/   # Editor React (roda standalone e embutido no Ancoro via iframe + postMessage)
│   └── process-publisher/# Portal estático + build do "processkit" (backend/vendor/processkit.cjs)
├── docs/                 # Documentação (este arquivo é o mapa principal)
│   └── process-studio/   # Visão, fases e decisões do módulo (README.md)
├── nginx/                # Reverse proxy (on-premise)
├── .github/workflows/    # CI/CD
├── scripts/              # Scripts utilitários (Python: geração de planilhas)
├── docker-compose.yml    # PostgreSQL local (dev)
├── docker-compose.onpremise.yml
└── package.json          # Scripts do monorepo
```

---

## 4. Mapa do Backend

**Entry point:** [backend/src/index.ts](../backend/src/index.ts) — configura CORS, Helmet,
rate limiting (global 100/15min; login 5/15min), Pino, licença, registra rotas e inicializa
Socket.io.
**Config:** [backend/src/config/index.ts](../backend/src/config/index.ts) e
[backend/src/config/deployment-mode.ts](../backend/src/config/deployment-mode.ts).

### 4.1 Rotas (recurso → arquivo)

Todas montadas sob `/api` em [index.ts](../backend/src/index.ts#L146-L163).

| Recurso | Arquivo | Observações |
|---|---|---|
| Autenticação | [routes/auth.ts](../backend/src/routes/auth.ts) | `POST /api/auth/login`, register; rate-limited |
| Requisitos | [routes/requirements.ts](../backend/src/routes/requirements.ts) | CRUD + bulk import/delete |
| Matriz de Cruzamento | [routes/crossMatrix.ts](../backend/src/routes/crossMatrix.ts) | regenerar, validar pipeline, conflitos semânticos |
| Comentários | [routes/comments.ts](../backend/src/routes/comments.ts) | por requisito |
| Objetivos | [routes/objectives.ts](../backend/src/routes/objectives.ts) | objetivos de negócio + requisitos órfãos. ⚠️ **Arquivo existe mas NÃO está registrado em `index.ts`** — endpoints não montados hoje (o `objectiveService` é usado internamente por `metricsService`). Para ativar: importar e `app.use('/api', objectivesRoutes)` em index.ts |
| Evidências | [routes/evidences.ts](../backend/src/routes/evidences.ts) | anexo + verificação (ReqOps) |
| Métricas | [routes/metrics.ts](../backend/src/routes/metrics.ts) | KPIs, timeline, heatmap, consultores |
| Changelog | [routes/changelog.ts](../backend/src/routes/changelog.ts) | histórico + rollback |
| Membros do projeto | [routes/projectMembers.ts](../backend/src/routes/projectMembers.ts) | atribuição a módulos |
| Listas do projeto | [routes/projectLists.ts](../backend/src/routes/projectLists.ts) | MODULE, REQ_STATUS, INTEGRATION_TYPE, INTEGRATION_TIMING |
| Projetos | [routes/projects.ts](../backend/src/routes/projects.ts) | CRUD + settings (padrão de ID) |
| Config runtime | [routes/config.ts](../backend/src/routes/config.ts) | sem auth (parcial); AppConfig |
| Export/Import | [routes/export.ts](../backend/src/routes/export.ts) | BPD (Markdown/DOCX), validação |
| Demo | [routes/demo.ts](../backend/src/routes/demo.ts) | reset/status modo demo |
| Graph layout | [routes/graphLayout.ts](../backend/src/routes/graphLayout.ts) | posições dos nós do grafo |
| Usuários | [routes/users.ts](../backend/src/routes/users.ts) | perfil, preferências de colunas |
| Process Studio | [routes/processes.ts](../backend/src/routes/processes.ts) | CRUD de processos BPMN do projeto, versões/restore, import `.bpm`/`.bpmn`, export BPMN, cobertura, busca de requisitos, publicação do portal (ZIP). Concorrência otimista (`rev`/`baseRev`, 409). **Gate de assinatura** no topo do router (403 `PROCESS_STUDIO_DISABLED`). Testes: [processes.test.ts](../backend/src/routes/processes.test.ts) |
| Direitos da assinatura | [index.ts](../backend/src/index.ts) | `GET /api/entitlements` → `{ processStudio }` (lido por [config/entitlements.ts](../backend/src/config/entitlements.ts)) |

**Endpoints de sistema:** `GET /health`, `GET /api/license/status`, `GET /api/test-db`, `GET /api/entitlements` (autenticado).

> ⚠️ Ordem de registro importa: `projectLists` é registrado **antes** de `projectMembers`
> para evitar conflito de middleware (ver comentário em index.ts:158). `config` e `demo` vêm
> antes das rotas autenticadas.

### 4.2 Services (lógica de negócio)

| Service | Arquivo | Responsabilidade |
|---|---|---|
| Config | [services/configService.ts](../backend/src/services/configService.ts) | Config runtime (features/UI/limites) a partir do banco, com fallback |
| Conflitos semânticos | [services/conflictDetectionService.ts](../backend/src/services/conflictDetectionService.ts) | WHO sobreposto, WHERE incompatível, HOW MUCH contraditório |
| Matriz de cruzamento | [services/crossMatrixService.ts](../backend/src/services/crossMatrixService.ts) | Dependências entre módulos + detecção de ciclos |
| Métricas | [services/metricsService.ts](../backend/src/services/metricsService.ts) | Lead time, taxa de rejeição, cobertura de objetivos/evidências |
| Objetivos | [services/objectiveService.ts](../backend/src/services/objectiveService.ts) | Matching WHY ↔ objetivo por keywords; órfãos |
| Evidências | [services/evidenceService.ts](../backend/src/services/evidenceService.ts) | Anexo e validação para aprovação de requisito |
| Gerador BPD | [services/bpdGenerator.ts](../backend/src/services/bpdGenerator.ts) | Business Process Diagram/Document para SAP ISU |
| Notificações | [services/notificationService.ts](../backend/src/services/notificationService.ts) | Socket.io real-time |
| Process Studio (kit) | [services/processKit.ts](../backend/src/services/processKit.ts) | Carrega `backend/vendor/processkit.cjs` (gerado por `npm run build:processkit`, gitignored): valida/importa/exporta BPMN e publica o portal com o MESMO código do editor |

### 4.3 Middleware, tenancy e licença

- **Auth:** [middleware/auth.ts](../backend/src/middleware/auth.ts) — JWT (`{userId,email,role}`,
  exp. 7d), `authenticate()` / `optionalAuthenticate()`.
- **Permissões:** [middleware/permissions.ts](../backend/src/middleware/permissions.ts) — RBAC
  por role (ADMIN, MANAGER, CONSULTANT, CLIENT) + validação de membership.
- **Multi-tenancy:** [backend/src/tenancy/](../backend/src/tenancy/) — database-per-client.
- **Licença:** [backend/src/license/](../backend/src/license/) — obrigatória em on-premise prod.
- **Assinatura (entitlements):** [config/entitlements.ts](../backend/src/config/entitlements.ts) — contratação **única**
  (sem tiers por feature): Process Studio liga/desliga. On-premise exige licença válida; senão `PROCESS_STUDIO_ENABLED`
  (ausente = ligado fora de produção, **desligado em produção**). Sem direito: rotas 403, e o frontend esconde menu, rota e aba.

### 4.4 Modelos de dados (Prisma)

Schema: [backend/prisma/schema.prisma](../backend/prisma/schema.prisma). Modelos principais:

| Modelo | Papel |
|---|---|
| `Project` | Container do projeto; padrão de ID configurável (`reqIdPrefix`/`reqIdSeparator`/`reqIdDigitCount`); status (DISCOVERY/REALIZATION/GOLIVE/HYPERCARE/CLOSED) |
| `User` | Conta, role, `columnPreferences` |
| `Requirement` | **Núcleo 5W2H Duplo** — AS-IS (`what/why/who/when/where/howToday/howMuch`) + TO-BE (`whatToBe/whyToBe/.../howToBe/howMuchToBe`, `howAsIs`); status, consultor responsável, `linkedObjectiveId`, `isOrphan` |
| `Evidence` | Evidência ReqOps (COMMIT/TEST_RESULT/SCREENSHOT/APPROVAL_DOC/LINK/FILE/OTHER); verificação |
| `ProjectObjective` | Objetivo de negócio (keywords JSON) para validar WHY e detectar órfãos |
| `CrossMatrixEntry` | Integração módulo→módulo (`integrationType`, `timing`, `status`: PENDING/OK/CONFLICT/CIRCULAR) |
| `Comment` | Discussão por requisito (QUESTION/ANSWER/OBSERVATION/CONFLICT) |
| `ChangeLog` / `ConfigChangeLog` | Auditoria field-level (com rollback) |
| `Sprint` | Sprints do projeto |
| `ProjectListItem` | Listas configuráveis por projeto (substitui enums hardcoded) |
| `ProjectUser` / `PendingProjectMembership` | Membership + atribuição a módulo |
| `AppConfig` | Config runtime sem redeploy |
| `GraphLayout` | Posições dos nós do grafo (JSON) |
| `Tenant` / `TenantUser` | Registro multi-tenant |
| `BusinessProcess` | Processo BPMN do projeto: `model` = JSON do `ProcessModel` (fonte da verdade), `key` único por projeto, `rev` (concorrência otimista) |
| `ProcessVersion` | Snapshot imutável criado **só manualmente** (Versões > Salvar versão), com rótulo opcional e `rev` = o `r` do processo no momento. Salvar NÃO cria versão. Automático apenas ao publicar o portal e como guarda "Antes de restaurar"; restaurar carrega rascunho (salvar é manual). `rev` é nulo em versões antigas |
| `ProcessRequirementLink` | **Projeção** elemento↔`Requirement`, reconstruída a cada save (nunca editar à mão) — alimenta "em quais processos o requisito aparece" e cobertura |
| `ProcessPortal` | Histórico de publicação do projeto (`versions.json`, contador) — alimenta o "O que mudou" do portal |

---

## 5. Mapa do Frontend

**Entry:** [main.tsx](../frontend/src/main.tsx) → [App.tsx](../frontend/src/App.tsx)
(BrowserRouter + QueryClientProvider + AuthProvider + ErrorBoundary + Toaster).

### 5.1 Roteamento (rota → página)

Definido em [App.tsx](../frontend/src/App.tsx#L175-L238).

| Rota | Página | Acesso |
|---|---|---|
| `/` | [LandingPage.tsx](../frontend/src/pages/LandingPage.tsx) | Público |
| `/login` | [Login.tsx](../frontend/src/pages/Login.tsx) | Público (redireciona se logado) |
| `/dashboard` | [Dashboard.tsx](../frontend/src/pages/Dashboard.tsx) | Protegido |
| `/cross-matrix` | [CrossMatrix.tsx](../frontend/src/pages/CrossMatrix.tsx) | Protegido + role via `useCapabilities` |
| `/metrics` | [Metrics.tsx](../frontend/src/pages/Metrics.tsx) | Protegido + role via `useCapabilities` |
| `/dependency-graph` | [DependencyGraph.tsx](../frontend/src/pages/DependencyGraph.tsx) | Protegido + role via `useCapabilities` |
| `/processes`, `/processes/:processId` | [Processes.tsx](../frontend/src/pages/Processes.tsx) (lista de processos recolhível por seta; preferência em `localStorage`) | Protegido + **assinatura** (`ProcessStudioRoute` em App.tsx → `/dashboard` se não assinante); lista + editor BPMN em `<iframe>` (`/process-studio/index.html`) |
| `*` | 404 inline | — |

> `ProtectedRoute` só garante **autenticação**. A restrição por **role** (MANAGER/CONSULTANT/
> ADMIN) é feita **dentro das páginas** via `useCapabilities()`, redirecionando ao Dashboard.

### 5.2 Componentes-chave (por função)

- **Grid/detalhe de requisitos:** [RequirementsGrid.tsx](../frontend/src/components/RequirementsGrid.tsx),
  [RequirementDetailModal.tsx](../frontend/src/components/RequirementDetailModal.tsx),
  [RequirementDetailPanel.tsx](../frontend/src/components/RequirementDetailPanel.tsx),
  [CreateRequirementModal.tsx](../frontend/src/components/CreateRequirementModal.tsx).
- **Matriz de cruzamento:** [MatrixTable.tsx](../frontend/src/components/MatrixTable.tsx).
- **Grafo de dependências:** [components/graph/](../frontend/src/components/graph/)
  (RequirementsGraph, graphDrawing, graphHitTest, graphPersistence, graphTypes).
- **Projetos/config:** [ProjectSwitcher.tsx](../frontend/src/components/ProjectSwitcher.tsx),
  [CreateProjectModal.tsx](../frontend/src/components/CreateProjectModal.tsx),
  [ProjectSettingsModal.tsx](../frontend/src/components/ProjectSettingsModal.tsx),
  [ManageMembersModal.tsx](../frontend/src/components/ManageMembersModal.tsx),
  [ListConfigModal.tsx](../frontend/src/components/ListConfigModal.tsx).
- **Import/Export:** [ImportSpreadsheetModal.tsx](../frontend/src/components/ImportSpreadsheetModal.tsx),
  [ExportModal.tsx](../frontend/src/components/ExportModal.tsx).
- **Colaboração/auditoria:** [CommentPanel.tsx](../frontend/src/components/CommentPanel.tsx),
  [ChangeHistory.tsx](../frontend/src/components/ChangeHistory.tsx),
  [DiffView.tsx](../frontend/src/components/DiffView.tsx),
  [NotificationBell.tsx](../frontend/src/components/NotificationBell.tsx).
- **Layout/UX:** [MobileNav.tsx](../frontend/src/components/MobileNav.tsx),
  [LanguageSwitcher.tsx](../frontend/src/components/LanguageSwitcher.tsx),
  [EnvironmentBanner.tsx](../frontend/src/components/EnvironmentBanner.tsx),
  [ErrorBoundary.tsx](../frontend/src/components/ErrorBoundary.tsx).

### 5.3 Hooks (dados via React Query)

Localização: [frontend/src/hooks/](../frontend/src/hooks/).

- **Projetos:** `useProjects`, `useProject`, `useCurrentProject`, `useProjectSettings`,
  `useUpdateProjectSettings`, `useCreateProject`, `useDeleteProject`.
- **Requisitos:** `useRequirements`, `useRequirement`, `useCreateRequirement`,
  `useUpdateRequirement` (optimistic), `useDeleteRequirement`, `useBulkDeleteRequirements`,
  `useBulkImport`.
- **Matriz/Grafo:** `useCrossMatrix`, `useRegenerateCrossMatrix`, `useUpdateCrossMatrixEntry`,
  `useGraphData`.
- **Colaboração:** `useComments`, `useAddComment`, `useChangelog`, `useNotifications`.
- **Membros/listas:** `useProjectMembers`, `useAddProjectMember`, `useRemoveProjectMember`,
  `useProjectLists`, `useProjectTerminology`.
- **Permissões:** `useCapabilities` (baseado em role; ver [utils/roleCapabilities.ts](../frontend/src/utils/roleCapabilities.ts)).
- **Assinatura:** `useEntitlements` ([hooks/useEntitlements.ts](../frontend/src/hooks/useEntitlements.ts)) — fail-closed; esconde menu/rota/aba do Process Studio.
- **Process Studio:** [hooks/useProcesses.ts](../frontend/src/hooks/useProcesses.ts) — lista/cobertura/mutations + a **ponte** `useProcessStudioBridge` (único ponto que fala com o iframe; o JWT nunca entra no editor). Protocolo em [packages/process-editor/src/host.ts](../packages/process-editor/src/host.ts).

### 5.4 Camada de API, estado e i18n

- **API:** [services/api.ts](../frontend/src/services/api.ts) — instância Axios única;
  interceptor injeta Bearer token; 401 → logout. **Todo acesso à API passa por aqui.**
- **Estado:** Auth em [contexts/AuthContext.tsx](../frontend/src/contexts/AuthContext.tsx)
  (token/user em localStorage); notificações em [stores/notificationStore.ts](../frontend/src/stores/notificationStore.ts)
  (Zustand); server state em React Query (staleTime 30s, retry inteligente sem retry em 4xx).
- **i18n:** [i18n/index.ts](../frontend/src/i18n/index.ts) — 11 namespaces (`common`, `nav`,
  `projects`, `enums`, `login`, `landing`, `metrics`, `matrix`, `graph`, `dashboard`, `processes`) × PT/EN
  em [i18n/locales/](../frontend/src/i18n/locales/). Idioma persistido em
  `localStorage['ancoro_lang']`, default `pt`.

---

## 6. Conceitos de domínio

- **5W2H Duplo:** cada requisito descreve o estado atual (**AS-IS**) e o futuro (**TO-BE**).
  Campos AS-IS e `*ToBe` no modelo `Requirement`.
- **Matriz de Cruzamento (Cross Matrix):** dependências de integração entre módulos SAP;
  auto-gerada e validada manualmente; detecta ciclos (status CIRCULAR).
- **Grafo de dependências:** DAG visual (canvas) com layout topológico; sincronização
  bidirecional grafo ↔ banco.
- **Objetivos e órfãos:** requisito cujo WHY não casa com nenhum `ProjectObjective` é marcado
  como **órfão**.
- **Conflitos semânticos:** WHO sobreposto, WHERE incompatível, HOW MUCH contraditório.
- **Evidências:** aprovação de requisito exige ao menos uma evidência anexada.
- **Roles:** `ADMIN` (total), `MANAGER` (gestão + métricas + matriz), `CONSULTANT`
  (cria/edita requisitos), `CLIENT` (visualiza + comenta).

---

## 7. "Onde mexer para..." (guia rápido de modificações)

| Tarefa | Arquivos a tocar (nesta ordem) |
|---|---|
| **Adicionar campo ao Requisito** | `backend/prisma/schema.prisma` → migration (`npm run prisma:migrate`) → `backend/src/schemas` (Zod) → `backend/src/routes/requirements.ts` → `frontend/src/services/api.ts` (tipos) → `RequirementDetailModal.tsx`/`RequirementsGrid.tsx` → traduções em `i18n/locales/*` |
| **Criar novo endpoint** | novo `backend/src/routes/<x>.ts` → lógica em `backend/src/services/` → registrar em `backend/src/index.ts` (bloco `app.use('/api', ...)`) → função em `frontend/src/services/api.ts` → hook em `frontend/src/hooks/` |
| **Adicionar/alterar regra de negócio** | service correspondente em `backend/src/services/` |
| **Alterar permissões por role** | `backend/src/middleware/permissions.ts` + `frontend/src/utils/roleCapabilities.ts` (manter em sincronia) |
| **Adicionar texto de UI** | chave no namespace certo em `frontend/src/i18n/locales/pt/*.json` **e** `en/*.json` (nunca hardcode string) |
| **Nova página/rota** | criar em `frontend/src/pages/` → registrar `<Route>` em `frontend/src/App.tsx` → item de nav em `MobileNav.tsx`/nav + namespace `nav` |
| **Nova lista configurável** | usar `ProjectListItem` (tipos MODULE/REQ_STATUS/INTEGRATION_TYPE/INTEGRATION_TIMING) via `routes/projectLists.ts` + `useProjectLists` |
| **Config runtime (sem redeploy)** | `AppConfig` via `services/configService.ts` + `routes/config.ts` |
| **Mudar o editor/portal BPMN** | `packages/process-core` (modelo/validação) → `process-editor` ou `process-publisher` → `npm run build:process-studio` (editor → `frontend/public/process-studio`) **e** `npm run build:processkit` (backend). Detalhes e decisões: [process-studio/README.md](process-studio/README.md) |
| **Criar elemento a partir de outro (botão "+")** | `process-core/src/edit.ts` (`addNodeAfter`, `whyCannotAddAfter`) → `process-editor/src/store.ts` (`addAfter`) → `canvas/ProcessCanvas.tsx` (alça `data-handle="quick"` + menu). Evento de fim não tem "+" nem alça de conectar |
| **Redimensionar o pool** | `process-core/src/edit.ts` (`resizePool`, nunca corta conteúdo) → alças `data-handle="presize"` em `ProcessCanvas.tsx` (pool selecionado) |
| **Versões do processo (r x versão)** | `r` = `BusinessProcess.rev` (cada Salvar, concorrência otimista); versão = `ProcessVersion` manual com `rev` registrado — `backend/src/routes/processes.ts` (`snapshot`) + `process-editor/src/HostUi.tsx` (`VersionsDialog`) |
| **Liberar/bloquear o Process Studio por assinatura** | `backend/src/config/entitlements.ts` (regra) → `PROCESS_STUDIO_ENABLED` no ambiente; o frontend segue `GET /api/entitlements` (`useEntitlements`) |
| **Métrica/KPI novo** | `backend/src/services/metricsService.ts` → `routes/metrics.ts` → `frontend/src/components/MetricsCharts.tsx` |

---

## 8. Build, ambientes e deploy

Scripts do monorepo em [package.json](../package.json) (executar da raiz):

```bash
npm run install:all      # instala deps (raiz + backend + frontend)
npm run dev              # backend + frontend (dev)
npm run demo             # modo demo (auto-seed)
npm run local            # dev apontando para API demo
npm run build            # build backend + frontend
npm run start:prod       # inicia backend em produção
npm run electron         # app desktop (dev)
npm run electron:build   # gera instalador (NSIS/DMG/AppImage)
npm run prisma:migrate   # roda migrations
npm run prisma:seed      # popula dados demo
npm run prisma:studio    # GUI do banco
```

**Ambientes:** `development` (Postgres via Docker), `demo` (auto-seed), `staging` e
`production` (Neon PostgreSQL). Variáveis por arquivo `.env.<ambiente>` no backend e
`.env`/`.env.demo`/`.env.staging`/`.env.production` no frontend.

**Variáveis-chave (backend):** `DATABASE_URL`, `JWT_SECRET` (≥32 chars em prod),
`JWT_EXPIRES_IN`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `DEMO_MODE`, `DEMO_AUTO_SEED`,
`TENANT_REGISTRY_DATABASE_URL`, `TENANT_REGISTRY_ENCRYPTION_KEY`.
**Frontend:** `VITE_API_URL`, `VITE_ENV`, `VITE_DEMO_MODE`, `VITE_SHOW_ENV_INDICATOR`.

Docker: [docker-compose.yml](../docker-compose.yml) (Postgres local),
[docker-compose.onpremise.yml](../docker-compose.onpremise.yml) (multi-serviço + nginx).

---

## 9. CI/CD

Workflows em [.github/workflows/](../.github/workflows/):

| Workflow | Gatilho | Função |
|---|---|---|
| `pr-checks.yml` | PR/push em main/develop | Lint, TypeCheck (`tsc --noEmit`), testes (backend gera o processkit antes), build; job `process-studio` roda os testes dos pacotes e o build do editor |
| `deploy-qa.yml` | push em develop | Migrate + deploy QA |
| `deploy-prod.yml` | manual em main | Backup + migrate + deploy (com aprovação) |
| `publish-images.yml` | criação de tag | Build/publish imagens Docker |

---

## 10. Índice de documentação

| Documento | Conteúdo | Estado |
|---|---|---|
| **ARCHITECTURE.md** (este) | Mapa de navegação do projeto | ✅ Atual |
| [INFRASTRUCTURE_GUIDE.md](INFRASTRUCTURE_GUIDE.md) | Banco, multi-tenancy, segurança, deploy | ✅ Atual |
| [DEPLOY.md](DEPLOY.md) | Processo de deploy | ✅ Atual |
| [ONPREMISE_INSTALLATION.md](ONPREMISE_INSTALLATION.md) | Instalação self-hosted (Docker) | ✅ Atual |
| [API_EXAMPLES.md](API_EXAMPLES.md) | Exemplos de chamadas à API | ⚠️ Verificar |
| [ROADMAP.md](ROADMAP.md) | Roadmap de features | ✅ Atual |
| [ANALISE_PERMISSOES_POR_ROLE.md](ANALISE_PERMISSOES_POR_ROLE.md) | Matriz de permissões por role | ✅ Atual |
| [ANALISE_ARMAZENAMENTO.md](ANALISE_ARMAZENAMENTO.md) | Análise de armazenamento/dados | ✅ Atual |
| [sap_isu_graph_spec.md](sap_isu_graph_spec.md) | Especificação do grafo SAP ISU | ✅ Atual |
| [process-studio/README.md](process-studio/README.md) | Módulo Process Studio (BPMN): visão, fases, decisões, medições | ✅ Atual |
| `Ancora_Method_Guide_v2_0.docx` | Metodologia de negócio | ✅ Referência |
