# SAP IS-U Requirements Graph — Especificação técnica para implementação

## Objetivo

Grafo interativo de requisitos SAP IS-U com Canvas 2D API puro (sem bibliotecas de grafo).
Funcionalidades: arrastar nós, zoom com scroll, pan, clique para detalhes, filtro por tipo, caminho crítico.

---

## Stack

- HTML + CSS + JavaScript vanilla
- Canvas 2D API nativo — sem D3, Cytoscape, React Flow ou similares
- Opcional para React: mesmo princípio, canvas via `useRef` + `useEffect`

---

## Estrutura de dados

```js
const nodes = [
  {
    id: 'F1',
    type: 'functional',        // 'process' | 'functional' | 'technical' | 'integration'
    label: 'Validação\nde leitura',  // \n para quebra de linha no canvas
    x: 280,                    // posição inicial em coordenadas "mundo"
    y: 60,
    desc: 'REQ-F01: Validar leitura contra limites mínimos/máximos históricos.',
    status: 'done'             // 'done' | 'in-progress' | 'pending'
  },
  // ... mais nós
];

const edges = [
  { from: 'P1', to: 'F1' },
  { from: 'F1', to: 'F3' },
  // ... mais arestas
];

// IDs dos nós no caminho crítico
const criticalPath = new Set(['P1', 'F1', 'F3', 'T2', 'F4', 'T3', 'I3']);

// Chaves "fromId→toId" das arestas críticas
const criticalEdges = new Set(['P1→F1', 'F1→F3', 'F3→T2', 'T2→F4', 'F4→T3', 'T3→I3']);
```

---

## Constantes de layout

```js
const NW = 100;   // largura do nó em px (coordenadas mundo)
const NH = 52;    // altura do nó
const NR = 8;     // border-radius do nó
```

---

## Estado global

```js
let scale   = 1;       // fator de zoom atual
let offsetX = 0;       // deslocamento horizontal do viewport
let offsetY = 0;       // deslocamento vertical do viewport

let draggingNode = null;   // nó sendo arrastado
let dragOffX = 0;          // offset do clique dentro do nó
let dragOffY = 0;

let isPanning  = false;    // pan do viewport ativo
let panStartX  = 0;
let panStartY  = 0;
let panOffX    = 0;        // offsetX no momento em que pan iniciou
let panOffY    = 0;

let selectedNode = null;   // nó selecionado (painel de detalhes)
let filterType   = 'all';  // filtro ativo
let showCritical = false;  // caminho crítico ativo
```

---

## Sistema de coordenadas duplo

Toda posição existe em dois espaços. Nós são armazenados em coordenadas "mundo".
O canvas desenha em coordenadas "canvas" (afetadas por zoom e pan).

```js
// Mundo → Canvas (usar ao DESENHAR)
function toCanvas(wx, wy) {
  return {
    x: wx * scale + offsetX,
    y: wy * scale + offsetY
  };
}

// Canvas → Mundo (usar ao RECEBER eventos de mouse)
function toWorld(cx, cy) {
  return {
    x: (cx - offsetX) / scale,
    y: (cy - offsetY) / scale
  };
}
```

---

## DPI alto (Retina / 4K) — obrigatório

Sem isso o canvas fica borrado em telas HiDPI:

```js
function resize() {
  const W = wrap.clientWidth;
  const H = wrap.clientHeight;

  canvas.width  = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  ctx.scale(devicePixelRatio, devicePixelRatio);
  draw();
}

window.addEventListener('resize', resize);
resize(); // chamar na inicialização
```

---

## Loop de renderização

Sem animação contínua — redesenha apenas quando o estado muda.
Sempre na ordem: limpar → arestas → nós (nós ficam por cima).

```js
function draw() {
  ctx.clearRect(0, 0, W, H);
  drawEdges();
  drawNodes();
}
```

Chamar `draw()` ao final de todo handler de evento.

---

## Desenho dos nós

```js
function drawNodes() {
  nodes.forEach(n => {
    if (!nodeVisible(n)) return;

    const { x: cx, y: cy } = toCanvas(n.x, n.y);
    const cw = NW * scale;
    const ch = NH * scale;
    const cr = NR * scale;
    const c  = COLORS[n.type];  // paleta por tipo (ver seção Paleta)

    const isCrit = showCritical && criticalPath.has(n.id);
    const isSel  = selectedNode && selectedNode.id === n.id;

    // fundo do nó
    drawRoundRect(cx, cy, cw, ch, cr);
    ctx.fillStyle   = c.fill;
    ctx.fill();
    ctx.strokeStyle = isCrit ? '#E24B4A' : isSel ? '#378ADD' : c.stroke;
    ctx.lineWidth   = (isCrit || isSel) ? 2 : 0.5;
    ctx.stroke();

    // texto (respeita escala)
    const fontSize = Math.max(9, 11 * scale);
    ctx.font         = `500 ${fontSize}px sans-serif`;
    ctx.fillStyle    = c.text;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    const lines = n.label.split('\n');
    const lh    = fontSize * 1.3;
    const startY = cy + ch / 2 - (lines.length - 1) * lh / 2;
    lines.forEach((line, i) => {
      ctx.fillText(line, cx + cw / 2, startY + i * lh);
    });

    // ponto de status (canto superior direito)
    const dotR = 4 * scale;
    const dotX = cx + cw - dotR * 1.5;
    const dotY = cy + dotR * 1.5;
    ctx.beginPath();
    ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = n.status === 'done'        ? '#1D9E75'
                  : n.status === 'in-progress' ? '#EF9F27'
                  :                              '#B4B2A9';
    ctx.fill();
  });
}

// helper: retângulo com bordas arredondadas
function drawRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x, y + r);     ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}
```

---

## Desenho das arestas (curva de Bézier + seta)

```js
function drawEdges() {
  edges.forEach(e => {
    const fn = nodes.find(n => n.id === e.from);
    const tn = nodes.find(n => n.id === e.to);
    if (!fn || !tn) return;
    if (!nodeVisible(fn) || !nodeVisible(tn)) return;

    const key    = e.from + '→' + e.to;
    const isCrit = showCritical && criticalEdges.has(key);
    const isHighlighted = selectedNode &&
      (e.from === selectedNode.id || e.to === selectedNode.id);

    // pontos centrais dos nós em coordenadas canvas
    const fp = toCanvas(fn.x + NW / 2, fn.y + NH / 2);
    const tp = toCanvas(tn.x + NW / 2, tn.y + NH / 2);

    ctx.save();
    ctx.strokeStyle = isCrit ? '#E24B4A' : isHighlighted ? '#378ADD' : '#888780';
    ctx.lineWidth   = isCrit ? 2.5 : isHighlighted ? 2 : 1;
    ctx.globalAlpha = isHighlighted || isCrit ? 1 : 0.4;

    if (!isCrit && !isHighlighted) ctx.setLineDash([4, 3]);

    // curva de Bézier: sai horizontal, chega horizontal
    const mx = (fp.x + tp.x) / 2;
    ctx.beginPath();
    ctx.moveTo(fp.x, fp.y);
    ctx.bezierCurveTo(mx, fp.y, mx, tp.y, tp.x, tp.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // seta na ponta de chegada
    const angle = Math.atan2(tp.y - fp.y, tp.x - fp.x);
    const arr   = 7 * scale;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(tp.x, tp.y);
    ctx.lineTo(tp.x - arr * Math.cos(angle - 0.4), tp.y - arr * Math.sin(angle - 0.4));
    ctx.lineTo(tp.x - arr * Math.cos(angle + 0.4), tp.y - arr * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  });
}
```

---

## Hit-test (detectar nó sob o cursor)

```js
function getNodeAt(canvasX, canvasY) {
  const w = toWorld(canvasX, canvasY);
  // iterar de trás para frente para pegar o nó do topo primeiro
  return [...nodes].reverse().find(n =>
    nodeVisible(n) &&
    w.x >= n.x && w.x <= n.x + NW &&
    w.y >= n.y && w.y <= n.y + NH
  );
}
```

---

## Eventos de mouse

```js
let clickStart = { x: 0, y: 0 };

canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  clickStart = { x: e.clientX, y: e.clientY };

  const n = getNodeAt(cx, cy);
  if (n) {
    // iniciar drag de nó
    draggingNode = n;
    const w  = toWorld(cx, cy);
    dragOffX = n.x - w.x;
    dragOffY = n.y - w.y;
    canvas.style.cursor = 'grabbing';
  } else {
    // iniciar pan do viewport
    isPanning = true;
    panStartX = e.clientX; panStartY = e.clientY;
    panOffX   = offsetX;   panOffY   = offsetY;
  }
});

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  if (draggingNode) {
    const w = toWorld(cx, cy);
    draggingNode.x = w.x + dragOffX;
    draggingNode.y = w.y + dragOffY;
    draw();
  } else if (isPanning) {
    offsetX = panOffX + (e.clientX - panStartX);
    offsetY = panOffY + (e.clientY - panStartY);
    draw();
  } else {
    canvas.style.cursor = getNodeAt(cx, cy) ? 'pointer' : 'grab';
  }
});

canvas.addEventListener('mouseup', e => {
  const moved = Math.abs(e.clientX - clickStart.x) +
                Math.abs(e.clientY - clickStart.y) > 4;

  if (!moved) {
    // clique simples: selecionar nó ou desselecionar
    const rect = canvas.getBoundingClientRect();
    const n = getNodeAt(e.clientX - rect.left, e.clientY - rect.top);
    if (n) {
      selectedNode = n;
      showDetailPanel(n);
    } else {
      selectedNode = null;
      hideDetailPanel();
    }
  }

  draggingNode = null;
  isPanning    = false;
  canvas.style.cursor = 'grab';
  draw();
});
```

---

## Zoom com scroll (centrado no cursor)

```js
canvas.addEventListener('wheel', e => {
  e.preventDefault();

  const rect  = canvas.getBoundingClientRect();
  const cx    = e.clientX - rect.left;
  const cy    = e.clientY - rect.top;
  const delta = e.deltaY > 0 ? 0.9 : 1.1;

  const newScale = Math.min(2.5, Math.max(0.3, scale * delta));

  // fórmula: zoom centrado no cursor (não no canto)
  offsetX = cx - (cx - offsetX) * (newScale / scale);
  offsetY = cy - (cy - offsetY) * (newScale / scale);
  scale   = newScale;

  draw();
}, { passive: false });
```

---

## Filtro por tipo

```js
function nodeVisible(n) {
  return filterType === 'all' || n.type === filterType;
}

// ao clicar num botão de filtro:
filterType = 'functional'; // ou 'process', 'technical', 'integration', 'all'
draw();
```

---

## Caminho crítico

```js
// ao ativar/desativar:
showCritical = !showCritical;
draw();

// no draw, nós e arestas verificam:
const isCritNode = showCritical && criticalPath.has(n.id);
const isCritEdge = showCritical && criticalEdges.has(`${e.from}→${e.to}`);
// → usar cor vermelha (#E24B4A) e lineWidth maior
```

---

## Paleta de cores por tipo de nó

```js
const COLORS = {
  process: {
    fill:   '#E6F1FB',  // azul claro
    stroke: '#378ADD',  // azul médio
    text:   '#0C447C',  // azul escuro
    badge:  '#B5D4F4'
  },
  functional: {
    fill:   '#E1F5EE',  // verde claro
    stroke: '#1D9E75',
    text:   '#085041',
    badge:  '#9FE1CB'
  },
  technical: {
    fill:   '#EEEDFE',  // roxo claro
    stroke: '#7F77DD',
    text:   '#3C3489',
    badge:  '#CECBF6'
  },
  integration: {
    fill:   '#FAECE7',  // coral claro
    stroke: '#D85A30',
    text:   '#712B13',
    badge:  '#F5C4B3'
  }
};

// Status dot colors
// done:        '#1D9E75'  (verde)
// in-progress: '#EF9F27'  (âmbar)
// pending:     '#B4B2A9'  (cinza)

// Caminho crítico
// '#E24B4A'  (vermelho)
```

---

## Versão React (componente)

Mesma lógica, adaptada para o ciclo de vida do React:

```jsx
import { useRef, useEffect, useState } from 'react';

export function RequirementsGraph({ nodes, edges, criticalPath, criticalEdges }) {
  const canvasRef = useRef(null);
  const stateRef  = useRef({ scale: 1, offsetX: 0, offsetY: 0,
                              draggingNode: null, selectedNode: null,
                              filterType: 'all', showCritical: false });
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext('2d');
    const state  = stateRef.current;

    // resize
    const resize = () => {
      const W = canvas.parentElement.clientWidth;
      const H = canvas.parentElement.clientHeight;
      canvas.width  = W * devicePixelRatio;
      canvas.height = H * devicePixelRatio;
      canvas.style.width  = W + 'px';
      canvas.style.height = H + 'px';
      ctx.scale(devicePixelRatio, devicePixelRatio);
      draw();
    };

    // draw, toCanvas, toWorld, drawNodes, drawEdges — mesmas funções acima
    // usando state.scale, state.offsetX, etc.

    // eventos
    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup',   onMouseUp);
    canvas.addEventListener('wheel',     onWheel, { passive: false });
    window.addEventListener('resize',    resize);

    resize();

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseup',   onMouseUp);
      canvas.removeEventListener('wheel',     onWheel);
      window.removeEventListener('resize',    resize);
    };
  }, [nodes, edges]);

  return (
    <div style={{ position: 'relative', width: '100%', height: 480 }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      {selectedNode && <DetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />}
    </div>
  );
}
```

---

## Prompt para o Claude Code

Cole isso diretamente no Claude Code (VSCode):

```
Crie um grafo interativo de requisitos SAP IS-U usando Canvas 2D API puro (sem bibliotecas).

Requisitos técnicos:
- Nós arrastáveis com offset correto (não "pula" ao clicar)
- Zoom com scroll centrado no cursor, range 0.3x–2.5x
- Pan com drag no fundo do canvas
- Curvas de Bézier como arestas com seta triangular na ponta
- Hit-test em coordenadas mundo (sistema duplo toCanvas/toWorld)
- Suporte a devicePixelRatio (Retina/4K)
- Redesenha apenas em eventos, sem requestAnimationFrame contínuo
- Painel de detalhes ao clicar num nó (HTML sobreposto ao canvas)
- Filtro por tipo: process, functional, technical, integration
- Caminho crítico: destaca nós e arestas em vermelho (#E24B4A)
- Ponto de status por nó: verde/âmbar/cinza no canto superior direito

Estrutura de dados:
nodes = [{ id, type, label, x, y, desc, status }]
edges = [{ from, to }]
criticalPath = new Set([...ids])
criticalEdges = new Set(['id1→id2', ...])

Use os dados SAP IS-U do arquivo sap_isu_graph_spec.md como conteúdo inicial.
```

---

## Dados SAP IS-U de exemplo

```js
const nodes = [
  { id:'P1', type:'process',     label:'Leitura de\nmedidor',      x:90,  y:120, status:'done',        desc:'Coleta de leitura via rota ou telemedição (MR-05).' },
  { id:'P2', type:'process',     label:'Faturamento\nperiódico',   x:90,  y:260, status:'done',        desc:'Ciclo IS-U: EASIBI → fatura → impressão (EA80).' },
  { id:'P3', type:'process',     label:'Arrecadação\ne pagamento', x:90,  y:400, status:'in-progress', desc:'Recebimento, baixa FI-CA e geração de extrato.' },
  { id:'F1', type:'functional',  label:'Validação\nde leitura',    x:280, y:60,  status:'done',        desc:'REQ-F01: Validar contra limites mínimos/máximos históricos.' },
  { id:'F2', type:'functional',  label:'Estimativa\nautomática',   x:280, y:180, status:'in-progress', desc:'REQ-F02: Estimar leitura ausente pela média dos últimos 12 ciclos.' },
  { id:'F3', type:'functional',  label:'Cálculo de\nconsumo',      x:280, y:300, status:'done',        desc:'REQ-F03: Consumo líquido com multiplicador e fator de correção.' },
  { id:'F4', type:'functional',  label:'Emissão de\nfatura',       x:280, y:400, status:'pending',     desc:'REQ-F04: Documento de fatura com todos os itens tarifários.' },
  { id:'F5', type:'functional',  label:'Débito\nautomático',       x:280, y:490, status:'in-progress', desc:'REQ-F05: Débito em conta via mandato FI-CA.' },
  { id:'T1', type:'technical',   label:'BAPI\nMR_CREATE',          x:470, y:60,  status:'done',        desc:'REQ-T01: BAPI para criação de ordem de leitura via interface.' },
  { id:'T2', type:'technical',   label:'Classe\nCL_ISU_BILL',      x:470, y:200, status:'in-progress', desc:'REQ-T02: Estender classe de faturamento para regras ANEEL.' },
  { id:'T3', type:'technical',   label:'FM\nISU_INVOICE',          x:470, y:330, status:'pending',     desc:'REQ-T03: Function module de fatura com parâmetros customizados.' },
  { id:'T4', type:'technical',   label:'Spool\nde impressão',      x:470, y:440, status:'pending',     desc:'REQ-T04: SmartForms para envio a gráfica ou e-mail.' },
  { id:'I1', type:'integration', label:'Interface\nAMR',           x:650, y:100, status:'in-progress', desc:'REQ-I01: IDoc MREQ_SEND para leituras automáticas.' },
  { id:'I2', type:'integration', label:'FI-CA →\nContabilidade',   x:650, y:250, status:'pending',     desc:'REQ-I02: Transferência para GL via reconciliação periódica.' },
  { id:'I3', type:'integration', label:'Portal\ndo cliente',       x:650, y:390, status:'pending',     desc:'REQ-I03: API REST para faturas e histórico no portal web.' },
];

const edges = [
  { from:'P1', to:'F1' }, { from:'P1', to:'F2' },
  { from:'F1', to:'F3' }, { from:'F2', to:'F3' },
  { from:'P2', to:'F3' }, { from:'P2', to:'F4' },
  { from:'F3', to:'T2' }, { from:'F4', to:'T3' }, { from:'F4', to:'T4' },
  { from:'P3', to:'F5' }, { from:'F5', to:'I2' },
  { from:'T1', to:'F1' }, { from:'T1', to:'I1' },
  { from:'T2', to:'F4' }, { from:'T3', to:'I3' },
  { from:'I1', to:'F2' }, { from:'I2', to:'T4' },
];

const criticalPath  = new Set(['P1','F1','F3','T2','F4','T3','I3']);
const criticalEdges = new Set(['P1→F1','F1→F3','F3→T2','T2→F4','F4→T3','T3→I3']);
```
