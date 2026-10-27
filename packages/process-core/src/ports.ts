/**
 * Ports (arquitetura hexagonal) — única superfície pela qual o núcleo conversa com o mundo externo.
 *
 * [2026-10-14] Criado: contratos para os adaptadores Ancoro (Fase 4) e standalone (Fase 6) — Rafael Brito
 * Regra: o núcleo NUNCA importa nada do Ancoro (Prisma, JWT, Requirement). Tudo entra por aqui.
 *
 * [2026-10-16] Alterado: os dois adaptadores existem (Ancoro: backend/src/routes/processes.ts; standalone: apps/standalone/src/app.ts)
 * mas NENHUM implementa estas interfaces literalmente — ambos falam o mesmo contrato HTTP, que precisa de concorrência otimista
 * (rev/baseRev -> 409), papéis e cobertura, coisas que as portas abaixo não expressam.
 *
 * TODO [ESTIGMERGIA]: alinhar as portas ao contrato real
 * - Por que pendente: só há 2 adaptadores e ambos HTTP; extrair a interface agora seria especulação.
 * - Próximo passo: ao surgir um 3º adaptador (ou um cliente não-HTTP), extrair `ProcessRepository` com save(baseRev) -> conflito,
 *   versões e listagem, e fazer os dois adaptadores atuais a implementarem.
 */
import type { ProcessModel } from './model.js';

export interface ProcessVersionMeta {
  version: number;
  createdAt: string; // ISO-8601
  author?: string;
  label?: string;
}

/** Persistência versionada de processos (cada save = nova versão imutável, base do diff entre publicações). */
export interface PersistencePort {
  save(model: ProcessModel, meta: { author?: string; label?: string }): Promise<ProcessVersionMeta>;
  load(processId: string, version?: number): Promise<ProcessModel | null>;
  listVersions(processId: string): Promise<ProcessVersionMeta[]>;
}

export type Capability = 'process:read' | 'process:edit' | 'process:publish';

/** Autorização. No Ancoro mapeia para roles/projeto (permissions.ts); no standalone, auth própria/OIDC. */
export interface AuthPort {
  can(actorId: string, capability: Capability, processId: string): Promise<boolean>;
}

export interface RequirementRef {
  ref: string; // ex.: 'REQ-014' — mesmo valor guardado em ProcessNode.requirementRefs
  title: string;
}

/** Vínculo elemento<->requisito. No standalone, a implementação pode ser vazia (lista sempre []). */
export interface RequirementsPort {
  resolve(refs: string[]): Promise<RequirementRef[]>;
}
