/**
 * Textos do viewer do portal (PT/EN). Sem dependências; o idioma inicial vem do brand.json e o visitante pode trocar.
 * [2026-10-14] Criado: Fase 3 — Rafael Brito
 */
const pt = {
  processes: 'Processos', search: 'Buscar processos, elementos, códigos, responsáveis…', noResults: 'Nada encontrado.', results: 'resultados',
  diagram: 'Diagrama', elements: 'Elementos', people: 'Responsáveis', raci: 'Matriz RACI',
  zoomIn: 'Aumentar', zoomOut: 'Diminuir', fit: 'Ajustar à tela', print: 'Imprimir', hideTree: 'Ocultar navegação', showTree: 'Navegação',
  hidePanel: 'Ocultar detalhes', showPanel: 'Detalhes', theme: 'Tema', lang: 'Idioma', staticPage: 'Versão estática (sem JavaScript)',
  selectHint: 'Clique em um elemento do diagrama para ver os detalhes.', openProcess: 'Abrir processo', open: 'Abrir', openLink: 'Abrir link',
  download: 'Baixar', filter: 'Filtrar…', allTypes: 'Todos os tipos', name: 'Nome', type: 'Tipo', lane: 'Raia', responsible: 'Responsável', sla: 'SLA', description: 'Descrição',
  none: '—', empty: 'Nenhum processo publicado.', notFound: 'Processo não encontrado.', loading: 'Carregando…', loadError: 'Não foi possível carregar os dados deste processo.',
  published: 'Publicado em', version: 'Versão', author: 'Autor', owner: 'Dono do processo', tags: 'Tags', modified: 'Modificado em',
  sections: {
    about: 'Sobre', documentation: 'Documentação', raci: 'Responsabilidades (RACI)', execution: 'Execução', systems: 'Sistemas', data: 'Dados e regras',
    attributes: 'Atributos', requirements: 'Requisitos', flow: 'Fluxo', incoming: 'Recebe de', outgoing: 'Segue para', condition: 'Condição',
  },
  f: {
    responsible: 'Responsável (R)', accountable: 'Aprovador (A)', consulted: 'Consultados (C)', informed: 'Informados (I)', sla: 'SLA', duration: 'Duração estimada',
    cost: 'Custo', priority: 'Prioridade', loop: 'Repetição', sap: 'Código / transação do sistema', inputs: 'Entradas', outputs: 'Saídas', rules: 'Regras e controles',
    lane: 'Raia', attached: 'Anexado a', probability: 'Probabilidade', default: 'Fluxo padrão', from: 'De', to: 'Para', link: 'Link',
  },
  kind: {
    start: 'Evento de início', end: 'Evento de fim', intermediate: 'Evento intermediário', boundary: 'Evento de borda', task: 'Tarefa', gateway: 'Gateway',
    subprocess: 'Subprocesso', dataObject: 'Objeto de dados', dataStore: 'Repositório de dados', annotation: 'Anotação', sequence: 'Fluxo de sequência',
    association: 'Associação', message: 'Fluxo de mensagem', lane: 'Raia', participant: 'Participante externo', process: 'Processo',
  } as Record<string, string>,
  variant: {
    none: '', timer: 'temporizador', message: 'mensagem', error: 'erro', conditional: 'condicional', link: 'link', terminate: 'término', generic: '',
    user: 'usuário', service: 'serviço', manual: 'manual', script: 'script', exclusive: 'exclusivo', parallel: 'paralelo', inclusive: 'inclusivo', eventBased: 'por evento',
  } as Record<string, string>,
  loopKind: { standard: 'Repetição (loop)', parallel: 'Multi-instância paralela', sequential: 'Multi-instância sequencial' } as Record<string, string>,
  priorityKind: { low: 'Baixa', medium: 'Média', high: 'Alta' } as Record<string, string>,
  news: 'Novidades', newsTitle: 'O que mudou', versionsHistory: 'Histórico de publicações', noChanges: 'Sem mudanças.',
  chg: { addedProcess: 'Processo novo', removedProcess: 'Processo removido', added: 'Adicionados', removed: 'Removidos', changed: 'Alterados' },
  fieldLabel: {
    name: 'nome', kind: 'tipo', variant: 'variante', lane: 'raia', description: 'descrição', documentation: 'documentação', url: 'link', performer: 'responsável', accountable: 'aprovador',
    consulted: 'consultados', informed: 'informados', systems: 'sistemas', sla: 'SLA', duration: 'duração', cost: 'custo', priority: 'prioridade', loop: 'repetição',
    sapTransaction: 'código do sistema', inputs: 'entradas', outputs: 'saídas', rules: 'regras', requirements: 'requisitos', calls: 'processo chamado', attachedTo: 'anexado a',
    attributes: 'atributos', from: 'de', to: 'para', condition: 'condição', probability: 'probabilidade', default: 'fluxo padrão',
  } as Record<string, string>,
  locked: { title: 'Conteúdo protegido', hint: 'Informe a senha para abrir este portal.', password: 'Senha', unlock: 'Abrir', wrong: 'Senha incorreta.' },
};
type Dict = typeof pt;

const en: Dict = {
  processes: 'Processes', search: 'Search processes, elements, codes, people…', noResults: 'Nothing found.', results: 'results',
  diagram: 'Diagram', elements: 'Elements', people: 'People', raci: 'RACI matrix',
  zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit to screen', print: 'Print', hideTree: 'Hide navigation', showTree: 'Navigation',
  hidePanel: 'Hide details', showPanel: 'Details', theme: 'Theme', lang: 'Language', staticPage: 'Static version (no JavaScript)',
  selectHint: 'Click an element in the diagram to see its details.', openProcess: 'Open process', open: 'Open', openLink: 'Open link',
  download: 'Download', filter: 'Filter…', allTypes: 'All types', name: 'Name', type: 'Type', lane: 'Lane', responsible: 'Responsible', sla: 'SLA', description: 'Description',
  none: '—', empty: 'No process published.', notFound: 'Process not found.', loading: 'Loading…', loadError: 'Could not load the data for this process.',
  published: 'Published on', version: 'Version', author: 'Author', owner: 'Process owner', tags: 'Tags', modified: 'Modified on',
  sections: {
    about: 'About', documentation: 'Documentation', raci: 'Responsibilities (RACI)', execution: 'Execution', systems: 'Systems', data: 'Data & rules',
    attributes: 'Attributes', requirements: 'Requirements', flow: 'Flow', incoming: 'Receives from', outgoing: 'Continues to', condition: 'Condition',
  },
  f: {
    responsible: 'Responsible (R)', accountable: 'Accountable (A)', consulted: 'Consulted (C)', informed: 'Informed (I)', sla: 'SLA', duration: 'Estimated duration',
    cost: 'Cost', priority: 'Priority', loop: 'Repetition', sap: 'System code / transaction', inputs: 'Inputs', outputs: 'Outputs', rules: 'Rules & controls',
    lane: 'Lane', attached: 'Attached to', probability: 'Probability', default: 'Default flow', from: 'From', to: 'To', link: 'Link',
  },
  kind: {
    start: 'Start event', end: 'End event', intermediate: 'Intermediate event', boundary: 'Boundary event', task: 'Task', gateway: 'Gateway',
    subprocess: 'Subprocess', dataObject: 'Data object', dataStore: 'Data store', annotation: 'Annotation', sequence: 'Sequence flow',
    association: 'Association', message: 'Message flow', lane: 'Lane', participant: 'External participant', process: 'Process',
  },
  variant: {
    none: '', timer: 'timer', message: 'message', error: 'error', conditional: 'conditional', link: 'link', terminate: 'terminate', generic: '',
    user: 'user', service: 'service', manual: 'manual', script: 'script', exclusive: 'exclusive', parallel: 'parallel', inclusive: 'inclusive', eventBased: 'event-based',
  },
  loopKind: { standard: 'Standard loop', parallel: 'Parallel multi-instance', sequential: 'Sequential multi-instance' },
  priorityKind: { low: 'Low', medium: 'Medium', high: 'High' },
  news: "What's new", newsTitle: 'What changed', versionsHistory: 'Publication history', noChanges: 'No changes.',
  chg: { addedProcess: 'New process', removedProcess: 'Removed process', added: 'Added', removed: 'Removed', changed: 'Changed' },
  fieldLabel: {
    name: 'name', kind: 'type', variant: 'variant', lane: 'lane', description: 'description', documentation: 'documentation', url: 'link', performer: 'responsible', accountable: 'accountable',
    consulted: 'consulted', informed: 'informed', systems: 'systems', sla: 'SLA', duration: 'duration', cost: 'cost', priority: 'priority', loop: 'repetition',
    sapTransaction: 'system code', inputs: 'inputs', outputs: 'outputs', rules: 'rules', requirements: 'requirements', calls: 'called process', attachedTo: 'attached to',
    attributes: 'attributes', from: 'from', to: 'to', condition: 'condition', probability: 'probability', default: 'default flow',
  },
  locked: { title: 'Protected content', hint: 'Enter the password to open this portal.', password: 'Password', unlock: 'Open', wrong: 'Wrong password.' },
};

export type Lang = 'pt' | 'en';
const dicts: Record<Lang, Dict> = { pt, en };
let current: Lang = 'pt';
export const setLang = (l: Lang): void => { current = l; };
export const getLang = (): Lang => current;
export const t = (): Dict => dicts[current];
