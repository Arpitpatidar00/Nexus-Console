import { test, expect } from 'vitest';

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

test('the patterns catch a planted violation', () => {
  expect('x bg-red-500/10 y'.match(RAW_PALETTE)).toEqual(['bg-red-500']);
  expect('hover:text-blue-300'.match(RAW_PALETTE)).toEqual(['text-blue-300']);
  expect('text-accent'.match(LEGACY_ALIASES)).toEqual(['text-accent']);
  expect('bg-accent-soft'.match(LEGACY_ALIASES)).toEqual(['bg-accent-soft']);
  expect('text-accent-foreground bg-ember-soft'.match(LEGACY_ALIASES)).toBeNull();
});
