import { HEADER_H, ROW_H, type Diagram } from './diagram';

/** Every colour the diagram uses. On screen these are theme variables, so
 * light/dark switch live; an export resolves them to plain colours. */
export interface Palette {
  canvas: string;
  card: string;
  header: string;
  border: string;
  text: string;
  muted: string;
  pk: string;
  fk: string;
  edge: string;
  accent: string;
  group: string;
}

const TOKENS: Record<keyof Palette, string> = {
  canvas: '--background',
  card: '--card',
  header: '--muted',
  border: '--border',
  text: '--foreground',
  muted: '--muted-foreground',
  pk: '--warning',
  fk: '--info',
  edge: '--muted-foreground',
  accent: '--ember',
  group: '--muted',
};

export const SCREEN_PALETTE = Object.fromEntries(
  Object.entries(TOKENS).map(([k, v]) => [k, `var(${v})`]),
) as unknown as Palette;

type Rgba = [number, number, number, number];

export function parseColor(c: string): Rgba | null {
  const s = c.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((x) => x + x).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba;
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (rgb) {
    const p = rgb[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if (p.length >= 3 && p.every((n) => Number.isFinite(n))) return [p[0], p[1], p[2], p[3] ?? 1];
  }
  return null;
}

/** `top` painted over an opaque `bottom`, as one opaque colour. */
export function over(top: string, bottom: string): string {
  const t = parseColor(top);
  const b = parseColor(bottom);
  if (!t || !b) return top;
  const a = t[3];
  const mix = (i: number) => Math.round(t[i] * a + b[i] * (1 - a));
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}

/** The current theme as plain colours, translucent surfaces flattened onto
 * the background — an exported file has no theme behind it. */
export function resolvePalette(read: (cssVar: string) => string): Palette {
  const raw = Object.fromEntries(
    Object.entries(TOKENS).map(([k, v]) => [k, read(v).trim() || '#808080']),
  ) as unknown as Palette;
  const canvas = over(raw.canvas, '#ffffff');
  const card = over(raw.card, canvas);
  return {
    ...raw,
    canvas,
    card,
    header: over(raw.header, card),
    group: over(raw.group, canvas),
    border: over(raw.border, card),
  };
}

export const escapeXml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );

const SANS = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface RenderOptions {
  /** Tables drawn with an accent outline (e.g. the focused table). */
  highlight?: ReadonlySet<string>;
  /** A title line at the top, for exported files. */
  title?: string;
}

/** The diagram as an SVG document. Nodes carry `data-table`, edges
 * `data-from`/`data-to`, so the screen can hit-test and highlight with CSS. */
export function renderSvg(d: Diagram, p: Palette, opts: RenderOptions = {}): string {
  const top = opts.title ? 36 : 0;
  const W = Math.ceil(d.width);
  const H = Math.ceil(d.height + top);
  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${SANS}">`,
    `<rect width="${W}" height="${H}" style="fill:${p.canvas}"/>`,
  );
  if (opts.title) {
    out.push(
      `<text x="40" y="26" font-size="15" font-weight="600" style="fill:${p.text}">${escapeXml(opts.title)}</text>`,
    );
  }
  out.push(`<g transform="translate(0 ${top})">`);

  for (const g of d.groups) {
    out.push(
      `<g class="sr-group"><rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="14" style="fill:${p.group};stroke:${p.border}"/>`,
      `<text x="${g.x + 18}" y="${g.y + 27}" font-size="14" font-weight="600" style="fill:${p.text}">${escapeXml(g.label)}</text>`,
      `<text x="${g.x + 18 + g.label.length * 8 + 12}" y="${g.y + 27}" font-size="12" style="fill:${p.muted}">${escapeXml(g.sublabel)}</text></g>`,
    );
  }

  for (const e of d.edges) {
    const crow = (x: number, y: number, dir: number) =>
      `M ${x + dir * 11} ${y} L ${x} ${y - 5} M ${x + dir * 11} ${y} L ${x} ${y} M ${x + dir * 11} ${y} L ${x} ${y + 5}`;
    const bar = (x: number, y: number, dir: number) =>
      `M ${x + dir * 7} ${y - 5} L ${x + dir * 7} ${y + 5}`;

    let dash = '';
    let strokeColor = p.edge;
    let desc = e.inferred ? ' (inferred)' : ' (declared)';

    if (e.status === 'ambiguous') {
      dash = ' stroke-dasharray="2 3"';
      strokeColor = p.accent;
      desc = ' (ambiguous candidate set)';
    } else if (e.status === 'incompatible') {
      dash = ' stroke-dasharray="6 2 2 2"';
      strokeColor = '#f59e0b';
      desc = ' (type mismatch warning)';
    } else if (e.provenance === 'configured') {
      dash = '';
      strokeColor = p.accent;
      desc = ' (user-configured mapping)';
    } else if (e.inferred) {
      dash = ' stroke-dasharray="5 4"';
      desc = ' (guessed from names)';
    }

    out.push(
      `<g class="sr-edge" data-from="${escapeXml(e.from)}" data-to="${escapeXml(e.to)}">`,
      `<title>${escapeXml(e.label)}${desc}</title>`,
      `<path d="${e.path}" fill="none" stroke-width="1.4"${dash} style="stroke:${strokeColor}"/>`,
      `<path d="${crow(e.start.x, e.start.y, e.start.dir)} ${bar(e.end.x, e.end.y, e.end.dir)}" fill="none" stroke-width="1.4" style="stroke:${strokeColor}"/>`,
      `</g>`,
    );
  }

  for (const n of d.nodes) {
    const hl = opts.highlight?.has(n.id);
    const isView = n.kind === 'view' || n.kind === 'materializedView';
    out.push(
      `<g class="sr-node" data-table="${escapeXml(n.id)}" style="cursor:pointer">`,
      `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="9" style="fill:${p.card};stroke:${hl ? p.accent : p.border}" stroke-width="${hl ? 2 : 1}"/>`,
    );
    if (n.columns.length || n.hidden) {
      out.push(
        `<path d="M ${n.x} ${n.y + 9} a 9 9 0 0 1 9 -9 h ${n.w - 18} a 9 9 0 0 1 9 9 v ${HEADER_H - 9} h ${-n.w} z" style="fill:${p.header}"/>`,
        `<line x1="${n.x}" y1="${n.y + HEADER_H}" x2="${n.x + n.w}" y2="${n.y + HEADER_H}" style="stroke:${p.border}"/>`,
      );
    }
    const tag =
      n.kind === 'materializedView'
        ? 'mat. view'
        : isView || n.kind === 'collection' || n.kind === 'keyspace'
          ? n.kind
          : null;
    // Room for the title: the node minus padding, the schema prefix and the tag.
    const room =
      n.w - 24 - (n.subtitle ? (n.subtitle.length + 1) * 7.4 : 0) - (tag ? tag.length * 6 + 14 : 0);
    const title = escapeXml(clip(n.title, Math.max(4, Math.floor(room / 7.6))));
    const sub = n.subtitle
      ? `<tspan style="fill:${p.muted}">${escapeXml(n.subtitle)}.</tspan>`
      : '';
    out.push(
      `<text x="${n.x + 12}" y="${n.y + 22}" font-size="13" font-weight="600"${isView ? ' font-style="italic"' : ''} style="fill:${p.text}">${sub}${title}</text>`,
    );
    if (tag) {
      out.push(
        `<text x="${n.x + n.w - 10}" y="${n.y + 22}" font-size="10" text-anchor="end" style="fill:${p.muted}">${tag}</text>`,
      );
    }
    n.columns.forEach((c, i) => {
      const y = n.y + HEADER_H + 4 + i * ROW_H + 15;
      const key = c.pk ? 'PK' : c.fk ? 'FK' : '';
      if (key) {
        out.push(
          `<text x="${n.x + 10}" y="${y}" font-size="9" font-weight="700" style="fill:${c.pk ? p.pk : p.fk}">${key}</text>`,
        );
      }
      out.push(
        `<text x="${n.x + 30}" y="${y}" font-size="12" font-family="${MONO}" style="fill:${p.text}">${escapeXml(clip(c.name, 28))}</text>`,
        // `?` marks a nullable column, as in TypeScript and Prisma.
        `<text x="${n.x + n.w - 10}" y="${y}" font-size="11" font-family="${MONO}" text-anchor="end" style="fill:${p.muted}">${escapeXml(clip(c.type, 22))}${c.nullable ? '?' : ''}</text>`,
      );
    });
    // Names-only nodes are just a header; the others say what they left out.
    if (n.hidden > 0 && n.h > HEADER_H) {
      const y = n.y + HEADER_H + 4 + n.columns.length * ROW_H + 15;
      out.push(
        `<text x="${n.x + 30}" y="${y}" font-size="11" font-style="italic" style="fill:${p.muted}">+ ${n.hidden} more column${n.hidden === 1 ? '' : 's'}</text>`,
      );
    }
    out.push(`</g>`);
  }
  out.push(`</g></svg>`);
  return out.join('');
}
