/**
 * Palette de la heatmap : rouge (0) → jaune (50) → vert (100).
 * Seul endroit de l'application où la couleur est utilisée.
 */
export const HEAT_STOPS: [number, string][] = [
  [0, "#d73027"],
  [50, "#fee08b"],
  [100, "#1a9850"],
];
export const NEUTRAL_FILL = "#d4d4d4";

/** Expression MapLibre pour une valeur 0-100 (interpolation RVB, comme scoreColor). */
export const heatExpression = (input: unknown) => [
  "interpolate",
  ["linear"],
  input,
  ...HEAT_STOPS.flat(),
];

const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Même couleur que sur la carte, pour les pastilles du Top 5 et de la légende. */
export function scoreColor(score: number): string {
  const s = Math.min(100, Math.max(0, score));
  const i = s <= HEAT_STOPS[1][0] ? 0 : 1;
  const [s0, c0] = HEAT_STOPS[i];
  const [s1, c1] = HEAT_STOPS[i + 1];
  const t = (s - s0) / (s1 - s0);
  const a = hexToRgb(c0);
  const b = hexToRgb(c1);
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * t)).join(", ")})`;
}

export const HEAT_GRADIENT_CSS = `linear-gradient(to right, ${HEAT_STOPS.map(([s, c]) => `${c} ${s}%`).join(", ")})`;
