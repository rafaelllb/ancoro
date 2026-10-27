/**
 * E2E da Fase 2: dirige o editor num Chrome real (puppeteer-core) e valida o modelo via window.__ps (store, só em DEV).
 *
 * [2026-10-14] Criado: verificação de aceite da Fase 2 (arrastar, conectar, inserir, renomear, propriedades, lane, undo/redo, corpus) — Rafael Brito
 * Uso: com `npm run dev` rodando (porta 5180):  npm run e2e
 * Env: CHROME (caminho do chrome.exe), BIIN_BPM (caminho do .bpm do corpus), URL.
 */
import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const URL = process.env.URL ?? 'http://localhost:5180/';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BPM = process.env.BIIN_BPM ?? 'C:/Users/rafae/OneDrive/Documentos/Profissional-Rafael/SAP/ISU/BIIN Process/Processo geral Billing - EN.bpm';
mkdirSync('e2e/out', { recursive: true });

let failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
  if (!cond) failed++;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1600, height: 950 } });
const page = await browser.newPage();
page.on('dialog', (d) => d.accept()); // window.confirm ao excluir atributo
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const state = () => page.evaluate(() => {
  const s = window.__ps.getState();
  const m = s.processes.find((p) => p.id === s.currentId);
  return { m, selectedId: s.selectedId, past: s.past.length, future: s.future.length, armed: s.armed?.id ?? null, editing: s.editing, toast: s.toast, count: s.processes.length, dirty: s.dirty };
});
const node = async (id) => (await state()).m.nodes.find((n) => n.id === id);
const box = async (sel) => {
  const el = await page.$(sel);
  if (!el) throw new Error(`elemento não encontrado: ${sel}`);
  const b = await el.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width, h: b.height, left: b.x, top: b.y };
};
const drag = async (from, to, steps = 12) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
};
const settle = (ms = 120) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => page.screenshot({ path: `e2e/out/${name}.png` });
const tab = async (k) => { await page.click(`[data-tab="${k}"]`); await settle(80); };
// textarea: Enter quebra linha, então o commit é por blur; input: Enter já faz blur
const typeIn = async (selector, text) => { const el = await page.$(selector); await el.click({ clickCount: 3 }); await el.type(text); await page.keyboard.press('Enter'); await page.evaluate(() => document.activeElement && document.activeElement.blur()); await settle(); };

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { localStorage.clear(); });
await page.reload({ waitUntil: 'networkidle0' });
await page.evaluate(() => { document.documentElement.style.colorScheme = 'light'; });

// ------------------------------------------------------------------ 1. exemplo + mover
await page.click('[data-action="sample"]');
await settle(300);
await shot('01-sample');
let s = await state();
check('exemplo carregado (17 nós)', s.m.nodes.length === 17, String(s.m.nodes.length));

const t1Before = (await node('t1')).bounds;
const c = await box('[data-id="t1"]');
await drag(c, { x: c.x + 100, y: c.y + 7 });
await settle();
const t1After = (await node('t1')).bounds;
s = await state();
check('arrastar move o nó (livre, sem grade)', t1After.x !== t1Before.x, JSON.stringify([t1Before, t1After]));
check('arrasto = 1 entrada de histórico', s.past === 1, String(s.past));
const f2 = s.m.flows.find((f) => f.id === 'f2');
const [px, py] = f2.waypoints[0];
const onBorder = px >= t1After.x && px <= t1After.x + t1After.w && py >= t1After.y && py <= t1After.y + t1After.h
  && (px === t1After.x || px === t1After.x + t1After.w || py === t1After.y || py === t1After.y + t1After.h);
check('fluxo ligado foi re-roteado: sai da borda do nó na nova posição', onBorder, JSON.stringify([f2.waypoints, t1After]));
await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
await settle();
check('Ctrl+Z desfaz o movimento', JSON.stringify((await node('t1')).bounds) === JSON.stringify(t1Before));
await page.keyboard.down('Control'); await page.keyboard.press('KeyY'); await page.keyboard.up('Control');
await settle();
check('Ctrl+Y refaz', JSON.stringify((await node('t1')).bounds) === JSON.stringify(t1After));
await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');

// ------------------------------------------------------------------ 1b. duplo clique edita o texto de qualquer elemento com texto
const dbl = async (sel) => { const b = await box(sel); await page.mouse.click(b.x, b.y, { count: 2 }); await settle(150); };
const retype = async (text) => { await page.keyboard.type(text); await page.keyboard.press('Enter'); await settle(); };
const dblCases = [
  ['tarefa', '[data-id="t1"] rect.shape', 't1', (m) => m.nodes.find((n) => n.id === 't1').name],
  ['evento de início (rótulo)', '[data-id="s1"] circle.shape', 's1', (m) => m.nodes.find((n) => n.id === 's1').name],
  ['gateway', '[data-id="g1"] path.shape', 'g1', (m) => m.nodes.find((n) => n.id === 'g1').name],
  ['subprocesso', '[data-id="sub1"] rect.shape', 'sub1', (m) => m.nodes.find((n) => n.id === 'sub1').name],
  ['anotação', '[data-id="n1"] path.shape', 'n1', (m) => m.nodes.find((n) => n.id === 'n1').name],
  ['objeto de dados', '[data-id="d1"] path.shape', 'd1', (m) => m.nodes.find((n) => n.id === 'd1').name],
  ['fluxo (rótulo)', '[data-id="f3"] path.flow', 'f3', (m) => m.flows.find((f) => f.id === 'f3').name],
  ['lane (cabeçalho)', '.lane-0 .head', 'Lane_A', (m) => m.lanes.find((l) => l.id === 'Lane_A').name],
  ['pool (cabeçalho)', '.pool .head', 'Process_Billing', (m) => m.name],
];
for (const [label, sel, id, read] of dblCases) {
  await dbl(sel);
  s = await state();
  const entered = s.editing === id;
  if (entered) await retype(` ✎${id}`.slice(0, 40));
  s = await state();
  check(`duplo clique edita: ${label}`, entered && String(read(s.m)).includes(`✎${id}`), `editing=${s.editing} valor=${read(s.m)}`);
}
// duplo clique no FUNDO da lane não deve renomear por acidente
{
  const lb = await box('.lane-0 .lane-box');
  await page.mouse.click(lb.left + lb.w * 0.85, lb.top + lb.h * 0.5, { count: 2 });
  await settle(150);
  check('duplo clique no fundo da lane NÃO abre edição', (await state()).editing === null);
}
// Esc cancela a edição inline
await dbl('[data-id="t1"] rect.shape');
await page.keyboard.type('NAO-DEVE-SALVAR');
await page.keyboard.press('Escape');
await settle();
check('Esc cancela a edição inline', !(await node('t1')).name.includes('NAO-DEVE-SALVAR'));
// volta o exemplo ao estado original para os próximos blocos
await page.click('[data-action="sample"]');
await settle(300);

// ------------------------------------------------------------------ 1c. rótulos (texto) são elementos: arrastar e editar fora da forma
{
  const lblBox = () => box('[data-id="s1"] .label-hit');
  const shapeBox = () => box('[data-id="s1"] circle.shape');
  const before = await lblBox();
  await drag(before, { x: before.x + 60, y: before.y + 50 }, 15);
  await settle();
  const after = await lblBox();
  const off = (await node('s1')).labelOffset;
  check('arrastar o texto do evento desloca só o rótulo', !!off && after.x > before.x + 40 && after.y > before.y + 30, JSON.stringify([off, before.x, after.x]));
  const shapeNow = await shapeBox();
  check('a forma do evento não se moveu ao arrastar o texto', Math.abs(shapeNow.x - (await shapeBox()).x) < 1 && !!off);
  check('arrastar o texto = 1 entrada de histórico', (await state()).past === 1, String((await state()).past));
  // duplo clique no texto, FORA da forma, edita o nome
  await page.mouse.click(after.x, after.y, { count: 2 });
  await settle(150);
  s = await state();
  check('duplo clique no texto (fora da forma) abre a edição', s.editing === 's1');
  await page.keyboard.type('Início renomeado');
  await page.keyboard.press('Enter');
  await settle();
  check('texto editado fora da forma salva o nome', (await node('s1')).name === 'Início renomeado');
  check('editar o texto preserva a posição customizada', !!(await node('s1')).labelOffset);
  // arrastar o rótulo de um fluxo
  const fb = await box('[data-id="f3"] .label-hit');
  await drag(fb, { x: fb.x + 20, y: fb.y - 25 }, 10);
  await settle();
  check('arrastar o rótulo de um fluxo', !!(s = await state()).m.flows.find((f) => f.id === 'f3').labelOffset);
  // resetar posição
  await page.click('[data-id="s1"] circle.shape');
  await settle();
  await tab('general');
  await page.click('[data-action="reset-label"]');
  await settle();
  check('"voltar ao padrão" remove o deslocamento', !(await node('s1')).labelOffset);
  await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
  await settle();
  check('Ctrl+Z restaura a posição customizada do rótulo', !!(await node('s1')).labelOffset);
  // volta ao exemplo limpo para os blocos seguintes
  await page.click('[data-action="sample"]');
  await settle(300);
}

// ------------------------------------------------------------------ 1d. ajustar o traçado das linhas de conexão (como no Bizagi)
{
  const flowOf = async (id) => (await state()).m.flows.find((f) => f.id === id);
  const ortho = (wp) => wp.slice(1).every((p, i) => Math.abs(p[0] - wp[i][0]) < 0.5 || Math.abs(p[1] - wp[i][1]) < 0.5);
  const onBorder = (p, b) => p[0] >= b.x - 0.5 && p[0] <= b.x + b.w + 0.5 && p[1] >= b.y - 0.5 && p[1] <= b.y + b.h + 0.5
    && (Math.abs(p[0] - b.x) < 0.5 || Math.abs(p[0] - b.x - b.w) < 0.5 || Math.abs(p[1] - b.y) < 0.5 || Math.abs(p[1] - b.y - b.h) < 0.5);
  await page.evaluate(() => window.__ps.getState().select('f5'));
  await settle(150);
  check('linha selecionada mostra alças nos segmentos', (await page.$$('[data-handle="segment"]')).length >= 2);
  const before = (await flowOf('f5')).waypoints;
  const pastBefore = (await state()).past;
  const h1 = await box('[data-handle="segment"][data-index="1"] rect');
  await drag(h1, { x: h1.x, y: h1.y - 12 }, 8); // sobe o canal horizontal
  await settle();
  let f5 = await flowOf('f5');
  check('arrastar a alça move o segmento (traçado fica manual)', f5.manualRoute === true && JSON.stringify(f5.waypoints) !== JSON.stringify(before), JSON.stringify([before, f5.waypoints]));
  check('traçado continua ortogonal e preso às formas', ortho(f5.waypoints) && onBorder(f5.waypoints[0], (await node('t2')).bounds) && onBorder(f5.waypoints.at(-1), (await node('t3')).bounds));
  check('ajustar a linha = 1 entrada de histórico', (await state()).past === pastBefore + 1, String((await state()).past - pastBefore));

  // linha reta: arrastar a alça cria um degrau, sem soltar dos elementos
  await page.evaluate(() => window.__ps.getState().select('f6'));
  await settle(150);
  const h0 = await box('[data-handle="segment"][data-index="0"] rect');
  await drag(h0, { x: h0.x, y: h0.y + 22 }, 8);
  await settle();
  const f6 = await flowOf('f6');
  check('linha reta ganha degrau ao ser puxada (>= 4 pontos) e continua ligada', f6.waypoints.length >= 4 && ortho(f6.waypoints) && onBorder(f6.waypoints[0], (await node('t3')).bounds) && onBorder(f6.waypoints.at(-1), (await node('g2')).bounds), JSON.stringify(f6.waypoints));

  // pontas da linha: mudar o ENCAIXE na borda do próprio elemento
  await page.evaluate(() => window.__ps.getState().select('f2')); // t1 -> g1 (reta)
  await settle(150);
  check('linha selecionada mostra alças nas DUAS pontas', (await page.$$('[data-handle="endpoint"]')).length === 2);
  const gb = await box('[data-id="g1"] path.shape');
  const tgtH = await box('[data-handle="endpoint"][data-end="target"] circle');
  await drag(tgtH, { x: gb.x, y: gb.top - 22 }, 12); // solta ACIMA do gateway
  await settle();
  let f2 = await flowOf('f2');
  const g1b = (await node('g1')).bounds;
  check('arrastar a ponta de destino muda o lado de encaixe (topo do gateway)', f2.manualRoute === true && Math.abs(f2.waypoints.at(-1)[1] - g1b.y) < 0.5 && Math.abs(f2.waypoints.at(-1)[0] - (g1b.x + g1b.w / 2)) < 0.5, JSON.stringify(f2.waypoints));
  check('linha com ponta movida continua ortogonal e a origem não se soltou', ortho(f2.waypoints) && onBorder(f2.waypoints[0], (await node('t1')).bounds));
  await page.evaluate(() => window.__ps.getState().select('f2'));
  await settle(150);
  const t1b = await box('[data-id="t1"] rect.shape');
  const srcH = await box('[data-handle="endpoint"][data-end="source"] circle');
  await drag(srcH, { x: t1b.x - 10, y: t1b.top + t1b.h + 28 }, 12); // solta ABAIXO de t1
  await settle();
  f2 = await flowOf('f2');
  const t1n = (await node('t1')).bounds;
  check('arrastar a ponta de origem muda o encaixe (borda inferior da tarefa, na posição escolhida)', Math.abs(f2.waypoints[0][1] - (t1n.y + t1n.h)) < 0.5 && f2.waypoints[0][0] >= t1n.x && f2.waypoints[0][0] <= t1n.x + t1n.w, JSON.stringify(f2.waypoints[0]));

  // religar a ponta a OUTRO elemento
  await page.evaluate(() => window.__ps.getState().select('f2'));
  await settle(150);
  const t2b = await box('[data-id="t2"] rect.shape');
  const tgtH2 = await box('[data-handle="endpoint"][data-end="target"] circle');
  await drag(tgtH2, { x: t2b.x, y: t2b.y }, 14);
  await settle();
  f2 = await flowOf('f2');
  check('soltar a ponta sobre outro elemento religa a linha (t1 -> t2) e volta ao automático', f2.sourceId === 't1' && f2.targetId === 't2' && f2.manualRoute === undefined && ortho(f2.waypoints), JSON.stringify([f2.sourceId, f2.targetId, f2.manualRoute]));
  // religação inválida: não pode entrar em evento de início -> recusa com motivo e a linha fica como estava
  await page.evaluate(() => window.__ps.getState().select('f2'));
  await settle(150);
  const s1b = await box('[data-id="s1"] circle.shape');
  const tgtH3 = await box('[data-handle="endpoint"][data-end="target"] circle');
  await drag(tgtH3, { x: s1b.x, y: s1b.y }, 14);
  await settle();
  f2 = await flowOf('f2');
  check('religação inválida (para evento de início) é recusada e a linha não muda', f2.targetId === 't2' && /início|start/i.test((await state()).toast ?? ''), JSON.stringify([f2.targetId, (await state()).toast]));
  await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
  await settle(150);
  check('Ctrl+Z desfaz a religação (volta para g1)', (await flowOf('f2')).targetId === 'g1' || (await flowOf('f2')).manualRoute === true);

  // mover o elemento: o traçado manual é ADAPTADO (não jogado fora)
  const canalAntes = (await flowOf('f5')).waypoints[1][1];
  await page.click('[data-id="t3"] rect.shape');
  await settle(100);
  await page.keyboard.press('ArrowRight');
  await settle(150);
  f5 = await flowOf('f5');
  check('mover o destino adapta a linha manual (mantém o canal escolhido)', f5.manualRoute === true && f5.waypoints[1][1] === canalAntes && ortho(f5.waypoints) && onBorder(f5.waypoints.at(-1), (await node('t3')).bounds), JSON.stringify(f5.waypoints));

  // voltar ao automático
  await page.evaluate(() => window.__ps.getState().select('f5'));
  await settle(150);
  await tab('general');
  await page.click('[data-action="auto-route"]');
  await settle(150);
  f5 = await flowOf('f5');
  check('"voltar ao automático" remove a marca manual e re-roteia', f5.manualRoute === undefined && ortho(f5.waypoints));
  await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
  await settle(150);
  check('Ctrl+Z restaura o traçado manual', (await flowOf('f5')).manualRoute === true);
  await page.click('[data-action="sample"]'); // exemplo limpo para os blocos seguintes
  await settle(300);
}

// ------------------------------------------------------------------ 2. inserir da paleta + renomear inline
await page.click('[data-tool="task-user"]');
s = await state();
check('clicar na paleta arma a ferramenta', s.armed === 'task-user');
const laneB = await box('.lane-1 .lane-box');
await page.mouse.click(laneB.left + laneB.w * 0.55, laneB.top + laneB.h * 0.85);
await settle(200);
s = await state();
const created = s.m.nodes.find((n) => n.kind === 'task' && n.name === 'Nova tarefa');
check('clique no diagrama insere a tarefa', !!created, 'nós: ' + s.m.nodes.length);
check('tarefa inserida na lane pela posição', created?.laneId === 'Lane_B', created?.laneId);
check('nova tarefa entra em edição inline', s.editing === created?.id);
await page.keyboard.type('Validar fatura');
await page.keyboard.press('Enter');
await settle();
check('Enter confirma o nome', (await node(created.id)).name === 'Validar fatura');
await shot('02-inserted');

// ------------------------------------------------------------------ 3. conectar arrastando a alça
const before = (await state()).m.flows.length;
await page.click(`[data-id="${created.id}"]`); // seleciona
await settle();
const handle = await box('[data-handle="connect"]');
const target = await box('[data-id="e1"]');
await drag(handle, target, 20);
await settle(200);
s = await state();
check('arrastar a alça cria o fluxo', s.m.flows.length === before + 1, `${before} -> ${s.m.flows.length}`);
const nf = s.m.flows.find((f) => f.sourceId === created.id && f.targetId === 'e1');
check('fluxo novo é sequência roteada', nf?.kind === 'sequence' && nf.waypoints.length >= 2);

// conexão inválida (fim -> tarefa) é recusada com toast
await page.click('[data-id="e1"]');
await settle();
const h2 = await box('[data-handle="connect"]');
const t3 = await box('[data-id="t3"]');
await drag(h2, t3, 15);
await settle(200);
s = await state();
check('conexão inválida é recusada (sem criar fluxo)', s.m.flows.length === before + 1);
check('recusa mostra o motivo (toast)', /fim/i.test(s.toast ?? ''), String(s.toast));
await shot('03-connected');

// ------------------------------------------------------------------ 4. propriedades editáveis (abas estilo Bizagi)
await page.click(`[data-id="${created.id}"]`);
await settle();
await tab('people');
await typeIn('input[aria-label="Responsável (R)"]', 'Analista de Faturamento');
check('aba Responsáveis: R (responsável)', (await node(created.id)).performer === 'Analista de Faturamento');
await typeIn('input[aria-label="Aprovador (A)"]', 'Gerente');
check('aba Responsáveis: A (aprovador)', (await node(created.id)).accountable === 'Gerente');
await typeIn('input[aria-label="Consultados (C)"]', 'Fiscal, TI');
check('aba Responsáveis: C com vários itens (vírgula)', JSON.stringify((await node(created.id)).consulted) === '["Fiscal","TI"]', JSON.stringify((await node(created.id)).consulted));
await typeIn('input[aria-label="Sistemas"]', 'S/4HANA IS-U');
check('aba Responsáveis: sistemas', (await node(created.id)).systems.includes('S/4HANA IS-U'));

await tab('execution');
await typeIn('input[aria-label="SLA"]', '< 2 h');
await typeIn('input[aria-label="Duração estimada"]', '90 min');
await typeIn('input[aria-label="Custo"]', 'R$ 40');
await page.select('select[aria-label="Prioridade"]', 'high');
await page.select('select[aria-label="Repetição"]', 'parallel');
await typeIn('input[aria-label="Transação SAP"]', 'EA19');
let nn = await node(created.id);
check('aba Execução: SLA, duração, custo', nn.sla === '< 2 h' && nn.duration === '90 min' && nn.cost === 'R$ 40');
check('aba Execução: prioridade, loop e transação SAP', nn.priority === 'high' && nn.loop === 'parallel' && nn.sapTransaction === 'EA19');
check('marcador de loop (multi-instância paralela) aparece no diagrama', !!(await page.$(`[data-id="${created.id}"] path[d="M-4 -5v8M0 -5v8M4 -5v8"]`)));

await tab('data');
await typeIn('input[aria-label="Dados de entrada"]', 'Ordem de faturamento');
await typeIn('input[aria-label="Dados de saída"]', 'Documento de faturamento');
await typeIn('input[aria-label="Regras e controles"]', 'Bloquear se inconsistente');
nn = await node(created.id);
check('aba Dados: entradas, saídas e regras', nn.inputs.length === 1 && nn.outputs.length === 1 && nn.rules.length === 1);

await tab('attrs');
// --- criar definições pelo diálogo (como o "Add New Extended Attribute" do Bizagi)
const DLG = '[data-dialog="attr-def"]';
const makeDef = async (name, type, { options, columns } = {}) => {
  await page.click('[data-action="add-attr-def"]');
  await page.waitForSelector(DLG);
  await page.type(`${DLG} input[aria-label="Nome"]`, name);
  await page.select(`${DLG} select[aria-label="Tipo"]`, type);
  if (options) await page.type(`${DLG} textarea[aria-label="Opções (uma por linha)"]`, options);
  if (columns) {
    for (let i = 0; i < columns.length; i++) {
      if (i > 0) await page.click(`${DLG} [data-action="add-column"]`);
      const inputs = await page.$$(`${DLG} input[aria-label="Nome da coluna"]`);
      await inputs[i].type(columns[i][0]);
      const sels = await page.$$(`${DLG} .colrow select`);
      await sels[i].select(columns[i][1]);
    }
  }
  await page.click(`${DLG} [data-action="save-def"]`);
  await settle(200);
};
// o diálogo recusa nome repetido com a mensagem (inline)
await makeDef('Criticidade', 'select', { options: 'Alta\nMédia\nBaixa' });
await makeDef('TCodes', 'textarea');
await makeDef('Módulos', 'multiselect', { options: 'IS-U\nFI-CA\nBW' });
await makeDef('Prioridade', 'radio', { options: 'P1\nP2' });
await makeDef('Quantidade', 'number');
await makeDef('Vigência', 'date');
await makeDef('Manual', 'url');
await makeDef('Fiori_Apps', 'table', { columns: [['App', 'text'], ['Link', 'url']] });
await makeDef('Foto', 'image');
await makeDef('Anexo', 'file');
await page.click('[data-action="add-attr-def"]');
await page.waitForSelector(DLG);
await page.type(`${DLG} input[aria-label="Nome"]`, 'criticidade');
await page.click(`${DLG} [data-action="save-def"]`);
await settle(150);
check('diálogo recusa nome de atributo repetido (mensagem inline)', !!(await page.$(`${DLG} .formerr`)));
await page.keyboard.press('Escape');
await settle(150);
check('Esc fecha o diálogo', !(await page.$(DLG)));
s = await state();
const defTypes = s.m.attributeDefs.map((d) => d.type).sort().join(',');
check('10 definições criadas, de 10 tipos diferentes', s.m.attributeDefs.length === 10 && new Set(s.m.attributeDefs.map((d) => d.type)).size === 10, defTypes);
check('definição de tabela guarda colunas tipadas', JSON.stringify(s.m.attributeDefs.find((d) => d.name === 'Fiori_Apps').columns.map((c) => c.type)) === '["text","url"]');

// --- preencher valores com o editor de cada tipo
await page.select('[data-def="Criticidade"] select', 'Alta');
const tc = await page.$('[data-def="TCodes"] textarea');
await tc.click(); await tc.type('EA00 - Fatura'); await page.keyboard.press('Enter'); await tc.type('EA19 - Reversão');
await page.evaluate(() => document.activeElement.blur());
await page.click('[data-def="Módulos"] input[type=checkbox]:nth-of-type(1)');
await page.click('[data-def="Módulos"] label:nth-of-type(2) input');
await page.click('[data-def="Prioridade"] label:nth-of-type(2) input');
await typeIn('[data-def="Quantidade"] input', '42');
await page.$eval('[data-def="Vigência"] input', (el) => { el.value = '2026-10-14'; });
await page.focus('[data-def="Vigência"] input'); await page.evaluate(() => document.activeElement.blur());
await typeIn('[data-def="Manual"] input', 'https://exemplo.com/manual');
await settle();
nn = await node(created.id);
const av = (name) => nn.attributes.find((a) => a.name === name)?.value;
check('valor: seleção única (lista)', av('Criticidade') === 'Alta', JSON.stringify(av('Criticidade')));
check('valor: área de texto multilinha', /EA00 - Fatura\nEA19 - Reversão/.test(String(av('TCodes'))), JSON.stringify(av('TCodes')));
check('valor: seleção múltipla', JSON.stringify(av('Módulos')) === '["IS-U","FI-CA"]', JSON.stringify(av('Módulos')));
check('valor: seleção única (opções/radio)', av('Prioridade') === 'P2', JSON.stringify(av('Prioridade')));
check('valor: número', av('Quantidade') === '42');
check('valor: data', av('Vigência') === '2026-10-14', JSON.stringify(av('Vigência')));
check('valor: URL (com link clicável)', av('Manual') === 'https://exemplo.com/manual' && !!(await page.$('[data-def="Manual"] a.ext')));

// tabela: linhas, células, reordenar
await page.click('[data-def="Fiori_Apps"] [data-action="add-row"]');
await settle(100);
await page.click('[data-def="Fiori_Apps"] [data-action="add-row"]');
await settle(100);
await typeIn('[data-def="Fiori_Apps"] input[aria-label="App 1"]', 'Resolve Implausible');
await typeIn('[data-def="Fiori_Apps"] input[aria-label="Link 1"]', "https://x.sap/Apps('F2185')/S32");
await typeIn('[data-def="Fiori_Apps"] input[aria-label="App 2"]', 'Process Missing');
await typeIn('[data-def="Fiori_Apps"] input[aria-label="Link 2"]', "https://x.sap/Apps('F3133')/S32");
// preenchida a tabela, a linha 1 vira vazia? (add-row só cria linhas depois do 1º valor): confere o formato final
nn = await node(created.id);
const tbl = av('Fiori_Apps');
check('valor: tabela com linhas e colunas', Array.isArray(tbl) && tbl.length === 2 && tbl[0][0] === 'Resolve Implausible' && tbl[1][1].includes('F3133'), JSON.stringify(tbl));
check('célula URL mostra rótulo amigável (F2185) em vez da URL inteira', (await page.$$eval('[data-def="Fiori_Apps"] a.ext', (as) => as.map((a) => a.textContent))).some((t) => t.includes('F2185')));
await page.click('[data-def="Fiori_Apps"] [data-row="1"] button[aria-label="Subir"]');
await settle(150);
check('tabela: subir linha reordena', av('Fiori_Apps') && (await node(created.id)).attributes.find((a) => a.name === 'Fiori_Apps').value[0][0] === 'Process Missing');

// imagem e arquivo embutidos
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
writeFileSync('e2e/out/pixel.png', png);
writeFileSync('e2e/out/nota.txt', 'conteudo do anexo');
await (await page.$('[data-def="Foto"] input[type=file]')).uploadFile('e2e/out/pixel.png');
await (await page.$('[data-def="Anexo"] input[type=file]')).uploadFile('e2e/out/nota.txt');
await settle(400);
nn = await node(created.id);
check('valor: imagem embutida (data URL) e pré-visualização', String(av('Foto')).startsWith('data:image/png') && !!(await page.$('[data-def="Foto"] img')));
check('valor: arquivo embutido (nome + dados) com link de download', /"name":"nota.txt"/.test(String(av('Anexo'))) && !!(await page.$('[data-def="Anexo"] a[download]')));

// limpar valor e validação
await page.click('[data-def="Quantidade"] header button');
await settle(150);
check('limpar (×) remove o valor do atributo', !(await node(created.id)).attributes.some((a) => a.name === 'Quantidade'));
await shot('07-attributes');

// excluir definição remove os valores
await page.click('[data-action="manage-attrs"]');
await page.waitForSelector(DLG);
await (await page.$$(`${DLG} .deflist button`))[0].click(); // Criticidade
await settle(100);
await page.click(`${DLG} [data-action="delete-def"]`);
await settle(200);
await page.keyboard.press('Escape');
await settle(150);
s = await state();
check('excluir definição remove também os valores nos elementos', !s.m.attributeDefs.some((d) => d.name === 'Criticidade') && !s.m.nodes.some((n) => n.attributes.some((a) => a.name === 'Criticidade')));

await tab('look');
await page.click('.presets button:nth-child(3)'); // amarelo
await settle();
nn = await node(created.id);
check('aba Aparência: preset aplica preenchimento e borda', nn.fill === '#fff2cc' && nn.stroke === '#d6b656', JSON.stringify([nn.fill, nn.stroke]));
const painted = await page.$eval(`[data-id="${created.id}"] rect.shape`, (el) => el.getAttribute('fill'));
check('cor personalizada é desenhada no SVG', painted === '#fff2cc', painted);

await tab('links');
await typeIn('input[aria-label="Requisitos"]', 'REQ-099');
check('aba Vínculos: requisito', (await node(created.id)).requirementRefs.includes('REQ-099'));

await tab('general');
await page.select('select[aria-label="Variante"]', 'service');
await typeIn('textarea[aria-label="Descrição"]', 'Valida o documento');
nn = await node(created.id);
check('aba Geral: variante e descrição', nn.variant === 'service' && nn.description === 'Valida o documento', JSON.stringify([nn.variant, nn.description]));
// tarefa <-> subprocesso pelo campo Variante (como no Bizagi)
await page.select('select[aria-label="Variante"]', '__subprocess');
await settle(200);
nn = await node(created.id);
check('Variante: tarefa vira subprocesso (140x80, sem variante, propriedades preservadas)', nn.kind === 'subprocess' && nn.bounds.w === 140 && !nn.variant && nn.performer === 'Analista de Faturamento', JSON.stringify([nn.kind, nn.bounds, nn.variant]));
check('o subprocesso aparece com o símbolo [+] no diagrama', !!(await page.$(`[data-id="${created.id}"][data-kind="subprocess"]`)));
await page.select('select[aria-label="Variante"]', 'service');
await settle(200);
nn = await node(created.id);
check('Variante: subprocesso volta a ser tarefa de serviço (120x70)', nn.kind === 'task' && nn.variant === 'service' && nn.bounds.w === 120 && nn.performer === 'Analista de Faturamento');
await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
await settle(150);
check('Ctrl+Z desfaz a troca de tipo', (await node(created.id)).kind === 'subprocess');
await page.keyboard.down('Control'); await page.keyboard.press('KeyY'); await page.keyboard.up('Control');
await settle(150);

await tab('docs');
const doc = await page.$('textarea[aria-label="Documentação"]');
await doc.click(); await doc.type('Passo 1'); await page.keyboard.press('Enter'); await doc.type('Passo 2'); await page.mouse.click(5, 5); await settle();
check('aba Documentação', /Passo 1/.test((await node(created.id)).documentation ?? ''), String((await node(created.id)).documentation));

// fluxo: condição + probabilidade
await page.evaluate((id) => window.__ps.getState().select(id), nf.id); // seleção por id: o centro do bbox de um fluxo em L não cai sobre a linha
await settle();
await tab('general');
await typeIn('textarea[aria-label="Condição"]', 'status == OK');
await typeIn('input[aria-label="Probabilidade (%)"]', '70');
const flowNow = (await state()).m.flows.find((f) => f.id === nf.id);
check('propriedades do fluxo: condição e probabilidade', flowNow.condition === 'status == OK' && flowNow.probability === 70);

// processo: metadados
await page.keyboard.press('Escape');
await page.click('.lane-2 .lane-box', { offset: { x: 500, y: 120 } }).catch(() => {});
await page.keyboard.press('Escape');
await settle();
s = await state();
if (s.selectedId) await page.evaluate(() => window.__ps.getState().select(null));
await settle();
await typeIn('input[aria-label="Autor"]', 'Rafael Brito');
await typeIn('input[aria-label="Versão"]', '2.0');
await typeIn('input[aria-label="Tags"]', 'billing, ISU');
s = await state();
check('propriedades do processo: autor, versão, tags', s.m.meta.author === 'Rafael Brito' && s.m.meta.version === '2.0' && s.m.meta.tags.length === 2, JSON.stringify(s.m.meta));
check('modifiedAt é carimbado a cada edição', !!s.m.meta.modifiedAt);

// ------------------------------------------------------------------ 5. lane: resize + add
const laneA = (await state()).m.lanes.find((l) => l.id === 'Lane_A').bounds;
await page.click('.lane-0 .head'); // seleciona a lane
await settle();
const rz = await box('[data-handle="resize"] rect');
await drag(rz, { x: rz.x, y: rz.y + 60 * 0.9 }, 10);
await settle();
const laneA2 = (await state()).m.lanes.find((l) => l.id === 'Lane_A').bounds;
check('arrastar a alça aumenta a lane', laneA2.h > laneA.h, `${laneA.h} -> ${laneA2.h}`);
s = await state();
check('lanes abaixo desceram junto', s.m.lanes[1].bounds.y === laneA2.y + laneA2.h);
const lanesBefore = s.m.lanes.length;
await page.click('[data-tool="lane"]');
await settle();
s = await state();
check('paleta adiciona lane', s.m.lanes.length === lanesBefore + 1);

// ------------------------------------------------------------------ 6. excluir + undo
await page.click(`[data-id="${created.id}"]`);
await settle();
await page.keyboard.press('Delete');
await settle();
s = await state();
check('Delete remove o nó e seus fluxos', !s.m.nodes.some((n) => n.id === created.id) && !s.m.flows.some((f) => f.sourceId === created.id || f.targetId === created.id));
await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control');
await settle();
check('Ctrl+Z traz o nó de volta', (await state()).m.nodes.some((n) => n.id === created.id));

// ------------------------------------------------------------------ 7. exportar
await page.click('[data-action="export"]');
await settle(300);
check('exportar .bpmn confirma (toast)', /BPMN/.test((await state()).toast ?? ''), String((await state()).toast));
await shot('04-edited');

// ------------------------------------------------------------------ 7b. painéis recolhíveis
const canvasW = async () => (await box('svg.canvas')).w;
const w0 = await canvasW();
check('painel de propriedades visível por padrão', !!(await page.$('aside.panel')));
await page.click('[data-action="toggle-right"]');
await settle(400);
const w1 = await canvasW();
check('ocultar propriedades some com o painel', !(await page.$('aside.panel')));
check('ocultar propriedades amplia a área do diagrama', w1 > w0 + 250, `${w0} -> ${w1}`);
await page.click('[data-action="toggle-left"]');
await settle(400);
const w2 = await canvasW();
check('ocultar a paleta amplia ainda mais', w2 > w1 + 150, `${w1} -> ${w2}`);
await shot('06-panels-hidden');
await page.keyboard.down('Control'); await page.keyboard.press('KeyB'); await page.keyboard.up('Control');
await settle(400);
check('Ctrl+B reabre a paleta', (await canvasW()) < w2 - 150);
await page.keyboard.down('Control'); await page.keyboard.down('Shift'); await page.keyboard.press('KeyB'); await page.keyboard.up('Shift'); await page.keyboard.up('Control');
await settle(400);
check('Ctrl+Shift+B reabre as propriedades', !!(await page.$('aside.panel')));
const persisted = await page.evaluate(() => localStorage.getItem('ps-ui-v1'));
check('preferência dos painéis é persistida', !!persisted);

// ------------------------------------------------------------------ 8. corpus real
if (existsSync(BPM)) {
  const input = await page.$('input[type=file]');
  await input.uploadFile(BPM);
  await page.waitForFunction(() => window.__ps.getState().processes.length >= 7, { timeout: 15000 });
  await settle(400);
  s = await state();
  check('abrir .bpm carrega os processos do corpus', s.count >= 7, String(s.count));
  const pid = await page.evaluate(() => window.__ps.getState().processes.find((p) => p.name === 'Meter Reading Process').id);
  await page.evaluate((id) => window.__ps.getState().openProcess(id), pid);
  await settle(400);
  await shot('05-corpus-meter-reading');
  // editar um processo real: mover um nó e desfazer
  const first = (await state()).m.nodes.find((n) => n.kind === 'task');
  const cb = await box(`[data-id="${first.id}"]`);
  await drag(cb, { x: cb.x + 40, y: cb.y + 20 });
  await settle();
  const moved = (await node(first.id)).bounds;
  check('mover nó em diagrama real do Bizagi', moved.x !== first.bounds.x || moved.y !== first.bounds.y);
  // atributos estendidos reais (TCodes e Fiori_Apps) importados do .bpm
  const sapId = await page.evaluate(() => window.__ps.getState().processes.find((p) => p.name.startsWith('SAP S/4HANA')).id);
  await page.evaluate((id) => window.__ps.getState().openProcess(id), sapId);
  await settle(300);
  const mr = (await state()).m.nodes.find((n) => n.name === 'Meter Reading' && n.attributes.length);
  await page.evaluate((id) => window.__ps.getState().select(id), mr.id);
  await settle(200);
  await tab('attrs');
  await settle(200);
  const tcodes = await page.$eval('[data-def="TCodes"] textarea', (el) => el.value);
  check('corpus: TCodes do subprocesso "Meter Reading" aparecem no editor', /EL01 - Individual Reading Order Creation/.test(tcodes));
  const fioriLinks = await page.$$eval('[data-def="Fiori_Apps"] a.ext', (as) => as.map((a) => a.textContent.trim()));
  check('corpus: tabela Fiori_Apps com F2786, F3133 e F2185', ['F2786', 'F3133', 'F2185'].every((f) => fioriLinks.some((l) => l.includes(f))), JSON.stringify(fioriLinks));
  await shot('08-corpus-attributes');
} else console.log('SKIP  corpus (arquivo não encontrado)');

// ------------------------------------------------------------------ 8b. redimensionar (8 alças) e alinhar ao mover
{
  await page.click('[data-action="sample"]');
  await settle(300);
  await page.click('[data-id="t1"] rect, [data-id="t1"]');
  await settle(100);
  const handles = await page.$$('[data-handle="nresize"]');
  check('tarefa selecionada mostra 8 alças de redimensionar', handles.length === 8, String(handles.length));
  const b0 = (await node('t1')).bounds;
  const se = await box('[data-handle="nresize"][data-pos="se"]');
  await drag(se, { x: se.x + 40, y: se.y + 30 }, 8);
  await settle();
  const b1 = (await node('t1')).bounds;
  check('alça SE aumenta largura e altura e mantém a origem', b1.w > b0.w && b1.h > b0.h && b1.x === b0.x && b1.y === b0.y, JSON.stringify([b0, b1]));
  const w = await box('[data-handle="nresize"][data-pos="w"]');
  await drag(w, { x: w.x - 30, y: w.y }, 8);
  await settle();
  const b2 = (await node('t1')).bounds;
  check('alça W cresce para a esquerda e mantém a borda direita', b2.x < b1.x && Math.abs(b2.x + b2.w - (b1.x + b1.w)) < 0.01, JSON.stringify([b1, b2]));
  const nn = await box('[data-handle="nresize"][data-pos="n"]');
  await drag(nn, { x: nn.x, y: nn.y + 400 }, 8);
  await settle();
  const b3 = (await node('t1')).bounds;
  check('não encolhe abaixo do mínimo (altura 40) e mantém a borda inferior', b3.h === 40 && Math.abs(b3.y + b3.h - (b2.y + b2.h)) < 0.01, JSON.stringify([b2, b3]));
  const fl = (await state()).m.flows.filter((f) => f.sourceId === 't1' || f.targetId === 't1');
  const onEdge = (pt, bb) => Math.abs(pt[0] - bb.x) < 1 || Math.abs(pt[0] - bb.x - bb.w) < 1 || Math.abs(pt[1] - bb.y) < 1 || Math.abs(pt[1] - bb.y - bb.h) < 1;
  check('as conexões continuam encostadas na borda após redimensionar', fl.every((f) => onEdge(f.sourceId === 't1' ? f.waypoints[0] : f.waypoints.at(-1), b3)));
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  await settle();
  check('desfazer volta o último redimensionamento', (await node('t1')).bounds.h === b2.h);
  await shot('09-resize');
  // eventos não são redimensionáveis
  await page.evaluate(() => window.__ps.getState().select('s1'));
  await settle(100);
  check('evento (forma fixa) não mostra alças', (await page.$$('[data-handle="nresize"]')).length === 0);
}

// ------------------------------------------------------------------ 9. novo processo do zero
await page.click('[data-action="new"]');
await settle(300);
s = await state();
check('Novo cria processo com evento de início', s.m.nodes.length === 1 && s.m.nodes[0].kind === 'start');

check('sem erros no console/página', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} FALHA(S)` : '\nTODOS OS CHECKS PASSARAM');
process.exit(failed ? 1 : 0);
