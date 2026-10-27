// [2026-10-14] Criado: bpmn-moddle@10 só exporta tipos em 'bpmn-moddle/types' (inutilizáveis p/ API genérica); declaração mínima (superfície realmente usada) — Rafael Brito
declare module 'bpmn-moddle' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ModdleElement = { $type: string; [key: string]: any };
  export class BpmnModdle {
    constructor(packages?: Record<string, unknown>);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(type: string, attrs?: Record<string, any>): ModdleElement;
    toXML(element: ModdleElement, options?: { format?: boolean }): Promise<{ xml: string }>;
    fromXML(xml: string): Promise<{ rootElement: ModdleElement; warnings: Array<{ message: string }> }>;
  }
}
