/**
 * Colour palettes for screen and for print.
 *
 * Print mode = white page + black text, but charts use LIGHT COLOURS (blue, yellow, green, pink...)
 * so they look good on a colour Xerox / colour printer. Dash patterns and marker shapes are kept
 * as an extra cue. `COLORS` is swapped by applyPalette(); components read COLORS.x while rendering.
 */
const SCREEN = {
  fedavg: '#3b82f6', median: '#22d3ee', centralized: '#a78bfa', local_ensemble: '#f59e0b',
  grid: '#1e2f5c', axis: '#8aa0c8', danger: '#f87171', ok: '#34d399',
};
const PRINT = {
  fedavg: '#2563eb', median: '#f59e0b', centralized: '#16a34a', local_ensemble: '#db2777',
  grid: '#c4c4c4', axis: '#222222', danger: '#dc2626', ok: '#16a34a',
};
export const COLORS = { ...SCREEN };
export function applyPalette(print) { Object.assign(COLORS, print ? PRINT : SCREEN); }

// "role" = visual identity of a series (s1..s4); model keys map onto roles.
export const ROLE = { fedavg: 's1', median: 's2', centralized: 's3', local_ensemble: 's4' };
// Print mode keeps dash patterns + marker shapes (helps if a page is ever copied in grayscale)
// but every series now has its own colour for colour photocopies / colour printers.
const LINE_COLOR = { s1: '#2563eb', s2: '#f59e0b', s3: '#16a34a', s4: '#db2777' };
const BAR_FILL = { s1: '#93c5fd', s2: '#fde047', s3: '#86efac', s4: '#f9a8d4' };   // light fills
const BAR_EDGE = { s1: '#1d4ed8', s2: '#b45309', s3: '#15803d', s4: '#be185d' };   // darker outlines
export const PRINT_CLASS_FILL = ['#93c5fd', '#fde047', '#86efac', '#f9a8d4', '#fdba74', '#c4b5fd', '#67e8f9', '#fca5a5'];
export const PRINT_CLASS_EDGE = ['#1d4ed8', '#a16207', '#15803d', '#be185d', '#c2410c', '#6d28d9', '#0e7490', '#b91c1c'];
const DASH = { s1: undefined, s2: '8 4', s3: '2 4', s4: '10 3 2 3' };

function Marker({ cx, cy, role }) {
  if (cx == null || cy == null) return null;
  const f = BAR_FILL[role], s = LINE_COLOR[role];
  if (role === 's1') return <circle cx={cx} cy={cy} r={4.5} fill={s} stroke={s} />;
  if (role === 's2') return <rect x={cx - 4} y={cy - 4} width={8} height={8} fill={f} stroke={s} strokeWidth={1.8} />;
  if (role === 's3') return <polygon points={`${cx},${cy - 5} ${cx - 5},${cy + 4} ${cx + 5},${cy + 4}`} fill={s} stroke={s} />;
  return <polygon points={`${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`} fill={f} stroke={s} strokeWidth={1.8} />;
}

/** Props for a <Line>: coloured on screen, gray + dash pattern + marker in print mode. */
export function lineProps(role, print, color, screenDot = false) {
  if (!print) return { stroke: color, strokeWidth: 2.5, dot: screenDot, isAnimationActive: false };
  return {
    stroke: LINE_COLOR[role], strokeWidth: 2.5, strokeDasharray: DASH[role], isAnimationActive: false,
    dot: (p) => <Marker key={p.key ?? p.index} cx={p.cx} cy={p.cy} role={role} />,
  };
}

/** Props for a <Bar>: coloured on screen, hatched / dotted fill with an outline in print mode. */
export function barProps(role, print, color) {
  if (!print) return { fill: color, isAnimationActive: false };
  return { fill: BAR_FILL[role], stroke: BAR_EDGE[role], strokeWidth: 1.2, isAnimationActive: false };
}
export function classBarProps(i, print, color) {
  if (!print) return { fill: color, isAnimationActive: false };
  return { fill: PRINT_CLASS_FILL[i % 8], stroke: PRINT_CLASS_EDGE[i % 8], strokeWidth: 1, isAnimationActive: false };
}

/** Kept for compatibility with App.jsx - print mode now uses solid light colours, so no patterns are needed. */
export function PatternDefs() { return null; }
