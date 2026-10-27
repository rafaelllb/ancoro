# Process Studio — standalone

Editor BPMN + portal publicável, **sem depender do Ancoro**. Mesmo núcleo (`process-core`), mesmo editor e mesmo publicador do módulo acoplado; só mudam a persistência (SQLite) e a autenticação (código/link por e-mail).

## Rodar

```bash
# uma vez, na raiz do repositório
npm run install:process-studio
cd apps/standalone && npm install

npm run build        # processkit + editor + servidor (dist/server.mjs)
PS_ADMIN_EMAIL=voce@exemplo.com npm start     # http://localhost:3200
```

Sem `PS_SMTP_URL`, o código e o link de login saem **no console do servidor** (só desenvolvimento). Em `NODE_ENV=production` o servidor se recusa a subir sem SMTP e sem `PS_BASE_URL` https.

| Variável | Padrão | Descrição |
|---|---|---|
| `PS_ADMIN_EMAIL` | — | Primeiro administrador (criado se o banco estiver vazio; obrigatório no 1º start) |
| `PS_BASE_URL` | `http://localhost:3200` | URL pública (link do e-mail, cookie `Secure` se https) |
| `PS_PORT` / `PS_DATA_DIR` | `3200` / `./data` | Porta e pasta do SQLite (`process-studio.db`) |
| `PS_SMTP_URL` / `PS_MAIL_FROM` | — | `smtp://user:pass@host:587` |
| `PS_SESSION_DAYS` / `PS_CODE_MINUTES` | `14` / `10` | Validade da sessão e do código/link |
| `PS_TRUST_PROXY` | `false` | `true` atrás de proxy reverso (rate limit por IP real) |

## Como funciona o acesso

- Só entram e-mails **cadastrados** (o ADMIN convida em *Usuários*). O pedido de código sempre responde igual, exista o e-mail ou não.
- Código de 6 dígitos (5 tentativas, uso único) **ou** link. O link abre uma tela com botão *Entrar* — não loga sozinho, porque scanners de e-mail pré-visitam links.
- Papéis: **ADMIN** (tudo + usuários), **EDITOR** (edita e publica; exclui só o que criou), **VIEWER** (somente leitura).
- Sessão em cookie `HttpOnly` + `SameSite=Strict`; POST/PUT/DELETE exigem `x-ps-csrf: 1`.

## Testes

```bash
npm test             # 17 testes de API (SQLite em memória)
npm run e2e          # Chrome real: login por código e por link, editor embutido, salvar, versões, papéis, publicar
```

## Limites conhecidos

- Uma instância = **um** repositório de processos (sem "projetos"). Multi-repositório fica para depois.
- Sem catálogo de requisitos: vínculos elemento→referência são texto livre (ex.: `RF-042`); o seletor sugere as já usadas.
- `Dockerfile` escrito mas **não validado**: o `npm ci` dentro do container falhou por `ECONNRESET` (rede do Docker na máquina de desenvolvimento); as etapas de build e runtime nunca executaram. Rode `docker build` numa rede estável antes de confiar nele.
- A CSP cobre o shell e o editor; o portal publicado (ZIP) é para hospedar à parte.
- `PersistencePort`/`AuthPort` do `process-core` não são usados literalmente: o contrato real precisa de concorrência otimista e papéis, que as portas atuais não expressam. Evoluir as portas (ver TODO em `process-core/src/ports.ts`) quando houver um terceiro adaptador.
