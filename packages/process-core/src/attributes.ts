/**
 * Atributos estendidos tipados (estilo Bizagi "Extended Attributes").
 *
 * [2026-10-14] Criado: tipos, valores vazios, coerção e validação — Rafael Brito
 * Modelo: o processo DEFINE atributos (`attributeDefs`: nome, descrição, tipo, opções/colunas, a quais elementos se aplica) e cada
 * elemento guarda VALORES por `defId`. Valor = texto | lista de textos (múltipla seleção) | linhas de células (tabela).
 *
 * TODO [ESTIGMERGIA]: definições por processo, não por repositório
 * - No Bizagi as definições são do projeto inteiro. Aqui cada processo carrega as suas (arquivo BPMN autocontido).
 *   Fase 3/4: promover para o repositório (mesmas definições em todos os processos) e sincronizar ao importar.
 * TODO [ESTIGMERGIA]: texto rico
 * - Bizagi guarda texto longo como HTML. Importamos como texto simples (negrito/cores se perdem). Avaliar `richtext` no futuro.
 * TODO [ESTIGMERGIA]: arquivos/imagens embutidos
 * - `image`/`file` guardam data-URL dentro do próprio .bpmn (com limite no editor). Com o asset store (Fase 3/4) passar a referência.
 */
import type { AttributeDef, AttrValue } from './model.js';

export const ATTR_TYPES = ['textarea', 'text', 'number', 'date', 'image', 'select', 'radio', 'multiselect', 'file', 'fileLink', 'url', 'table'] as const;
export type AttrType = (typeof ATTR_TYPES)[number];
export const COLUMN_TYPES = ['text', 'number', 'date', 'url'] as const;
export const OPTION_TYPES: ReadonlySet<string> = new Set(['select', 'radio', 'multiselect']);

export const emptyAttrValue = (def: Pick<AttributeDef, 'type'>): AttrValue => (def.type === 'multiselect' || def.type === 'table' ? [] : '');

export const isEmptyAttrValue = (v: AttrValue): boolean => (typeof v === 'string' ? v.trim() === '' : v.length === 0);

/** Normaliza o valor ao formato do tipo (ex.: '' vindo do XML para multiselect/table vira []). */
export function coerceAttrValue(def: Pick<AttributeDef, 'type'>, v: AttrValue): AttrValue {
  if (def.type === 'multiselect') {
    if (typeof v === 'string') return v ? [v] : [];
    return (v as unknown[]).every((x) => typeof x === 'string') ? (v as string[]) : [];
  }
  if (def.type === 'table') return Array.isArray(v) && (v as unknown[]).every(Array.isArray) ? (v as string[][]) : [];
  if (Array.isArray(v)) return (v as unknown[]).map((x) => (Array.isArray(x) ? x.join(' ') : String(x))).join('\n');
  return v;
}

/** Motivo (texto curto) se o valor não é válido para a definição; null se ok. Estrutural — vira aviso na validação, não impede salvar. */
export function attrValueProblem(def: AttributeDef, v: AttrValue): string | null {
  switch (def.type) {
    case 'number': return typeof v === 'string' && v !== '' && !Number.isFinite(Number(v)) ? 'não é um número' : null;
    case 'date': return typeof v === 'string' && v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v) ? 'data deve ser AAAA-MM-DD' : null;
    case 'select':
    case 'radio': return typeof v === 'string' && v !== '' && !def.options.includes(v) ? `valor fora das opções (${def.options.join(', ')})` : null;
    case 'multiselect': return Array.isArray(v) && (v as unknown[]).some((x) => typeof x !== 'string' || !def.options.includes(x)) ? 'seleção fora das opções' : null;
    case 'table':
      return Array.isArray(v) && (v as unknown[]).some((r) => !Array.isArray(r) || r.length !== def.columns.length) ? 'linha com número de células diferente das colunas' : null;
    default: return typeof v === 'string' ? null : 'valor deveria ser texto';
  }
}
