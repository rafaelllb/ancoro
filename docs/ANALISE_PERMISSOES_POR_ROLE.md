# Analise de permissoes por role

## Objetivo

Documentar o comportamento desejado para cada tipo de usuario na aplicacao e mapear o que precisara ser ajustado no backend e no frontend antes da implementacao.

## Escopo pedido

### Regras desejadas

| Funcionalidade | ADMIN | MANAGER | CONSULTANT | CLIENT |
| --- | --- | --- | --- | --- |
| Visualizar requisitos | Sim | Sim | Sim | Sim |
| Criar requisitos | Sim | Sim | Sim | Sim |
| Editar requisitos | Sim | Sim | Sim | Sim |
| Excluir requisitos | Sim | Nao | Sim | Nao |
| Visualizar matriz de cruzamento | Sim | Sim | Sim | Nao |
| Gerar/regenerar matriz | Sim | Sim | Sim | Nao |
| Editar dados manuais da matriz | Sim | Sim | Sim | Nao |
| Visualizar metricas | Sim | Sim | Sim | Nao |
| Configurar listas do projeto | Sim | Sim | Nao | Nao |
| Configurar padrao de ID de requisitos | Sim | Nao | Nao | Nao |
| Criar projetos | Sim | Sim | Nao | Nao |
| Editar dados gerais do projeto | Sim | Nao | Nao | Nao |
| Excluir projetos | Sim | Nao | Nao | Nao |
| Gerenciar membros do projeto | Sim | Sim | Nao | Nao |
| Importar requisitos por planilha | Sim | Sim | Nao | Nao |
| Exportar BPD | Sim | Sim | Sim | Nao |

### Observacoes importantes

- O pedido altera a regra atual de `CLIENT`: hoje o cliente nao edita requisito; o comportamento desejado passa a ser criar e editar.
- O pedido altera a regra atual de `MANAGER`: hoje o manager ainda consegue excluir requisito e alterar padrao de ID; isso precisa ser removido.
- O pedido altera a regra atual de `CONSULTANT`: hoje o consultor nao pode excluir requisito, nao acessa metricas e nao deveria editar a matriz inteira; no comportamento desejado ele passa a excluir requisito, visualizar/gerar matriz e visualizar metricas.
- O pedido tambem exige que a UI esconda acoes proibidas, mas o controle real precisa ficar no backend.

## Estado atual encontrado

### Backend

- `backend/src/middleware/permissions.ts`
  - `requireAdminOrManager()` trata `ADMIN` e `MANAGER` como equivalentes.
  - `canEditRequirement()` bloqueia `CLIENT` e permite `MANAGER` editar qualquer requisito do projeto.
  - Nao existe hoje uma camada central de capacidades por role; as regras estao espalhadas em varios arquivos.

- `backend/src/routes/requirements.ts`
  - `POST /api/requirements` permite criar requisito para qualquer membro do projeto.
  - `PATCH /api/requirements/:id` depende de `requireEditPermission()`, que hoje bloqueia `CLIENT`.
  - `DELETE /api/requirements/:id` permite apenas `ADMIN` e `MANAGER`.
  - `POST /api/projects/:projectId/requirements/bulk` permite apenas `ADMIN` e `MANAGER`.

- `backend/src/routes/projects.ts`
  - `POST /api/projects` permite `ADMIN` e `MANAGER`.
  - `PATCH /api/projects/:id/settings` permite `ADMIN` e `MANAGER` alterar padrao de ID.
  - `PUT /api/projects/:id` e `DELETE /api/projects/:id` ja sao `ADMIN` only.

- `backend/src/routes/projectLists.ts`
  - CRUD de listas configuraveis permite `ADMIN` e `MANAGER`.
  - Essa regra ja esta alinhada para bloquear `CONSULTANT` e `CLIENT`.

- `backend/src/routes/crossMatrix.ts`
  - `GET /projects/:id/cross-matrix` usa apenas acesso ao projeto.
  - `POST /projects/:id/cross-matrix/regenerate` usa apenas acesso ao projeto.
  - `PATCH /cross-matrix/:id` hoje permite editar para qualquer usuario com acesso ao projeto, inclusive `CLIENT`.

- `backend/src/routes/metrics.ts`
  - Todas as rotas de metricas exigem `requireAdminOrManager()`.
  - Isso bloqueia `CONSULTANT`, mas o comportamento desejado e permitir visualizacao para consultor.

### Frontend

- `frontend/src/pages/Dashboard.tsx`
  - `canManageMembers` e `canCreateProject` usam `ADMIN || MANAGER`.
  - `canViewMetrics` tambem usa `ADMIN || MANAGER`, o que esconde metricas para consultor.
  - Botao de configuracao de listas aparece para `ADMIN || MANAGER`.
  - Botao de padrao de ID aparece para qualquer usuario.
  - Botao "Novo Requisito" aparece para qualquer usuario com projeto selecionado.
  - Acoes de planilha e exportacao nao estao segregadas por role.

- `frontend/src/components/RequirementsGrid.tsx`
  - A grid e editavel inline praticamente para todos os perfis.
  - Delete aparece apenas para `ADMIN || MANAGER`.
  - Falta um conceito de `canEditRequirements` e `canDeleteRequirements` separado por role.

- `frontend/src/components/ProjectSettingsModal.tsx`
  - O modal de padrao de ID pode ser aberto pela UI atual para qualquer role; o backend barra apenas parte dos casos.

- `frontend/src/components/ListConfigModal.tsx`
  - Abertura esta protegida no dashboard para `ADMIN || MANAGER`.
  - O modal em si nao recebe capacidade explicita; depende do chamador.

- `frontend/src/pages/CrossMatrix.tsx`
  - Link para metricas aparece sempre.
  - Botao de regenerar matriz aparece para qualquer usuario com acesso ao projeto.
  - `MatrixTable` permite edicao inline sem checagem de role.

- `frontend/src/components/MatrixTable.tsx`
  - Campos editaveis da matriz estao sempre ativos.
  - Falta diferenciar visualizar matriz de editar matriz.

- `frontend/src/pages/Metrics.tsx`
  - Redireciona usuarios que nao sejam `ADMIN` ou `MANAGER`.
  - Precisa incluir `CONSULTANT`.

- `frontend/src/components/ProjectSwitcher.tsx`
  - Criacao de projeto esta corretamente restrita a `ADMIN || MANAGER`.

- `frontend/src/components/CreateRequirementModal.tsx`
  - Nao recebe nenhuma permissao explicita; depende do botao de abertura.

## Gaps entre regra desejada e implementacao atual

### 1. Requisitos

- `CLIENT` precisa passar a criar e editar requisito.
- `CONSULTANT` precisa passar a excluir requisito.
- `MANAGER` precisa perder a exclusao de requisito.
- O backend precisa ser a fonte de verdade para essas tres mudancas.
- A UI precisa esconder edicao/delete conforme a role para evitar erro 403 desnecessario.

### 2. Matriz de cruzamento

- `CLIENT` nao deve visualizar nem gerar nem editar matriz.
- `CONSULTANT` deve visualizar, regenerar e editar dados manuais da matriz.
- Hoje `CLIENT` consegue acessar e editar porque as rotas usam apenas membership do projeto.

### 3. Metricas

- `CONSULTANT` deve visualizar metricas.
- `CLIENT` nao deve visualizar.
- Hoje apenas `ADMIN` e `MANAGER` podem acessar.

### 4. Configuracoes administrativas

- Listas configuraveis:
  - `ADMIN` e `MANAGER` mantem acesso.
  - `CONSULTANT` e `CLIENT` seguem sem acesso.

- Padrao de ID de requisito:
  - apenas `ADMIN`.
  - hoje `MANAGER` ainda consegue alterar no backend.
  - na UI o botao/modal aparece sem restricao adequada.

### 5. Navegacao e experiencia

- A navegacao precisa refletir capacidades:
  - esconder link de metricas para `CLIENT`.
  - esconder acesso a matriz para `CLIENT`.
  - esconder configuracoes de listas para `CONSULTANT` e `CLIENT`.
  - esconder configuracao de padrao de ID para todos exceto `ADMIN`.
  - ajustar botoes de criar/importar/exportar conforme role.

## O que precisara ser ajustado

### Backend

#### 1. Centralizar capacidades por role

Criar uma camada unica de autorizacao para evitar regras duplicadas e contraditorias.

Arquivos candidatos:

- `backend/src/middleware/permissions.ts`
- possivelmente um novo arquivo como `backend/src/utils/roleCapabilities.ts` ou `backend/src/authorization/permissions.ts`

Capacidades sugeridas:

- `canCreateRequirement`
- `canEditRequirement`
- `canDeleteRequirement`
- `canViewCrossMatrix`
- `canRegenerateCrossMatrix`
- `canEditCrossMatrix`
- `canViewMetrics`
- `canManageProjectLists`
- `canManageRequirementIdPattern`
- `canCreateProject`
- `canManageProjectMembers`

#### 2. Ajustar rotas de requisitos

Arquivo:

- `backend/src/routes/requirements.ts`

Ajustes necessarios:

- `POST /api/requirements`
  - manter `ADMIN`, `MANAGER`, `CONSULTANT` e `CLIENT` como permitidos, desde que tenham acesso ao projeto.

- `PATCH /api/requirements/:id`
  - alterar `requireEditPermission()` para permitir `CLIENT`.

- `DELETE /api/requirements/:id`
  - permitir `ADMIN` e `CONSULTANT`.
  - remover `MANAGER`.

- `POST /api/projects/:projectId/requirements/bulk`
  - manter apenas `ADMIN` e `MANAGER`.

#### 3. Ajustar middleware de requisito

Arquivo:

- `backend/src/middleware/permissions.ts`

Ajustes necessarios:

- revisar `canEditRequirement()`
  - `ADMIN`: tudo.
  - `MANAGER`: edita.
  - `CONSULTANT`: edita.
  - `CLIENT`: edita.

- decidir se a edicao continuara presa ao ownership (`consultantId === user.id`) para `CONSULTANT`.
  - O pedido nao colocou essa restricao.
  - Se o comportamento desejado for literal, o consultor podera editar qualquer requisito do projeto.
  - Esse ponto precisa ser confirmado antes da implementacao para evitar conflito com a regra atual.

- criar uma regra separada para delete em vez de reaproveitar `requireEditPermission()`.
  - Hoje o delete usa `requireEditPermission()` mais um check de role.
  - Isso tende a gerar inconsistencias quando editar e excluir passam a ter regras diferentes.

#### 4. Ajustar rotas da matriz

Arquivo:

- `backend/src/routes/crossMatrix.ts`

Ajustes necessarios:

- `GET /projects/:id/cross-matrix`
  - bloquear `CLIENT`.

- `POST /projects/:id/cross-matrix/regenerate`
  - permitir `ADMIN`, `MANAGER`, `CONSULTANT`.
  - bloquear `CLIENT`.

- `PATCH /cross-matrix/:id`
  - permitir `ADMIN`, `MANAGER`, `CONSULTANT`.
  - bloquear `CLIENT`.

#### 5. Ajustar rotas de metricas

Arquivo:

- `backend/src/routes/metrics.ts`

Ajustes necessarios:

- substituir `requireAdminOrManager()` por uma regra que permita tambem `CONSULTANT`.
- manter bloqueio para `CLIENT`.

#### 6. Ajustar rotas de projetos

Arquivo:

- `backend/src/routes/projects.ts`

Ajustes necessarios:

- `PATCH /projects/:id/settings`
  - trocar de `ADMIN || MANAGER` para apenas `ADMIN`.

- `POST /projects`
  - manter `ADMIN || MANAGER`.

- `PUT /projects/:id` e `DELETE /projects/:id`
  - ja estao coerentes com o pedido.

#### 7. Listas configuraveis

Arquivo:

- `backend/src/routes/projectLists.ts`

Ajustes necessarios:

- provavelmente nenhum ajuste de regra de role.
- apenas revisar mensagens de erro para manter consistencia com a nova matriz de permissoes.

### Frontend

#### 1. Criar capacidade por role no cliente

Hoje a UI decide exibicao com checks ad hoc como `user?.role === 'ADMIN' || user?.role === 'MANAGER'`.

Arquivos candidatos:

- novo utilitario, por exemplo `frontend/src/utils/roleCapabilities.ts`
- ou um hook como `frontend/src/hooks/useRoleCapabilities.ts`

Capacidades espelhadas do backend:

- `canCreateRequirement`
- `canEditRequirement`
- `canDeleteRequirement`
- `canViewCrossMatrix`
- `canRegenerateCrossMatrix`
- `canEditCrossMatrix`
- `canViewMetrics`
- `canManageProjectLists`
- `canManageRequirementIdPattern`
- `canCreateProject`
- `canManageProjectMembers`
- `canImportRequirements`
- `canExportBpd`

#### 2. Ajustar dashboard principal

Arquivo:

- `frontend/src/pages/Dashboard.tsx`

Ajustes necessarios:

- mostrar/esconder:
  - link para matriz
  - link para metricas
  - botao "Novo Requisito"
  - botao de configurar listas
  - botao de padrao de ID
  - menu de planilha
  - botao de exportacao BPD
  - botao de gerenciar membros

- regras desejadas na UI:
  - `CLIENT` nao ve matriz nem metricas nem listas nem padrao de ID.
  - `CONSULTANT` ve metricas e matriz, mas nao listas nem padrao de ID.
  - `MANAGER` ve quase tudo, menos padrao de ID e delete de requisito.

#### 3. Ajustar grid de requisitos

Arquivo:

- `frontend/src/components/RequirementsGrid.tsx`

Ajustes necessarios:

- separar visualizacao de edicao inline.
- bloquear edicao inline para quem nao puder editar.
- mudar regra de delete para:
  - `ADMIN`: sim
  - `CONSULTANT`: sim
  - `MANAGER`: nao
  - `CLIENT`: nao

- recomendacao:
  - trocar `userRole?: string` por um objeto de capacidades.

#### 4. Ajustar modal de criacao de requisito

Arquivo:

- `frontend/src/components/CreateRequirementModal.tsx`

Ajustes necessarios:

- o modal pode continuar como esta, desde que o botao de abertura respeite a role.
- opcionalmente receber `canCreateRequirement` para dupla protecao na UI.

#### 5. Ajustar configuracao do padrao de ID

Arquivos:

- `frontend/src/components/ProjectSettingsModal.tsx`
- `frontend/src/pages/Dashboard.tsx`

Ajustes necessarios:

- exibir o botao apenas para `ADMIN`.
- impedir abertura do modal por `MANAGER`, `CONSULTANT` e `CLIENT`.

#### 6. Ajustar configuracao de listas

Arquivos:

- `frontend/src/components/ListConfigModal.tsx`
- `frontend/src/pages/Dashboard.tsx`

Ajustes necessarios:

- manter visivel apenas para `ADMIN` e `MANAGER`.
- opcionalmente desabilitar a propria UI interna do modal se for reutilizado em outro ponto sem protecao.

#### 7. Ajustar pagina da matriz

Arquivos:

- `frontend/src/pages/CrossMatrix.tsx`
- `frontend/src/components/MatrixTable.tsx`

Ajustes necessarios:

- redirecionar `CLIENT` para `/dashboard` ou esconder rota na navegacao.
- esconder link para metricas se o usuario nao puder ver.
- esconder botao de regenerar para `CLIENT`.
- bloquear edicao inline da tabela para `CLIENT`.

#### 8. Ajustar pagina de metricas

Arquivo:

- `frontend/src/pages/Metrics.tsx`

Ajustes necessarios:

- permitir `CONSULTANT`.
- manter redirecionamento para `CLIENT`.

#### 9. Ajustar componentes de navegacao

Arquivos:

- `frontend/src/components/ProjectSwitcher.tsx`
- `frontend/src/components/MobileNav.tsx`
- `frontend/src/App.tsx`

Ajustes necessarios:

- confirmar que rotas protegidas e links sigam a nova matriz.
- `ProjectSwitcher` ja esta correto para criacao de projeto.
- `App.tsx` deve ser revisado para garantir que `CLIENT` nao navegue diretamente para matriz/metricas por URL sem tratamento.

## Proposta de abordagem de implementacao

### Fase 1. Regra unica de autorizacao

- criar mapa de capacidades por role no backend
- espelhar o mesmo mapa no frontend
- eliminar checks espalhados por string literal

### Fase 2. Backend como fonte de verdade

- ajustar middleware
- ajustar rotas de requisitos
- ajustar rotas de matriz
- ajustar rotas de metricas
- ajustar rota de configuracao de padrao de ID

### Fase 3. UI e navegacao

- esconder ou desabilitar acoes nao permitidas
- ajustar redirecionamentos das paginas protegidas
- alinhar menus, modais e tabelas

### Fase 4. Validacao

Cobrir pelo menos estes cenarios:

- `ADMIN` consegue tudo.
- `MANAGER` nao consegue excluir requisito.
- `MANAGER` nao consegue alterar padrao de ID.
- `CONSULTANT` consegue criar, editar e excluir requisito.
- `CONSULTANT` consegue acessar metricas.
- `CONSULTANT` consegue ver e regenerar matriz.
- `CONSULTANT` nao consegue configurar listas.
- `CLIENT` consegue criar e editar requisito.
- `CLIENT` nao consegue excluir requisito.
- `CLIENT` nao consegue acessar matriz.
- `CLIENT` nao consegue acessar metricas.
- `CLIENT` nao consegue configurar listas.
- `CLIENT` nao consegue alterar padrao de ID.

## Ponto que precisa de confirmacao antes da implementacao

Existe uma ambiguidade relevante na regra do consultor:

- regra atual: consultor edita apenas requisitos pelos quais e responsavel.
- texto do pedido: "O consultor pode criar, editar, excluir requisitos" sem restringir aos proprios requisitos.

Se a interpretacao correta for literal, o consultor passara a editar e excluir qualquer requisito do projeto. Se a intencao for manter ownership, a analise acima continua quase toda valida, mas `canEditRequirement()` e `canDeleteRequirement()` precisarao preservar esse recorte.

## Arquivos com maior probabilidade de mudanca

### Backend

- `backend/src/middleware/permissions.ts`
- `backend/src/routes/requirements.ts`
- `backend/src/routes/crossMatrix.ts`
- `backend/src/routes/metrics.ts`
- `backend/src/routes/projects.ts`

### Frontend

- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/CrossMatrix.tsx`
- `frontend/src/pages/Metrics.tsx`
- `frontend/src/components/RequirementsGrid.tsx`
- `frontend/src/components/MatrixTable.tsx`
- `frontend/src/components/ProjectSettingsModal.tsx`
- `frontend/src/components/ListConfigModal.tsx`
- `frontend/src/App.tsx`
- possivelmente um novo utilitario de capacidades por role

