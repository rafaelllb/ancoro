/**
 * Utilitário de cores para geração de paleta dinâmica de nós do grafo.
 *
 * Converte uma cor hex base (configurada por módulo do projeto) em
 * variações claras/escuras para fill, stroke, text e badge.
 *
 * @author Rafael Brito
 */

export interface NodeColors {
  fill: string    // fundo claro do nó
  stroke: string  // borda (cor original do módulo)
  text: string    // texto escuro
  badge: string   // tom intermediário para badges
}

// Paleta fallback para módulos sem cor configurada (8 cores distintas)
const FALLBACK_COLORS = [
  '#378ADD', '#1D9E75', '#7F77DD', '#D85A30',
  '#E5A100', '#C14E8A', '#2EAAAA', '#8B6914',
]

/**
 * Converte hex (#RRGGBB ou #RGB) para HSL [h, s, l] (h: 0-360, s/l: 0-100)
 */
function hexToHSL(hex: string): [number, number, number] {
  // Normaliza hex para 6 dígitos
  let h = hex.replace('#', '')
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }

  const r = parseInt(h.substring(0, 2), 16) / 255
  const g = parseInt(h.substring(2, 4), 16) / 255
  const b = parseInt(h.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) {
    return [0, 0, Math.round(l * 100)]
  }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let hue = 0
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) hue = ((b - r) / d + 2) / 6
  else hue = ((r - g) / d + 4) / 6

  return [Math.round(hue * 360), Math.round(s * 100), Math.round(l * 100)]
}

/**
 * Converte HSL para hex
 */
function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100
  const ln = l / 100

  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = ln - c / 2

  let r = 0, g = 0, b = 0
  if (h < 60)      { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else              { r = c; g = 0; b = x }

  const toHex = (v: number) => {
    const hex = Math.round((v + m) * 255).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

/**
 * Gera paleta completa de cores para um nó a partir de uma cor base hex.
 *
 * - fill: versão muito clara (para fundo do nó)
 * - stroke: cor original (para borda)
 * - text: versão escura (para texto legível)
 * - badge: versão intermediária (para badges e portas)
 */
export function generateNodeColors(baseHex: string): NodeColors {
  const [h, s, l] = hexToHSL(baseHex)

  return {
    fill:   hslToHex(h, Math.min(s, 60), Math.min(95, Math.max(l + 35, 90))),
    stroke: baseHex,
    text:   hslToHex(h, s, Math.max(15, l - 30)),
    badge:  hslToHex(h, Math.min(s, 50), Math.min(80, l + 15)),
  }
}

/**
 * Retorna cor fallback determinística para um módulo sem cor configurada.
 * Mesmo módulo sempre recebe mesma cor (baseado no índice da lista ordenada).
 */
export function getFallbackColor(index: number): string {
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}
