/**
 * Helper mínimo para montar DOM com SEGURANÇA: texto sempre via textContent (nunca innerHTML) e href restrito a http(s)/mailto/âncora.
 * [2026-10-14] Criado: Fase 3 — evita o problema do Bizagi `preserveHTML: true` (HTML cru das propriedades) — Rafael Brito
 */
export type Child = Node | string | number | null | undefined | false;

/** Só links "seguros": http(s), mailto e âncoras internas. Qualquer outra coisa (javascript:, data:, file:) vira null. */
export function safeHref(url: string): string | null {
  const u = url.trim();
  return /^(https?:\/\/|mailto:|#)/i.test(u) ? u : null;
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Record<string, unknown> | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'href') {
      const safe = safeHref(String(v));
      if (safe) { el.setAttribute('href', safe); if (/^https?:/i.test(safe)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); } }
    } else if (k === 'src') {
      const s = String(v);
      // data: só raster; http(s); e arquivos do PRÓPRIO portal em assets/ (logo da marca). <img> não executa script, mesmo com svg.
      if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(s) || /^https?:\/\//i.test(s) || /^assets\/[\w.-]+\.(webp|png|jpe?g|gif|svg)$/i.test(s)) el.setAttribute('src', s);
    } else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export const clear = (el: Node): void => { while (el.firstChild) el.removeChild(el.firstChild); };

/** "…/Apps('F2186')/…" -> "F2186"; senão o host (ou a URL truncada). Mostra algo legível no lugar de uma URL de 300 caracteres. */
export function friendlyUrl(url: string): string {
  const m = /Apps\('([^']+)'\)/.exec(url);
  if (m) return m[1]!;
  try { return new URL(url).host || url; } catch { return url.length > 28 ? `${url.slice(0, 27)}…` : url; }
}
