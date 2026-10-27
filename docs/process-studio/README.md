# Process Studio — módulo BPMN do Ancoro (nome provisório)

> **Status (2026-10-16):** Fase 0 ✅ · Fase 1 ✅ · Fase 2 ✅ · Fase 3 ✅ (§6.3) · **Fase 4 ✅ aprovada pelo Rafael em 2026-10-16 (§6.4) + gate de assinatura** · **Fase 6 ✅ standalone (§6.5)** · Fase 5 (IA) ⬜ pendente · Fase 7 (simulação animada) planejada — ver §6.2.
> (A Fase 7 aparece sozinha aqui só por ter detalhamento próprio em §6.2; 5 e 6 não têm nada iniciado, por isso não eram citadas.)
> Documento criado em 2026-10-14. Autoria da visão: Rafael Brito.
> Acompanhe o progresso na coluna *Status* da tabela da seção 6.
> Este documento **não** faz parte do mapa de arquitetura (`docs/ARCHITECTURE.md`) até o
> módulo existir e ser aprovado (ver CLAUDE.md raiz).

## 1. Visão

Ferramenta de modelagem BPMN 2.0 inspirada no Bizagi Modeler, sem as limitações dele, que:

1. Modela processos **manualmente** (editor visual, estética própria e cuidada).
2. Gera modelos **automaticamente** a partir de requisitos do Ancoro, textos e documentação
   (workshops, transcrições, especificações).
3. **Publica um portal web interativo** (equivalente ao "Publish to Web" do Bizagi): repositório
   navegável de processos + documentação oficial do cliente/projeto.
4. Funciona **acoplado ao Ancoro** (vinculado a requisitos, projetos, roles) **e standalone**
   (produto independente, sem depender do Ancoro).

## 2. Referência analisada: export Bizagi

Pasta de referência do Rafael: `C:\Users\rafae\OneDrive\Documentos\Processo geral Billing - EN`
(não versionada no repo; ~14 MB).

Estrutura observada:
- `index.html` + `libs/js/app/process-viewer*.min.js` — viewer proprietário minificado.
- `files/diagrams/` — diagramas como **SVG + dados** (25 SVGs) com metadados por elemento.
- `key.json.js` / `configuration.json.js` — configuração e tema (cores, descrição, performers).
- Tem `CNAME` (publicado via GitHub Pages) e scripts de rebrand (`rebrand.ps1`) — o Rafael já
  faz pós-processamento manual para trocar marca. **Esse atrito é requisito de produto:** tema/
  marca do cliente deve ser configuração, não script.

Funcionalidades do portal Bizagi a **igualar**: navegação hierárquica de processos, drill-down
em subprocessos, painel de propriedades/descrição por elemento, lista de performers, tabela de
elementos, busca.

A **superar**: busca full-text real, deep links por elemento, versionamento/diff entre
publicações, tema por cliente, acesso protegido por projeto, links elemento↔requisito,
i18n PT/EN, export offline (ZIP estático) e hospedado.

## 3. Princípio de arquitetura: núcleo independente + adaptador Ancoro

```
 ┌─────────────────────────────────────────────┐
 │ @ancoro/process-core  (pacote independente) │
 │  modelo de domínio, parser/serializer BPMN  │
 │  XML, validação, layout, geração por IA,    │
 │  publicador do portal (static site)         │
 └───────────────┬─────────────────────────────┘
                 │ interface PersistencePort / AuthPort / RequirementsPort
      ┌──────────┴───────────┐
      │                      │
 Adaptador Ancoro        Adaptador standalone
 (Prisma do Ancoro,      (SQLite/Postgres próprio,
  JWT/roles do Ancoro,    auth própria ou OIDC,
  vínculo a Requirement)  sem requisitos)
```

Decisão-chave: o núcleo **nunca importa nada do Ancoro**. Tudo que é do Ancoro entra por
*ports* (hexagonal). É isso que garante "perfeitamente dentro e fora". Composição sobre
herança, conforme padrão do Rafael.

Estrutura sugerida (monorepo, a decidir):
```
packages/process-core/     # domínio + BPMN + IA + publisher (TS, sem deps do Ancoro)
packages/process-editor/   # componente React do editor (reutilizável nos dois mundos)
packages/process-portal/   # viewer estático do portal publicado
apps/standalone/           # app independente (backend + frontend finos)
backend/src/routes/processes.ts   # adaptador no Ancoro (quando integrar)
```

## 4. Decisão em aberto: motor do editor

O Rafael considera o visual do bpmn-js feio. Opções:

| Opção | Prós | Contras |
|---|---|---|
| **bpmn-js + renderer customizado** | Parser/validação/BPMN XML prontos; o *renderer* é plugável (dá para trocar completamente o visual, ícones, cores, formas estilo Bizagi) | Acoplado à arquitetura do bpmn-js; licença exige manter o logo bpmn.io no canvas |
| **Editor próprio sobre React Flow / tldraw / Konva** | Liberdade visual total, sem marca de terceiros | Reimplementar semântica BPMN (regras de conexão, boundary events, pools/lanes, subprocessos) — meses |
| **bpmn-js só como parser/modelo (headless) + canvas próprio** | Semântica BPMN grátis, UI 100% própria | Integração mais trabalhosa; bpmn-moddle isolado é viável |

**Decisão (2026-10-14, Rafael Brito — aceita ao seguir para a Fase 1): headless.** Recomendação original: `bpmn-moddle` (modelo + XML, headless, MIT) como fonte da verdade
+ canvas próprio. Se o prazo apertar, começar com bpmn-js + renderer customizado e migrar
depois — o XML BPMN 2.0 é o contrato estável entre os dois.

**Ponto de atenção sobre a licença do bpmn-js:** a licença proíbe remover/ocultar o watermark
do bpmn.io. Para produto comercial com marca própria isso é bloqueador → reforça a opção
headless. **Verificar o texto atual da licença antes de decidir** (não confirmado nesta sessão).

Bizagi tem visual bonito porque tem ícones de tarefa/evento bem desenhados e paleta coesa.
Isso é trabalho de design (set de SVGs + tokens), independente do motor. Fazer um *design
spike* cedo: 15–20 elementos BPMN essenciais.

## 5. Funcionalidades

### 5.1 Modelagem
- BPMN 2.0 completo no MVP+: pools/lanes, tarefas (user, service, manual, script), gateways
  (XOR, AND, OR, event-based), eventos (start/intermediate/end, timer, message, error),
  subprocessos (colapsado/expandido, drill-down), anotações, data objects.
- Propriedades ricas por elemento: descrição, responsável (performer), sistema SAP/transação,
  SLA, documentos anexos, links para requisitos.
- Import/export **BPMN 2.0 XML puro** (sem formato proprietário) + import de `.bpm` do Bizagi
  como meta futura (formato zip/XML; **a investigar** — engenharia reversa do `.bpm`).
- Versionamento com **diff visual** entre versões (elementos adicionados/removidos/alterados).
- Validação de boas práticas (nomes verbo+objeto, gateway sem saída padrão, fluxo sem fim,
  lanes sem responsável).

### 5.2 Geração automática
Entradas: requisito(s) do Ancoro (5W2H AS-IS/TO-BE), texto livre, transcrição de workshop,
documento (docx/pdf).
Pipeline recomendado (**não pedir XML direto ao LLM**):
1. LLM extrai um **JSON intermediário** estruturado (atores, passos, decisões, exceções,
   sistemas) com schema validado por Zod.
2. Código determinístico converte JSON → modelo BPMN → **auto-layout** (ELK/dagre).
3. Validador de boas práticas + revisão humana antes de salvar.
Motivo: XML/coordenadas gerados por LLM são frágeis; JSON intermediário é testável e
auditável. Default de modelo: Claude (ver skill claude-api na implementação).
Rastreabilidade: cada elemento gerado guarda a **origem** (requisito/trecho de texto) —
alinhado à governança, que é o diferencial do Ancoro.

### 5.3 Portal publicado (equivalente ao Publish to Web)
- Gerador de **site estático** a partir de um conjunto de processos (ZIP offline e/ou
  hospedado). Diagramas em SVG + JSON de metadados (mesmo princípio observado no Bizagi).
- Navegação hierárquica, drill-down, painel de propriedades, busca full-text (Lunr/Pagefind),
  deep links, tema/marca por cliente (config, sem script de rebrand), PT/EN.
- Modo "repositório oficial": documentos anexos, glossário, matriz RACI, histórico de versões
  publicadas.
- Acesso: público por link, protegido por senha/token, ou autenticado via Ancoro (modo acoplado).

### 5.4 Integração com o Ancoro (modo acoplado)
- Elemento BPMN ↔ `Requirement` (vínculo N:N); no requisito, aba "Processo" mostra onde ele
  aparece.
- Processo herda permissões por role/projeto (`permissions.ts` + `roleCapabilities.ts`).
- Gap-analysis: requisito sem processo / processo sem requisito (governança).
- Reaproveitar `GraphLayout` existente? **A verificar** — já há modelo `GraphLayout` no Prisma
  para o grafo SAP ISU; avaliar se há algo reutilizável ou se é conceito distinto.

### 5.5 Futuro (fora do escopo inicial)
- **Process Mining / conformance:** comparar o BPMN TO-BE com event logs (SAP ISU, Signavio)
  via PM4Py. Alinha com a meta de carreira (Signavio + Utilities + IA). Alto valor, alto custo.
- Engine de execução (Camunda 8/Zeebe ou Flowable) — **não construir; integrar** se vier.
- Colaboração em tempo real (Yjs/CRDT).

## 6. Fases sugeridas

| Fase | Entrega | Critério de pronto | Status |
|---|---|---|---|
| 0 | Design spike: set visual de elementos + decisão do motor (seção 4) | 1 diagrama de exemplo renderizado com a estética aprovada | ✅ **Feito** (2026-10-14) — `spike/design-spike.html`; motor: headless (`bpmn-moddle`) |
| 1 | `process-core`: modelo, import/export BPMN XML, validação, testes | Round-trip XML sem perda em ≥10 diagramas reais | ✅ **Feito** (2026-10-14) com **7** diagramas reais (do `.bpm` BIIN) — ver ressalvas abaixo |
| 2 | Editor visual MVP (tarefas, eventos, gateways, lanes, subprocesso) | Reproduzir o processo "Billing" de referência | ✅ **Feito** (2026-10-14) — ver §6.1; aval do teste manual pendente |
| 3 | Publisher do portal estático | Portal equivalente ao export Bizagi de referência, com busca e tema | ✅ **Feito** (2026-10-14) — ver §6.3: 7 diagramas reais publicados, medido contra o Bizagi |
| 4 | Adaptador Ancoro (persistência, permissões, vínculo a requisitos) | Módulo acoplado funcionando no app | ✅ **Feito e aprovado** (2026-10-16) — ver §6.4; só para assinantes |
| 5 | Geração por IA (JSON intermediário → BPMN) | Requisito → diagrama revisável com rastreabilidade | ⬜ Pendente |
| 6 | Adaptador standalone + auth própria | Roda sem o Ancoro | ✅ **Feito** (2026-10-16) — ver §6.5 (`apps/standalone`); Docker não validado |
| 7 | **Simulação animada** do processo (tokens percorrendo o fluxo em tempo real, com o que acontece em cada passo) | Rodar o *Invoicing Process* do corpus de ponta a ponta, ramificando por probabilidade/escolha, com painel narrando cada passo e KPIs de tempo/custo | ⬜ Pendente (ver §6.2) |

### Progresso detalhado

**Fase 0 — ✅ Feito**
- [x] Design spike renderizado e aprovado visualmente (`docs/process-studio/spike/design-spike.html`).
- [x] Decisão do motor: **headless** (`bpmn-moddle` como modelo/XML + canvas próprio). Ver seção 4.

**Fase 1 — ✅ `packages/process-core` (standalone, não importa nada do Ancoro)**
- [x] Modelo de domínio + schema Zod (`src/model.ts`) — também é o JSON intermediário da IA.
- [x] Serializer modelo → BPMN 2.0 XML com BPMNDI e parser BPMN XML → modelo, com `warnings` explícitos (`src/bpmn/`).
- [x] Extensão `ancoro:` (performer, SLA, transação SAP, requisitos, origem) em `extensionElements`.
- [x] Validação de integridade e boas práticas (`src/validate.ts`), incl. pares de link event e boundary.
- [x] Ports hexagonais (`src/ports.ts`) — só contratos, sem implementação.
- [x] Layout automático determinístico (`src/layout.ts`): dagre define camadas/ordem, lanes viram faixas, roteamento ortogonal próprio. Preview: `npm run preview`.
- [x] **Importador Bizagi `.bpm`** (`src/import/bizagi.ts`) — ver descoberta abaixo.
- [x] **Corpus real**: 7 diagramas do `BIIN Process/Processo geral Billing - EN.bpm` importados, validados e com round-trip BPMN sem perda e XML idempotente (`test/bizagi-corpus.test.ts`; arquivo não versionado, caminho via env `BIIN_BPM`, teste pulado se ausente).
- [x] Modelo estendido com o que o corpus real exigiu: boundary events (10 ocorrências), eventos conditional/link/terminate, throw/catch, data stores (tabelas SAP), pools externos + message flows, call activity entre diagramas.
- [x] 33 testes verdes. Relatório do corpus: `npm run report:bizagi -- "<arquivo.bpm>"` (gera `.bpmn` em `out/` para abrir no bpmn.io).

Ressalvas honestas (Fase 1 fechada, mas isto fica em aberto):
- [ ] O critério pedia ≥10 diagramas; o corpus tem **7** (um deles, "Process 1", é rascunho de 4 elementos). **Rafael: confirmar** que 7 basta ou fornecer mais (as imagens `DM/F2185…jpg` e `ISU invoicing.png` não são importáveis).
- [ ] Subprocesso expandido (`BlockActivity`, 2 casos) importa **colapsado**, sem o conteúdo interno (está em `ActivitySets` do XPDL).
- [ ] 2 `SubFlow` sem processo chamado definido viram subprocesso simples.
- [ ] Round-trip validado em BPMN XML ↔ modelo; **não** foi aberto em bpmn.io/Camunda Modeler para conferência visual.
- [ ] Layout: satélites (objeto de dados/anotação) podem colidir com nós empilhados (até 2 colisões nos diagramas reais); retornos não desviam de outros elementos.
- [ ] Regra de nome "verbo + objeto": só heurística de ≥2 palavras (3 avisos no corpus são nomes de 1 palavra).

> **Descoberta (2026-10-14):** o `.bpm` do Bizagi é um ZIP de ZIPs (`<guid>.diag`), cada um com `Diagram.xml` em
> **XPDL 2.2** (padrão aberto) + extensões Bizagi. Isso derruba o risco de "engenharia reversa do `.bpm`" dos §5.1/§7:
> o import é direto. Peculiaridades tratadas: lane **não** é gravada nas atividades (inferida pela posição Y);
> `Route` sem tipo = gateway exclusivo; boundary events via `IsAttached`; GUIDs convertidos para NCName.

### 6.1 Fase 2 em etapas (`packages/process-editor`, React + Vite + zustand, consome `process-core`)

| Etapa | Entrega | Status |
|---|---|---|
| 1 | **Visualizador**: renderer SVG de todos os kinds, pan/zoom, seleção, painel + validação, abrir `.bpm`/`.bpmn`/exemplo, drill-down em call activities, i18n PT/EN, tema claro/escuro | ✅ Feito |
| 2 | **Edição básica**: arrastar com grade de 10px (fluxos re-roteados), excluir, desfazer/refazer (Ctrl+Z/Y), setas para ajustar, dirty-flag | ✅ Feito |
| 3 | **Criação**: paleta (29 itens, clique ou arraste), conectar arrastando a alça (regras com motivo), renomear inline (duplo clique/F2/Enter), lanes (criar, redimensionar arrastando, excluir), participantes externos | ✅ Feito |
| 4 | **Propriedades editáveis** (nome, variante, lane, responsável, SLA, transação SAP, requisitos, documentação, processo chamado, fluxo padrão), **exportar `.bpmn`** (Ctrl+S), autosave local, novo processo | ✅ Feito |
| 5 | **Critério de pronto**: reproduzir o processo de referência | ✅ Feito — ver evidência abaixo |

**Evidência da etapa 5** (o critério original era "reproduzir o processo Billing de referência"):
- `process-core/test/edit.test.ts`: cada um dos **7 diagramas reais** do `.bpm` BIIN (incl. *Invoicing Process* e *Contract Billing Process*) é **reconstruído do zero usando só as operações públicas do editor** (`addLane`, `addNode`, `updateNode`, `addFlow`...). Compara tipos, nomes, lanes, propriedades, boundary events, link throw/catch, message flows e fluxos padrão; valida integridade; exporta BPMN idempotente.
- `process-editor/e2e/phase2.mjs`: 107 checks num **Chrome real** (puppeteer-core) dirigindo a UI como usuário — arrastar, desfazer/refazer, inserir da paleta, renomear inline, conectar pela alça, recusa de conexão inválida com motivo, editar propriedades, redimensionar/criar lane, excluir, exportar, abrir o `.bpm` do corpus e mover nó num diagrama real.
- Regra de conexão descoberta pelo corpus: **pool→pool** é válido em message flow (a regra inicial o proibia).

Como rodar: `cd packages/process-editor && npm install && npm run dev` → http://localhost:5180 · E2E (com o dev server ligado): `npm run e2e`.
Operações de edição puras vivem em `packages/process-core/src/edit.ts` (testáveis sem UI; a IA da Fase 5 e o adaptador da Fase 4 as reutilizam).

**Melhorias pós-teste do Rafael (2026-10-14):**
- [x] **Duplo clique edita o texto de qualquer elemento com texto**: tarefa, subprocesso, evento (rótulo), gateway, anotação, objeto de dados, repositório, fluxo, cabeçalho de lane/pool e participante. Duplo clique no *fundo* de uma lane não renomeia sem querer; Esc cancela. (Causa do bug anterior: `setPointerCapture` fazia o `dblclick` chegar ao `<svg>`; agora o alvo é resolvido por posição.)
- [x] **Painéis recolhíveis**: botões *Paleta* e *Propriedades* no topo (Ctrl+B / Ctrl+Shift+B) ampliam a área do diagrama; preferência persistida.
- [x] **Propriedades completas, em abas (estilo Bizagi)** — todas exportadas/importadas no BPMN (round-trip testado):
  - *Geral*: nome, variante, lane, descrição, link (URL), processo chamado, interrompe/lançamento.
  - *Documentação*: texto longo (elemento, fluxo, processo).
  - *Responsáveis*: **RACI** (R responsável, A aprovador, C consultados, I informados) e sistemas/módulos envolvidos.
  - *Execução*: SLA, duração estimada, custo, prioridade, **repetição** (loop / multi-instância paralela / sequencial, com marcador no diagrama), transação SAP.
  - *Dados*: dados de entrada, de saída, regras e controles.
  - *Atributos*: atributos estendidos livres (nome/valor), como os *Extended Attributes* do Bizagi.
  - *Aparência*: preenchimento e borda (8 pares sugeridos + seletor), também para lanes (`bioc:fill/stroke`, lido pelo bpmn.io).
  - *Vínculos*: requisitos, origem, entradas/saídas do elemento.
  - **Fluxos**: nome, descrição, **condição**, **probabilidade (%)**, fluxo padrão, documentação.
  - **Lane / participante**: descrição (+ cor da lane).
  - **Processo**: descrição, autor, dono, versão, tags, criado/modificado em (carimbo automático a cada edição), documentação.
- Persistência no BPMN: construtos padrão onde existem (`multiInstanceLoopCharacteristics`, `conditionExpression`, `documentation`, `bioc:*`); o restante em `<ancoro:props>` (ignorado por outras ferramentas). Testes: `process-core/test/properties.test.ts` (59 testes no core) e E2E ampliado (88 checks no Chrome real).
**Rodada 2 de melhorias (2026-10-14) — texto como elemento e atributos tipados:**
- [x] **Rótulos (texto) são elementos**: o nome de eventos, gateways, objetos de dados, repositórios e fluxos pode ser **arrastado** para qualquer lugar
  (posição guardada como deslocamento relativo → o texto acompanha o elemento quando ele se move) e **editado com duplo clique em qualquer ponto do texto**,
  mesmo fora da forma. "Voltar ao padrão" na aba Geral; desfazer/refazer cobre o reposicionamento. Persistido como `<bpmndi:BPMNLabel>` (padrão BPMN DI).
  Anotações (bracket) continuam sendo o "texto livre" do diagrama (arrastáveis e editáveis).
- [x] **Atributos estendidos TIPADOS (estilo Bizagi "Extended Attributes")**: botão *Adicionar novo atributo* abre o diálogo
  (nome, descrição, tipo, opções/colunas, a quais elementos se aplica). Os **12 tipos**: área de texto, caixa de texto, número, data, imagem,
  seleção única (lista), seleção única (opções), seleção múltipla, arquivo embutido, arquivo vinculado, URL e **tabela** (colunas tipadas; linhas
  reordenáveis). Cada elemento aplicável ganha o editor do tipo na aba *Atributos*; gerenciar/editar/excluir definições no mesmo diálogo
  (alterar opções/colunas preserva os valores válidos; trocar o tipo avisa que descarta). Validação: valor fora das opções, número/data inválidos, definição ausente.
- [x] **Importa os Extended Attributes reais do `.bpm`** (TCodes e Fiori_Apps do corpus BIIN): definições unificadas (Bizagi cria uma por tipo de elemento),
  HTML dos textos longos convertido em texto simples, tabelas com os links da Fiori Apps Library (exibidos como F2786, F3133, F2185…).
  E também a **posição dos textos** do Bizagi (TextX/TextY) → deslocamentos de rótulo.
- [x] Testes: core **75** (rótulos, atributos de todos os tipos, round-trip BPMN, import real) e E2E **107 checks** em Chrome real (inclui criar definições pelo
  diálogo, preencher cada tipo, upload de imagem/arquivo, arrastar/editar rótulos e conferir os atributos reais do corpus).
- Bug pego pelo E2E e corrigido: nós criados pela edição não recebiam os defaults do schema novo (`attributes` indefinido derrubava o painel) — agora passam pelo
  schema e há teste de regressão no core.
- [x] **Edição de texto direto no elemento** (rodada 3): duplo clique abre um editor sem moldura *sobre o próprio texto* (mesma fonte, alinhamento e zoom; quebra linha dentro da forma; lanes/pool editam na vertical, no cabeçalho). Enter confirma, Esc cancela, clicar fora confirma. O texto estático some enquanto edita. Nomenclatura da UI simplificada: "atributo estendido" → **"atributo"**.
- [x] **Tarefa <-> subprocesso pelo campo Variante** (como no Bizagi): a lista de variantes da tarefa inclui "subprocesso" e, no subprocesso, a lista inclui as variantes de tarefa. O elemento mantém o centro, o nome, a lane e todas as propriedades; muda de 120x70 para 140x80 (e vice-versa), boundary events e fluxos acompanham. Subprocesso -> tarefa descarta o vínculo com outro processo (aviso implícito: tarefa não chama processo). Só esse par é permitido (outros mudam a semântica do fluxo).
- [x] **Ajuste manual das linhas de conexão** (como no Bizagi): ao selecionar uma linha aparecem alças nos **segmentos** (barras: arraste para deslocar o trecho, sempre ortogonal; puxar uma linha reta cria um degrau) e nas **pontas** (círculos): arraste a ponta para **outro lado/posição da borda** do próprio elemento, ou **solte sobre outro elemento para religar** a linha (valida pelas mesmas regras de conexão, com o motivo se recusar). Linha ajustada vira "manual": ao mover os elementos o traçado é **adaptado** (mantém o canal escolhido) e só volta ao automático se não houver como adaptar; botão "voltar ao automático" no painel. Persistido (flag em ancoro:props + waypoints no BPMN DI).
- [ ] Pendentes dessa rodada: texto **rico** (negrito/cores) nos atributos longos (Bizagi usa HTML; importamos como texto simples); definições **por repositório**
  (hoje por processo); imagem/arquivo embutidos limitados a 400 KB (asset store na Fase 3/4); ordenar definições e valor padrão.

- [ ] Ainda **não** cobertos do Bizagi: fonte/alinhamento do texto, cor de fluxos, BPSim (simulação completa — ver Fase 7), imagem/ícone customizado por elemento.

Limitações conhecidas da Fase 2 (honestas):
- [ ] Seleção de **um** elemento por vez (sem marquee/shift-click); sem copiar/colar.
- [ ] Fluxos são **sempre auto-roteados** — não dá para arrastar vértices; waypoints importados só são preservados até um extremo mexer.
- [ ] Não troca o *tipo* de um elemento (tarefa→subprocesso) nem reordena lanes: apagar e recriar.
- [ ] Subprocesso **expandido** (filhos) ainda não existe no modelo (importa colapsado).
- [ ] Persistência = autosave no navegador + exportar `.bpmn` (um processo por vez). Persistência real vem na Fase 4 (`PersistencePort`).
- [ ] Renderer fixo (extrair `ShapeSet` na Fase 3); sem virtualização (ok até ~500 nós); strings em `src/i18n.ts` (migrar p/ i18next ao embutir no Ancoro).
- [ ] Tema escuro e layout mobile não foram verificados visualmente nesta fase.

### 6.3 Fase 3 — portal publicado ✅ (decisão e entrega de 2026-10-14, Rafael Brito)

**Meta cumprida:** para quem vê, parecido com o portal do Bizagi (árvore à esquerda, diagrama com pan/zoom, painel do elemento, tabela de elementos,
responsáveis, busca); **por dentro, outra engenharia** — e agora **medida**, não prometida.

**Como usar** (`packages/process-publisher`):
```
npm install && npm run build:viewer
npx tsx src/cli.ts --bpm "<arquivo.bpm>" [--bpmn "<a.bpmn>"] --out ./portal [--brand brand.json] [--exclude "Process 1"] [--zip] [--label "Release 2026.10"] [--strict]
PS_PASSWORD="frase longa" npx tsx src/cli.ts ... --out ./portal      # portal protegido por senha (AES-256-GCM no navegador)
```
Abre por **duplo clique** em `portal/index.html` (`file://`, sem servidor) e também hospedado (GitHub Pages etc.). Marca: ver `examples/brand.example.json`.
Republicar na mesma pasta continua o histórico (`versions.json`); sem mudança semântica, os bytes são idênticos.

**O que o portal tem** (tudo coberto por teste; 42 testes do publisher, 16 deles em **Chrome real por `file://`**):
- **Navegação**: árvore montada pelos subprocessos (call activities), breadcrumbs, drill-down por duplo clique, **link direto por processo e por elemento** (`#/p/<id>/e/<elemento>`; recarregar e voltar do navegador funcionam).
- **Diagrama**: o *mesmo renderer do editor* (pacote `process-render`) → SVG com classes/tokens; pan/zoom, ajustar à tela, destaque do elemento, foco automático.
- **Painel do elemento**: descrição, documentação, **RACI**, execução (SLA/duração/custo/prioridade/loop/transação SAP), sistemas, dados e regras, **atributos tipados** (TCodes em texto, **tabela Fiori com links F2185/F3133…**, imagens, arquivos), requisitos, ligações de entrada/saída clicáveis.
- **Abas**: *Elementos* (filtro por texto/tipo) e *Responsáveis* (**matriz RACI** gerada dos dados).
- **Busca** instantânea e offline (índice pré-computado no publish): nome, transação SAP, texto de atributos (TCodes), apps Fiori, responsáveis, requisitos; sem acento/caixa, prefixo, teclado (`/` foca, ↑↓ Enter).
- **Marca por configuração** (`brand.json`): título, logo (otimizado para webp no publish), cor de destaque, tokens CSS (inclusive cores dos shapes BPMN) claro/escuro, fonte, rodapé; sem script de rebrand. Analytics **opt-in** (GA4) e respeitando Do-Not-Track.
- **Tema claro/escuro/auto**, **PT/EN**, **impressão** (só o diagrama), **celular** (navegação e detalhes viram gavetas; busca em largura total).
- **Páginas estáticas sem JavaScript** (`p/<id>.html`): SVG + tabela de elementos + atributos — indexáveis e imprimíveis.
- **Versões e "O que mudou"**: a 2ª publicação em diante grava o diff semântico (campos alterados/adicionados/removidos, processos novos/removidos) e mostra a página *Novidades* com links para os elementos. Mover elemento/ajustar linha **não** cria versão.
- **Relatório de publicação** (`publish-report.json` + resumo no CLI): erros/avisos de validação por processo e **lacunas** (sem descrição, sem responsável, sem requisito, chamadas quebradas); `--strict` falha se houver erro.
- **Acesso protegido por senha** sem servidor: todo conteúdo (inclusive nomes da árvore, busca e histórico) cifrado; tela de senha; chave só na sessão da aba.
- **Segurança**: texto sempre por `textContent`/escape (nome de elemento com `<img onerror>` aparece como texto e **não executa**); links só `http(s)`; CSS da marca validado (sem `url()`, `;{}`, `<`); manifesto embutido sem fechar `<script>`.
- **Determinismo**: mesma entrada ⇒ mesmos bytes e mesmo ZIP (independe da ordem de entrada); arquivos com hash do conteúdo (cache seguro; só muda o que mudou).

**Medição lado a lado** (jornada: abrir portal → abrir *Invoicing Process* → clicar num elemento; mediana de 7 execuções, cache frio, http local sem throttling;
`node bench/compare.mjs "<export Bizagi>" "<portal>"`; mesmo conteúdo = os 7 diagramas):

| Métrica | Bizagi (export de referência) | Process Studio |
|---|---|---|
| Arquivos / tamanho em disco* | 423 / 12 782 KB | 20 / 530 KB |
| Requisições até o diagrama aberto | 36 | 5 |
| Bytes até o diagrama aberto (bruto / gzip) | 1 917 KB / 460 KB | 133 KB / 30 KB |
| JavaScript (bruto / gzip) | 1 016 KB / 216 KB | 119 KB / 26 KB |
| Evento *load* do portal | 267 ms | 56 ms |
| Clique no processo → diagrama pronto | 46 ms | 14 ms |
| Hosts externos contatados | fonts.gstatic.com (+ Google Analytics via `analytics.js`) | nenhum |
| Busca de texto completo (acha TCodes e apps Fiori) | **sim** | sim |
| Link direto por processo / por elemento | **sim / sim** | sim / sim |
| Painel de detalhes ao clicar | **sim** | sim |
| Overflow horizontal em 390 px | não | não |

\* sem lixo local (`nul`, `ideias/`, scripts de rebrand). O logo de 4,3 MB do Bizagi não entra na conta; o nosso logo é otimizado no publish.

**Correções honestas ao que eu havia suposto** (a medição derrubou):
- O Bizagi **tem** busca de texto completo (jQuery UI autocomplete), **tem** link direto por diagrama (`#diagram/<guid>`) e por elemento, **tem** painel de detalhes e **não** quebra no celular.
  Busca com as mesmas 8 consultas: resultados equivalentes (`node bench/search-compare.mjs`); a diferença só estava na *ordenação* (ajustada: nome de processo pesa mais; empate ⇒ título mais curto).
- A vantagem real não está em "ter busca/links", e sim em **peso e dependências** (≈ 14× menos bytes, 7× menos requisições, 8× menos JS, sem host externo), **marca por configuração**,
  **republicação idempotente**, **histórico/diff**, **relatório de lacunas**, **senha**, **sanitização**, **páginas sem JS**, **tema escuro**, **matriz RACI** e **atributos tipados renderizados**.
- Bizagi desenha o diagrama como `<img>` do SVG sobre `<canvas>` (Kinetic) com "hotspots" HTML só dos elementos visíveis; o nosso é SVG real (texto selecionável, impressão vetorial, acessível).

**Limites e pendências (fica registrado):**
- [ ] Testado só no **Chrome**; Firefox/Safari/Edge não foram exercitados (a Web Crypto e `file://` merecem checagem em cada um).
- [ ] **Acessibilidade** não foi auditada com ferramenta (axe/Lighthouse); há roles/aria e foco visível, sem garantia WCAG.
- [ ] **Pinça (pinch-zoom)** no celular não implementada (arrastar e botões +/− funcionam).
- [ ] **Senha**: protege contra acesso casual e vazamento de hospedagem; quem tem os arquivos pode tentar adivinhar **offline** (PBKDF2 600 mil iterações + frase longa recomendada). Uma senha por portal; em modo protegido não há páginas estáticas nem relatório no site.
- [ ] Marca: só tokens CSS e fonte do sistema (sem webfont embutida); logo é raster/svg simples.
- [ ] Paridade fina com o portal do Bizagi **não** foi verificada visualmente lado a lado (só medida por jornada): lista de performers dedicada, miniaturas na landing e outras telas dele.
- [ ] Deploy automatizado (GitHub Pages/ZIP para cliente) e botão **"Publicar"** no editor/Ancoro → Fase 4.
- [ ] **Diff visual** no editor (elementos coloridos adicionados/removidos) → Fase 4; hoje o diff é textual no portal. A lógica (`versions.ts`) deve ir para o `process-core`.
- [ ] Texto rico (negrito/cores) das descrições do Bizagi é convertido em texto simples na importação.

### 6.4 Fase 4 — Adaptador Ancoro (decisões de 2026-10-15, Rafael Brito)

**Leitura do Ancoro antes de projetar** (`docs/ARCHITECTURE.md` + código): backend Express/Prisma **CommonJS**, sem testes e sem migrations versionadas (sincroniza com `prisma db push`;
SQLite em dev/demo e PostgreSQL em staging/prod → **os dois schemas mudam juntos**); permissões em `utils/roleCapabilities.ts` (backend) espelhadas em `frontend/src/utils/roleCapabilities.ts`;
frontend com **Tailwind (preflight global)**, `noUnusedLocals`, e a regra "**todo acesso à API passa por `services/api.ts` + hooks React Query**".

**Decisões (e por quê):**
1. **Editor embutido por `<iframe>` + ponte `postMessage` (RPC)**, não como componente React no bundle do Ancoro.
   O CSS do editor é global (`button`, `body`, `*`) e colidiria com o preflight do Tailwind (nos dois sentidos); o iframe isola CSS, React e estado.
   O **token JWT nunca entra no iframe**: o editor pede "salvar/listar/buscar requisito" à página-pai, que chama a API via `api.ts` (cumpre a regra do projeto).
   O mesmo editor continua rodando **standalone** (adaptador local) — é a mesma `PersistencePort`/`RequirementsPort` do README §3, com 2 adaptadores.
2. **Núcleo "processkit" compilado para CommonJS** (`backend/vendor/processkit.cjs`, gerado por esbuild a partir de `process-core` + `process-publisher`, `sharp` opcional):
   o backend valida, importa (.bpm/.bpmn), exporta BPMN e **publica o portal** com o MESMO código do editor, sem processo filho e sem portar schema.
3. **Fonte da verdade = JSON do `ProcessModel`** (coluna de texto, compatível com SQLite e PostgreSQL). A tabela `ProcessRequirementLink` é uma **projeção** reconstruída a cada save
   (para responder "em quais processos este requisito aparece?" e para a análise de lacunas), nunca editada à mão.
4. **Concorrência otimista** (`rev` + `baseRev`, 409 em conflito) em vez de merge: dois consultores no mesmo diagrama é raro e o aviso é suficiente; colaboração em tempo real fica no §5.5.
5. **Versões**: snapshot explícito (com rótulo) e automático ao publicar; restaurar = novo save com o conteúdo antigo (histórico nunca é reescrito).
6. **Permissões** (novas capabilities, nos dois `roleCapabilities.ts`): ver = todos; editar = ADMIN/MANAGER/CONSULTANT; excluir = ADMIN (qualquer) e criador (MANAGER/CONSULTANT); publicar = ADMIN/MANAGER.
   Toda rota passa por `requireProjectAccess` (membership do projeto). CLIENT vê o processo em modo **somente leitura** no editor.
7. **Modelo do banco**: `BusinessProcess` (modelo atual + `rev`), `ProcessVersion`, `ProcessRequirementLink`, `ProcessPortal` (histórico de publicação do projeto — alimenta o "O que mudou" do portal).

**Etapas:**
| Etapa | Entrega | Status |
|---|---|---|
| 1 | **Backend**: processkit (build), schemas Prisma (SQLite+PostgreSQL), rotas CRUD/versões/restore/import/BPMN/cobertura/publicação, capabilities, testes (jest) | ✅ **Feito** (2026-10-15) — 16 testes de rota (jest+supertest, SQLite descartável) passando; `npm run build:processkit` gera o kit; processo de exemplo no seed demo |
| 2 | **Editor em modo host**: ponte RPC, somente leitura por permissão, seletor de requisitos (busca), conflito de versão, histórico de versões | ✅ **Feito** (2026-10-15) — `packages/process-editor/src/host.ts` (protocolo `{ps:1,…}`, origem verificada nos dois sentidos), `HostUi.tsx`; `store.readOnly` bloqueia `edit()`/arrasto; painel de propriedades em `<fieldset disabled>` |
| 3 | **Frontend Ancoro**: página `/processes` (iframe + lista), `api.ts`+hooks, i18n PT/EN, nav, capabilities, aba "Processos" no requisito, análise de lacunas, botão Publicar | ✅ **Feito** (2026-10-15) — `pages/Processes.tsx`, `hooks/useProcesses.ts` (hooks + ponte), `processesAPI` em `services/api.ts`, namespace i18n `processes`, link nas telas Dashboard/Grafo, aba Processos em `RequirementDetailPanel` |
| 4 | **E2E full-stack** (backend demo + frontend + editor em Chrome real) incluindo matriz de papéis | ✅ **Feito** (2026-10-15) — `packages/process-editor/e2e/ancoro-fullstack.mjs`: 48 checks (ver abaixo) |
| 5 | Documentação: README, CI (`pr-checks.yml`), atualização do `ARCHITECTURE.md` e de `ANALISE_PERMISSOES_POR_ROLE.md` | ✅ Feito (2026-10-16) após o aval do Rafael |

**Como rodar o E2E full-stack (etapa 4):**
```bash
npm run build:processkit && npm run build:process-studio      # artefatos gerados (gitignored)
scripts/e2e/process-studio-env.sh up                          # backend :3100 (SQLite descartável semeado) + frontend :5199
cd packages/process-editor && npm run e2e:ancoro              # Chrome real (puppeteer)
scripts/e2e/process-studio-env.sh reset                       # volta o banco ao estado inicial (o cenário assume dados pristinos)
scripts/e2e/process-studio-env.sh down
```
Cobertura (48 checks): lista/cobertura vindas do seed; editor embutido carrega pela ponte; vincular requisito pelo seletor com busca; salvar (rev sobe) e projeção
de vínculos/cobertura no servidor; "em quais processos este requisito aparece" (API e aba no requisito); redimensionar e persistir; versões (snapshot rotulado, restaurar,
guarda do estado anterior); **conflito entre duas pessoas** (409 → diálogo → "salvar como cópia" preserva a edição do segundo); publicar portal (UI + ZIP);
matriz de papéis (CLIENT somente leitura na UI **e** 403 na API; CONSULTANT edita mas não publica e só exclui o que criou; MANAGER publica; ADMIN exclui qualquer); 404 entre projetos; i18n EN.
Backend: `cd backend && npm test` (16 testes de rota, SQLite descartável).

**Achados/decisões durante a implementação:** (a) rate limit global do backend (100 req/15 min em NODE_ENV≠development) derruba qualquer E2E — o script do ambiente roda o backend com
`NODE_ENV=development` só no banco descartável; (b) o dev server do Vite devolve a SPA do Ancoro para qualquer caminho inexistente, então um editor não compilado carregaria o Ancoro dentro do
iframe — a página detecta a ausência do "ready" em 8 s e mostra a instrução `npm run build:process-studio`; (c) o painel de elementos do editor também usa `.node` (ícones da paleta): seletores de teste
devem usar `svg.canvas .node`; (d) `ancoro_current_project_id` é a chave do projeto atual no `localStorage`.

**CI (2026-10-16, Rafael Brito):** `pr-checks.yml` agora (a) instala os pacotes e roda `build:processkit` antes dos testes do backend (sem o kit gitignored, `processes.test.ts` falha) e
(b) tem o job `process-studio`: testes de `process-core` (104) e `process-publisher` (42; os de Chrome real se pulam sozinhos sem Chrome) + build do editor em modo Ancoro. Rodado localmente: tudo verde.
Ressalva: o job `test` já existente roda `prisma migrate deploy` num projeto **sem migrations** e o `pretest` regenera o client em SQLite — não validado em runner real; revisar no primeiro PR.

**Pendente da Fase 4:** migration/`db push` em staging/produção (o projeto não versiona migrations), (`ARCHITECTURE.md` e `ANALISE_PERMISSOES_POR_ROLE.md` já atualizados após o aval). Editor no Electron (file://): o iframe usa caminho relativo e a origem `file://` não passa na checagem
de origem da ponte; tratar quando o desktop for empacotado com o Process Studio.

**Gate de assinatura (decisão do Rafael Brito, 2026-10-16):** a contratação é **única**, com todas as funcionalidades — não há tiers por feature. O Process Studio é, portanto,
um liga/desliga binário: quem não é assinante (free/trial) **não vê nada** (nem menu, nem rota, nem aba do requisito) e a API responde 403 `PROCESS_STUDIO_DISABLED` até para ADMIN.
- Regra em `backend/src/config/entitlements.ts`: on-premise exige licença válida; `PROCESS_STUDIO_ENABLED=true|false` decide explicitamente; **sem a variável, ligado em dev/demo/test e DESLIGADO em produção** (fail-closed).
- Frontend: `GET /api/entitlements` → `useEntitlements()` (fail-closed enquanto carrega/em erro) esconde os 3 links de navegação e a aba "Processos", e `ProcessStudioRoute` redireciona `/processes*` ao dashboard.
- Testes: 2 no backend (`processes.test.ts`, 18 no total). **Não** verificado no navegador com a flag desligada (o E2E full-stack roda com ela ligada).
- [ ] Hoje a assinatura é **por deploy** (env). Quando o tenant registry (`Tenant.plan/status`) entrar no caminho das requisições, resolver por tenant em `isProcessStudioEnabled()` (TODO estigmérgico no arquivo); o contrato com o frontend não muda.

### 6.5 Fase 6 — Adaptador standalone ✅ (2026-10-16, Rafael Brito)

`apps/standalone`: o Process Studio **sem o Ancoro** — mesmo núcleo, mesmo editor, mesmo publicador. Detalhes de uso em `apps/standalone/README.md`.

**Decisões:**
1. **Login por código de 6 dígitos OU link enviado por e-mail** (escolha do Rafael): sem senha para guardar/vazar. Só e-mails cadastrados (convite do ADMIN) recebem algo; resposta idêntica exista o e-mail ou não;
   5 tentativas por código, uso único, 1 pedido/30 s e 5/h por e-mail, código/token só como HMAC no banco; o link abre uma tela com botão "Entrar" (scanners de e-mail pré-visitam links e queimariam o token).
2. **Sessão** opaca em cookie `HttpOnly`+`SameSite=Strict` (no banco só o SHA-256), mutações exigem `x-ps-csrf: 1`; CSP no shell/editor; desativar usuário revoga as sessões na hora; nunca fica sem ADMIN ativo.
3. **SQLite** (better-sqlite3, migrações por `user_version`) + **um comando** (`npm start`). Papéis ADMIN / EDITOR / VIEWER (editar+publicar; excluir só o próprio; leitura).
4. **Reuso, não cópia:** o `processkit.cjs` é o MESMO bundle do backend do Ancoro (`build-kit.mjs --out`); o editor é o MESMO build (`vite build` em `apps/standalone/public/editor`) falando o MESMO protocolo `postMessage` — o shell (`public/app.js`, JS puro, sem build) só implementa o lado "host" com a API própria.
5. **Referências** elemento→"requisito" viram texto livre (sem catálogo): o seletor sugere as já usadas e oferece o texto digitado como "(novo)". Uma instância = um repositório (sem projetos).

**Evidência:** `npm test` 17 testes de API (login por código/link, expiração, tentativas, enumeração, CSRF, papéis, concorrência 409, versões, import/export, publicação) + `npm run e2e` **26 checks em Chrome real** (login por código e por link,
cookie HttpOnly, editor embutido via ponte, vínculo, salvar r2, versões, leitor somente leitura, 403s, publicar ZIP, CSRF, logout, zero erro de console/CSP). CI: job `process-studio` do `pr-checks.yml` (sem o E2E).

**Pendências honestas:**
- [ ] **Dockerfile não validado**: o `npm ci` dentro do container falhou por `ECONNRESET` (2 tentativas) na máquina de dev; nada depois dele rodou.
- [ ] Sem SMTP real testado (só o mailer de console/memória); `smtpMailer` usa nodemailer e **não foi exercitado** contra um servidor SMTP.
- [ ] Sem multi-repositório/projetos, sem auditoria de acessos, sem SSO/OIDC (o login por e-mail é a única porta; OIDC entraria como segundo método).
- [ ] Portas do núcleo (`PersistencePort`/`AuthPort`) seguem sem implementação literal — ver nota em `process-core/src/ports.ts`.
- [ ] Testado só no Chrome e em Windows.

### 6.2 Fase 7 — Simulação animada (visão do Rafael Brito, 2026-10-14)

**Objetivo:** o usuário *assiste* o processo acontecer. Um token percorre o diagrama em tempo real; a cada elemento um painel
narra **o que ocorre ali** (quem executa, em qual sistema/transação SAP, dados que entram e saem, regras aplicadas, quanto tempo/custo),
como se estivesse presenciando a execução. Serve para validar o processo com o cliente, treinar usuários e achar gargalos.

**O que a simulação mostra (e de onde vem — a maior parte já está modelada na Fase 2):**
| Elemento | Animação | Narração (painel "O que acontece agora") |
|---|---|---|
| Início / tarefa | token entra, elemento pulsa durante a duração | descrição, responsável (RACI), sistemas, transação SAP, dados de entrada → saída, regras/controles, SLA vs duração simulada |
| Gateway exclusivo/inclusivo | token pára; ramo escolhido acende | condição avaliada e **por que** seguiu esse ramo (probabilidade sorteada, escolha manual ou cenário) |
| Gateway paralelo | token **se divide** em N e se junta (join espera todos) | ramos disparados / aguardando |
| Boundary event (erro/timer/mensagem) | evento dispara na borda e desvia o fluxo | gatilho e tratamento |
| Message flow / participante externo | envelope viaja até o pool externo e volta | sistema externo acionado (ex.: Convergent Invoicing) |
| Link (saltar/destino) | token "teleporta" ao link de mesmo nome | |
| Subprocesso / call activity | opcional: **mergulhar** no processo chamado (drill-down) e voltar | |
| Repositório de dados | leitura/escrita piscando | tabelas SAP acessadas (EITR, ERCH, EABL…) |
| Loop / multi-instância | contador de iterações; N tokens paralelos | iteração k de N |
| Fim | token consome; terminate encerra todos | resultado do caso |

**Controles:** ▶ play / ⏸ pausa / ⏭ passo a passo / ↺ reiniciar, velocidade (0,25×–10×), modo **tempo simulado** (relógio do processo
em horas/dias, não do mundo real), seleção do **modo de ramificação**: *manual* (o usuário escolhe em cada gateway), *probabilístico*
(usa `probability` dos fluxos, com semente fixa → reprodutível) ou *cenário salvo* (caminho nomeado, ex.: "Leitura implausível → correção manual").
Linha do tempo/log clicável (voltar a qualquer passo), tooltips nos tokens, e **foco automático da câmera** seguindo o token.

**KPIs ao final (e ao vivo):** tempo total e por lane/responsável, custo acumulado, esperas, caminho percorrido, SLAs estourados,
gargalo (elemento com maior tempo/fila), cobertura (% de elementos exercitados).

**Arquitetura (decisão):**
- **Motor puro no `process-core`** (`src/simulate.ts`): recebe `ProcessModel` + configuração (modo, semente, cenários) e devolve uma
  **sequência de eventos determinística** (`token-moved`, `task-started/finished`, `gateway-decided`, `fork/join`, `boundary-fired`, `message-sent`…).
  Sem DOM, sem relógio real, testável e reutilizável pela IA (Fase 5) e pelo adaptador Ancoro (Fase 4).
- **Animação no `process-editor`**: consome o *trace* e anima (tokens SVG, destaque, câmera). Pausar/voltar = reposicionar no trace (event-sourcing) — não re-simula.
- **Distribuições** (estimativa de duração: fixa, uniforme, triangular) e **recursos** (fila quando o responsável está ocupado) entram como extensão
  do `duration`/`performer`/RACI já existentes; começar determinístico (duração fixa) e evoluir.
- Reaproveita a regra de **validação** (processo sem fim, gateway sem padrão…): simulação recusa-se a rodar com erros de integridade e aponta o elemento.

**Evolução natural (alinhada à meta de carreira Signavio + Utilities + IA):**
- **Execuções em lote (Monte Carlo)**: milhares de casos → histograma de tempo/custo, gargalos, probabilidade de estourar SLA.
- **Replay de event log real** (SAP ISU / Signavio Process Intelligence) sobre o mesmo diagrama: animar o que *de fato* aconteceu e comparar com o modelo (conformance).
- Exportar a simulação como **vídeo/GIF** e **link compartilhável** no portal (Fase 3).

**Etapas sugeridas (a detalhar quando a fase começar):**
1. Motor determinístico mínimo (tarefas, XOR, AND, fim) + testes sobre o corpus. 2. Animação de token + play/pausa/passo + painel narrado.
3. Probabilidade/cenários + semente. 4. Paralelismo/join, boundary, message flow, link, subprocesso. 5. Tempo simulado, recursos e KPIs. 6. Lote (Monte Carlo) e replay de log.

**Riscos/honestidade:** (a) semântica BPMN de *join* de gateway inclusivo e de eventos temporais é sutil — limitar o escopo inicial e documentar o que não é simulado;
(b) durações/custos dos diagramas atuais estão em texto livre (`"2 h"`, `"R$ 40"`) → precisam de parser/normalização ou campos numéricos antes de gerar KPIs confiáveis;
(c) simulação com dados incompletos *parece* precisa mas não é — mostrar sempre a cobertura de dados (quantos passos têm duração/probabilidade informadas).

Backend/núcleo antes da UI (diretriz do projeto). Fase 3 antes da 4 é intencional: o portal é
o diferencial mais tangível e já vende sozinho.

## 7. Riscos e pontos de honestidade

- **Escopo:** editor BPMN próprio é o maior risco de prazo. Mitigar com o caminho headless.
- **Foco:** o Ancoro está entrando em fase comercial (landing, assinatura, multi-tenant — ver
  plano de signup). Este módulo compete por tempo com isso. Sugestão: tratar como roadmap
  pós-lançamento do SaaS, exceto a Fase 0 (barata, ajuda a vender a visão).
- **Concorrência:** Signavio, Camunda Modeler, Bizagi, draw.io. O diferencial **não** é o
  editor; é geração a partir de requisitos + portal + rastreabilidade + Utilities.
- **Formato `.bpm` do Bizagi:** importar tem valor de migração, mas pode esbarrar em termos de
  licença do Bizagi. Verificar antes de prometer.
- **Multi-tenancy:** o módulo herda a decisão de isolamento do Ancoro (schema-per-tenant
  recomendado). No standalone, definir do zero.

## 8. Perguntas para o próximo chat

1. ~~Motor: headless (bpmn-moddle + canvas próprio) ou bpmn-js?~~ ✅ **Decidido: headless** (2026-10-14).
2. Nome do produto (Process Studio é provisório) e se terá marca separada do Ancoro.
3. Standalone será produto comercial separado ou apenas "o módulo pode rodar sozinho"?
4. Prioridade vs. fluxo de signup/assinatura do Ancoro.
5. ~~Obter diagramas reais para corpus~~ ✅ Recebido: `.bpm` com 7 diagramas (XPDL) — ver §9.

## 9. Materiais de referência no repo/máquina
- Export Bizagi: `C:\Users\rafae\OneDrive\Documentos\Processo geral Billing - EN`
  (inclui `ideias/bizagi-knowledge-base.md` e `plano-melhorias-s4umap.md` — **ler no início
  do próximo chat**, não foram lidos nesta sessão).
- Corpus BIIN: `C:/Users/rafae/OneDrive/Documentos/Profissional-Rafael/SAP/ISU/BIIN Process/` — `.bpm` (importável) + PNGs/JPGs de referência visual (não importáveis).
- Padrões do Ancoro: `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/INFRASTRUCTURE_GUIDE.md`.
