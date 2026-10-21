import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Vitest hands CSS imports back empty (even `?raw`), so read the file itself.
const themeCss = readFileSync('src/styles/theme.css', 'utf8');

// Light + dark contrast review (PLAN F.8): every text token on the surfaces it
// is used on must reach WCAG AA (4.5:1). Translucent surfaces are composited
// over the page background, as the app paints them.

type Rgba = [number, number, number, number];

function block(selector: string): Record<string, string> {
  const start = themeCss.indexOf(selector);
  const body = themeCss.slice(themeCss.indexOf('{', start) + 1, themeCss.indexOf('\n}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  );
}

const LIGHT = block(":root,\n[data-theme='light']");
const DARK = { ...LIGHT, ...block("[data-theme='dark'] {") };

function resolve(vars: Record<string, string>, name: string): string {
  let v = vars[name];
  for (let i = 0; v?.startsWith('var(') && i < 10; i++) v = vars[v.slice(6, -1)];
  if (!v) throw new Error(`unresolved --${name}`);
  return v;
}

function parse(c: string): Rgba {
  if (c.startsWith('#')) {
    const h = c.slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba;
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`not a color: ${c}`);
  const [r, g, b, a = '1'] = m[1].split(',').map((s) => s.trim());
  return [Number(r), Number(g), Number(b), Number(a)];
}

const over = ([r, g, b, a]: Rgba, [R, G, B]: Rgba): Rgba => [
  r * a + R * (1 - a),
  g * a + G * (1 - a),
  b * a + B * (1 - a),
  1,
];

function luminance([r, g, b]: Rgba): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(vars: Record<string, string>, text: string, surface: string): number {
  const bg = parse(resolve(vars, 'background'));
  const card = over(parse(resolve(vars, 'card')), bg);
  const base = surface === 'background' ? bg : card;
  const surf =
    surface === 'background' || surface === 'card'
      ? base
      : over(parse(resolve(vars, surface)), card);
  const fg = over(parse(resolve(vars, text)), surf);
  const [a, b] = [luminance(fg), luminance(surf)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/** [text token, surface token] pairs the UI actually renders. */
const PAIRS: [string, string][] = [
  ['foreground', 'background'],
  ['foreground', 'card'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
  ['fg-subtle', 'background'],
  ['fg-subtle', 'card'],
  ['ember-text', 'card'],
  ['ember-text', 'ember-soft'],
  ['ember-foreground', 'ember'],
  ['primary-foreground', 'primary'],
  ['success', 'card'],
  ['success', 'success-soft'],
  ['warning', 'card'],
  ['warning', 'warning-soft'],
  ['info', 'card'],
  ['info', 'info-soft'],
  ['destructive', 'card'],
  ['destructive', 'danger-soft'],
  ['destructive-foreground', 'destructive'],
  ['sidebar-foreground', 'sidebar'],
  ['sidebar-primary-foreground', 'sidebar-primary'],
];

for (const [name, vars] of [
  ['light', LIGHT],
  ['dark', DARK],
] as const) {
  test(`${name} theme: every text/surface pair reaches WCAG AA`, () => {
    const failing = PAIRS.map(
      ([t, s]) => [t, s, Number(contrast(vars, t, s).toFixed(2))] as const,
    ).filter(([, , ratio]) => ratio < 4.5);
    expect(failing).toEqual([]);
  });
}
