// [2026-10-07] Criado: roteiro do vídeo de demonstração (legenda + fonética p/ TTS) — Rafael Brito
// Cada beat: id, say (legenda exibida), tts (pronúncia p/ SAPI pt-BR; opcional).
// Setores = capítulos do vídeo. A ação de cada beat vive em record.js (mapa por id).
// [2026-10-19] Alterado: versão com Process Studio — novos setores 08/09/10 (BPMN, vínculo processo×requisito, versões+portal); Métricas/Entrega/Multi-projeto renumerados 11/12/13 — Rafael Brito
module.exports = [
  { id: 'intro', title: 'Ancoro', sub: 'Ancora ReqOps Method — demonstração da plataforma', n: '', beats: [
    { id: 'intro1', say: 'Ancoro é a plataforma de governança de requisitos para projetos SAP S/4HANA Utilities. Nesta demonstração você acompanha o ciclo completo, do cadastro à validação entre áreas, agora com o Process Studio: a modelagem BPMN vinculada aos requisitos.',
      tts: 'Ancoro é a plataforma de governança de requisitos para projetos S A P, S quatro HANA Utilities. Nesta demonstração você acompanha o ciclo completo, do cadastro à validação entre áreas, agora com o Prócess Stúdio: a modelagem bê pê eme ene vinculada aos requisitos.' } ] },
  { id: 's1', title: 'Proposta de valor', sub: 'Por que governar requisitos', n: '01', beats: [
    { id: 's1a', say: 'Escopo mal definido custa, em média, 45% a mais no orçamento. O Ancoro coloca governança no ciclo de vida do requisito.', tts: 'Escopo mal definido custa, em média, quarenta e cinco por cento a mais no orçamento. O Ancoro coloca governança no ciclo de vida do requisito.' },
    { id: 's1b', say: 'Uma calculadora mostra a faixa de economia: ajustando o orçamento do projeto, você vê quanto a governança devolve ao bolso.' },
    { id: 's1c', say: 'Quatro pilares: 5W2H Duplo com o estado atual e o futuro lado a lado, Matriz de Cruzamento entre módulos, Process Studio com os processos BPMN ligados aos requisitos, e colaboração com auditoria.', tts: 'Quatro pilares: cinco W dois H Duplo, com o estado atual e o futuro lado a lado; Matriz de Cruzamento entre módulos; Prócess Stúdio, com os processos bê pê eme ene ligados aos requisitos; e colaboração com auditoria.' },
    { id: 's1d', say: 'O fluxo é simples: estruture o escopo, conecte os impactos e valide com clareza. Vamos entrar na plataforma.' } ] },
  { id: 's2', title: 'Acesso por perfil', sub: 'Admin · Manager · Consultant · Client', n: '02', beats: [
    { id: 's2a', say: 'O acesso é por perfil: administrador, gerente, consultor e cliente, cada um com suas permissões. Vamos entrar como gerente de projeto.' } ] },
  { id: 's3', title: 'Dashboard de requisitos', sub: 'O estado do projeto num relance', n: '03', beats: [
    { id: 's3a', say: 'Cinquenta requisitos, dezessete validados, 34% de cobertura e seis conflitos ativos: o estado do projeto num relance.' },
    { id: 's3b', say: 'Cada linha traz módulo, status, consultor responsável e as dependências: de quem o requisito depende e para quem ele fornece.' },
    { id: 's3c', say: 'A busca varre todos os campos. Aqui, tudo que envolve faturamento.' },
    { id: 's3d', say: 'Os filtros isolam o que importa: por exemplo, só os requisitos em conflito, que precisam de decisão.' } ] },
  { id: 's4', title: 'AS-IS vs TO-BE', sub: 'Estado atual × estado futuro, comentários e histórico' /* [2026-10-07] Alterado: 'Duplo' sugeria dois requisitos distintos — Rafael Brito */, n: '04', beats: [
    { id: 's4a', say: 'Abrindo um requisito: identificação, módulo, responsáveis, relações de dependência, dúvidas do consultor e observações.' },
    { id: 's4b', say: 'A aba 5W2H é o coração do método. Primeiro o estado atual, AS-IS: o quê, por quê, quem, quando, onde, como e quanto.',
      tts: 'A aba cinco W dois H é o coração do método. Primeiro o estado atual, az iz: o quê, por quê, quem, quando, onde, como e quanto.' },
    { id: 's4c', say: 'Ao lado, o estado futuro, TO-BE. O comparativo obriga o time a explicitar o que muda, antes de construir.', tts: 'Ao lado, o estado futuro, tu bi. O comparativo obriga o time a explicitar o que muda, antes de construir.' },
    { id: 's4d', say: 'A colaboração fica no próprio requisito. Vamos registrar uma dúvida sobre a regra de deduplicação.' },
    { id: 's4e', say: 'E o histórico guarda cada alteração, campo a campo. Quando perguntarem quem aprovou isso, a resposta já está lá.' },
    { id: 's4f', say: 'Na grade, basta clicar no requisito: o painel lateral mostra a discussão existente, com dúvidas e respostas do cliente.' } ] },
  { id: 's5', title: 'Criando um requisito', sub: '5W2H obrigatório, ID por padrão do projeto', n: '05', beats: [
    { id: 's5a', say: 'Criar um requisito segue o mesmo rigor: o identificador vem do padrão do projeto e os campos do 5W2H são obrigatórios.', tts: 'Criar um requisito segue o mesmo rigor: o identificador vem do padrão do projeto e os campos do cinco W dois H são obrigatórios.' },
    { id: 's5b', say: 'Vamos descrever a aplicação da tarifa social no faturamento: o quê, por quê, quem, quando, onde e quanto.' },
    { id: 's5c', say: 'Ao criar, o requisito entra na base e os indicadores do projeto já refletem o novo item.' } ] },
  { id: 's6', title: 'Matriz de Cruzamento', sub: 'Integrações entre módulos, conflitos e pendências', n: '06', beats: [
    { id: 's6a', say: 'A matriz mapeia as integrações entre módulos: 32 no total, 18 validadas, 10 pendentes e 4 em conflito.', tts: 'A matriz mapeia as integrações entre módulos: trinta e duas no total, dezoito validadas, dez pendentes e quatro em conflito.' },
    { id: 's6b', say: 'Cada linha mostra o fluxo de dados, o tipo (BAPI, RFC, API), o gatilho e o timing. É a resposta para: o que quebra em Faturamento quando Contratos muda?',
      tts: 'Cada linha mostra o fluxo de dados, o tipo, como bápi, erre efe cê ou a pê i, o gatilho e o timing. É a resposta para: o que quebra em Faturamento quando Contratos muda?' },
    { id: 's6c', say: 'Dá para buscar qualquer integração e filtrar por área.' } ] },
  { id: 's7', title: 'Grafo de dependências', sub: 'O impacto visível antes de virar problema', n: '07', beats: [
    { id: 's7a', say: 'O grafo desenha a rede de requisitos. As cores indicam o andamento: concluído, em progresso ou pendente.' },
    { id: 's7b', say: 'Dá para isolar uma área, como o Faturamento, e destacar o caminho crítico do projeto.' },
    { id: 's7c', say: 'Nada de descobrir dependência na hora do go-live: o impacto fica visível antes de virar problema.', tts: 'Nada de descobrir dependência na hora do gôu láiv: o impacto fica visível antes de virar problema.' } ] },
  // [2026-10-19] Criado: setores do Process Studio — Rafael Brito
  { id: 'p1', title: 'Process Studio', sub: 'Modelagem BPMN dentro do projeto', n: '08', beats: [
    { id: 'p1a', say: 'Requisito diz o que o negócio precisa. Processo mostra como a operação acontece. No Ancoro, os dois vivem no mesmo projeto: aqui está o Process Studio.', tts: 'Requisito diz o que o negócio precisa. Processo mostra como a operação acontece. No Ancoro, os dois vivem no mesmo projeto: aqui está o Prócess Stúdio.' },
    { id: 'p1b', say: 'Cada projeto traz seus processos BPMN. Abrindo o ciclo de faturamento de consumo: raias por área, eventos, tarefas, decisões e fluxos, do início da medição até a cobrança.', tts: 'Cada projeto traz seus processos bê pê eme ene. Abrindo o ciclo de faturamento de consumo: raias por área, eventos, tarefas, decisões e fluxos, do início da medição até a cobrança.' },
    { id: 'p1c', say: 'O editor é completo: paleta de elementos, propriedades, documentação, responsáveis, desfazer e refazer. Também importa arquivos Bizagi e BPMN, e exporta BPMN padrão.', tts: 'O editor é completo: paleta de elementos, propriedades, documentação, responsáveis, desfazer e refazer. Também importa arquivos Bizagui e bê pê eme ene, e exporta bê pê eme ene padrão.' } ] },
  { id: 'p2', title: 'Processo × Requisito', sub: 'Cada elemento do processo aponta para os requisitos que o sustentam', n: '09', beats: [
    { id: 'p2a', say: 'O diferencial: cada elemento do processo pode ser vinculado a requisitos. Este subprocesso de cálculo de tarifa já aponta para dois requisitos do projeto.' },
    { id: 'p2b', say: 'Lembra da tarifa social que criamos há pouco? Basta buscar e vincular ao cálculo de tarifa. Ao salvar, a revisão do processo sobe e o vínculo fica gravado.' },
    { id: 'p2c', say: 'A cobertura mostra, em tempo real, quantos requisitos aparecem em algum processo, e lista os que ainda não têm: a lacuna fica visível antes do workshop de validação.', tts: 'A cobertura mostra, em tempo real, quantos requisitos aparecem em algum processo, e lista os que ainda não têm: a lacuna fica visível antes do uórkshop de validação.' },
    { id: 'p2d', say: 'E o caminho inverso: abrindo o requisito, a aba Processos mostra em quais processos e elementos ele aparece, com um clique para abrir o diagrama.' } ] },
  { id: 'p3', title: 'Versões e portal', sub: 'Histórico, edição concorrente e publicação para o cliente', n: '10', beats: [
    { id: 'p3a', say: 'Cada processo tem histórico de versões: dá para salvar um marco com rótulo e restaurar qualquer estado anterior. Se duas pessoas editam ao mesmo tempo, o sistema detecta o conflito e nada é sobrescrito.' },
    { id: 'p3b', say: 'Para compartilhar com o cliente, o Ancoro publica um portal estático com todos os processos do projeto, com rótulo de versão e senha opcional, cifrada no navegador.' },
    { id: 'p3c', say: 'O portal é um site pronto para hospedar: navegação entre processos, busca, e os requisitos vinculados em cada elemento. Governança também no processo.' } ] },
  { id: 's8', title: 'Métricas', sub: 'Validação, conflitos e distribuição', n: '11', beats: [
    { id: 's8a', say: 'Em Métricas, o gerente acompanha taxa de validação, conflitos abertos, integrações pendentes e dependências circulares.' },
    { id: 's8b', say: 'E a distribuição dos requisitos por status e por área, para saber onde o projeto está concentrado.' } ] },
  { id: 's9', title: 'Entrega e equipe', sub: 'Exportação do BPD e gestão de membros', n: '12', beats: [
    { id: 's9a', say: 'Para entregar ao cliente, o Ancoro exporta o BPD em Word ou Markdown, com um aviso do que ainda está pendente ou em conflito.', tts: 'Para entregar ao cliente, o Ancoro exporta o bê pê dê em Word ou Markdown, com um aviso do que ainda está pendente ou em conflito.' },
    { id: 's9b', say: 'A gestão de membros define quem participa do projeto e em qual módulo atua.' } ] },
  { id: 's10', title: 'Multi-projeto e idiomas', sub: 'S/4HANA Utilities · BRIM · Salesforce · PT/EN', n: '13', beats: [
    { id: 's10a', say: 'A plataforma é multi-projeto. Além de S/4HANA Utilities, a demo traz um cenário BRIM para Telecom e outro Salesforce para Varejo.', tts: 'A plataforma é multi-projeto. Além de S quatro HANA Utilities, a demo traz um cenário B R I M para Telecom e outro Salesforce para Varejo.' },
    { id: 's10b', say: 'E toda a interface está disponível em português e em inglês.' } ] },
  { id: 'outro', title: 'Ancoro', sub: 'Estruture o escopo · Conecte os impactos · Valide com clareza', n: '', beats: [
    { id: 'outro1', say: 'Ancoro: requisitos e processos governados juntos, antes que escopo mal definido vire prejuízo.' } ] },
];
