# Ancoro — Guia de Infraestrutura, Segurança e Disponibilidade

> Fonte da verdade para banco, ambientes, deploy, armazenamento de arquivos e operação. Consolida o plano de abril/2026 (v1.0)
> e a revisão de 24/out/2026 (`SAAS_SELF_SERVICE.md`), com **segurança e disponibilidade como critério de decisão** — não facilidade de implantação.

**Autor:** Rafael Brito · **Versão:** 2.0 · **Data:** 2026-10-30 · **Status:** GCP/São Paulo **confirmado pelo Rafael em 2026-10-30**; demais pontos propostos
**Substitui:** v1.0 (abril/2026). O que foi mantido, trocado e removido está na §1.

> **Números de preço e de camada gratuita deste documento são estimativas de ordem de grandeza** (não consultei as tabelas dos
> fornecedores nesta revisão). Confirmar nas calculadoras oficiais antes de contratar ou de precificar o produto.

---

## 0. Como usar este documento

1. Antes de qualquer mudança de infraestrutura, releia a seção relevante.
2. Não improvise decisão arquitetural; caso novo → perguntar ao Rafael.
3. O que **já existe no código** e o que é **só plano** está separado na §13. Não presumir que algo "está pronto" porque está descrito aqui.
4. Mudou algo aqui? Registrar com data e motivo (estigmergia) — mudanças silenciosas geram dívida arquitetural.

---

## 1. O que mudou em relação à v1.0 (abril)

| Tema | v1.0 (abril) | v2.0 (este) | Por quê |
|---|---|---|---|
| Nuvem de produção | Railway Hobby + Neon Launch por cliente | **Uma nuvem só, região São Paulo, serviços gerenciados com SLA** (GCP: Cloud Run + Cloud SQL + Cloud Storage) | Railway Hobby e Neon Launch não dão SLA contratual nem rede privada; cada fornecedor extra é um ponto de falha e uma revisão de segurança a mais |
| Isolamento | Banco por cliente (1 projeto Neon/cliente) | **Banco por cliente, mantido** — mas como *databases* dentro de uma instância HA compartilhada; instância dedicada para quem exigir | Mesmo isolamento lógico, sem custo linear de US$ 19/cliente; ver §5 |
| Dev/QA/demo | Northflank free | **Cloud Run (escala a zero) + Neon free** | Menos fornecedores; Neon continua ótimo para branching e bancos descartáveis |
| Região | Neon US East | **southamerica-east1 (São Paulo)** | Latência e LGPD (dado fica no Brasil); confirmar disponibilidade de cada serviço na região |
| Arquivos (anexos) | não previsto | **Storage de objetos privado + varredura antivírus** (§7) | Novo requisito: anexar arquivos/imagens a elementos de processo |
| Backup | pg_dump semanal + PITR | **PITR + dump lógico por tenant diário em outro fornecedor, com retenção imutável e restore testado** (§9) | PITR da nuvem restaura a *instância*; restaurar **um** cliente exige dump por tenant. E backup no mesmo fornecedor não protege contra erro de conta |
| Chave de criptografia | env var com AES-256-GCM | **Envelope encryption com KMS** | Chave fora do ambiente da aplicação, com rotação e auditoria |
| Disponibilidade | meta não explícita | **SLO por plano e gatilhos de upgrade** (§9, §12) | Prometer só o que a configuração entrega |

**Mantido da v1.0 (era bom):** banco por cliente; tenant registry com URL cifrada; PostgreSQL em todos os ambientes (sem SQLite fora de dev
local); migração orquestrada tenant a tenant com parada na primeira falha; anonimização para QA; tabela de cenários de DR; testes de
isolamento entre tenants como bloqueio de release; GitHub Environments com aprovação manual; checklist de hardening; roteiro LGPD.
**Removido:** Northflank, Railway, Backblaze, referências a um nicho específico de implantação — o produto atende **qualquer projeto de
levantamento de requisitos e modelagem de processo**.

---

## 2. Princípios (em ordem de prioridade)

1. **Confidencialidade do cliente:** requisitos, processos e arquivos de um cliente nunca são alcançáveis por outro — por construção (banco e prefixo de storage separados), não só por filtro de query.
2. **Integridade e recuperabilidade:** todo dado tem backup testado; arquivo tem hash; mudança destrutiva tem rede de proteção.
3. **Disponibilidade honesta:** o SLA prometido é o que a configuração entrega (§9). Sem HA, sem promessa de 99,9%.
4. **Menor privilégio e menos fornecedores:** cada credencial com o mínimo necessário; cada fornecedor novo precisa justificar o risco que adiciona.
5. **Custo cresce com o uso:** dev/QA/demo escalam a zero; produção paga o necessário para a promessa feita.

---

## 2.1 Modelo de oferta (decisão do Rafael, 2026-10-30)

| Segmento | Entrega | Onde roda |
|---|---|---|
| **Individual e pequenas empresas** | **SaaS** (multi-tenant, §3–§9) | GCP São Paulo, gerido por nós |
| **Médias e grandes empresas** | **On-premise** (ou nuvem privada do cliente) com licença | ambiente do cliente (§9.1) |

Consequências para esta arquitetura:
- A nuvem do Ancoro hospeda **só tenants pequenos**: carga e risco menores, e a camada *Dedicated* deixa de ser parte do plano (§5). Quem precisa de isolamento total ou de exigência regulatória vai para on-premise.
- **A qualidade do on-premise vira requisito de produto**, não extra (§9.1): atualização segura, migração de banco sem perda, backup documentado, pacote de segurança para a área de TI do cliente.
- O mesmo código serve aos dois: nada de recurso exclusivo de SaaS no caminho crítico (ex.: o storage de anexos já funciona em disco local para on-premise).
- **Piloto pode ser nos dois modos** (SaaS e on-premise). Isso força validar as duas esteiras de entrega antes do primeiro contrato.

---

## 3. Arquitetura alvo

```
 Usuário (Electron / navegador)
        │ HTTPS (TLS 1.2+, HSTS)
        ▼
 Cloudflare ── DNS · WAF · DDoS · Turnstile (anti-bot em signup/leads)
        │  (origem só aceita tráfego da Cloudflare)
        ▼
 Cloud Run: ancoro-api  (SP)  ── min ≥ 1 instância, CPU sempre alocada, session-affinity (Socket.io)
        │   │      │
        │   │      └─► Redis (adapter do Socket.io; obrigatório com > 1 instância)
        │   └────────► Cloud Storage (bucket PRIVADO, CMEK, versionamento)  ◄── ClamAV (varredura no upload)
        ▼
 Cloud SQL PostgreSQL 16 (SP, IP privado, HA regional na Fase 2)
   ├─ db: tenant_registry        (slug → credencial cifrada via KMS)
   ├─ db: tenant_<cliente-a>     (role próprio, só enxerga este db)
   └─ db: tenant_<cliente-b>
        │
        └─► Backup lógico diário por tenant ──► Cloudflare R2 (outro fornecedor, retenção imutável)

 Segredos: Secret Manager · Chaves: Cloud KMS · Logs: Cloud Logging + Sentry · Uptime: Better Stack
```

Por que esta forma e não as alternativas:

| Opção | Veredito |
|---|---|
| **GCP (escolhida)** | Cloud Run já é o alvo do Dockerfile atual; o Rafael já opera esse stack (Secret Manager, Scheduler, deploy via script) no ProsperIA → menos erro operacional. Região SP, SLA contratual (Cloud Run e Cloud SQL HA ≈ 99,95% cada, estimativa), IAM, KMS, Cloud Armor se precisar |
| AWS (ECS Fargate + RDS Multi-AZ + S3) | Tecnicamente equivalente ou melhor em maturidade; custo de aprendizado e operação maior para uma pessoa só. **Reavaliar** se um cliente enterprise exigir AWS |
| Railway/Render/Fly | Sem rede privada nem SLA contratual; adequados para protótipo, não para dado confidencial de cliente |
| Neon em produção | Excelente produto (branching, scale-to-zero), mas projeto-por-cliente escala custo linearmente e não oferece SLA/rede privada no plano de entrada. **Fica para dev/QA/preview** |
| VM única (Oracle free etc.) | Ponto único de falha sob administração manual; só serve para staging descartável |
| Kubernetes | Overkill para 1 pessoa; reavaliar acima de ~50 clientes |

**Socket.io em Cloud Run — pontos que precisam estar certos** (senão a colaboração em tempo real falha de formas confusas):
`--session-affinity`, `--timeout=3600`, CPU sempre alocada (`--no-cpu-throttling`), `--min-instances ≥ 1` e **adapter Redis** assim que houver mais de uma instância.
O código atual **não** tem o adapter Redis (ver §13).

---

## 4. Ambientes

| Ambiente | Banco | Backend | Dados | Custo |
|---|---|---|---|---|
| local | PostgreSQL via Docker (`npm run db:start`) | processo local | seed completo, descartável | 0 |
| preview/dev | Neon free (branch por PR) | Cloud Run (escala a zero) | sintéticos | ≈ 0 |
| demo | Neon free | Cloud Run (escala a zero) | dataset curado fictício, reset semanal (Action) | ≈ 0 |
| qa | Neon free (ou db separado na instância de prod-like) | Cloud Run | anonimizado de produção ou sintético volumoso; **schema idêntico à produção** | ≈ 0–poucos US$ |
| produção | Cloud SQL (§6) | Cloud Run (§3) | dados reais | §12 |
| on-premise | PostgreSQL do cliente | `docker-compose.onpremise.yml` + licença JWT | do cliente | licença |

Regras de fluxo de dados: produção → QA só **anonimizado**; nada de QA/dev/demo → produção; **nunca** entre clientes. Banner "AMBIENTE DE DEMO/QA" visível nos não-produtivos.

---

## 5. Multi-tenancy e isolamento

**Modelo padrão — banco por cliente:** cada cliente tem seu *database* e seu *role* PostgreSQL; a credencial só conecta nesse database.
Um vazamento por bug de query (esquecer `WHERE projectId`) não cruza a fronteira porque a conexão nem enxerga o outro banco.

| Camada | Para quem | Isolamento | Observação |
|---|---|---|---|
| **Pooled** (padrão SaaS) | consultor, consultoria, empresa | database + role por tenant na instância HA compartilhada; prefixo de storage por tenant | compute compartilhado → "vizinho barulhento" possível; mitigar com `connection_limit` por tenant e monitorar |
| **Dedicated** (exceção) | caso excepcional que não possa ir para on-premise | instância Cloud SQL própria (e bucket próprio, chave KMS própria) | não faz parte da oferta padrão; custo integral repassado |
| **On-premise** | cliente que não aceita nuvem | tudo no ambiente dele | já existe; ver `ONPREMISE_INSTALLATION.md` |

**Tenant registry** (mantido da v1.0): `tenants(slug, name, database_url_encrypted, plan, status)` + `tenant_users(tenant_id, user_email, role)`.
Mudança: `database_url_encrypted` passa a ser cifrada por **envelope encryption com Cloud KMS** (chave de dados cifrada pela chave KMS; rotação anual sem reescrever tudo).
Usuário em vários tenants (consultor que atende N clientes) é suportado por `tenant_users`.

**Resolução em runtime:** JWT (`userId`, `tenantSlug`) → registry → URL decifrada → `PrismaClient` em cache LRU (máx. ~10 vivos) → `req.prisma`.
Nunca instanciar `PrismaClient` por requisição; nunca usar o `prisma` global em handler de tenant. Acima de ~50 tenants ativos, colocar **PgBouncer** na frente do Cloud SQL
(cada cliente Prisma abre conexões; o limite do Postgres chega rápido).

**Testes de isolamento são bloqueio de release:** usuário do tenant A não lê/escreve nada do B (API, anexos, exportações, portal publicado, WebSocket), JWT de um tenant não vale em outro, id de outro tenant retorna 404.

---

## 6. Banco de dados

- **PostgreSQL 16** em todos os ambientes que importam. SQLite só no desenvolvimento local rápido (o schema SQLite é espelho e **sempre** muda junto com o PostgreSQL).
- **Migrações:** `prisma migrate deploy`, nunca `db push`, nunca `--accept-data-loss` fora do local. Antes de cada deploy de produção: backup sob demanda de todos os tenants; migração tenant a tenant; **para na primeira falha**; deploy do código só depois (e o código deve tolerar o schema N e N+1 — *expand/contract*).
- **Cloud SQL — configuração:** IP privado (sem IP público), SSL obrigatório, backups automáticos + PITR (≥ 7 dias), proteção contra exclusão, flags de log de conexão/DDL, `max_connections` dimensionado. HA regional (multi-zona) a partir da Fase 2 (§12).
- **Acesso humano:** nada de senha de superusuário em máquina de dev; acesso de suporte por túnel autenticado (IAM + Cloud SQL Auth Proxy), com log.
- **Dados do tenant em repouso:** criptografia gerenciada (padrão); chave KMS própria (CMEK) para Dedicated.

---

## 7. Anexos e imagens por elemento (Process Studio)

Implementado em 2026-10-30. Decisões:

| Decisão | Escolha | Motivo |
|---|---|---|
| Onde ficam os bytes | **Storage de objetos** atrás de uma interface (`AttachmentStorage`): disco local (dev/demo/on-premise) ou S3-compatível (produção) | Disco do Cloud Run é efêmero; arquivo dentro do JSON do processo inflaria save, versão e portal |
| O que o banco guarda | Só metadados (`ProcessAttachment`: nome, tipo detectado, tamanho, SHA-256, `storageKey`, quem enviou) | Consulta rápida; troca de storage = copiar objetos mantendo as chaves |
| Vínculo com o diagrama | `(processId, elementId)` — **fora** do `ProcessModel` | Restaurar versão antiga "reencontra" os anexos do elemento; salvar não carrega arquivos |
| Acesso | Sempre pela API autenticada; **não há URL pública** do arquivo | Mesmo controle de projeto/papel dos processos; o editor em iframe nunca recebe o token |
| Tipo de arquivo | **Allowlist por assinatura binária** + coerência com a extensão (PNG/JPG/GIF/WebP, PDF, Office, ODF, txt/csv/md/json). SVG, HTML, JS, executáveis e ZIP genérico **recusados** | Não confiar no que o cliente declara; SVG executa script |
| Entrega | `nosniff`, `Content-Security-Policy: sandbox`, imagem raster inline, o resto sempre `attachment` | Mitiga XSS e MIME-sniffing |
| Integridade | SHA-256 conferido a cada download | Detecta adulteração no storage |
| Limites (env) | 10 MB/arquivo, 25/elemento, 500 MB/projeto | Controle de custo e abuso |
| Quem exclui | quem enviou ou ADMIN (mesma regra de exclusão de processo) | Governança |
| Exclusão do processo | apaga também os objetos | Evita dado órfão retido (LGPD) |

**Produção:** bucket **privado** (acesso público bloqueado, *uniform bucket-level access*), versionamento + retenção para recuperar exclusão acidental,
CMEK, um prefixo por tenant (`<projectId>/<processId>/<uuid>`), conta de serviço com acesso só a esse bucket, ciclo de vida para versões antigas.
Hoje o provedor S3 implementado serve **Cloudflare R2/AWS S3/MinIO**; para GCS nativo falta um `GcsStorage` (o modo de interoperabilidade do GCS tem
particularidades com o SDK da AWS — não apostar nele sem testar). Como as chaves são opacas, começar em R2 e migrar para GCS depois é só copiar objetos.

**Antivírus (pendente, obrigatório antes de aceitar arquivo de cliente em produção):** ClamAV como serviço Cloud Run chamado no upload, **fail-closed**
(se o scanner estiver fora, o upload é recusado). Ver TODO em `backend/src/services/attachmentPolicy.ts`.

**Pendências conhecidas:** o portal publicado (ZIP estático) ainda **não** inclui os anexos; anexos de elementos apagados do diagrama ficam retidos (porque restaurar versão os recupera) — falta rotina de limpeza por política; o app standalone não tem anexos.

---

## 8. Segurança

### 8.1 Obrigatório antes do primeiro cliente real

| Item | Estado | Prioridade |
|---|---|---|
| Helmet, rate limit global e de login, CORS por lista, Pino | **existe** em `backend/src/index.ts` | — |
| `prisma migrate deploy` em vez de `db push --accept-data-loss` | **não** (`docker-entrypoint.sh` ainda usa `db push`) | Crítica |
| Multi-tenancy montada no request | **não** (módulo existe, não está em `index.ts`) | Crítica |
| Testes de isolamento entre tenants | **não** | Crítica |
| Backup por tenant + restore testado | **não** | Crítica |
| Segredos no Secret Manager, nenhum `.env` com segredo real versionado | parcial | Crítica |
| Rotação de refresh token / revogação de sessão | **não verificado** | Alta |
| Auditoria de eventos de autenticação e de acesso a anexo | parcial (`change_logs`) | Alta |
| Antivírus nos anexos | **não** | Alta |
| Sentry (API + editor) com tag de tenant | não | Alta |
| Cloudflare na frente + origem restrita | não | Alta |
| Teste de invasão externo (antes de cliente enterprise) | não | Média |

### 8.2 Práticas fixas
- Tokens de curta duração; cookies/headers só em HTTPS; CSP; `X-Content-Type-Options`.
- Menor privilégio: conta de serviço da API sem permissão de administrar Cloud SQL; role de tenant sem `CREATEDB`/`SUPERUSER`.
- Dependências: `npm audit` e Dependabot no CI; imagem base fixada e escaneada.
- Nunca logar senha, token, conteúdo de arquivo ou texto de requisito.
- Segregação: quem faz deploy de produção ≠ conta pessoal do dia a dia (MFA obrigatório no GitHub, GCP e Cloudflare).

---

## 9. Disponibilidade, backup e recuperação

**SLOs (metas internas; só viram cláusula contratual quando a configuração correspondente existir):**

| Plano | Disponibilidade-alvo | Configuração mínima exigida |
|---|---|---|
| Solo / Team (Pooled, Fase 1) | 99,5% mensal (≈ 3,6 h/mês), melhor esforço, suporte em horário comercial | Cloud Run min 1, Cloud SQL zona única + PITR |
| SaaS com SLA 99,9% (Fase 2, opcional) | 99,9% mensal (≈ 43 min/mês) | Cloud SQL **HA**, ≥ 2 instâncias + Redis, status page, plantão definido |
| On-premise (médias/grandes) | SLA é do ambiente do cliente; o Ancoro responde por suporte e correções (prazos por severidade no contrato) | ver §9.1 |

> **Risco franco:** hoje o plantão é uma pessoa só. Disponibilidade técnica de 99,95% não vira 99,9% de serviço sem alguém para agir às 3h.
> Não assinar SLA com multa antes de ter runbooks testados e um segundo responsável (mesmo que part-time).

**Backups:**
1. **Cloud SQL automático + PITR** — protege contra erro de aplicação e falha de disco (restaura a instância inteira).
2. **Backup sob demanda antes de cada migração de produção.**
3. **Dump lógico por tenant, diário** (`pg_dump -Fc`) → **Cloudflare R2** (outro fornecedor), com bloqueio de objeto/retenção (imutável por N dias) e credencial de escrita sem permissão de apagar. Permite restaurar **um** cliente sem tocar nos outros.
4. **Arquivos:** versionamento do bucket + cópia periódica para o segundo fornecedor.
5. **Restore testado todo mês** (job automático restaura o dump mais recente num banco temporário, valida contagens/integridade e apaga). Backup nunca restaurado não é backup.

**Cenários (RTO = tempo para voltar, RPO = dado que se pode perder):**

| Cenário | RTO | RPO | Como |
|---|---|---|---|
| Deploy ruim | < 15 min | 0 | rollback de revisão do Cloud Run |
| Instância Cloud Run caiu | automático | 0 | reinício/escala; com ≥ 2 instâncias sem interrupção |
| Zona inteira indisponível | minutos (HA) / horas (sem HA) | ≈ 0 (HA) / último PITR | failover do Cloud SQL HA |
| Banco de **um** tenant corrompido/apagado | < 2 h | até 24 h (dump diário) ou PITR | restaurar dump do tenant |
| Erro humano em migração | < 1 h | 0 | backup pré-migração |
| Região SP indisponível | 4–24 h | até 24 h | restaurar dumps em outra região (runbook; automação só no Enterprise) |
| Credencial comprometida | < 1 h | 0 | rotacionar segredos, invalidar sessões, auditar acessos |
| Conta de nuvem comprometida | horas | até 24 h | dumps e arquivos no segundo fornecedor, com retenção imutável |

Runbooks em `docs/runbooks/` (um por linha da tabela) — **a criar**.

### 9.1 On-premise (médias e grandes empresas)

O cliente opera a infraestrutura; nós entregamos um produto que se instala, atualiza e recupera sem a gente por perto. Já existe `docker-compose.onpremise.yml`,
`nginx/nginx.onpremise.conf`, licença JWT e `ONPREMISE_INSTALLATION.md`. O que falta para ser vendável a uma empresa grande:

| Item | Estado | Observação |
|---|---|---|
| Atualização por versão | não | imagens **versionadas e assinadas** (cosign) num registry; `docker compose pull` + migração automática com backup prévio e **rollback documentado** |
| Migração de banco segura | **não** (`db push --accept-data-loss` no entrypoint) | mesmo bloqueador do SaaS; no on-premise é pior, porque não temos acesso para consertar |
| Backup/restore | só texto no guia de instalação | script `backup.sh`/`restore.sh` testados (banco + volume de anexos) e checagem de integridade |
| Armazenamento de anexos | **disco local** (volume) ou S3 compatível/MinIO do cliente | documentar volume persistente e backup do volume |
| Pacote de segurança para a TI do cliente | não | SBOM (lista de dependências), relatório de pen test, `npm audit`/scan de imagem, modelo de dados e fluxo de rede, respostas-padrão ao questionário de segurança, política de divulgação de vulnerabilidades |
| Autenticação corporativa | não | **SSO (OIDC/SAML)** e provisionamento de usuários: grande empresa quase sempre exige |
| Sem "ligar para casa" | a verificar | licença validada offline; nenhuma telemetria sem consentimento; modo air-gapped documentado |
| Antivírus nos anexos | não | no on-premise o scanner é do cliente: expor um ponto de integração (ICAP/clamd) configurável |
| Suporte | — | canais, severidades e prazos no contrato; acesso remoto só por sessão autorizada pelo cliente |

### 9.2 Piloto em empresa grande (ex.: consultoria global de auditoria/risco)

Um piloto nesse porte quase certamente cai no **on-premise (ou na nuvem privada do cliente)** e passa por avaliação de fornecedor (segurança, privacidade, continuidade).
Antes de aceitar dado real: pen test externo, pacote de segurança (§9.1), DPA/NDA, SSO, migração segura, backup testado. Um piloto de **demonstração com dados fictícios**
no SaaS de demo é a ponte enquanto isso não está pronto — e exige a mesma disciplina de não misturar dados entre ambientes (§4).

### 9.3 Primeiro tenant de produção: o próprio Rafael (plano Individual)

Em 2026-10-30 o Rafael decidiu usar o Ancoro como cliente individual num projeto real (implantação de faturamento no mercado livre de energia, via consultoria). Isso o torna o **primeiro dado real em produção**:
- Todos os bloqueadores da §13 valem **antes** de subir esse projeto — em especial migração segura, backup por tenant com restore testado e isolamento. Dado real não entra em dev/demo/QA.
- O conteúdo do projeto (requisitos, processos, anexos) pertence ao cliente final e à consultoria contratante: **confirmar com a consultoria que o uso de ferramenta própria é permitido** (contrato/NDA/política de dados) e que a localização dos dados (São Paulo) atende. Se houver restrição, o alternativo é rodar on-premise/local para esse projeto.
- Usar o próprio produto em condições reais é a melhor validação do plano Individual e do fluxo de assinatura.

---

## 10. CI/CD

Workflows (`.github/workflows/`): `pr-checks` (existe), `deploy-qa` (existe), `deploy-prod` (existe como **esqueleto: todas as etapas de produção são `echo TODO`**).

Pipeline de produção alvo:
1. Aprovação manual (GitHub Environment `production`, MFA).
2. Backup sob demanda de todos os tenants.
3. Migração do demo e depois **tenant a tenant** (`scripts/migrate-all-tenants.ts`), parando na primeira falha.
4. Deploy do Cloud Run com **tráfego gradual** (revisão nova a 10% → 100%) e health check.
5. Smoke tests contra produção (login, criar/ler requisito, abrir processo, subir e baixar um anexo de teste).
6. Rollback automático se o smoke falhar; notificação.
7. Build do instalador Electron e publicação em Releases.

Autenticação do CI na nuvem por **Workload Identity Federation** (sem chave JSON de longa duração no GitHub).

---

## 11. Observabilidade

- **Logs:** Pino estruturado → Cloud Logging; campos fixos `tenantSlug`, `userId`, `requestId`; retenção definida (≥ 90 dias para auditoria de acesso).
- **Erros:** Sentry (API + editor + Electron), tag `tenant_slug`.
- **Métricas/alertas:** latência p95, taxa de erro, conexões Socket.io, conexões de banco por tenant, memória, fila de backup, falha de restore, cota de storage por projeto.
- **Uptime externo:** Better Stack/UptimeRobot em `/health` (checagem com leitura no banco, não só "processo vivo") + **status page pública**.
- **Alerta de custo** na nuvem (orçamento com aviso a 50/80/100%).

---

## 12. Custos e gatilhos de upgrade

Valores em US$/mês, **estimativas de ordem de grandeza para região São Paulo** (confirmar nas calculadoras):

| Item | Fase 1 — piloto (1–5 clientes) | Fase 2 — SLA 99,9% | Observação |
|---|---|---|---|
| Cloud Run (API) | 40–70 (min 1 instância) | 100–150 (≥ 2 instâncias) | CPU sempre alocada para WebSocket |
| Cloud SQL PostgreSQL | 120–180 (zona única, ~2 vCPU/8 GB, 50 GB) | 250–350 (HA regional) | Dimensionar por medição; o maior item fixo |
| Redis (adapter Socket.io) | — | 40–60 | só com > 1 instância |
| Storage de arquivos + backups | 2–10 | 10–40 | cresce com o uso; R2 sem custo de saída |
| KMS / Secret Manager / logs | 5–15 | 15–40 | |
| Cloudflare | Free | Pro ≈ 25 | WAF gerenciado no Pro |
| Sentry / Better Stack | Free | ≈ 30–60 | |
| Dev/QA/demo (Neon free + Cloud Run) | ≈ 0–10 | ≈ 10–30 | |
| **Total aproximado** | **≈ 170–290** | **≈ 450–750** | |

Custo marginal por cliente novo em modo Pooled: pequeno (um database, conexões e storage) — da ordem de **US$ 3–15/mês**; é por isso que o modelo vale mais que 1 projeto Neon por cliente (US$ 19 fixos cada).

**Gatilhos para subir de fase (não esperar o incidente):**
- → HA (Fase 2): cliente SaaS com cláusula de disponibilidade **ou** ~20+ clientes pagantes **ou** primeira indisponibilidade que doa. Como o SaaS é só para porte pequeno, HA tende a ser necessário mais tarde que no plano anterior.
- → Redis + 2ª instância: junto com HA, ou qualquer necessidade de zero downtime em deploy.
- → PgBouncer: ~50 tenants ativos ou erro de limite de conexões.
- → Instância Dedicated: só por exceção (o caminho normal para isolamento total é on-premise) ou volume que degrade os vizinhos.
- → Segunda região/DR automatizado: cliente enterprise com RTO < 4 h.
- → Pen test externo: **antes do primeiro piloto on-premise em empresa grande** (o questionário de segurança vai pedir). SOC 2/ISO 27001: quando um contrato exigir.

Precificação do produto: ver conversa de 2026-10-30 / `docs/SAAS_SELF_SERVICE.md` (a registrar após decisão do Rafael).

---

## 13. Estado real × alvo (checklist)

**Já existe:** Dockerfiles; docker-compose local e on-premise; Helmet/rate limit/CORS/Pino; módulo `backend/src/tenancy/` (crypto, cache, resolver — **desmontado**); modelos `Tenant`/`TenantUser`;
workflows de PR e QA; licença on-premise; anexos por elemento com storage local e S3 (§7); gate de assinatura do Process Studio.

**Falta, em ordem de execução:**

*Bloqueadores (antes de qualquer cliente em produção)*
- [ ] Migration baseline do PostgreSQL; trocar `db push --accept-data-loss` por `migrate deploy` em `docker-entrypoint.sh`.
- [ ] Montar tenancy no request (`index.ts`), remover o `prisma` global dos handlers, migrar os services que instanciam `new PrismaClient()` próprio (ex.: `evidenceService.ts`).
- [ ] Suíte de isolamento entre tenants (API, anexos, WebSocket, portal).
- [ ] `scripts/migrate-all-tenants.ts`, `scripts/backup-all-tenants.ts`, `scripts/anonymize-prod-snapshot.ts`; job de restore mensal.
- [ ] Projeto GCP: rede privada, Cloud SQL, Secret Manager, KMS, conta de serviço mínima, Workload Identity Federation.
- [ ] `deploy-prod.yml` real (sem placeholders).
- [ ] Antivírus nos anexos (fail-closed) e `npm i @aws-sdk/client-s3` + teste contra bucket real (QA) — **o provedor S3 nunca rodou contra um bucket de verdade**.

*Para o on-premise (médias e grandes empresas)*
- [ ] Itens da tabela §9.1: imagens versionadas e assinadas, atualização com rollback, `backup.sh`/`restore.sh`, SSO OIDC/SAML, pacote de segurança, pen test.

*Antes do SLA 99,9% (SaaS)*
- [ ] Redis adapter no Socket.io; Cloud SQL HA; ≥ 2 instâncias; status page; runbooks; plantão.
- [ ] Sentry, alertas, uptime com checagem de banco.
- [ ] `GcsStorage` nativo (opcional, se quiser tudo no GCP); rotina de limpeza de anexos órfãos; anexos no portal publicado.

*Jurídico/fiscal:* termos, privacidade (LGPD), DPA por cliente, NFS-e por cobrança, endpoint de exportação e exclusão de dados pessoais, registro de operadores/suboperadores (GCP, Cloudflare, Sentry, e-mail transacional).

---

## 14. LGPD

- Dados pessoais: nome, e-mail, senha (hash), papel; **conteúdo de projeto pode conter dado pessoal de terceiros** (nomes em requisitos, prints, documentos anexados) — o cliente é o controlador; o Ancoro é operador. DPA necessário.
- Direitos do titular: endpoints de exportação e exclusão; exclusão do tenant apaga banco **e** objetos de storage **e** entra no ciclo de retenção dos backups (documentar o prazo em que o dado some dos backups).
- Localização: dados em São Paulo; lista de suboperadores publicada.
- Cancelamento: inadimplência → somente leitura → suspensão; **nunca apagar de imediato**; exportação completa disponível antes da exclusão.

---

## 15. Decisões a revisitar

| Decisão | Reavaliar quando |
|---|---|
| GCP vs AWS | cliente enterprise exigir AWS ou custo/limite de Cloud SQL incomodar |
| Pooled vs Dedicated como padrão | primeiro incidente de "vizinho barulhento" |
| Offline-first | cliente pedir explicitamente |
| Code signing do instalador | primeira reclamação de "editor desconhecido" |
| SSO (SAML/OIDC) | enterprise exigir |
| Kubernetes | > ~50 clientes |
| Segunda região ativa | RTO contratual < 4 h |

---

**Mudanças neste guia:** abrir PR e marcar Rafael para revisão. Mudança não documentada vira dívida arquitetural.
