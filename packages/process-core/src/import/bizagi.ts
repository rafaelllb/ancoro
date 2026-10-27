/**
 * Importador de arquivos Bizagi Modeler (.bpm) -> ProcessModel[].
 *
 * [2026-10-14] Criado: importador do formato nativo do Bizagi — Rafael Brito
 * Descoberta (corpus BIIN): .bpm NÃO é opaco. É um ZIP que contém um ZIP por diagrama (`<guid>.diag`),
 * e cada `Diagram.xml` é XPDL 2.2 (padrão aberto WfMC) + extensões Bizagi. Logo, o import é legível
 * sem engenharia reversa binária — o risco de licença citado no README §7 fica restrito a
 * "importar arquivo do próprio usuário", que é o uso aqui.
 *
 * Mapeamento relevante (validado contra 7 diagramas reais):
 *  - Coordenadas XPDL são absolutas no diagrama e (x,y) = canto superior esquerdo => mapeiam 1:1 para BPMN DI.
 *  - Lanes: Bizagi NÃO grava LaneId nas atividades; a lane é inferida pela posição (centro Y da atividade
 *    dentro da faixa Y absoluta da lane). Lane.y é relativo ao pool; x da lane = borda direita do cabeçalho.
 *  - Route sem GatewayType = gateway exclusivo. Transition com Condition Type=OTHERWISE = fluxo padrão.
 *  - IntermediateEvent IsAttached=true -> boundary event (Target = id da tarefa hospedeira).
 *  - Link event: throw se não tem saída (origem do salto), catch se não tem entrada (destino).
 *  - Implementation/SubFlow@Id -> call activity (calledProcessId = id do processo chamado em OUTRO diagrama).
 *  - DataStoreReference -> dataStore (nome = lista de tabelas do DataStore). Association -> association.
 *  - Pools sem atividades e com fronteira visível, alvo de MessageFlow -> participante externo (caixa-preta).
 *  - Pool "Main Process" (BoundaryVisible=false, vazio) é placeholder do Bizagi e é descartado.
 *
 * TODO [ESTIGMERGIA]: conteúdo de BlockActivity (subprocesso expandido)
 * - Hoje vira subprocesso colapsado + warning; os filhos estão em <ActivitySets> (Activities/Transitions próprios).
 * - Próximo passo: o modelo precisa de `children` em subprocess (ver TODO do serializer) para importar sem perda.
 * TODO [ESTIGMERGIA]: RuntimeProperties (JSON em ExtendedAttributes), Performers, Loop e BPSim
 * - Ausentes ou vazios no corpus BIIN; ignorados de propósito. Reavaliar se aparecerem em outros arquivos.
 */
import { strFromU8, unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import { parseModel, type AttributeDef, type AttrValue, type Bounds, type NodeKind, type ProcessFlow, type ProcessLane, type ProcessModel, type ProcessNode } from '../model.js';
import { flowLabel, nodeLabel, offsetFrom } from '../labels.js';

export interface BizagiImportResult {
  processes: ProcessModel[];
  warnings: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

const LIST_TAGS = new Set([
  'Pool', 'Lane', 'Activity', 'Transition', 'MessageFlow', 'Association', 'Artifact', 'DataStore', 'DataStoreReference',
  'DataObject', 'Coordinates', 'ConnectorGraphicsInfo', 'NodeGraphicsInfo', 'WorkflowProcess',
  // atributos estendidos (Documentation/*.xml e ExtendedAttributeValues.xml)
  'ColumnAttribute', 'AttributeElementType', 'ElementAttributeValues', 'ExtendedAttributeValue', 'RowValues', 'Option',
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseAttributeValue: false,
  isArray: (name) => LIST_TAGS.has(name),
});

/** XPDL usa GUIDs (podem iniciar com dígito); xsd:ID do BPMN exige NCName. */
export const toNcName = (id: string): string => (/^[A-Za-z_]/.test(id) ? id : `id_${id}`);

const num = (v: unknown): number => Number.parseFloat(String(v ?? '0')) || 0;
const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'object' && v && '#text' in v ? String((v as X)['#text']) : '').trim();
const list = (v: unknown): X[] => (Array.isArray(v) ? v : v && typeof v === 'object' ? [v] : []);

function gfx(el: X): Bounds | undefined {
  const g = list(el?.NodeGraphicsInfos?.NodeGraphicsInfo)[0];
  const c = list(g?.Coordinates)[0];
  if (!g || !c) return undefined;
  return { x: num(c['@_XCoordinate']), y: num(c['@_YCoordinate']), w: num(g['@_Width']), h: num(g['@_Height']) };
}

function waypoints(el: X): Array<[number, number]> | undefined {
  const cg = list(el?.ConnectorGraphicsInfos?.ConnectorGraphicsInfo)[0];
  const pts = list(cg?.Coordinates).map((c): [number, number] => [num(c['@_XCoordinate']), num(c['@_YCoordinate'])]);
  return pts.length >= 2 ? pts : undefined;
}

/** Lê o .bpm (ZIP de ZIPs) e devolve os Diagram.xml (XPDL) em texto. */
export function extractDiagrams(bpm: Uint8Array): Array<{ name: string; xml: string }> {
  const outer = unzipSync(bpm);
  const out: Array<{ name: string; xml: string }> = [];
  for (const [name, data] of Object.entries(outer).sort(([a], [b]) => a.localeCompare(b))) {
    if (!name.endsWith('.diag')) continue;
    const inner = unzipSync(data);
    const diagram = inner['Diagram.xml'];
    if (diagram) out.push({ name, xml: strFromU8(diagram) });
  }
  return out;
}

/** Conteúdo do .bpm: diagramas (XPDL), valores de atributos por diagrama e definições de atributos (projeto). */
export interface BpmContents {
  diagrams: Array<{ name: string; xml: string; valuesXml?: string }>;
  /** Documentation/<guid>.xml — definições dos atributos estendidos (nível de projeto) */
  attributeDefsXml: string[];
}

export function extractBpm(bpm: Uint8Array): BpmContents {
  const outer = unzipSync(bpm);
  const diagrams: BpmContents['diagrams'] = [];
  const attributeDefsXml: string[] = [];
  for (const [name, data] of Object.entries(outer).sort(([x], [y]) => x.localeCompare(y))) {
    if (name.startsWith('Documentation/') && name.endsWith('.xml')) attributeDefsXml.push(strFromU8(data));
    if (!name.endsWith('.diag')) continue;
    const inner = unzipSync(data);
    const diagram = inner['Diagram.xml'];
    if (diagram) diagrams.push({ name, xml: strFromU8(diagram), ...(inner['ExtendedAttributeValues.xml'] && { valuesXml: strFromU8(inner['ExtendedAttributeValues.xml']) }) });
  }
  return { diagrams, attributeDefsXml };
}

export function importBizagi(bpm: Uint8Array): BizagiImportResult {
  const processes: ProcessModel[] = [];
  const warnings: string[] = [];
  const { diagrams, attributeDefsXml } = extractBpm(bpm);
  if (!diagrams.length) throw new Error('Arquivo .bpm sem diagramas (.diag): não é um arquivo Bizagi Modeler válido');
  for (const d of diagrams) {
    const r = importXpdl(d.xml, d.name, { defsXml: attributeDefsXml, valuesXml: d.valuesXml });
    processes.push(...r.processes);
    warnings.push(...r.warnings);
  }
  return { processes, warnings };
}

// ------------------------------------------------------------------------------------------------ atributos estendidos
// [2026-10-14] Criado: importa os Extended Attributes do Bizagi (definições + valores, ex.: tabelas de apps e listas de códigos) — Rafael Brito
// Formato (corpus BIIN): definições em Documentation/<guid>.xml (<ExtendedAttribute Id Type><Name/><Description/><Options/><TableColumns/><ElementTypes/>)
// e valores em <diagrama>.diag/ExtendedAttributeValues.xml (<ElementAttributeValues ElementId><Values><ExtendedAttributeValue Id Type><Content/>
// <TableValues><RowValues><ExtendedAttributeValue .../></RowValues></TableValues>). Texto longo vem como HTML -> convertido para texto simples.
// Tipos do Bizagi além de LongText/Table/Text/Link são inferidos pelo nome (não há amostra no corpus) e geram aviso quando desconhecidos.

const NAMED_ENTITIES: Record<string, string> = {
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', deg: '°', times: '×', laquo: '«', raquo: '»', euro: '€', rarr: '→', larr: '←',
  aacute: 'á', agrave: 'à', atilde: 'ã', acirc: 'â', eacute: 'é', ecirc: 'ê', iacute: 'í', oacute: 'ó', otilde: 'õ',
  ocirc: 'ô', uacute: 'ú', ccedil: 'ç', Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú', Ccedil: 'Ç',
};

/** HTML do Bizagi (texto rico) -> texto simples com quebras de linha. */
export function htmlToText(html: string): string {
  if (!html.includes('<') && !html.includes('&')) return html.trim();
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name] ?? m) // entidades nomeadas comuns do editor de texto rico do Bizagi
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim();
}

const BIZAGI_TYPE: Record<string, AttributeDef['type']> = {
  longtext: 'textarea', text: 'text', textbox: 'text', number: 'number', numeric: 'number', integer: 'number', decimal: 'number', date: 'date', datetime: 'date',
  image: 'image', combo: 'select', combobox: 'select', singleselection: 'select', radio: 'radio', radiobutton: 'radio',
  multiple: 'multiselect', multipleselection: 'multiselect', multiselect: 'multiselect', checkbox: 'multiselect',
  embeddedfile: 'file', file: 'file', linkedfile: 'fileLink', link: 'url', url: 'url', table: 'table',
};
const BIZAGI_ELEMENT_KIND: Record<string, NodeKind[]> = {
  task: ['task'], subprocess: ['subprocess'], callactivity: ['subprocess'], startevent: ['start'], endevent: ['end'],
  intermediateevent: ['intermediate', 'boundary'], route: ['gateway'], gateway: ['gateway'], dataobject: ['dataObject'], datastore: ['dataStore'],
  datastorereference: ['dataStore'], annotation: ['annotation'], textannotation: ['annotation'],
};

interface RawDef { id: string; name: string; description?: string; type: AttributeDef['type']; options: string[]; columns: Array<{ id: string; name: string; type: 'text' | 'number' | 'date' | 'url' }>; kinds: NodeKind[] }

function parseAttributeDefs(defsXml: string[], warnings: string[]): { raw: Map<string, RawDef>; canonical: AttributeDef[]; canonOf: Map<string, string> } {
  const raw = new Map<string, RawDef>();
  for (const xml of defsXml) {
    let ea: X;
    try { ea = parser.parse(xml).ExtendedAttribute; } catch { continue; }
    if (!ea?.['@_Id']) continue;
    const bt = String(ea['@_Type'] ?? 'Text');
    const type = BIZAGI_TYPE[bt.toLowerCase()];
    if (!type) warnings.push(`Atributo estendido '${text(ea.Name)}': tipo Bizagi '${bt}' desconhecido — importado como texto`);
    const colType = (t: string): 'text' | 'number' | 'date' | 'url' => {
      const k = BIZAGI_TYPE[t.toLowerCase()];
      return k === 'number' ? 'number' : k === 'date' ? 'date' : k === 'url' ? 'url' : 'text';
    };
    const kinds = list(ea.ElementTypes?.AttributeElementType).flatMap((e) => BIZAGI_ELEMENT_KIND[String(e['@_Type']).toLowerCase()] ?? []);
    raw.set(ea['@_Id'], {
      id: ea['@_Id'], name: text(ea.Name) || ea['@_Id'], ...(text(ea.Description) && { description: text(ea.Description) }),
      type: type ?? 'text',
      options: list(ea.Options?.Option).map((o) => text(o)).filter(Boolean),
      columns: list(ea.TableColumns?.ColumnAttribute).map((c) => ({ id: c['@_Id'] as string, name: text(c.Name) || (c['@_Id'] as string), type: colType(String(c['@_Type'] ?? 'Text')) })),
      kinds: [...new Set(kinds)],
    });
  }
  // Bizagi cria uma definição por tipo de elemento (ex.: "TCodes" p/ SubProcess e outra p/ CallActivity). Aqui viram UMA, com appliesTo unido.
  const groups = new Map<string, RawDef[]>();
  for (const d of raw.values()) {
    const key = `${d.name.toLowerCase()}|${d.type}|${d.columns.map((c) => c.name.toLowerCase()).join(',')}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const canonical: AttributeDef[] = [];
  const canonOf = new Map<string, string>();
  for (const g of groups.values()) {
    const first = g[0]!;
    const cid = toNcName(first.id);
    const unrestricted = g.some((d) => d.kinds.length === 0);
    const kinds = [...new Set(g.flatMap((d) => d.kinds))];
    canonical.push({
      id: cid, name: first.name, ...(first.description && first.type !== 'textarea' && { description: first.description }),
      type: first.type, options: first.options,
      columns: first.columns.map((c) => ({ id: toNcName(c.id), name: c.name, type: c.type })),
      ...(!unrestricted && kinds.length && { appliesTo: kinds }),
    });
    for (const d of g) canonOf.set(d.id, cid);
  }
  return { raw, canonical, canonOf };
}

interface RawValue { defId: string; content: string; rows: Array<Array<{ id: string; content: string }>> }

function parseAttributeValues(valuesXml: string): Map<string, RawValue[]> {
  const out = new Map<string, RawValue[]>();
  let root: X;
  try { root = parser.parse(valuesXml).DiagramAttributeValues; } catch { return out; }
  for (const el of list(root?.ElementAttributeValues)) {
    const vals = list(el.Values?.ExtendedAttributeValue).map((v): RawValue => ({
      defId: v['@_Id'] as string, content: text(v.Content),
      rows: list(v.TableValues?.RowValues).map((r) => list(r.ExtendedAttributeValue).map((c) => ({ id: c['@_Id'] as string, content: text(c.Content) }))),
    }));
    if (vals.length) out.set(el['@_ElementId'] as string, vals);
  }
  return out;
}

/** Converte o valor bruto do Bizagi para o valor tipado da definição canônica. null = vazio/ignorar. */
function toTypedValue(rawDef: RawDef, canon: AttributeDef, v: RawValue): AttrValue | null {
  switch (canon.type) {
    case 'table': {
      const rows = v.rows.map((r) => rawDef.columns.map((c) => htmlToText(r.find((cell) => cell.id === c.id)?.content ?? ''))).filter((r) => r.some(Boolean));
      return rows.length ? rows : null;
    }
    case 'multiselect': { const items = htmlToText(v.content).split(/\n|;/).map((x) => x.trim()).filter(Boolean); return items.length ? items : null; }
    default: { const t = htmlToText(v.content); return t ? t : null; }
  }
}

interface PoolInfo {
  id: string; name: string; processId: string; visible: boolean; box: Bounds; lanes: Array<{ id: string; name: string; box: Bounds }>;
}

/** Importa um Diagram.xml (XPDL 2.2 Bizagi). Exportado para teste e para uso com arquivos XPDL soltos. */
export function importXpdl(xml: string, label = 'diagrama', extra: { defsXml?: string[]; valuesXml?: string } = {}): BizagiImportResult {
  const warnings: string[] = [];
  const attrDefs = parseAttributeDefs(extra.defsXml ?? [], warnings);
  const attrValues = extra.valuesXml ? parseAttributeValues(extra.valuesXml) : new Map<string, RawValue[]>();
  // posição do texto (TextX/TextY/TextWidth/TextHeight, absolutos) por elemento -> vira labelOffset
  const textBoxes = new Map<string, Bounds>();
  const readTextBox = (id: string, g: X) => {
    if (g?.['@_TextX'] === undefined || g?.['@_TextWidth'] === undefined) return;
    textBoxes.set(id, { x: num(g['@_TextX']), y: num(g['@_TextY']), w: Math.max(1, num(g['@_TextWidth'])), h: Math.max(1, num(g['@_TextHeight'])) });
  };
  const pkg: X = parser.parse(xml).Package;
  if (!pkg) throw new Error(`${label}: XML não é XPDL (sem <Package>)`);

  const dataStoreName = new Map<string, string>(list(pkg.DataStores?.DataStore).map((d) => [d['@_Id'], d['@_Name'] ?? '']));
  const processById = new Map<string, X>(list(pkg.WorkflowProcesses?.WorkflowProcess).map((p) => [p['@_Id'], p]));

  const pools: PoolInfo[] = list(pkg.Pools?.Pool).map((p) => {
    const box = gfx(p) ?? { x: 0, y: 0, w: 0, h: 0 };
    const lanes = list(p.Lanes?.Lane).map((l) => {
      const lb = gfx(l) ?? { x: 0, y: 0, w: 0, h: 0 };
      // Lane.y é relativo ao pool; x/w: a lane ocupa a largura do pool menos o cabeçalho
      return { id: l['@_Id'] as string, name: (l['@_Name'] as string) ?? '', box: { x: box.x + (box.w - lb.w), y: box.y + lb.y, w: lb.w, h: lb.h } };
    });
    return { id: p['@_Id'], name: p['@_Name'] ?? '', processId: p['@_Process'], visible: p['@_BoundaryVisible'] !== 'false', box, lanes };
  });

  // dono de cada elemento (atividade/data store/etc.) -> pool
  const poolOfElement = new Map<string, PoolInfo>();
  const activitiesOf = (pool: PoolInfo): X[] => list(processById.get(pool.processId)?.Activities?.Activity);
  for (const pool of pools) {
    const wp = processById.get(pool.processId);
    for (const a of activitiesOf(pool)) poolOfElement.set(a['@_Id'], pool);
    for (const d of list(wp?.DataStoreReferences?.DataStoreReference)) poolOfElement.set(d['@_Id'], pool);
    for (const d of list(wp?.DataObjects?.DataObject)) poolOfElement.set(d['@_Id'], pool);
    for (const a of list(wp?.Artifacts?.Artifact)) poolOfElement.set(a['@_Id'], pool);
  }

  const messageFlows = list(pkg.MessageFlows?.MessageFlow);
  const associations = list(pkg.Associations?.Association);
  const poolById = new Map(pools.map((p) => [p.id, p]));
  const result: ProcessModel[] = [];

  for (const pool of pools) {
    const acts = activitiesOf(pool);
    if (!acts.length) continue; // placeholder "Main Process" ou pool externo (tratado como participante abaixo)
    const wp = processById.get(pool.processId)!;
    const tag = `[${label}/${pool.name}]`;
    const modelId = toNcName(pool.processId);
    const nodes: ProcessNode[] = [];
    const flows: ProcessFlow[] = [];
    const nid = (id: string) => toNcName(id);

    // ---- lanes (por posição)
    const lanes: ProcessLane[] = pool.lanes.map((l) => ({ id: nid(l.id), name: l.name, bounds: l.box }));
    const laneAt = (b: Bounds | undefined): string | undefined => {
      if (!b) return undefined;
      const cy = b.y + b.h / 2;
      const lane = pool.lanes.find((l) => cy >= l.box.y && cy < l.box.y + l.box.h);
      return lane ? nid(lane.id) : undefined;
    };

    // ---- transições (precisamos delas para decidir throw/catch de link)
    const transitions = list(wp.Transitions?.Transition);
    const hasIn = new Set(transitions.map((t) => t['@_To'] as string));
    const hasOut = new Set(transitions.map((t) => t['@_From'] as string));

    // valores de atributos estendidos de um elemento (um valor por definição canônica; vazios ignorados)
    const attributesFor = (origId: string) => {
      const seen = new Set<string>();
      return (attrValues.get(origId) ?? []).flatMap((v) => {
        const rd = attrDefs.raw.get(v.defId);
        const cid = attrDefs.canonOf.get(v.defId);
        const canon = attrDefs.canonical.find((d) => d.id === cid);
        if (!rd || !cid || !canon || seen.has(cid)) return [];
        const tv = toTypedValue(rd, canon, v);
        if (tv === null) return [];
        seen.add(cid);
        return [{ name: canon.name, defId: cid, value: tv }];
      });
    };

    // ---- atividades
    for (const a of acts) {
      const id = nid(a['@_Id']);
      const name = (a['@_Name'] as string) ?? '';
      const bounds = gfx(a);
      // [2026-10-14] Alterado: Documentation/Description do Bizagi são HTML rico -> texto simples (o portal mostrava as tags) — Rafael Brito
      const documentation = htmlToText(text(a.Documentation));
      // [2026-10-14] Alterado: <Description> do Bizagi -> description (vazio no corpus BIIN, mas é campo padrão do Modeler) — Rafael Brito
      const description = htmlToText(text(a.Description));
      readTextBox(id, list(a.NodeGraphicsInfos?.NodeGraphicsInfo)[0]);
      const attributes = attributesFor(a['@_Id']);
      const base = { id, name, laneId: laneAt(bounds), ...(documentation && { documentation }), ...(description && { description }), ...(attributes.length && { attributes }), ...(bounds && { bounds }) };
      const ev = a.Event;
      if (ev) {
        const [evKind, evBody] = (['StartEvent', 'EndEvent', 'IntermediateEvent'] as const).map((k) => [k, ev[k]] as const).find(([, v]) => v) ?? [];
        const trigger = String(evBody?.['@_Trigger'] ?? evBody?.['@_Result'] ?? 'None');
        const variant = ({ None: 'none', Message: 'message', Timer: 'timer', Error: 'error', Conditional: 'conditional', Link: 'link', Terminate: 'terminate' } as Record<string, string>)[trigger];
        if (!variant) warnings.push(`${tag} evento '${name || id}': gatilho '${trigger}' não suportado; tratado como evento sem definição`);
        const v = variant ?? 'none';
        if (evKind === 'StartEvent') nodes.push({ ...base, kind: 'start', variant: v } as ProcessNode);
        else if (evKind === 'EndEvent') nodes.push({ ...base, kind: 'end', variant: v } as ProcessNode);
        else if (evBody?.['@_IsAttached'] === 'true') {
          nodes.push({ ...base, kind: 'boundary', variant: v, attachedToId: nid(evBody['@_Target']), cancelActivity: true } as ProcessNode);
        } else {
          const isThrow = v === 'link' && !hasOut.has(a['@_Id']) && hasIn.has(a['@_Id']);
          nodes.push({ ...base, kind: 'intermediate', variant: v, throw: isThrow } as ProcessNode);
        }
      } else if (a.Route !== undefined) {
        const gt = String(a.Route?.['@_GatewayType'] ?? 'Exclusive');
        const variant = ({ Exclusive: 'exclusive', Inclusive: 'inclusive', Parallel: 'parallel', EventBased: 'eventBased' } as Record<string, string>)[gt];
        if (!variant) warnings.push(`${tag} gateway '${name || id}': tipo '${gt}' não suportado; tratado como exclusivo`);
        nodes.push({ ...base, kind: 'gateway', variant: variant ?? 'exclusive' } as ProcessNode);
      } else if (a.BlockActivity !== undefined) {
        warnings.push(`${tag} '${name}': subprocesso expandido (BlockActivity) importado COLAPSADO; conteúdo interno não importado`);
        nodes.push({ ...base, kind: 'subprocess' } as ProcessNode);
      } else if (a.Implementation?.SubFlow !== undefined) {
        const called = a.Implementation.SubFlow['@_Id'] as string | undefined;
        if (!called) warnings.push(`${tag} '${name}': SubFlow sem processo chamado; importado como subprocesso simples`);
        nodes.push({ ...base, kind: 'subprocess', ...(called && { calledProcessId: nid(called) }) } as ProcessNode);
      } else {
        const tt = String(a.Implementation?.Task?.['@_TaskType'] ?? 'None');
        const variant = ({ User: 'user', Service: 'service', Manual: 'manual', Script: 'script' } as Record<string, string>)[tt] ?? 'generic';
        nodes.push({ ...base, kind: 'task', variant } as ProcessNode);
      }
    }

    // ---- data stores (repositórios de dados), objetos de dados, anotações
    for (const d of list(wp.DataStoreReferences?.DataStoreReference)) {
      const bounds = gfx(d);
      readTextBox(nid(d['@_Id']), list(d.NodeGraphicsInfos?.NodeGraphicsInfo)[0]);
      nodes.push({ id: nid(d['@_Id']), kind: 'dataStore', name: dataStoreName.get(d['@_DataStoreRef']) ?? '', ...(bounds && { bounds }) } as ProcessNode);
    }
    for (const d of list(wp.DataObjects?.DataObject)) {
      const bounds = gfx(d);
      readTextBox(nid(d['@_Id']), list(d.NodeGraphicsInfos?.NodeGraphicsInfo)[0]);
      nodes.push({ id: nid(d['@_Id']), kind: 'dataObject', name: d['@_Name'] ?? '', ...(bounds && { bounds }) } as ProcessNode);
    }
    for (const ar of list(wp.Artifacts?.Artifact)) {
      const bounds = gfx(ar);
      if (ar['@_ArtifactType'] === 'Annotation') {
        nodes.push({ id: nid(ar['@_Id']), kind: 'annotation', name: ar['@_TextAnnotation'] ?? '', ...(bounds && { bounds }) } as ProcessNode);
      } else {
        warnings.push(`${tag} artefato '${ar['@_ArtifactType']}' (${ar['@_BizAgiArtifactType'] ?? '-'}) não suportado — ignorado`);
      }
    }
    const known = new Set(nodes.map((n) => n.id));

    // ---- fluxos de sequência
    for (const t of transitions) {
      const s = nid(t['@_From']), tg = nid(t['@_To']);
      if (!known.has(s) || !known.has(tg)) { warnings.push(`${tag} transição ${t['@_Id']} descartada (origem/destino ausente)`); continue; }
      const wpts = waypoints(t);
      readTextBox(nid(t['@_Id']), list(t.ConnectorGraphicsInfos?.ConnectorGraphicsInfo)[0]);
      const otherwise = String(t.Condition?.['@_Type'] ?? '').toUpperCase() === 'OTHERWISE';
      const condText = text(t.Condition);
      flows.push({
        id: nid(t['@_Id']), kind: 'sequence', sourceId: s, targetId: tg, isDefault: otherwise,
        ...(t['@_Name'] && { name: t['@_Name'] as string }), ...(wpts && { waypoints: wpts }), ...(condText && { condition: condText }),
      });
    }

    // ---- associações (globais ao diagrama) cujo par pertence a este pool
    for (const a of associations) {
      const s = nid(a['@_Source']), tg = nid(a['@_Target']);
      if (poolOfElement.get(a['@_Source']) !== pool && poolOfElement.get(a['@_Target']) !== pool) continue;
      if (!known.has(s) || !known.has(tg)) continue; // pontas dentro de ActivitySets (não importados)
      const wpts = waypoints(a);
      flows.push({ id: nid(a['@_Id']), kind: 'association', sourceId: s, targetId: tg, isDefault: false, ...(wpts && { waypoints: wpts }) });
    }

    // ---- message flows + participantes externos
    const participants = new Map<string, { id: string; name: string; bounds: Bounds }>();
    const endpoint = (raw: string): string | undefined => {
      const p = poolById.get(raw);
      if (p) {
        if (p === pool) return modelId;
        participants.set(nid(p.id), { id: nid(p.id), name: p.name, bounds: p.box });
        return nid(p.id);
      }
      const owner = poolOfElement.get(raw);
      if (owner === pool) return nid(raw);
      return undefined;
    };
    for (const mf of messageFlows) {
      // só entra se tocar este pool (o pool em si ou uma atividade dele)
      const touches = [mf['@_Source'], mf['@_Target']].some((r) => poolById.get(r) === pool || poolOfElement.get(r) === pool);
      if (!touches) continue;
      const s = endpoint(mf['@_Source']), tg = endpoint(mf['@_Target']);
      if (!s || !tg) { warnings.push(`${tag} message flow ${mf['@_Id']} descartado (ponta fora deste processo)`); continue; }
      if (s !== modelId && tg !== modelId && !known.has(s) && !known.has(tg)) continue;
      const wpts = waypoints(mf);
      readTextBox(nid(mf['@_Id']), list(mf.ConnectorGraphicsInfos?.ConnectorGraphicsInfo)[0]);
      flows.push({ id: nid(mf['@_Id']), kind: 'message', sourceId: s, targetId: tg, isDefault: false, ...(mf['@_Name'] && { name: mf['@_Name'] as string }), ...(wpts && { waypoints: wpts }) });
    }

    // Posição do texto no Bizagi (caixa absoluta, texto centralizado) -> deslocamento do rótulo em relação à posição padrão do Process Studio.
    // Alinha pelo CENTRO da caixa do Bizagi, pois larguras/alturas de texto diferem entre as ferramentas.
    const centered = (home: Bounds, tb: Bounds) => offsetFrom(home, { x: tb.x + tb.w / 2 - home.w / 2, y: tb.y + tb.h / 2 - home.h / 2 });
    const nodesOut = nodes.map((n) => {
      const tb = textBoxes.get(n.id), lay = tb ? nodeLabel(n) : null;
      const off = tb && lay ? centered(lay.home, tb) : undefined;
      return off ? { ...n, labelOffset: off } : n;
    });
    const flowsOut = flows.map((f) => {
      const tb = textBoxes.get(f.id), lay = tb ? flowLabel(f) : null;
      const off = tb && lay ? centered(lay.home, tb) : undefined;
      return off ? { ...f, labelOffset: off } : f;
    });
    result.push(parseModel({
      id: modelId, name: pool.name, lanes, participants: [...participants.values()], nodes: nodesOut, flows: flowsOut, pool: pool.box,
      attributeDefs: attrDefs.canonical,
    }));
  }
  if (!result.length) warnings.push(`${label}: nenhum pool com atividades encontrado`);
  return { processes: result, warnings };
}
