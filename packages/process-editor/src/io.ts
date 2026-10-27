/**
 * Abertura de arquivos: .bpm do Bizagi (ZIP) ou BPMN 2.0 XML.
 * [2026-10-14] Criado: Fase 2 / etapa 1 — Rafael Brito
 * Detecta pelo conteúdo (magic "PK"), não pela extensão: o usuário pode renomear arquivos.
 */
import { fromBpmnXml, importBizagi, type ProcessModel } from '@ancoro/process-core';

export interface OpenResult { models: ProcessModel[]; warnings: string[] }

export async function openFile(file: File): Promise<OpenResult> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // "PK"
  if (isZip) {
    const { processes, warnings } = importBizagi(buf);
    return { models: processes, warnings };
  }
  const { model, warnings } = await fromBpmnXml(new TextDecoder('utf-8').decode(buf));
  return { models: [model], warnings };
}
