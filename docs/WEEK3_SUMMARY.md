# Semana 3 - Matriz de Cruzamento ✅

**Status:** 100% Completo
**Data:** 17/03/2026
**Autor:** Rafael Brito

---

## 📋 Objetivos da Semana

Implementar a matriz de cruzamento auto-gerada com detecção de dependências circulares, permitindo validação manual de integrações entre requisitos.

---

## ✅ Implementações Realizadas

### Backend - Geração Automática

#### 1. Algoritmo de Detecção de Ciclos ([`backend/src/utils/circularDependency.ts`](../backend/src/utils/circularDependency.ts))
```typescript
// Implementação completa de DFS (Depth-First Search)
- detectCircularDependencies(edges): Detecta ciclos usando três estados (WHITE, GRAY, BLACK)
- formatCycle(cycle): Formata ciclo para visualização
- isReqInCycle(reqId, cycles): Verifica se requisito está em algum ciclo
- getCyclesForReq(reqId, cycles): Retorna ciclos que afetam um requisito
```

**Trade-offs:**
- ✅ Algoritmo robusto com complexidade O(V+E)
- ✅ Detecta múltiplos ciclos independentes
- ✅ Evita duplicatas de ciclos
- ⚠️ Em grafos muito grandes (>1000 nós), pode ter impacto de performance

#### 2. Serviço de Geração da Matriz ([`backend/src/services/crossMatrixService.ts`](../backend/src/services/crossMatrixService.ts))
```typescript
// Funções implementadas:
- regenerateCrossMatrix(projectId): Gera matriz a partir dos requisitos
- extractDependencies(requirements): Extrai "Depende De" e "Fornece Para"
- findModule(reqId, requirements): Lookup de módulo por Req ID
- getCrossMatrix(projectId, moduleFilter?): Lista matriz com filtros
- updateCrossMatrixEntry(entryId, data): Atualiza campos de validação manual
```

**Fluxo de Geração:**
1. Busca requisitos do projeto
2. Extrai dependências dos campos `dependsOn` e `providesFor`
3. Deleta entries antigas da matriz
4. Cria novas entries com status PENDING
5. Detecta ciclos usando algoritmo DFS
6. Atualiza status para CIRCULAR quando detectado

**Campos Auto-Preenchidos:**
- `fromReqId`, `toReqId` (extraídos dos requisitos)
- `fromModule`, `toModule` (lookup automático)
- `status` (PENDING por padrão, CIRCULAR se detectado)

**Campos de Validação Manual:**
- `dataFlow`: Descrição do fluxo de dados
- `integrationType`: BAPI | iDoc | File | API | Batch | Other
- `trigger`: Evento que dispara a integração
- `timing`: Sync | Async | Batch | Event | Real-time
- `ownerId`: Consultor responsável
- `manualNotes`: Observações manuais

#### 3. API REST ([`backend/src/routes/crossMatrix.ts`](../backend/src/routes/crossMatrix.ts))
```typescript
GET    /api/projects/:id/cross-matrix          // Lista matriz (com filtro opcional por módulo)
POST   /api/projects/:id/cross-matrix/regenerate  // Force regeneration
PATCH  /api/cross-matrix/:id                   // Atualiza campos de validação manual
```

**Validações:**
- Requer autenticação JWT em todas as rotas
- Requer permissão de acesso ao projeto
- Validação Zod para campos de update
- Error handling com mensagens detalhadas

#### 4. Trigger Automático ([`backend/src/routes/requirements.ts`](../backend/src/routes/requirements.ts:195-199))
```typescript
// Após criar ou atualizar requisito:
regenerateCrossMatrix(projectId).catch((err) =>
  console.error('Error regenerating cross matrix:', err)
)
```

**Implementação:**
- Executa em background (não bloqueia resposta)
- Fire-and-forget pattern com error logging
- Acionado em POST e PATCH de requirements

---

### Frontend - View da Matriz

#### 1. React Query Hook ([`frontend/src/hooks/useCrossMatrix.ts`](../frontend/src/hooks/useCrossMatrix.ts))
```typescript
// Hooks implementados:
- useCrossMatrix(projectId, moduleFilter?): Busca matriz com filtros
- useRegenerateCrossMatrix(): Mutation para force regeneration
- useUpdateCrossMatrixEntry(projectId): Mutation para editar entry
```

**Features:**
- Auto-refetch quando requisitos são atualizados (cache invalidation)
- Optimistic updates para edição inline
- Toast notifications para sucesso/erro
- Stale time de 5 minutos

#### 2. Tabela Interativa ([`frontend/src/components/MatrixTable.tsx`](../frontend/src/components/MatrixTable.tsx))

**Recursos:**
- TanStack Table v8 com sorting e filtering
- Edição inline com auto-save on blur
- Dropdowns para campos enum (integrationType, timing)
- Status badges coloridos (✅ OK | ⚠️ Pendente | 🔴 Conflito | 🔄 Circular)
- Search global
- Empty state

**Colunas:**
1. From Req (font-mono)
2. To Req (font-mono)
3. From Module
4. To Module
5. Data Flow (editável)
6. Type (dropdown: BAPI/iDoc/File/API/Batch/Other)
7. Trigger (editável)
8. Timing (dropdown: Sync/Async/Batch/Event/Real-time)
9. Status (badge com ícone)
10. Notes (editável)

**UX:**
- Click no header para sort
- Input perde foco = auto-save
- Loading states
- Hover effects

#### 3. Página Cross Matrix ([`frontend/src/pages/CrossMatrix.tsx`](../frontend/src/pages/CrossMatrix.tsx))

**Layout:**
- Header com navegação (← Requisitos | Logout)
- Controls panel:
  - Filtro por módulo (dropdown)
  - Botão "Regenerar Matriz"
- KPI Cards (5 cards):
  - Total de integrações
  - ⚠️ Pendentes (amarelo)
  - ✅ OK (verde)
  - 🔴 Conflitos (vermelho)
  - 🔄 Circulares (roxo)
- Alert para dependências circulares (quando > 0)
- MatrixTable (responsivo)

**Estados:**
- Loading: spinner + mensagem
- Error: card vermelho com detalhes
- Success: tabela + stats

#### 4. Navegação ([`frontend/src/App.tsx`](../frontend/src/App.tsx), [`frontend/src/pages/Dashboard.tsx`](../frontend/src/pages/Dashboard.tsx))
```typescript
// Rota adicionada:
<Route path="/cross-matrix" element={<ProtectedRoute><CrossMatrix /></ProtectedRoute>} />

// Link no Dashboard:
<Link to="/cross-matrix">Matriz de Cruzamento</Link>

// Link na CrossMatrix:
<Link to="/dashboard">← Requisitos</Link>
```

---

## 🎨 Alertas e Notificações

### Toast Notifications
```typescript
// Sucesso:
toast.success('Matriz regenerada com sucesso. X entries criadas.')

// Warning (ciclos detectados):
toast.error('Matriz regenerada com X entries. ⚠️ Y dependência(s) circular(es) detectada(s)!', { duration: 6000 })

// Erro:
toast.error('Erro ao regenerar matriz')
```

### Alert Banner (Ciclos)
```typescript
// Renderizado quando stats.circular > 0:
<div className="bg-purple-50 border-l-4 border-purple-400">
  ⚠️ Dependências circulares detectadas!
  Foram detectadas X integrações com dependências circulares.
  Revise o campo "Notes" para identificar os ciclos.
</div>
```

---

## 📊 Exemplos de Dados

### Req com Dependências
```json
{
  "reqId": "ISU-002",
  "dependsOn": "ISU-001, FI-001",  // JSON array string
  "providesFor": "ISU-004"
}
```

### Cross Matrix Entry Gerada
```json
{
  "id": "cm_abc123",
  "projectId": "1",
  "fromReqId": "ISU-002",
  "toReqId": "ISU-001",
  "fromModule": "ISU",
  "toModule": "ISU",
  "dataFlow": null,
  "integrationType": null,
  "trigger": null,
  "timing": null,
  "ownerId": null,
  "status": "PENDING",
  "manualNotes": null
}
```

### Ciclo Detectado
```json
{
  "cycle": ["ISU-001", "ISU-002", "ISU-003", "ISU-001"],
  "affectedReqIds": ["ISU-001", "ISU-002", "ISU-003"]
}
```

**Entry atualizada:**
```json
{
  "status": "CIRCULAR",
  "manualNotes": "Dependência circular detectada: ISU-001 → ISU-002 → ISU-003 → ISU-001"
}
```

---

## 🔧 Decisões Técnicas

### 1. Parse de Dependências
**Decisão:** String CSV simples (ex: "ISU-001, FI-002")
**Alternativa:** JSON array no banco
**Razão:** SQLite não suporta arrays nativos; JSON strings são mais flexíveis

### 2. Trigger Automático
**Decisão:** Fire-and-forget em background
**Alternativa:** Esperar regeneração completa
**Razão:** Não bloqueia resposta ao usuário; matriz pode levar tempo em projetos grandes

### 3. Optimistic Updates
**Decisão:** Update imediato + rollback em erro
**Alternativa:** Esperar resposta do servidor
**Razão:** UX mais fluida; feedback instantâneo

### 4. DFS vs BFS
**Decisão:** DFS (Depth-First Search)
**Alternativa:** BFS (Breadth-First Search)
**Razão:** DFS é mais eficiente para detectar ciclos; usa menos memória

---

## 📦 Arquivos Criados

### Backend (4 arquivos)
1. `backend/src/utils/circularDependency.ts` (150 linhas)
2. `backend/src/services/crossMatrixService.ts` (200 linhas)
3. `backend/src/routes/crossMatrix.ts` (140 linhas)
4. Atualização: `backend/src/routes/requirements.ts` (+6 linhas)

### Frontend (5 arquivos)
1. `frontend/src/hooks/useCrossMatrix.ts` (120 linhas)
2. `frontend/src/components/MatrixTable.tsx` (250 linhas)
3. `frontend/src/pages/CrossMatrix.tsx` (180 linhas)
4. `frontend/src/vite-env.d.ts` (9 linhas)
5. Atualização: `frontend/src/services/api.ts` (+60 linhas)

**Total:** ~1100 linhas de código

---

## 🧪 Testes Manuais Realizados

### 1. Build Verification
```bash
# Backend
cd backend && npm run build
✓ TypeScript compiled successfully

# Frontend
cd frontend && npm run build
✓ Vite build completed (336.25 kB)
```

### 2. Casos de Teste Sugeridos

#### Teste 1: Geração Básica
```
1. Login no sistema
2. Criar 3 requisitos: ISU-001, ISU-002, ISU-003
3. ISU-001 dependsOn: "ISU-002"
4. ISU-002 dependsOn: "ISU-003"
5. Navegar para Matriz de Cruzamento
6. Verificar: 2 entries criadas (ISU-001→ISU-002, ISU-002→ISU-003)
7. Status: ambas PENDING
```

#### Teste 2: Detecção de Ciclo
```
1. Criar ISU-004 com dependsOn: "ISU-001"
2. ISU-003 editar dependsOn: "ISU-004"
3. Regenerar matriz
4. Verificar: Alert roxo aparece
5. Status das 4 entries: CIRCULAR
6. manualNotes contém: "ISU-001 → ISU-002 → ISU-003 → ISU-004 → ISU-001"
```

#### Teste 3: Edição Inline
```
1. Na matriz, clicar em campo "Data Flow"
2. Digitar: "Customer data sync"
3. Clicar fora (blur)
4. Verificar: toast success "Entry atualizada"
5. Refresh página
6. Verificar: valor persistido
```

#### Teste 4: Filtro por Módulo
```
1. Matriz com requisitos ISU, FI, SD
2. Selecionar filtro: "ISU"
3. Verificar: apenas entries onde fromModule=ISU ou toModule=ISU
4. Total atualizado corretamente
```

---

## 🎯 Entregáveis

- ✅ Matriz auto-gerada a partir de requisitos
- ✅ Detecção de dependências circulares (algoritmo DFS)
- ✅ Validação manual de integrações (inline editing)
- ✅ Status badges visuais (OK, Pendente, Conflito, Circular)
- ✅ Trigger automático ao criar/editar requisitos
- ✅ API REST completa com filtros
- ✅ UI responsiva com TanStack Table
- ✅ Toast notifications
- ✅ KPI cards com estatísticas

---

## 📝 Próximos Passos (Semana 4)

### Sistema de Comentários
1. Backend: API de comments
2. Frontend: CommentPanel component
3. Frontend: CommentForm component
4. Integração: painel lateral no Dashboard

### Features Pendentes
- [ ] Owner dropdown (listar consultores do projeto)
- [ ] Heatmap de integrações (módulo × módulo)
- [ ] Export da matriz para BPD
- [ ] Histórico de mudanças na matriz

---

## 💡 Melhorias Futuras

### Performance
- Cache de lookups (findModule, findRequirementId)
- Debounce em search global
- Virtualização da tabela para grandes datasets

### UX
- Visualização gráfica dos ciclos (force-directed graph)
- Bulk edit de múltiplas entries
- Filtros avançados (por status, owner, timing)
- Export matriz para CSV/Excel

### Testes
- Unit tests para algoritmo DFS
- Integration tests para API
- E2E tests para fluxo completo

---

**Semana 3 Completa!** 🎉

Progresso geral do projeto: **75% da Fase 1 (MVP Core)**
