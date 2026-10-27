/**
 * Carrega o "processkit" (mesmo bundle usado pelo backend do Ancoro): valida, importa, exporta e publica com o
 * MESMO código do editor. Gerado por `npm run build:kit` (packages/process-publisher/build-kit.mjs --out ...).
 *
 * [2026-10-16] Criado: Fase 6 — o standalone reaproveita o núcleo sem importar nada do Ancoro — Rafael Brito
 */
import { createRequire } from 'node:module';

export interface KitIssue { code: string; message: string; elementId?: string }
export interface KitModel {
  id: string; name: string;
  nodes: Array<{ id: string; name: string; requirementRefs: string[]; calledProcessId?: string }>;
  [k: string]: unknown;
}
export interface ProcessKit {
  KIT_VERSION: number;
  normalizeModel(input: unknown): KitModel;
  integrityIssues(model: KitModel): KitIssue[];
  qualityIssues(model: KitModel): Array<KitIssue & { severity: string }>;
  requirementRefsOf(model: KitModel): Array<{ elementId: string; elementName: string; ref: string }>;
  importFile(kind: 'bpm' | 'bpmn', bytes: Uint8Array): Promise<{ models: KitModel[]; warnings: string[] }>;
  newProcessModel(existingKeys: string[], name: string): KitModel;
  exportBpmn(model: KitModel): Promise<string>;
  demoProcess(reqIds: string[], id?: string, name?: string): KitModel;
  publishPortal(opts: Record<string, unknown>): Promise<{ zip: Uint8Array; report: unknown; versionsFile: string; manifest: unknown }>;
}

export function loadKit(path: string): ProcessKit {
  try {
    return createRequire(import.meta.url)(path) as ProcessKit;
  } catch (e) {
    throw new Error(`processkit não encontrado em ${path}. Rode \`npm run build:kit\` (causa: ${e instanceof Error ? e.message : String(e)})`);
  }
}
