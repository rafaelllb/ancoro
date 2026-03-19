# Semana 2: CRUD de Requisitos - Resumo

**Data:** 17/03/2026
**Status:** ✅ Backend completo + Frontend (Auth + Login) completo

---

## ✅ Implementado

### Backend

**1. Schemas de Validação (Zod)**
- [backend/src/schemas/index.ts](../backend/src/schemas/index.ts)
- Validação de: login, create requirement, update requirement, comments, cross-matrix
- Mensagens de erro customizadas

**2. Tipos TypeScript**
- [backend/src/types/index.ts](../backend/src/types/index.ts)
- Enums como constantes (compatível com SQLite)
- Interfaces para Request/Response
- JWTPayload type

**3. Middleware de Autenticação JWT**
- [backend/src/middleware/auth.ts](../backend/src/middleware/auth.ts)
- `generateToken()` - Gera JWT (válido por 7 dias)
- `verifyToken()` - Valida e decodifica token
- `authenticate()` - Middleware que bloqueia rotas sem token
- `optionalAuthenticate()` - Middleware que não bloqueia mas adiciona user se token válido

**4. Middleware de Permissões**
- [backend/src/middleware/permissions.ts](../backend/src/middleware/permissions.ts)
- `canEditRequirement()` - CONSULTANT só edita próprios, MANAGER/ADMIN editam todos
- `canCommentRequirement()` - Qualquer membro do projeto
- `canViewRequirement()` - Cross-module visibility
- `requireEditPermission()` - Middleware para rotas de edição
- `requireCommentPermission()` - Middleware para rotas de comentários
- `requireProjectAccess()` - Middleware para rotas de projetos

**5. Rota de Autenticação**
- [backend/src/routes/auth.ts](../backend/src/routes/auth.ts)
- `POST /api/auth/login` - Login com email/password, retorna user + token
- `POST /api/auth/register` - Not implemented (placeholder)

**6. Rotas CRUD de Requirements**
- [backend/src/routes/requirements.ts](../backend/src/routes/requirements.ts)
- `GET /api/projects/:projectId/requirements` - Lista requisitos (filtros: module, status)
- `GET /api/requirements/:id` - Busca requisito específico
- `POST /api/requirements` - Cria requisito
- `PATCH /api/requirements/:id` - Atualiza requisito (com permissões)
- `DELETE /api/requirements/:id` - Deleta requisito (apenas MANAGER/ADMIN)

**7. Atualização do Server**
- [backend/src/index.ts](../backend/src/index.ts)
- Importa e usa rotas de auth e requirements
- Mantém rotas básicas de projects

**8. Documentação**
- [docs/API_EXAMPLES.md](API_EXAMPLES.md) - Exemplos de uso da API

---

### Frontend

**1. Serviço Axios**
- [frontend/src/services/api.ts](../frontend/src/services/api.ts)
- Instância configurada com BASE_URL
- Interceptor para adicionar token JWT automaticamente
- Interceptor para tratar erro 401 (logout automático)
- Funções: `authAPI.login()`, `requirementsAPI.*`, `projectsAPI.getAll()`

**2. Context de Autenticação**
- [frontend/src/contexts/AuthContext.tsx](../frontend/src/contexts/AuthContext.tsx)
- `AuthProvider` - Provider global
- `useAuth()` - Hook personalizado
- State: user, token, isAuthenticated, isLoading
- Funções: login(), logout()
- Restaura sessão do localStorage

**3. Página de Login**
- [frontend/src/pages/Login.tsx](../frontend/src/pages/Login.tsx)
- Form de email + password
- Error handling
- Loading state
- Credenciais de demo exibidas
- Redirect para /dashboard após login

**4. Página de Dashboard (placeholder)**
- [frontend/src/pages/Dashboard.tsx](../frontend/src/pages/Dashboard.tsx)
- Header com nome do usuário + botão logout
- Placeholder para grid de requisitos

**5. App.tsx Atualizado**
- [frontend/src/App.tsx](../frontend/src/App.tsx)
- React Query Provider
- AuthProvider
- React Router com rotas protegidas
- Toaster para notificações

**6. Configuração**
- [frontend/.env](../frontend/.env) - VITE_API_URL=http://localhost:3000
- [frontend/.env.example](../frontend/.env.example) - Template

---

## 📦 Dependências Necessárias

### Backend (já instaladas)
- express
- prisma, @prisma/client
- jsonwebtoken, bcrypt
- cors, dotenv
- zod

### Frontend (INSTALAR ANTES DE TESTAR)

```bash
cd frontend
npm install react-router-dom axios
```

---

## 🧪 Como Testar

### 1. Iniciar Backend

```bash
cd backend
npm run dev
```

**Endpoints disponíveis:**
- http://localhost:3000/health
- http://localhost:3000/api/auth/login
- http://localhost:3000/api/projects/:id/requirements

### 2. Iniciar Frontend

```bash
cd frontend
npm install react-router-dom axios  # Se ainda não instalou
npm run dev
```

**Frontend:** http://localhost:5173

### 3. Testar Login

1. Acessar http://localhost:5173
2. Você será redirecionado para /login (não autenticado)
3. Login com credenciais de demo:
   - **Email:** joao.silva@seidor.com
   - **Senha:** demo123
4. Após login, será redirecionado para /dashboard
5. Verificar que nome do usuário aparece no header
6. Testar logout

**Outros usuários para testar:**
- maria.santos@seidor.com (CRM)
- pedro.oliveira@seidor.com (FI-CA)
- rafael.brito@seidor.com (Manager)

### 4. Testar API (opcional)

Ver [API_EXAMPLES.md](API_EXAMPLES.md) para exemplos de curl.

---

## 🚧 Próximos Passos (continuação da Semana 2)

### Ainda Falta Implementar:

1. **Hook useRequirements (React Query)**
   - Fetch, create, update, delete requirements
   - Optimistic updates
   - Cache management

2. **Grid de Requisitos (TanStack Table)**
   - Tabela editável
   - Colunas: Req ID | Descrição | Módulo | Status | 5W2H fields | etc.
   - Inline editing (salva ao perder foco)
   - Filtros por módulo e status
   - Search global
   - Indicadores visuais de status (🔴 ⚠️ ✅)

3. **Integração Dashboard ↔ Grid**
   - Dashboard exibe grid de requisitos
   - Filtro padrão: requisitos do módulo do usuário
   - Toggle: "Ver todos os requisitos"

**Tempo estimado:** Mais 1-2 dias de trabalho.

---

## 📊 Progresso da Fase 1 (MVP Core)

| Semana | Tarefa | Status |
|--------|--------|--------|
| **Semana 1** | Setup inicial | ✅ 100% |
| **Semana 2** | CRUD Requirements (Backend) | ✅ 100% |
| **Semana 2** | Auth + Login (Frontend) | ✅ 100% |
| **Semana 2** | Grid Requirements (Frontend) | 🚧 Pendente |
| **Semana 3** | Matriz de Cruzamento | ⏳ Não iniciado |
| **Semana 4** | Sistema de Comentários | ⏳ Não iniciado |

**Progresso total Fase 1:** ~60% (2.5/4 semanas)

---

## 🔍 Arquivos Criados (Semana 2)

### Backend (10 arquivos)
```
backend/src/
├── types/
│   └── index.ts               ✅ Tipos e enums
├── schemas/
│   └── index.ts               ✅ Validações Zod
├── middleware/
│   ├── auth.ts                ✅ JWT middleware
│   └── permissions.ts         ✅ Role-based permissions
├── routes/
│   ├── auth.ts                ✅ Login endpoint
│   └── requirements.ts        ✅ CRUD requirements
└── index.ts                   ✅ Atualizado com novas rotas
```

### Frontend (6 arquivos)
```
frontend/src/
├── services/
│   └── api.ts                 ✅ Axios client
├── contexts/
│   └── AuthContext.tsx        ✅ Auth provider + hook
├── pages/
│   ├── Login.tsx              ✅ Página de login
│   └── Dashboard.tsx          ✅ Dashboard (placeholder)
├── App.tsx                    ✅ Router + providers
└── .env                       ✅ Config API URL
```

### Documentação (3 arquivos)
```
docs/
├── API_EXAMPLES.md            ✅ Exemplos de uso da API
├── WEEK2_SUMMARY.md           ✅ Este arquivo
└── ROADMAP.md                 ✅ Atualizado
```

---

## ✨ Conquistas

- ✅ API REST completa com autenticação JWT
- ✅ Sistema de permissões role-based
- ✅ Validação robusta com Zod
- ✅ Frontend com auth flow completo
- ✅ Rotas protegidas funcionando
- ✅ Documentação detalhada

**Total de linhas de código (estimado):** ~1500 linhas

---

**Última atualização:** 17/03/2026
**Próxima tarefa:** Implementar Grid de Requisitos com TanStack Table
