import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Design-token guard (A-09 / PLAN E.6): colors come from `theme.css` tokens only.
// A raw palette class can't follow the light/dark ramp, and a legacy alias no
// longer resolves to anything, so Tailwind silently renders no color at all.

const sources = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const UTIL =
  '(?:text|bg|border(?:-[trblxy])?|ring|ring-offset|divide|fill|stroke|outline|from|via|to|placeholder|caret|decoration|accent|shadow)';
const PALETTE =
  'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|grey|zinc|neutral|stone';

const RAW_PALETTE = new RegExp(`(?<![\\w-])${UTIL}-(?:${PALETTE})-\\d{2,3}(?![\\w-])`, 'g');

/** Names that existed before the shadcn token move; each now resolves to nothing. */
const LEGACY_ALIASES = new RegExp(
  [
    'text-text-[a-z]+',
    '[a-z]+-surface(?:-[a-z]+)?',
    '[a-z]+-border-(?:subtle|muted)',
    '[a-z]+-accent-(?:soft|fg|text|hover)',
    'text-muted-fg',
    'bg-subtle',
    'bg-hover',
    'bg-bg',
    // `accent` is shadcn's hover surface; as text/border/ring it is near-invisible.
    '(?:text|border|ring)-accent',
  ]
    .map((p) => `(?<![\\w-])${p}(?![\\w-])`)
    .join('|'),
  'g',
);

/** `text-fg`/`bg-fg`/etc. and `text-foreground`/`bg-foreground`/etc. resolve to
 * the identical color (`theme.css` aliases `--fg` to `--foreground`), but
 * having both names in use (AUDIT-2026-10-24 DES-04) is the kind of drift
 * this guard exists to catch. `text-fg` is the one CLAUDE.md names — ban the
 * bare `-foreground` form going forward. (A compound token like
 * `text-muted-foreground` or `text-primary-foreground` is a different,
 * legitimate token and must not match.) */
const BARE_FOREGROUND = new RegExp(
  `(?<![\\w-])(?:text|bg|border|stroke)-foreground(?![\\w-])`,
  'g',
);

function offenders(re: RegExp): string[] {
  return Object.entries(sources).flatMap(([file, text]) =>
    text.split('\n').flatMap((line, i) => {
      const hits = line.match(re);
      return hits ? [`${file}:${i + 1} ${hits.join(' ')}`] : [];
    }),
  );
}

test('the guard actually sees the source tree', () => {
  expect(Object.keys(sources).length).toBeGreaterThan(100);
});

test('no raw Tailwind palette classes', () => {
  expect(offenders(RAW_PALETTE)).toEqual([]);
});

test('no legacy color aliases', () => {
  expect(offenders(LEGACY_ALIASES)).toEqual([]);
});

test('no bare -foreground token (use -fg)', () => {
  expect(offenders(BARE_FOREGROUND)).toEqual([]);
});

// Dark mode is CSS-variable driven ([data-theme='dark'] overrides in
// theme.css), not scattered `dark:` utilities (CLAUDE.md, AUDIT-2026-10-24
// DES-08) — a one-off `dark:hover:bg-white/20` can't follow the token ramp
// and drifts the moment that ramp changes.
const SCATTERED_DARK_VARIANT = /(?<![\w-])dark:[a-z-]+/g;

test('no scattered dark: utility variants', () => {
  expect(offenders(SCATTERED_DARK_VARIANT)).toEqual([]);
});

// Dark mode is flat, no shadows (PRODUCT.md) — Tailwind's native shadow
// scale isn't theme-aware by itself, so theme.css must force it off under
// [data-theme='dark'] (AUDIT-2026-10-24 DES-01). This only checks the rule
// exists, not what renders — vitest runs in node, no DOM.
test('dark mode flattens the native Tailwind shadow scale', () => {
  const themeCss = readFileSync('src/styles/theme.css', 'utf8');
  for (const cls of [
    'shadow-xs',
    'shadow-sm',
    'shadow-md',
    'shadow-lg',
    'shadow-xl',
    'shadow-2xl',
  ]) {
    expect(themeCss, `expected a dark-mode override for .${cls}`).toMatch(
      new RegExp(`\\[data-theme=.dark.\\][^{]*\\.${cls}\\b`),
    );
  }
  expect(themeCss).toMatch(/box-shadow:\s*none\s*!important/);
});

test('the patterns catch a planted violation', () => {
  expect('x bg-red-500/10 y'.match(RAW_PALETTE)).toEqual(['bg-red-500']);
  expect('hover:text-blue-300'.match(RAW_PALETTE)).toEqual(['text-blue-300']);
  expect('text-accent'.match(LEGACY_ALIASES)).toEqual(['text-accent']);
  expect('bg-accent-soft'.match(LEGACY_ALIASES)).toEqual(['bg-accent-soft']);
  expect('text-accent-foreground bg-ember-soft'.match(LEGACY_ALIASES)).toBeNull();
  expect('text-foreground'.match(BARE_FOREGROUND)).toEqual(['text-foreground']);
  expect('text-muted-foreground'.match(BARE_FOREGROUND)).toBeNull();
  expect('text-primary-foreground'.match(BARE_FOREGROUND)).toBeNull();
});
