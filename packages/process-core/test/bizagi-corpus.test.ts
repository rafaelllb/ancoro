/**
 * Corpus real (Bizagi .bpm do Rafael — pasta BIIN Process). NÃO versionado: contém material de projeto.
 * [2026-10-14] Criado: round-trip sobre diagramas reais (critério de pronto da Fase 1) — Rafael Brito
 * Caminho via env BIIN_BPM; se o arquivo não existir (CI, outra máquina) o bloco é pulado.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalize, fromBpmnXml, importBizagi, layoutModel, toBpmnXml, validateModel, type ProcessModel } from '../src/index.js';

const BPM = process.env.BIIN_BPM ??
  'C:/Users/rafae/OneDrive/Documentos/Profissional-Rafael/SAP/ISU/BIIN Process/Processo geral Billing - EN.bpm';

describe.skipIf(!existsSync(BPM))('corpus Bizagi (.bpm real)', () => {
  const { processes, warnings } = importBizagi(new Uint8Array(readFileSync(BPM)));

  it('importa os 7 diagramas como processos com conteúdo', () => {
    expect(processes.length).toBeGreaterThanOrEqual(6);
    for (const p of processes) expect(p.nodes.length, p.name).toBeGreaterThan(2);
    // warnings do import são conhecidos/esperados: só BlockActivity e artefatos decorativos
    const unexpected = warnings.filter((w) => !/BlockActivity|artefato|SubFlow sem processo/.test(w));
    expect(unexpected).toEqual([]);
  });

  // Integridade estrutural (bug do importador se falhar) != qualidade de modelagem (rascunho do usuário, ex.: NO_END).
  it('nenhum processo importado tem erro de INTEGRIDADE estrutural', () => {
    const integrity = ['DUPLICATE_ID', 'FLOW_DANGLING', 'LANE_UNKNOWN', 'BOUNDARY_NO_HOST', 'BOUNDARY_BAD_HOST'];
    for (const p of processes) {
      const errors = validateModel(p).filter((i) => integrity.includes(i.code));
      expect(errors, p.name).toEqual([]);
    }
  });

  it.each(processes.map((p) => [p.name, p] as const))('round-trip BPMN XML sem perda: %s', async (_name, p) => {
    const xml = await toBpmnXml(p);
    const back = await fromBpmnXml(xml);
    expect(back.warnings).toEqual([]);
    expect(canonicalize(back.model)).toEqual(canonicalize(p));
    expect(await toBpmnXml(back.model)).toBe(xml); // idempotente
  });

  // [2026-10-14] Criado: stress do auto-layout em diagramas reais (sem geometria) — Rafael Brito
  // Limite conhecido (README/TODO do layout): satélites podem colidir com nós empilhados; toleramos poucos casos.
  describe('auto-layout em diagramas reais', () => {
    const strip = (m: ProcessModel): ProcessModel => ({
      ...m, pool: undefined,
      participants: m.participants.map(({ bounds: _b, ...x }) => x),
      lanes: m.lanes.map(({ bounds: _b, ...l }) => l),
      nodes: m.nodes.map(({ bounds: _b, ...n }) => n),
      flows: m.flows.map(({ waypoints: _w, ...f }) => f),
    });
    const overlap = (a: NonNullable<ProcessModel['nodes'][number]['bounds']>, b: typeof a) =>
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

    it.each(processes.map((p) => [p.name, p] as const))('%s: layout completo, round-trip e poucas sobreposições', async (_n, p) => {
      const laid = layoutModel(strip(p));
      expect(laid.nodes.every((n) => n.bounds)).toBe(true);
      const bs = laid.nodes.filter((n) => n.kind !== 'boundary').map((n) => n.bounds!);
      const clashes = bs.flatMap((a, i) => bs.slice(i + 1).filter((b) => overlap(a, b)));
      expect(clashes.length).toBeLessThanOrEqual(3);
      const back = await fromBpmnXml(await toBpmnXml(laid));
      expect(canonicalize(back.model)).toEqual(canonicalize(laid));
    });
  });
});
