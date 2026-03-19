# Roadmap de Implementação - Ancoro Application

**Baseado no plano aprovado:** `~/.claude/plans/floating-inventing-ullman.md`

---

## ✅ FASE 0: SETUP INICIAL (CONCLUÍDA)

**Duração:** 1 semana
**Status:** ✅ Completa

### Entregáveis
- [x] Estrutura de pastas do projeto
- [x] Repositório Git inicializado
- [x] README.md e .gitignore
- [x] Backend: npm init + dependências instaladas
- [x] Schema Prisma completo (8 models)
- [x] Migration inicial + Prisma Client gerado
- [x] Frontend: Vite + React + TypeScript + Tailwind
- [x] Electron setup (main.ts + preload.ts)
- [x] Express server básico (/health, /api/test-db, /api/projects)
- [x] Seed data (5 users, 1 project, 5 requirements, 4 integrations)
- [x] Documentação de setup (SETUP.md)

---

## ✅ FASE 1: MVP CORE (4 SEMANAS)

**Objetivo:** CRUD básico, Matriz de Cruzamento, Comentários
**Status:** ✅ Completa (100% concluído)

---

### SEMANA 2: CRUD DE REQUISITOS ✅ 100% COMPLETO

**Backend - API REST:** ✅ 100% COMPLETO
- [x] Criar `backend/src/types/index.ts` - Tipos TypeScript + Enums
- [x] Criar `backend/src/schemas/index.ts` - Validação Zod (login, requirements, comments, cross-matrix)
- [x] Criar `backend/src/routes/requirements.ts`
  - [x] `GET /api/projects/:projectId/requirements` - Listar com filtros (module, status)
  - [x] `GET /api/requirements/:id` - Buscar específico
  - [x] `POST /api/requirements` - Criar requisito
  - [x] `PATCH /api/requirements/:id` - Editar requisito
  - [x] `DELETE /api/requirements/:id` - Deletar requisito (apenas MANAGER/ADMIN)
  - [x] Validação de dados (Zod schema)

- [x] Criar `backend/src/middleware/auth.ts`
  - [x] Middleware de autenticação JWT
  - [x] Função `verifyToken(token)` - Valida e decodifica JWT
  - [x] Função `generateToken(user)` - Gera JWT válido por 7 dias
  - [x] Middleware `authenticate()` - Bloqueia rotas sem token
  - [x] Middleware `optionalAuthenticate()` - Não bloqueia mas adiciona user

- [x] Criar `backend/src/middleware/permissions.ts`
  - [x] `canEditRequirement(user, requirement)` - Consultores só editam seus próprios
  - [x] `canCommentRequirement(user, requirement)` - Qualquer membro do projeto pode comentar
  - [x] `canViewRequirement(user, requirement)` - Visibilidade cross-module
  - [x] `canViewProject(user, project)` - Verifica acesso ao projeto
  - [x] Middlewares: `requireEditPermission`, `requireCommentPermission`, `requireProjectAccess`

- [x] Atualizar `backend/src/index.ts`
  - [x] Importar e usar rotas de requirements
  - [x] Importar e usar rotas de auth
  - [x] Middleware de error handling global (já existia)

- [x] Criar `backend/src/routes/auth.ts`
  - [x] `POST /api/auth/login` - Login com email/password
  - [x] `POST /api/auth/register` - Placeholder (not implemented)

- [x] Criar `docs/API_EXAMPLES.md` - Documentação completa da API com exemplos curl

**Frontend - Autenticação e Estrutura:** ✅ 100% COMPLETO
- [x] Criar `frontend/src/services/api.ts`
  - [x] Axios client configurado
  - [x] Interceptors para JWT token (adiciona automaticamente)
  - [x] Interceptor para tratar erro 401 (logout automático)
  - [x] Base URL do backend (via VITE_API_URL)
  - [x] Funções: authAPI, requirementsAPI, projectsAPI

- [x] Criar `frontend/src/contexts/AuthContext.tsx`
  - [x] AuthProvider component
  - [x] useAuth() hook personalizado
  - [x] State: user, token, isAuthenticated, isLoading
  - [x] Funções: login(), logout()
  - [x] Restaura sessão do localStorage

- [x] Criar `frontend/src/pages/Login.tsx`
  - [x] Form de login (email + password)
  - [x] Error handling
  - [x] Loading state
  - [x] Credenciais de demo exibidas
  - [x] Armazenar JWT token no localStorage
  - [x] Redirect para /dashboard após login

- [x] Atualizar `frontend/src/App.tsx`
  - [x] React Query Provider (QueryClientProvider)
  - [x] AuthProvider wrapper
  - [x] React Router (BrowserRouter)
  - [x] Rotas protegidas (ProtectedRoute component)
  - [x] Rotas públicas (PublicRoute component)
  - [x] Toaster para notificações globais

- [x] Criar `frontend/src/pages/Dashboard.tsx` (placeholder)
  - [x] Header com nome do usuário
  - [x] Botão de logout
  - [x] Estrutura básica

- [x] Criar `frontend/.env` + `.env.example` - Configuração VITE_API_URL

**Frontend - Dashboard de Requisitos:** ✅ 100% COMPLETO
- [x] Criar `frontend/src/hooks/useRequirements.ts`
  - [x] React Query hook para fetch/update/delete
  - [x] Optimistic updates
  - [x] Invalidação de cache
  - [x] Query por projeto + filtros (module, status)

- [x] Criar `frontend/src/components/RequirementsGrid.tsx`
  - [x] Grid editável (TanStack Table)
  - [x] Colunas: Req ID | Descrição | Módulo | Status | What | Why | Who | When | Where | How (hoje) | How Much | Depende De | Fornece Para | Dúvidas | Observações
  - [x] Inline editing (salva auto ao perder foco)
  - [x] Indicadores visuais: 🔴 ⚠️ ✅ 🚧 ❌ ✔️
  - [x] Ordenação/filtro por coluna
  - [x] Search global

- [x] Atualizar `frontend/src/pages/Dashboard.tsx`
  - [x] Integrar RequirementsGrid
  - [x] Filtro padrão: requisitos do módulo do usuário
  - [x] Toggle: "Ver todos os requisitos"
  - [x] Painel lateral para comentários (quando row selecionada - placeholder)

**Entregável:** ✅ Backend API completo + Auth frontend + Grid editável com inline editing COMPLETO

**Ver detalhes:** [WEEK2_SUMMARY.md](WEEK2_SUMMARY.md)

---

### SEMANA 3: MATRIZ DE CRUZAMENTO ✅ 100% COMPLETO

**Backend - Geração Automática:** ✅ 100% COMPLETO
- [x] Criar `backend/src/services/crossMatrixService.ts`
  - [x] `regenerateCrossMatrix(projectId)` - Gera matriz a partir dos requisitos
  - [x] `extractDependencies(requirements)` - Extrai "Depende De" e "Fornece Para"
  - [x] `detectCircularDependencies(entries)` - Algoritmo DFS para detectar ciclos
  - [x] `findModule(reqId)` - Lookup de módulo por Req ID

- [x] Criar `backend/src/routes/crossMatrix.ts`
  - [x] `GET /api/projects/:id/cross-matrix` - Lista matriz
  - [x] `PATCH /api/cross-matrix/:id` - Atualiza campos de validação manual
  - [x] `POST /api/projects/:id/cross-matrix/regenerate` - Force regeneration

- [x] Criar trigger automático
  - [x] Quando requisito é criado/atualizado → regenera matriz
  - [x] Fire-and-forget em background no controller

**Backend - Detecção de Ciclos:** ✅ 100% COMPLETO
- [x] Criar `backend/src/utils/circularDependency.ts`
  - [x] Algoritmo DFS (Depth-First Search) com backtracking
  - [x] Retorna lista de dependências circulares
  - [x] Marca entries com status `CIRCULAR`

**Frontend - View da Matriz:** ✅ 100% COMPLETO
- [x] Criar `frontend/src/pages/CrossMatrix.tsx`
  - [x] Tabela interativa: From Req | To Req | From Module | To Module | Data Flow | Type | Trigger | Timing | Status | Notes
  - [x] Status badges: ✅ OK | ⚠️ Pendente | 🔴 Conflito | 🔄 Circular
  - [x] KPI Cards (Total, Pendentes, OK, Conflitos, Circulares)
  - [x] Alert banner para dependências circulares
  - [x] Filtro por módulo
  - [x] Botão "Regenerar Matriz"

- [x] Criar `frontend/src/components/MatrixTable.tsx`
  - [x] Edição inline dos campos de validação manual
  - [x] Dropdown: Integration Type (BAPI | iDoc | File | API | Batch | Other)
  - [x] Dropdown: Timing (Sync | Async | Batch | Event | Real-time)
  - [x] Input: Data Flow, Trigger, Manual Notes
  - [x] TanStack Table v8 com sorting e filtering
  - [x] Search global

- [x] Criar `frontend/src/hooks/useCrossMatrix.ts`
  - [x] React Query hook
  - [x] Auto-refetch quando requisitos são atualizados
  - [x] Optimistic updates para edição inline

**Alertas:** ✅ 100% COMPLETO
- [x] Frontend: Toast notification quando dependência circular detectada
- [x] Badge roxo 🔄 para status CIRCULAR
- [x] Alert banner detalhado com contador

**Entregável:** ✅ Matriz auto-gerada, detecção de ciclos, validação manual, UI completa COMPLETO

**Ver detalhes:** [WEEK3_SUMMARY.md](WEEK3_SUMMARY.md)

---

### SEMANA 4: SISTEMA DE COMENTÁRIOS ✅ 100% COMPLETO

**Backend - API de Comments:** ✅ 100% COMPLETO
- [x] Criar `backend/src/routes/comments.ts`
  - [x] `POST /api/requirements/:id/comments` - Criar comentário
  - [x] `GET /api/requirements/:id/comments` - Listar comentários
  - [x] `DELETE /api/comments/:id` - Deletar comentário (autor ou admin)
  - [x] `GET /api/requirements/:id/comments/count` - Contagem por tipo

- [x] Validações
  - [x] User deve ser membro do projeto (middleware requireCommentPermission)
  - [x] Type: QUESTION | ANSWER | OBSERVATION | CONFLICT (Zod)
  - [x] Content não pode ser vazio (Zod)
  - [x] Registro no ChangeLog ao criar comentário

**Frontend - Painel de Comentários:** ✅ 100% COMPLETO
- [x] Criar `frontend/src/components/CommentPanel.tsx`
  - [x] Thread view ao selecionar requisito no grid
  - [x] Lista de comentários com timestamps relativos
  - [x] Avatar com iniciais + cor por role
  - [x] Type tag (badge colorido com emoji)
  - [x] Estado vazio quando nenhum requisito selecionado
  - [x] Botão de deletar (apenas para quem tem permissão)

- [x] Criar `frontend/src/components/CommentForm.tsx`
  - [x] Seleção visual de tipo (grid 2x2 com emoji e cor)
  - [x] Descrição contextual do tipo selecionado
  - [x] Textarea de content
  - [x] Loading state + disable durante envio

- [x] Criar `frontend/src/hooks/useComments.ts`
  - [x] useComments(requirementId) - lista comentários
  - [x] useCommentCount(requirementId) - contagem para badges
  - [x] useCreateComment() - mutation com optimistic update
  - [x] useDeleteComment() - mutation com optimistic update

- [x] Integração com Dashboard
  - [x] CommentPanel integrado como painel lateral
  - [x] Contador de comentários na grid (coluna "Comments" já existia)

**Entregável:** ✅ Sistema de comentários funcional, thread view, type tags, optimistic updates COMPLETO

**Ver detalhes:** [WEEK4_SUMMARY.md](WEEK4_SUMMARY.md)

---

## ✅ ENTREGÁVEL FASE 1 (COMPLETO)

**MVP funcional com:**
- ✅ Autenticação JWT (login, rotas protegidas, token no localStorage)
- ✅ CRUD de requisitos (API REST + UI com inline editing)
- ✅ Dashboard com grid editável (TanStack Table, filtros, search)
- ✅ Matriz de cruzamento auto-gerada (trigger automático)
- ✅ Detecção de dependências circulares (algoritmo DFS)
- ✅ Sistema de comentários (thread view, 4 tipos, optimistic updates)

---

## ✅ FASE 2: NOTIFICAÇÕES E VERSIONAMENTO (2 SEMANAS)

**Status:** ✅ Completa (100% concluído)

---

### SEMANA 5: NOTIFICAÇÕES REAL-TIME ✅ 100% COMPLETO

**Backend - Socket.io Setup:** ✅ 100% COMPLETO
- [x] Criar `backend/src/services/notificationService.ts`
  - [x] Configurar Socket.io server
  - [x] Rooms por projeto (isolamento)
  - [x] Emitir eventos: `requirement:conflict`, `crossmatrix:circular`, `requirement:comment`, `requirement:update`, `requirement:create`

- [x] Atualizar `backend/src/index.ts`
  - [x] Integrar Socket.io com Express server (HTTP server + Socket.io)
  - [x] Configurar CORS para Socket.io

- [x] Triggers de notificação
  - [x] Quando status muda para CONFLICT → emit `requirement:conflict`
  - [x] Quando dependência circular detectada → emit `crossmatrix:circular`
  - [x] Quando novo comentário → emit `requirement:comment`
  - [x] Quando requisito criado → emit `requirement:create`
  - [x] Quando requisito atualizado → emit `requirement:update`

**Frontend - Socket.io Client:** ✅ 100% COMPLETO
- [x] Criar `frontend/src/services/socket.ts`
  - [x] Socket.io client configurado
  - [x] Connect/disconnect handlers
  - [x] Join project room
  - [x] Subscription API (onNotification, onConnected, onError)

- [x] Criar `frontend/src/stores/notificationStore.ts`
  - [x] Zustand store para notificações
  - [x] Lista de notificações não lidas
  - [x] Contador de unread

- [x] Criar `frontend/src/hooks/useNotifications.ts`
  - [x] Hook para escutar eventos
  - [x] State de notificações não lidas
  - [x] Integração com toast

- [x] Criar `frontend/src/components/NotificationBell.tsx`
  - [x] Ícone de sino no header
  - [x] Badge com contador de não lidas
  - [x] Dropdown com lista de notificações recentes
  - [x] Indicador de status de conexão WebSocket

- [x] Toast notifications
  - [x] Integrar react-hot-toast (já existia)
  - [x] Popup no canto inferior direito
  - [x] Tipos: success, warning, error, info

**Entregável:** ✅ Notificações push em tempo real, bell icon, toast popups COMPLETO

**Ver detalhes:** [WEEK5_SUMMARY.md](WEEK5_SUMMARY.md)

---

### SEMANA 6: VERSIONAMENTO E HISTÓRICO ✅ 100% COMPLETO

**Backend - ChangeLog Middleware:** ✅ 100% COMPLETO
- [x] Criar `backend/src/middleware/changelog.ts`
  - [x] Funções para capturar updates (diffObjects)
  - [x] Log de cada campo alterado (oldValue → newValue)
  - [x] ChangeType: CREATE | UPDATE | DELETE | STATUS_CHANGE | COMMENT_ADDED
  - [x] logRequirementCreate, logRequirementChanges, rollbackChange

- [x] Atualizar rotas de requirements
  - [x] Registrar criação no changelog
  - [x] Registrar atualizações no changelog

- [x] Criar `backend/src/routes/changelog.ts`
  - [x] `GET /api/requirements/:id/changes` - Histórico de mudanças
  - [x] `GET /api/projects/:projectId/changes` - Timeline do projeto
  - [x] `GET /api/changes/:id` - Detalhes de uma mudança
  - [x] Filtros: por usuário, por campo, por data, paginação
  - [x] `POST /api/requirements/:id/rollback/:changeId` - Rollback (admin only)

**Frontend - View de Histórico:** ✅ 100% COMPLETO
- [x] Criar `frontend/src/hooks/useChangelog.ts`
  - [x] useRequirementChangelog - histórico por requisito
  - [x] useProjectChangelog - timeline do projeto
  - [x] useRollback - mutation para rollback
  - [x] Helpers: formatChangeType, getChangeTypeColor, formatFieldName

- [x] Criar `frontend/src/components/ChangeHistory.tsx`
  - [x] Timeline visual (tipo GitHub commits)
  - [x] Item: timestamp, user, field, old → new
  - [x] Filtros: field
  - [x] Paginação
  - [x] Modo embedded para uso dentro do CommentPanel

- [x] Criar `frontend/src/components/DiffView.tsx`
  - [x] Exibição side-by-side: old value | new value
  - [x] Layout vertical para valores longos
  - [x] Suporte a valores null

- [x] Botão "Rollback" (admin only)
  - [x] Modal de confirmação (ConfirmDialog)
  - [x] Reverte campo para versão anterior

- [x] Integração no CommentPanel
  - [x] Tabs: Comentários | Histórico
  - [x] Alternância entre views

**Entregável:** ✅ Histórico completo de mudanças, timeline visual, rollback COMPLETO

**Ver detalhes:** [WEEK6_SUMMARY.md](WEEK6_SUMMARY.md)

---

## ✅ FASE 3: EXPORT E DASHBOARD (2 SEMANAS)

**Status:** ✅ Completa (100% concluído)

---

### SEMANA 7: GERAÇÃO DE BPD ✅ 100% COMPLETO

**Backend - BPD Generator:** ✅ 100% COMPLETO
- [x] Criar `backend/src/services/bpdGenerator.ts`
  - [x] `generateBPDMarkdown(projectId, moduleFilter?)` - Gera BPD em Markdown
  - [x] `generateBPDDocx(projectId, moduleFilter?)` - Gera BPD em Word
  - [x] `generateSummary(project, requirements, crossMatrix)` - Visão geral com KPIs
  - [x] `generateRequirementsSection(requirements)` - Detalhes 5W2H por módulo
  - [x] `generateMatrixSection(crossMatrix)` - Tabela de integrações
  - [x] `generateConclusionSection(requirements, crossMatrix)` - Conflitos e próximos passos
  - [x] `validateExportReadiness(projectId)` - Validação pré-export com warnings

- [x] Conversão para .docx
  - [x] Usar library `docx` (docx.js)
  - [x] Documento estruturado com tabelas, headings, parágrafos

- [x] Criar `backend/src/routes/export.ts`
  - [x] `GET /api/projects/:id/export/bpd?module=ISU&format=md`
  - [x] `GET /api/projects/:id/export/bpd/preview` - Preview em Markdown (JSON)
  - [x] `GET /api/projects/:id/export/validate` - Validação pré-export
  - [x] Query params: module (opcional), format (md | docx)
  - [x] Stream file download com Content-Disposition

**Frontend - Modal de Export:** ✅ 100% COMPLETO
- [x] Criar `frontend/src/components/ExportModal.tsx`
  - [x] Dropdown: escolher módulo (ou "Todos os Módulos")
  - [x] Cards de formato: Markdown | Word
  - [x] Botão "Exportar BPD"
  - [x] Preview do Markdown antes de download
  - [x] KPI cards (Total, Validados, Pendentes, Conflitos)
  - [x] Warning banners para problemas detectados

- [x] Botão "Exportar BPD" no Dashboard
  - [x] Abre modal de export
  - [x] Download automático do arquivo

**Validações:** ✅ 100% COMPLETO
- [x] Pré-export check: se há requisitos com conflito ou pendências, exibe warnings
- [x] Mostra estatísticas de validação antes de exportar

**Entregável:** ✅ BPD auto-gerado em Markdown e Word, modal de export completo

---

### SEMANA 8: DASHBOARD DE MÉTRICAS ✅ 100% COMPLETO

**Backend - API de Métricas:** ✅ 100% COMPLETO
- [x] Criar `backend/src/services/metricsService.ts`
  - [x] `getProjectMetrics(projectId)` - Agregações de KPIs completas
  - [x] `getConsultantsPendencies(projectId)` - Lista de consultores com pendências
  - [x] `getProgressTimeline(projectId, weeks)` - Série temporal por semana
  - [x] `getIntegrationHeatmap(projectId)` - Matriz módulo × módulo
  - [x] `getCommentStats(projectId)` - Estatísticas de comentários por tipo

- [x] Criar `backend/src/routes/metrics.ts`
  - [x] `GET /api/projects/:id/metrics` - KPIs gerais
  - [x] `GET /api/projects/:id/metrics/consultants` - Consultores com pendências
  - [x] `GET /api/projects/:id/metrics/timeline` - Dados para line chart
  - [x] `GET /api/projects/:id/metrics/heatmap` - Matriz módulo × módulo
  - [x] `GET /api/projects/:id/metrics/comments` - Estatísticas de comentários

**Frontend - Dashboard View:** ✅ 100% COMPLETO
- [x] Criar `frontend/src/pages/Metrics.tsx`
  - [x] KPI Cards principais:
    - [x] Taxa de Validação (%)
    - [x] Conflitos Abertos
    - [x] Integrações Pendentes
    - [x] Dependências Circulares
  - [x] KPI Cards secundários:
    - [x] Total Requisitos
    - [x] Total Integrações
    - [x] Mudanças (24h)
    - [x] Comentários (24h)
  - [x] Barras de progresso por Status
  - [x] Barras de progresso por Módulo
  - [x] Tabela de Consultores com Pendências

- [x] Criar `frontend/src/components/MetricsCharts.tsx`
  - [x] Line chart: Progressão semanal (validados, pendentes, conflitos) - Recharts
  - [x] Heatmap: Matriz de integrações (módulo × módulo) - Grid customizado
  - [x] Bar chart: Integrações por status - Recharts

- [x] Menu de navegação
  - [x] Link "Métricas" no header do Dashboard
  - [x] Link "Métricas" no header da Cross Matrix
  - [x] Rota `/metrics` configurada no App.tsx

**Entregável:** ✅ Dashboard de métricas completo com KPIs e gráficos

---

## 🎨 FASE 4: POLIMENTO E DEPLOY (2 SEMANAS)

**Status:** 🔄 Em progresso (Semana 9 completa)

---

### SEMANA 9: UX E PERFORMANCE ✅ 100% COMPLETO

**Optimistic Updates:** ✅ 100% COMPLETO
- [x] TanStack Query: configurar optimistic updates (já existia em useRequirements)
- [x] Quando editar requisito → UI atualiza imediatamente, reverte se falhar

**Loading States:** ✅ 100% COMPLETO
- [x] Skeleton loaders para grid de requisitos (SkeletonRequirementsGrid)
- [x] Spinners reutilizáveis (Spinner.tsx, LoadingButton)
- [x] Disable buttons durante submissão (LoadingButton component)
- [x] Loading overlays (LoadingOverlay, FullPageLoading)

**Error Handling:** ✅ 100% COMPLETO
- [x] Toast de erro para falhas de API (melhorado no QueryClient)
- [x] Retry automático inteligente (shouldRetry - não retenta 4xx, apenas 5xx)
- [x] Fallback UI para erros críticos (ErrorBoundary, ErrorCard, QueryError)
- [x] Exponential backoff nos retries (1s, 2s, 4s...)

**Validação de Formulários:** ✅ 100% COMPLETO
- [x] Integrar Zod para validação client-side (frontend/src/schemas/index.ts)
- [x] Schemas para: Requirements, Comments, CrossMatrix, Login
- [x] Mensagens de erro amigáveis em português
- [x] Helpers: validateWithErrors, validateField

**Responsive Design:** ✅ 100% COMPLETO
- [x] MobileNav - Menu hamburger com drawer lateral
- [x] Dashboard adaptado para tablet/mobile
- [x] CommentPanel como drawer em mobile (desliza da direita)
- [x] Botões de ação responsivos (ícone + texto em desktop, só ícone em mobile)
- [x] Grid de requisitos com scroll horizontal em mobile

**Testes de Usabilidade:**
- [ ] Testar com Rafael (ou outro consultor SAP)
- [ ] Coletar feedback sobre UX
- [ ] Ajustar fluxos confusas

**Entregável:** ✅ UX polida, performance otimizada, validações robustas COMPLETO

---

### SEMANA 10: DEPLOY E DOCUMENTAÇÃO

**Electron Builder:**
- [ ] Configurar electron-builder
- [ ] Gerar instalador Windows (.exe)
- [ ] Gerar instalador macOS (.dmg)
- [ ] Gerar AppImage Linux
- [ ] Testar instalação em máquinas limpas

**Deploy Backend:**
- [ ] Escolher provedor: Railway / Render / Fly.io
- [ ] Deploy de backend
- [ ] Configurar variáveis de ambiente (produção)
- [ ] Trocar SQLite → PostgreSQL (Neon / Supabase)
- [ ] Testar endpoints em produção

**Database em Produção:**
- [ ] Provisionar PostgreSQL (Neon ou Supabase)
- [ ] Rodar migrations em produção
- [ ] Não rodar seed em produção (dados reais)

**Documentação de Usuário:**
- [ ] Criar `docs/USER_GUIDE.md`
  - [ ] Tutorial de onboarding (primeiro login)
  - [ ] Como criar requisitos
  - [ ] Como validar matriz de cruzamento
  - [ ] Como exportar BPD
  - [ ] Como usar comentários

- [ ] Criar `docs/PERMISSIONS.md`
  - [ ] Tabela de permissões por role (CONSULTANT | CLIENT | MANAGER | ADMIN)
  - [ ] O que cada role pode fazer

- [ ] Criar `docs/FAQ.md`
  - [ ] Perguntas frequentes
  - [ ] Troubleshooting

**Entregável:** App production-ready, instalador desktop, backend deployed, docs completas.

---

## 📊 RESUMO DAS FASES

| Fase | Duração | Status | Progresso | Entregáveis |
|------|---------|--------|-----------|-------------|
| **Fase 0: Setup** | 1 semana | ✅ Completa | 100% | Estrutura, database, seed data |
| **Fase 1: MVP Core** | 4 semanas | ✅ Completa | 100% | CRUD, Matriz, Comentários, Auth |
| **Fase 2: Notificações** | 2 semanas | ✅ Completa | 100% | Socket.io, Versionamento |
| **Fase 3: Export/Métricas** | 2 semanas | ✅ Completa | 100% | BPD Generator, Dashboard Métricas |
| **Fase 4: Polimento** | 2 semanas | 🔄 Em progresso | 50% | UX ✅, Deploy ⏳, Docs ⏳ |

**Timeline total:** 11 semanas (incluindo setup)
**Progresso geral:** 91% (10/11 semanas equivalentes concluídas)

---

## 🎯 CRITÉRIOS DE SUCESSO

### Durante Projeto

| Métrica | Target | Como Medir |
|---------|--------|------------|
| **5W2H compliance** | >90% | % consultores que preenchem antes de workshop |
| **Conflitos na Matriz** | <5/sprint | Nº de 🔴 por sprint |
| **Retrabalho** | <10% | % requisitos mudados após aprovação |
| **Cross não mapeado** | <3/sprint | Integrações descobertas só na config |

### Pós Go-Live (quando app for usado em projeto real)

| Métrica | Target | Como Medir |
|---------|--------|------------|
| Defeitos em produção (1ª semana) | <5 | Incident tracker |
| SLA compliance | >95% | ServiceNow/Jira |
| Client satisfaction (NPS) | >9/10 | Survey |
| On-time delivery | >90% | Project timeline |

---

## 📝 NOTAS IMPORTANTES

### Priorização
- **Must have**: Fase 1 (MVP Core) - sem isso, app não é funcional
- **Should have**: Fase 2 e 3 - features críticas para produção
- **Nice to have**: Fase 4 (polimento) - pode ser feito incrementalmente

### Decisões Técnicas Pendentes
- [ ] PostgreSQL vs. SQLite em produção? (Recomendado: PostgreSQL via Neon)
- [ ] Deploy do backend: Railway vs. Render vs. Fly.io?
- [ ] Conversão .docx: pandoc vs. docx.js?
- [ ] Heatmap: Recharts vs. D3.js?

### Riscos Identificados
1. **Dependências circulares complexas** → Mitigação: algoritmo DFS + visualização gráfica
2. **Sincronização desktop ↔ web** → Mitigação: optimistic locking + conflict resolution UI
3. **Escalabilidade de notificações** → Mitigação: rooms por projeto + throttling
4. **BPD incompleto** → Mitigação: validação pré-export + template customizável

---

## 📝 CHANGELOG

### 18/03/2026 - Fase 4 Semana 9 Completa ✅
**✅ SEMANA 9 - UX e Performance:**
- Frontend: Skeleton.tsx (SkeletonRequirementsGrid, SkeletonTable, SkeletonKPICards)
- Frontend: Spinner.tsx (LoadingButton, FullPageLoading, LoadingOverlay)
- Frontend: ErrorBoundary.tsx (ErrorCard, QueryError)
- Frontend: schemas/index.ts (validação Zod client-side)
- Frontend: MobileNav.tsx (menu hamburger, drawer lateral)
- Frontend: App.tsx melhorado (QueryClient com retry inteligente, ErrorBoundary)
- Frontend: Dashboard.tsx responsivo (mobile-first, botões adaptativos)
- Frontend: CommentPanel.tsx responsivo (drawer em mobile)
- Frontend: RequirementsGrid.tsx com skeleton loader

**📦 Arquivos criados:** 5 arquivos novos
- frontend/src/components/Skeleton.tsx
- frontend/src/components/Spinner.tsx
- frontend/src/components/ErrorBoundary.tsx
- frontend/src/components/MobileNav.tsx
- frontend/src/schemas/index.ts

**📦 Arquivos modificados:** 5 arquivos
- frontend/src/App.tsx (QueryClient, ErrorBoundary, Toaster config)
- frontend/src/pages/Dashboard.tsx (responsive, MobileNav)
- frontend/src/components/RequirementsGrid.tsx (skeleton, a11y)
- frontend/src/components/CommentPanel.tsx (responsive)
- frontend/package.json (zod dependency)

**📏 Linhas de código:** ~900 linhas

**🎉 SEMANA 9 (UX E PERFORMANCE) COMPLETA!**

---

### 18/03/2026 - Fase 2 Completa (Semanas 5 e 6) ✅
**✅ SEMANA 5 - Notificações Real-Time:**
- Backend: Socket.io server integrado com Express
- Backend: notificationService.ts com rooms por projeto
- Backend: Triggers para requirement:conflict, comment, circular, create, update
- Frontend: Socket.io client (socket.ts)
- Frontend: Zustand store para notificações (notificationStore.ts)
- Frontend: Hook useNotifications com integração toast
- Frontend: NotificationBell component com dropdown e badge

**✅ SEMANA 6 - Versionamento e Histórico:**
- Backend: Middleware changelog.ts (diffObjects, logRequirementChanges, rollbackChange)
- Backend: Rotas changelog.ts (GET changes, POST rollback)
- Frontend: Hook useChangelog (useRequirementChangelog, useRollback)
- Frontend: ChangeHistory component (timeline visual, filtros, paginação)
- Frontend: DiffView component (side-by-side, vertical para valores longos)
- Frontend: Integração no CommentPanel com tabs (Comentários | Histórico)

**📦 Arquivos criados:** 10 arquivos novos
- backend/src/services/notificationService.ts
- backend/src/middleware/changelog.ts
- backend/src/routes/changelog.ts
- frontend/src/services/socket.ts
- frontend/src/stores/notificationStore.ts
- frontend/src/hooks/useNotifications.ts
- frontend/src/hooks/useChangelog.ts
- frontend/src/components/NotificationBell.tsx
- frontend/src/components/ChangeHistory.tsx
- frontend/src/components/DiffView.tsx

**📦 Arquivos modificados:** 8 arquivos
- backend/src/index.ts (HTTP server + Socket.io)
- backend/src/routes/requirements.ts (changelog + notifications)
- backend/src/routes/comments.ts (notifications)
- backend/src/services/crossMatrixService.ts (circular notification)
- frontend/src/services/api.ts (changelog API)
- frontend/src/pages/Dashboard.tsx (NotificationBell)
- frontend/src/components/CommentPanel.tsx (tabs + ChangeHistory)

**📏 Linhas de código:** ~1500 linhas

**🎉 FASE 2 (NOTIFICAÇÕES + VERSIONAMENTO) COMPLETA!**

---

### 18/03/2026 - CRUD UI + Importação de Planilha ✅
**✅ Implementado:**
- Frontend: Modal de criação de requisitos (CreateRequirementModal)
  - Formulário completo com todos os campos 5W2H
  - Validação client-side com feedback visual
  - Auto-geração do próximo reqId
- Frontend: Botão de delete na grid de requisitos
  - Apenas visível para ADMIN/MANAGER
  - Diálogo de confirmação antes de deletar
  - Usa hook useDeleteRequirement existente
- Frontend: ConfirmDialog - componente reutilizável
- Frontend: Modal de importação de planilha (ImportSpreadsheetModal)
  - Upload drag & drop de arquivos Excel (.xlsx) e CSV
  - Parse automático com biblioteca xlsx (SheetJS)
  - Auto-detecção de colunas baseado em headers conhecidos
  - Preview com validação visual por linha
  - Status OK/Erro por linha com detalhes
- Frontend: Hook useBulkImport (React Query)
- Backend: Endpoint POST /api/projects/:projectId/requirements/bulk
  - Validação individual por item com Zod
  - Verificação de duplicatas (no banco e no batch)
  - Inserção transacional (all-or-nothing)
  - Trigger de regeneração da matriz após sucesso
- Backend: Schema bulkImportItemSchema para validação
- Dependência: xlsx instalado no frontend

**📦 Arquivos criados:** 5 arquivos novos
- frontend/src/components/ConfirmDialog.tsx
- frontend/src/components/CreateRequirementModal.tsx
- frontend/src/components/ImportSpreadsheetModal.tsx
- frontend/src/hooks/useBulkImport.ts
- backend/src/schemas/index.ts (bulk schemas adicionados)

**📦 Arquivos modificados:** 5 arquivos
- frontend/src/pages/Dashboard.tsx (botões + modais)
- frontend/src/components/RequirementsGrid.tsx (coluna delete)
- frontend/src/services/api.ts (bulkImport API)
- backend/src/routes/requirements.ts (endpoint bulk)
- backend/src/schemas/index.ts (bulk validation)

**📏 Linhas de código:** ~900 linhas

---

### 18/03/2026 - Semana 4 (100% completo) ✅
**✅ Implementado:**
- Backend: API REST de comentários (GET, POST, DELETE, COUNT)
- Backend: Validações com Zod (content, type)
- Backend: Permissões (membro do projeto, autor/admin para delete)
- Backend: Registro no ChangeLog ao criar comentário
- Frontend: Hook useComments (React Query) com optimistic updates
- Frontend: CommentForm com seleção visual de tipo
- Frontend: CommentPanel com thread view e avatars
- Frontend: Integração no Dashboard (painel lateral)
- Docs: WEEK4_SUMMARY.md

**📦 Arquivos criados:** 3 arquivos novos (1 backend + 2 frontend)
**📦 Arquivos modificados:** 3 arquivos (1 backend + 2 frontend)
**📏 Linhas de código:** ~450 linhas

**🎉 FASE 1 (MVP CORE) COMPLETA!**

---

### 17/03/2026 - Semana 3 (100% completo) ✅
**✅ Implementado:**
- Backend: Algoritmo DFS para detecção de ciclos (circularDependency.ts)
- Backend: Serviço de geração automática da matriz (crossMatrixService.ts)
- Backend: API REST da matriz (/api/projects/:id/cross-matrix, /regenerate, PATCH)
- Backend: Trigger automático ao criar/editar requisitos (fire-and-forget)
- Backend: Validação Zod para campos de update da matriz
- Frontend: Hook useCrossMatrix (React Query) com optimistic updates
- Frontend: Componente MatrixTable (TanStack Table v8) com edição inline
- Frontend: Página CrossMatrix com KPI cards e filtros
- Frontend: Status badges visuais (OK, Pendente, Conflito, Circular)
- Frontend: Alert banner para dependências circulares
- Frontend: Navegação entre Dashboard e CrossMatrix
- Frontend: Toast notifications para sucesso/erro
- Docs: WEEK3_SUMMARY.md com exemplos e decisões técnicas

**📦 Arquivos criados:** 9 arquivos novos (4 backend + 5 frontend)
**📏 Linhas de código:** ~1100 linhas

### 17/03/2026 - Semana 2 (100% completo) ✅
**✅ Implementado:**
- Backend: API REST completa (auth + CRUD requirements)
- Backend: Middleware JWT + permissões role-based
- Backend: Validação Zod + tipos TypeScript
- Frontend: Autenticação completa (login + rotas protegidas)
- Frontend: Serviço Axios + AuthContext
- Frontend: Hook useRequirements (React Query) com optimistic updates
- Frontend: RequirementsGrid (TanStack Table v8) com inline editing
- Frontend: Dashboard completo com filtros (status, módulo) e search global
- Frontend: Painel lateral para comentários (placeholder)
- Docs: API_EXAMPLES.md + WEEK2_SUMMARY.md

**📦 Arquivos criados:** 22 arquivos novos
**📏 Linhas de código:** ~2200 linhas

### 17/03/2026 - Fase 0 (Completa)
**✅ Implementado:**
- Estrutura de pastas completa
- Backend: Express + Prisma + SQLite
- Frontend: Electron + React + Vite + TypeScript
- Database: Schema completo (8 models)
- Seed: 5 users, 1 project, 5 requirements, 4 integrations
- Docs: SETUP.md, ROADMAP.md

### 18/03/2026 - Fase 3 Completa (Semanas 7 e 8) ✅
**✅ SEMANA 7 - Geração de BPD:**
- Backend: bpdGenerator.ts (generateBPDMarkdown, generateBPDDocx)
- Backend: Validação pré-export (validateExportReadiness)
- Backend: routes/export.ts (GET /export/bpd, /preview, /validate)
- Backend: Biblioteca `docx` para geração de Word
- Frontend: ExportModal.tsx (seleção módulo/formato, preview, warnings)
- Frontend: Integração no Dashboard (botão "Exportar BPD")
- Frontend: API exportAPI no api.ts

**✅ SEMANA 8 - Dashboard de Métricas:**
- Backend: metricsService.ts (getProjectMetrics, getConsultantsPendencies, getProgressTimeline, getIntegrationHeatmap)
- Backend: routes/metrics.ts (GET /metrics, /consultants, /timeline, /heatmap)
- Frontend: Metrics.tsx (KPI cards, barras de progresso, tabela consultores)
- Frontend: MetricsCharts.tsx (Line chart, Heatmap, Bar chart com Recharts)
- Frontend: Navegação completa (links no Dashboard e CrossMatrix)
- Frontend: Rota /metrics configurada no App.tsx
- Frontend: API metricsAPI no api.ts

**📦 Arquivos criados:** 8 arquivos novos
- backend/src/services/bpdGenerator.ts
- backend/src/services/metricsService.ts
- backend/src/routes/export.ts
- backend/src/routes/metrics.ts
- frontend/src/components/ExportModal.tsx
- frontend/src/components/MetricsCharts.tsx
- frontend/src/pages/Metrics.tsx

**📦 Arquivos modificados:** 6 arquivos
- backend/src/index.ts (rotas export + metrics)
- frontend/src/services/api.ts (exportAPI + metricsAPI)
- frontend/src/pages/Dashboard.tsx (ExportModal + link Métricas)
- frontend/src/pages/CrossMatrix.tsx (link Métricas)
- frontend/src/App.tsx (rota /metrics)

**📏 Linhas de código:** ~2000 linhas

**🎉 FASE 3 (EXPORT + MÉTRICAS) COMPLETA!**

---

**Última atualização:** 18/03/2026 - Fase 4 Semana 9 (UX e Performance) completa
**Autor:** Rafael Brito
**Referência:** `~/.claude/plans/floating-inventing-ullman.md`
