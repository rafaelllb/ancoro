# Semana 4 - Sistema de Comentários

**Data:** 18/03/2026
**Status:** ✅ 100% Completo

---

## Resumo

Implementação completa do sistema de comentários para requisitos, incluindo:
- API REST para CRUD de comentários
- Validações de permissão e dados
- Painel lateral interativo no Dashboard
- Thread view com suporte a tipos de comentário
- Optimistic updates com React Query

---

## Backend

### Arquivos Criados

| Arquivo | Descrição |
|---------|-----------|
| `backend/src/routes/comments.ts` | Rotas REST para comentários |

### Endpoints Implementados

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/requirements/:id/comments` | Lista comentários de um requisito |
| `POST` | `/api/requirements/:id/comments` | Cria novo comentário |
| `DELETE` | `/api/comments/:id` | Deleta comentário |
| `GET` | `/api/requirements/:id/comments/count` | Retorna contagem (total + por tipo) |

### Validações Implementadas

1. **Permissão de Acesso**
   - User deve ser membro do projeto para ver/criar comentários
   - Reutiliza middleware `requireCommentPermission` existente

2. **Validação de Dados** (Zod)
   - `content`: string não vazia
   - `type`: enum QUESTION | ANSWER | OBSERVATION | CONFLICT

3. **Permissão de Deleção**
   - Autor pode deletar seus próprios comentários
   - Admin pode deletar qualquer comentário
   - Manager pode deletar comentários do projeto

### Integração com ChangeLog

- Quando comentário é criado, registra entry no ChangeLog
- `changeType: 'COMMENT_ADDED'`
- Registra tipo e preview do conteúdo

---

## Frontend

### Arquivos Criados

| Arquivo | Descrição |
|---------|-----------|
| `frontend/src/hooks/useComments.ts` | React Query hooks para comentários |
| `frontend/src/components/CommentForm.tsx` | Formulário de novo comentário |
| `frontend/src/components/CommentPanel.tsx` | Painel lateral de comentários |

### Arquivos Modificados

| Arquivo | Alteração |
|---------|-----------|
| `frontend/src/services/api.ts` | Adicionado tipos e funções de API |
| `frontend/src/pages/Dashboard.tsx` | Integrado CommentPanel |

### Features do Frontend

1. **CommentForm**
   - Seleção visual de tipo (4 opções com emoji e cor)
   - Textarea para conteúdo
   - Descrição contextual do tipo selecionado
   - Loading state durante envio
   - Limpa formulário após sucesso

2. **CommentPanel**
   - Estado "vazio" quando nenhum requisito selecionado
   - Header com reqId e descrição do requisito
   - Lista cronológica de comentários (mais antigos primeiro)
   - Avatar com iniciais e cor baseada no role
   - Badge de tipo com emoji e cor
   - Timestamp relativo ("há 2h", "há 3d")
   - Botão de deletar (visível apenas para quem tem permissão)
   - Confirmação antes de deletar

3. **useComments Hook**
   - `useComments(requirementId)` - lista comentários
   - `useCommentCount(requirementId)` - contagem para badges
   - `useCreateComment()` - mutation com optimistic update
   - `useDeleteComment()` - mutation com optimistic update

### Tipos de Comentário

| Tipo | Emoji | Cor | Uso |
|------|-------|-----|-----|
| QUESTION | ❓ | Amarelo | Solicita esclarecimento |
| ANSWER | 💬 | Verde | Responde dúvida |
| OBSERVATION | 📝 | Azul | Nota ou contexto |
| CONFLICT | ⚠️ | Vermelho | Sinaliza problema |

---

## Decisões Técnicas

### Por que Thread View (não Chat)?

- Comentários são associados a requisitos específicos
- Histórico cronológico é mais útil que conversa em tempo real
- Facilita rastrear quem disse o quê e quando
- Tipos de comentário permitem filtrar/priorizar

### Por que Optimistic Updates?

- UX mais fluida (resposta imediata)
- Rollback automático se API falhar
- Invalidação de cache garante consistência

### Por que reutilizar `requireCommentPermission`?

- Já existia no middleware de permissões
- Verifica se user é membro do projeto
- DRY: evita duplicação de lógica

---

## Estrutura de Dados

### Comment (Database)

```prisma
model Comment {
  id              String   @id @default(cuid())
  requirementId   String
  userId          String
  content         String
  type            String   @default("OBSERVATION")
  createdAt       DateTime @default(now())
}
```

### Comment (API Response)

```typescript
interface Comment {
  id: string
  requirementId: string
  userId: string
  content: string
  type: 'QUESTION' | 'ANSWER' | 'OBSERVATION' | 'CONFLICT'
  createdAt: string
  user: {
    id: string
    name: string
    email: string
    role: string
  }
}
```

---

## Exemplos de Uso

### Criar Comentário

```bash
curl -X POST http://localhost:3000/api/requirements/REQ_ID/comments \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Essa integração precisa ser síncrona ou pode ser batch?",
    "type": "QUESTION"
  }'
```

### Listar Comentários

```bash
curl http://localhost:3000/api/requirements/REQ_ID/comments \
  -H "Authorization: Bearer TOKEN"
```

### Deletar Comentário

```bash
curl -X DELETE http://localhost:3000/api/comments/COMMENT_ID \
  -H "Authorization: Bearer TOKEN"
```

---

## Métricas

| Métrica | Valor |
|---------|-------|
| Arquivos criados | 3 |
| Arquivos modificados | 3 |
| Linhas de código | ~450 |
| Endpoints | 4 |
| Componentes React | 2 |
| Hooks React Query | 4 |

---

## Próximos Passos (Semana 5)

A Fase 1 (MVP Core) está **100% completa**!

Próxima fase: **Notificações Real-Time**
- Socket.io para eventos push
- Notification bell no header
- Toast notifications
- Rooms por projeto

---

## Checklist Final

- [x] API de comentários (GET, POST, DELETE)
- [x] Validação de permissões
- [x] Validação de dados (Zod)
- [x] Hook useComments (React Query)
- [x] CommentForm com seleção de tipo
- [x] CommentPanel com thread view
- [x] Integração no Dashboard
- [x] Contador de comentários na grid (já existia)
- [x] Optimistic updates
- [x] Registro no ChangeLog
- [x] Documentação
