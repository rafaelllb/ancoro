# API Examples - Ancoro Application

Exemplos de uso da API REST do backend.

## Setup

1. Iniciar o backend:
```bash
cd backend
npm run dev
```

Backend rodando em: `http://localhost:3000`

## Autenticação

### Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "joao.silva@seidor.com",
    "password": "demo123"
  }'
```

**Response:**
```json
{
  "user": {
    "id": "clxxxx...",
    "name": "João Silva",
    "email": "joao.silva@seidor.com",
    "role": "CONSULTANT",
    "createdAt": "2026-03-17T...",
    "updatedAt": "2026-03-17T..."
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Salvar o token** para usar nos próximos requests!

---

## Requirements (Requisitos)

### Listar todos os requisitos de um projeto

```bash
# Substituir {TOKEN} pelo token recebido no login
# Substituir {PROJECT_ID} pelo ID do projeto

curl -X GET "http://localhost:3000/api/projects/{PROJECT_ID}/requirements" \
  -H "Authorization: Bearer {TOKEN}"
```

**Com filtros:**
```bash
# Filtrar por módulo
curl -X GET "http://localhost:3000/api/projects/{PROJECT_ID}/requirements?module=ISU" \
  -H "Authorization: Bearer {TOKEN}"

# Filtrar por status
curl -X GET "http://localhost:3000/api/projects/{PROJECT_ID}/requirements?status=VALIDATED" \
  -H "Authorization: Bearer {TOKEN}"

# Múltiplos filtros
curl -X GET "http://localhost:3000/api/projects/{PROJECT_ID}/requirements?module=CRM&status=PENDING" \
  -H "Authorization: Bearer {TOKEN}"
```

### Buscar requisito específico

```bash
curl -X GET "http://localhost:3000/api/requirements/{REQUIREMENT_ID}" \
  -H "Authorization: Bearer {TOKEN}"
```

### Criar novo requisito

```bash
curl -X POST http://localhost:3000/api/requirements \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "reqId": "REQ-006",
    "projectId": "{PROJECT_ID}",
    "shortDesc": "Teste de novo requisito",
    "module": "ISU",
    "what": "Testar criação de requisito via API",
    "why": "Validar funcionamento do endpoint POST",
    "who": "Desenvolvedor",
    "when": "Durante testes",
    "where": "Ambiente de desenvolvimento",
    "howToday": "1. Fazer request POST\n2. Validar response\n3. Verificar no banco",
    "howMuch": "1 requisito",
    "dependsOn": [],
    "providesFor": [],
    "status": "PENDING",
    "consultantNotes": "Requisito de teste"
  }'
```

**Validações:**
- `reqId` deve seguir padrão `REQ-XXX`
- `shortDesc` máximo 50 caracteres
- Campos `what`, `why`, `howToday` mínimo 10 caracteres
- `module` deve ser um dos: ISU | CRM | FICA | DEVICE | SD | MM | PM | OTHER
- `status` deve ser um dos: PENDING | IN_PROGRESS | VALIDATED | CONFLICT | REJECTED | APPROVED

### Atualizar requisito

```bash
curl -X PATCH "http://localhost:3000/api/requirements/{REQUIREMENT_ID}" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "VALIDATED",
    "observations": "Requisito validado em workshop 17/03/2026"
  }'
```

**Permissões:**
- **CONSULTANT**: pode editar apenas requisitos onde é o consultor responsável
- **MANAGER/ADMIN**: pode editar qualquer requisito do projeto

**Campos editáveis (todos opcionais):**
- shortDesc
- module
- what, why, who, when, where, howToday, howMuch
- dependsOn (array de Req IDs)
- providesFor (array de Req IDs)
- consultantNotes
- status
- observations

### Deletar requisito

```bash
curl -X DELETE "http://localhost:3000/api/requirements/{REQUIREMENT_ID}" \
  -H "Authorization: Bearer {TOKEN}"
```

**Permissões:**
- Apenas **MANAGER** ou **ADMIN** podem deletar requisitos
- **CONSULTANT** não pode deletar

---

## Testando com dados do seed

O seed criou os seguintes dados:

### Usuários (todos com senha: `demo123`)

**Consultores:**
- joao.silva@seidor.com (ISU)
- maria.santos@seidor.com (CRM)
- pedro.oliveira@seidor.com (FI-CA)

**Manager:**
- rafael.brito@seidor.com

**Cliente:**
- ana.costa@cliente.com

### Requisitos criados

- REQ-001: Criar contrato de cliente (CRM) - Status: VALIDATED
- REQ-002: Instalar medidor (ISU) - Status: IN_PROGRESS
- REQ-003: Faturamento mensal (ISU) - Status: CONFLICT 🔴
- REQ-004: Documento contábil (FI-CA) - Status: PENDING
- REQ-005: Validar crédito (CRM) - Status: PENDING

---

## Exemplos de Cenários

### Cenário 1: Consultor ISU editando seu próprio requisito

1. Login como João Silva (ISU):
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "joao.silva@seidor.com", "password": "demo123"}'
```

2. Atualizar REQ-002 (instalação de medidor):
```bash
curl -X PATCH "http://localhost:3000/api/requirements/{REQ_002_ID}" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "VALIDATED",
    "consultantNotes": "Validado fluxo de instalação. Device Mgmt fornece readings via batch."
  }'
```

✅ **Sucesso** - João é o consultor responsável por REQ-002

### Cenário 2: Consultor tentando editar requisito de outro módulo

1. Login como João Silva (ISU)
2. Tentar atualizar REQ-001 (CRM - pertence a Maria):
```bash
curl -X PATCH "http://localhost:3000/api/requirements/{REQ_001_ID}" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"status": "APPROVED"}'
```

❌ **Erro 403 Forbidden** - João não pode editar requisitos do módulo CRM

### Cenário 3: Manager editando qualquer requisito

1. Login como Rafael Brito (Manager):
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "rafael.brito@seidor.com", "password": "demo123"}'
```

2. Atualizar qualquer requisito:
```bash
curl -X PATCH "http://localhost:3000/api/requirements/{ANY_REQUIREMENT_ID}" \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"status": "APPROVED"}'
```

✅ **Sucesso** - Manager pode editar qualquer requisito do projeto

### Cenário 4: Cliente tentando editar requisito

1. Login como Ana Costa (Cliente)
2. Tentar atualizar qualquer requisito

❌ **Erro 403 Forbidden** - Cliente não pode editar requisitos (apenas comentar)

---

## Códigos de Status HTTP

| Código | Significado | Quando acontece |
|--------|-------------|-----------------|
| 200 | OK | Request bem-sucedido (GET, PATCH) |
| 201 | Created | Requisito criado com sucesso (POST) |
| 204 | No Content | Requisito deletado com sucesso (DELETE) |
| 400 | Bad Request | Dados de entrada inválidos (validação Zod falhou) |
| 401 | Unauthorized | Token não fornecido ou inválido |
| 403 | Forbidden | Usuário autenticado mas sem permissão para a operação |
| 404 | Not Found | Requisito não encontrado |
| 409 | Conflict | Req ID já existe no projeto |
| 500 | Internal Server Error | Erro no servidor |

---

## Estrutura de Erro

Todos os erros retornam o formato:
```json
{
  "error": "Nome do Erro",
  "message": "Descrição detalhada do erro"
}
```

**Exemplos:**

**Validação:**
```json
{
  "error": "Validation Error",
  "message": "shortDesc: Descrição curta deve ter no máximo 50 caracteres, what: Campo \"What\" deve ter no mínimo 10 caracteres"
}
```

**Autenticação:**
```json
{
  "error": "Unauthorized",
  "message": "Email ou senha inválidos"
}
```

**Permissão:**
```json
{
  "error": "Forbidden",
  "message": "Você não tem permissão para editar este requisito"
}
```

---

## Próximos Endpoints (ainda não implementados)

- `POST /api/requirements/:id/comments` - Adicionar comentário
- `GET /api/requirements/:id/comments` - Listar comentários
- `GET /api/requirements/:id/changes` - Histórico de mudanças
- `GET /api/projects/:id/cross-matrix` - Matriz de cruzamento
- `PATCH /api/cross-matrix/:id` - Validar integração manual

---

**Última atualização:** 17/03/2026
**Semana:** 2 - CRUD de Requirements
