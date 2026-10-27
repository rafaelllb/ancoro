/**
 * "processkit": a fachada que o BACKEND do Ancoro usa (compilada para CommonJS em backend/vendor/processkit.cjs por build-kit.mjs).
 *
 * [2026-10-15] Criado: Fase 4 — um único código (o do editor/publisher) valida, importa, exporta e publica também no servidor — Rafael Brito
 * Por que um bundle e não `import`: o backend é CommonJS com rootDir ./src; os pacotes são ESM TypeScript. Em vez de portar schemas (e correr
 * o risco de divergirem do editor), o servidor carrega ESTE arquivo gerado. Regra: nada aqui importa algo do Ancoro (ver README §3).
 *
 * Contrato estável (versionado em KIT_VERSION) — o backend só conhece estas funções.
 */
import {
  billingSample, fromBpmnXml, importBizagi, newProcess, parseModel, toBpmnXml, validateModel, type ProcessModel,
} from '@ancoro/process-core';
import { publish, zipFiles, type PublishInput } from './publish';
import type { VersionsFile } from './versions';

declare const __VIEWER_JS__: string;
declare const __VIEWER_CSS__: string;

export const KIT_VERSION = 1;

/** Erros que tornam o modelo inconsistente (não "qualidade de modelagem"): o servidor recusa salvar com eles. */
const INTEGRITY = new Set(['DUPLICATE_ID', 'FLOW_DANGLING', 'LANE_UNKNOWN', 'BOUNDARY_NO_HOST', 'BOUNDARY_BAD_HOST', 'ATTR_DEF_MISSING']);

/** Valida e normaliza (defaults do schema). Lança (ZodError) se a forma estiver errada. */
export function normalizeModel(input: unknown): ProcessModel {
  return parseModel(input);
}

export function integrityIssues(model: ProcessModel): Array<{ code: string; message: string; elementId?: string }> {
  return validateModel(model).filter((i) => INTEGRITY.has(i.code)).map((i) => ({ code: i.code, message: i.message, ...(i.elementId && { elementId: i.elementId }) }));
}

export function qualityIssues(model: ProcessModel): Array<{ severity: string; code: string; message: string; elementId?: string }> {
  return validateModel(model).map((i) => ({ severity: i.severity, code: i.code, message: i.message, ...(i.elementId && { elementId: i.elementId }) }));
}

export interface RequirementRef { elementId: string; elementName: string; ref: string }

/** Todos os vínculos elemento -> requisito (por reqId legível, ex.: "REQ-014") do modelo. */
export function requirementRefsOf(model: ProcessModel): RequirementRef[] {
  const out: RequirementRef[] = [];
  for (const n of model.nodes) for (const ref of n.requirementRefs) out.push({ elementId: n.id, elementName: n.name || n.id, ref });
  return out;
}

export async function importFile(kind: 'bpm' | 'bpmn', bytes: Uint8Array): Promise<{ models: ProcessModel[]; warnings: string[] }> {
  if (kind === 'bpm') {
    const r = importBizagi(bytes);
    return { models: r.processes, warnings: r.warnings };
  }
  const r = await fromBpmnXml(new TextDecoder('utf-8').decode(bytes));
  return { models: [r.model], warnings: r.warnings };
}

/** Processo novo mínimo (só o evento de início), com id único entre `existingKeys`. */
export const newProcessModel = (existingKeys: string[], name: string): ProcessModel => newProcess(existingKeys, name);

export const exportBpmn = (model: ProcessModel): Promise<string> => toBpmnXml(model);

/** Processo de demonstração (o do design spike) com os vínculos remapeados para requisitos REAIS do projeto. */
export function demoProcess(reqIds: string[], id = 'Process_Demo', name = 'Ciclo de faturamento de consumo'): ProcessModel {
  const base = billingSample();
  const used = [...new Set(base.nodes.flatMap((n) => n.requirementRefs))];
  const map = new Map(used.map((r, i) => [r, reqIds.length ? reqIds[i % reqIds.length]! : r]));
  return parseModel({ ...base, id, name, nodes: base.nodes.map((n) => ({ ...n, requirementRefs: [...new Set(n.requirementRefs.map((r) => map.get(r) ?? r))] })) });
}

export interface PublishPortalOptions extends Omit<PublishInput, 'models' | 'viewer'> { models: ProcessModel[] }

/** Publica o portal (mesmo publisher do CLI) com o viewer embutido no bundle. Devolve o ZIP + relatório + novo versions.json. */
export async function publishPortal(opts: PublishPortalOptions): Promise<{ zip: Uint8Array; report: unknown; versionsFile: string; manifest: unknown }> {
  const res = await publish({ ...opts, viewer: { js: __VIEWER_JS__, css: __VIEWER_CSS__ } });
  const v = res.files.get('versions.json');
  return { zip: zipFiles(res.files), report: res.report, versionsFile: typeof v === 'string' ? v : '', manifest: res.manifest };
}

export type { ProcessModel, VersionsFile };
