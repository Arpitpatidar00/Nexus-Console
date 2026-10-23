import type { TableInfo } from '@/features/databases/api/explorer.schema';
import { keyOf, type Link } from './relations';

/** How much of each table a diagram shows. */
export type Detail = 'all' | 'keys' | 'names';

export const HEADER_H = 34;
export const ROW_H = 22;
const CHAR_W = 7.1;
const GAP_X = 104;
const GAP_Y = 30;
const COMPONENT_GAP = 72;
const GROUP_HEAD = 44;
const GROUP_PAD = 28;
export const MARGIN = 40;

export interface DiagramColumn {
  name: string;
  type: string;
  pk: boolean;
  fk: boolean;
  nullable: boolean;
}

export interface DiagramNode {
  /** Unique within the diagram (prefixed by database on the map). */
  id: string;
  title: string;
  /** `schema` when the database has more than one. */
  subtitle: string | null;
  kind: string;
  columns: DiagramColumn[];
  /** Columns left out at this detail level. */
  hidden: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label: string;
  inferred: boolean;
  path: string;
  /** Where the line meets each table: for markers. */
  start: { x: number; y: number; dir: 1 | -1 };
  end: { x: number; y: number; dir: 1 | -1 };
}

export interface DiagramGroup {
  id: string;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Diagram {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  groups: DiagramGroup[];
  width: number;
  height: number;
}

interface Box {
  nodes: DiagramNode[];
  w: number;
  h: number;
}

function nodeOf(
  t: TableInfo,
  id: string,
  fkColumns: Set<string>,
  detail: Detail,
  showSchema: boolean,
): DiagramNode {
  const all = t.columns.map((c) => ({
    name: c.name,
    type: c.dataType,
    pk: c.isPrimary,
    fk: fkColumns.has(c.name),
    nullable: c.nullable,
  }));
  const columns = detail === 'all' ? all : detail === 'keys' ? all.filter((c) => c.pk || c.fk) : [];
  const hidden = all.length - columns.length;
  // Views, collections and key prefixes carry a small kind tag after the name.
  const tagRoom = t.kind === 'table' ? 0 : 11;
  const longest = Math.max(
    t.name.length + (showSchema ? t.schema.length + 1 : 0) + 6 + tagRoom,
    ...columns.map((c) => c.name.length + Math.min(c.type.length, 26) + 6),
  );
  const w = Math.round(Math.min(380, Math.max(168, 24 + longest * CHAR_W)));
  const rows = columns.length + (hidden > 0 && detail !== 'names' ? 1 : 0);
  return {
    id,
    title: t.name,
    subtitle: showSchema ? t.schema : null,
    kind: t.kind,
    columns,
    hidden,
    x: 0,
    y: 0,
    w,
    h: HEADER_H + rows * ROW_H + (rows > 0 ? 8 : 0),
  };
}

/** Rows into a shelf of at most `maxW`, tallest first. Returns the size used. */
function shelf<T extends { w: number; h: number }>(
  items: T[],
  maxW: number,
  gap: number,
  place: (item: T, x: number, y: number) => void,
): { w: number; h: number } {
  let x = 0;
  let y = 0;
  let rowH = 0;
  let w = 0;
  for (const it of items) {
    if (x > 0 && x + it.w > maxW) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    place(it, x, y);
    x += it.w + gap;
    rowH = Math.max(rowH, it.h);
    w = Math.max(w, x - gap);
  }
  return { w, h: items.length ? y + rowH : 0 };
}

/** Layered layout of one database's tables. Referenced tables sit left of
 * the tables that point at them; rows are ordered by the barycentre of their
 * neighbours to cut crossings; unconnected tables go in a grid at the end. */
function layoutTables(nodes: DiagramNode[], links: { from: string; to: string }[]): Box {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parents = new Map<string, Set<string>>();
  const adj = new Map<string, Set<string>>();
  for (const n of nodes) {
    parents.set(n.id, new Set());
    adj.set(n.id, new Set());
  }
  for (const l of links) {
    if (!byId.has(l.from) || !byId.has(l.to) || l.from === l.to) continue;
    parents.get(l.from)!.add(l.to);
    adj.get(l.from)!.add(l.to);
    adj.get(l.to)!.add(l.from);
  }

  // Connected components.
  const comp = new Map<string, number>();
  const components: string[][] = [];
  for (const n of nodes) {
    if (comp.has(n.id)) continue;
    const members: string[] = [];
    const stack = [n.id];
    comp.set(n.id, components.length);
    while (stack.length) {
      const cur = stack.pop()!;
      members.push(cur);
      for (const m of adj.get(cur)!) {
        if (!comp.has(m)) {
          comp.set(m, components.length);
          stack.push(m);
        }
      }
    }
    components.push(members);
  }

  // Rank = longest chain of references below a table (cycles cut).
  const rank = new Map<string, number>();
  const visiting = new Set<string>();
  const rankOf = (id: string): number => {
    const known = rank.get(id);
    if (known != null) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let r = 0;
    for (const p of parents.get(id)!) r = Math.max(r, rankOf(p) + 1);
    visiting.delete(id);
    rank.set(id, r);
    return r;
  };

  const boxes: Box[] = [];
  const loners: DiagramNode[] = [];
  for (const members of components) {
    if (members.length === 1) {
      loners.push(byId.get(members[0])!);
      continue;
    }
    const layers: string[][] = [];
    for (const id of members.sort()) (layers[rankOf(id)] ??= []).push(id);
    const dense = layers.filter(Boolean);
    // Barycentre sweeps: down then up, a few times.
    const order = new Map<string, number>();
    const reindex = () => dense.forEach((layer) => layer.forEach((id, i) => order.set(id, i)));
    reindex();
    for (let sweep = 0; sweep < 4; sweep++) {
      const seq = sweep % 2 === 0 ? dense.slice(1) : dense.slice(0, -1).reverse();
      for (const layer of seq) {
        const bary = (id: string) => {
          const ns = [...adj.get(id)!].filter((m) => order.has(m));
          return ns.length ? ns.reduce((s, m) => s + order.get(m)!, 0) / ns.length : order.get(id)!;
        };
        layer.sort((a, b) => bary(a) - bary(b));
        reindex();
      }
    }
    const heights = dense.map((layer) =>
      layer.reduce((s, id, i) => s + byId.get(id)!.h + (i ? GAP_Y : 0), 0),
    );
    const tallest = Math.max(...heights);
    let x = 0;
    const placed: DiagramNode[] = [];
    dense.forEach((layer, li) => {
      const colW = Math.max(...layer.map((id) => byId.get(id)!.w));
      let y = (tallest - heights[li]) / 2;
      for (const id of layer) {
        const n = byId.get(id)!;
        n.x = x + (colW - n.w) / 2;
        n.y = Math.round(y);
        y += n.h + GAP_Y;
        placed.push(n);
      }
      x += colW + GAP_X;
    });
    boxes.push({ nodes: placed, w: x - GAP_X, h: tallest });
  }

  if (loners.length) {
    const cols = Math.max(1, Math.ceil(Math.sqrt(loners.length * 1.6)));
    const avgW = loners.reduce((s, n) => s + n.w, 0) / loners.length;
    const box: Box = { nodes: [], w: 0, h: 0 };
    const size = shelf(
      [...loners].sort((a, b) => a.title.localeCompare(b.title)),
      cols * (avgW + 40),
      40,
      (n, x, y) => {
        n.x = x;
        n.y = y;
        box.nodes.push(n);
      },
    );
    boxes.push({ ...box, ...size });
  }

  // Components side by side, wrapping into a roughly landscape canvas.
  boxes.sort((a, b) => b.nodes.length - a.nodes.length);
  const area = boxes.reduce((s, b) => s + b.w * b.h, 0);
  const maxW = Math.max(900, Math.sqrt(area) * 1.7, ...boxes.map((b) => b.w));
  const all: DiagramNode[] = [];
  const size = shelf(boxes, maxW, COMPONENT_GAP, (b, ox, oy) => {
    for (const n of b.nodes) {
      n.x += ox;
      n.y += oy;
      all.push(n);
    }
  });
  return { nodes: all, w: size.w, h: size.h };
}

function rowY(n: DiagramNode, column: string): number {
  const i = n.columns.findIndex((c) => c.name === column);
  return i < 0 ? n.y + HEADER_H / 2 : n.y + HEADER_H + 4 + i * ROW_H + ROW_H / 2;
}

/** A curve from the referencing column to the referenced one, leaving and
 * entering on the facing sides; a self-reference loops out on the right. */
function route(
  a: DiagramNode,
  b: DiagramNode,
  fromColumn: string,
  toColumn: string,
): Pick<DiagramEdge, 'path' | 'start' | 'end'> {
  const y1 = rowY(a, fromColumn);
  const y2 = rowY(b, toColumn);
  if (a === b) {
    const x = a.x + a.w;
    const out = 40;
    return {
      path: `M ${x} ${y1} C ${x + out} ${y1}, ${x + out} ${y2}, ${x} ${y2}`,
      start: { x, y: y1, dir: 1 },
      end: { x, y: y2, dir: 1 },
    };
  }
  const leftward = a.x + a.w / 2 > b.x + b.w / 2;
  const x1 = leftward ? a.x : a.x + a.w;
  const x2 = leftward ? b.x + b.w : b.x;
  const dx = Math.max(48, Math.abs(x2 - x1) / 2);
  const s = leftward ? -1 : 1;
  return {
    path: `M ${x1} ${y1} C ${x1 + s * dx} ${y1}, ${x2 - s * dx} ${y2}, ${x2} ${y2}`,
    start: { x: x1, y: y1, dir: s as 1 | -1 },
    end: { x: x2, y: y2, dir: (s * -1) as 1 | -1 },
  };
}

function edgesOf(
  nodes: DiagramNode[],
  links: Link[],
  idOf: (l: Link, end: 'from' | 'to') => string,
) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: DiagramEdge[] = [];
  for (const l of links) {
    const a = byId.get(idOf(l, 'from'));
    const b = byId.get(idOf(l, 'to'));
    if (!a || !b) continue;
    out.push({
      id: l.id,
      from: a.id,
      to: b.id,
      label: `${l.fromColumns.join(', ')} → ${l.toColumns.join(', ')}`,
      inferred: l.inferred,
      ...route(a, b, l.fromColumns[0], l.toColumns[0]),
    });
  }
  return out;
}

function fkSets(tables: TableInfo[], links: Link[]) {
  const sets = new Map(tables.map((t) => [keyOf(t), new Set<string>()]));
  for (const l of links) for (const c of l.fromColumns) sets.get(l.from)?.add(c);
  return sets;
}

/** One database: its tables (or a subset) and the links among them. */
export function buildDiagram(tables: TableInfo[], links: Link[], detail: Detail): Diagram {
  const keys = new Set(tables.map(keyOf));
  const inside = links.filter((l) => keys.has(l.from) && keys.has(l.to));
  const fks = fkSets(tables, inside);
  const multiSchema = new Set(tables.map((t) => t.schema)).size > 1;
  const nodes = tables.map((t) => nodeOf(t, keyOf(t), fks.get(keyOf(t))!, detail, multiSchema));
  const box = layoutTables(nodes, inside);
  for (const n of box.nodes) {
    n.x += MARGIN;
    n.y += MARGIN;
  }
  return {
    nodes: box.nodes,
    edges: edgesOf(box.nodes, inside, (l, end) => l[end]),
    groups: [],
    width: box.w + MARGIN * 2,
    height: box.h + MARGIN * 2,
  };
}

export interface MapDb {
  id: string;
  label: string;
  sublabel: string;
  tables: TableInfo[];
  links: Link[];
}

/** Several databases, each boxed with its own layout; `cross` links (with
 * `fromDb`/`toDb`) run between the boxes. */
export function buildMap(dbs: MapDb[], cross: Link[], detail: Detail): Diagram {
  const nodeId = (db: string, table: string) => `${db}/${table}`;
  const groups: (DiagramGroup & { nodes: DiagramNode[] })[] = [];
  for (const db of dbs) {
    const crossCols = cross.filter((l) => l.fromDb === db.id);
    const fks = fkSets(db.tables, [...db.links, ...crossCols]);
    const multiSchema = new Set(db.tables.map((t) => t.schema)).size > 1;
    const nodes = db.tables.map((t) =>
      nodeOf(t, nodeId(db.id, keyOf(t)), fks.get(keyOf(t))!, detail, multiSchema),
    );
    const links = db.links.map((l) => ({ from: nodeId(db.id, l.from), to: nodeId(db.id, l.to) }));
    const box = layoutTables(nodes, links);
    for (const n of box.nodes) {
      n.x += GROUP_PAD;
      n.y += GROUP_HEAD;
    }
    const w = Math.max(box.w + GROUP_PAD * 2, 260);
    const h = box.h + GROUP_HEAD + GROUP_PAD;
    groups.push({
      id: db.id,
      label: db.label,
      sublabel: db.sublabel,
      x: 0,
      y: 0,
      w,
      h,
      nodes: box.nodes,
    });
  }
  const area = groups.reduce((s, g) => s + g.w * g.h, 0);
  const maxW = Math.max(1200, Math.sqrt(area) * 1.8, ...groups.map((g) => g.w));
  const size = shelf(groups, maxW, 96, (g, x, y) => {
    g.x = x + MARGIN;
    g.y = y + MARGIN;
    for (const n of g.nodes) {
      n.x += g.x;
      n.y += g.y;
    }
  });
  // Route once every box has its final position.
  const nodes = groups.flatMap((g) => g.nodes);
  const local = dbs.flatMap((db) => edgesOf(nodes, db.links, (l, end) => nodeId(db.id, l[end])));
  const between = edgesOf(nodes, cross, (l, end) =>
    nodeId(end === 'from' ? l.fromDb! : l.toDb!, l[end]),
  );
  return {
    nodes,
    edges: [...local, ...between],
    groups: groups.map(({ nodes: _n, ...g }) => g),
    width: size.w + MARGIN * 2,
    height: size.h + MARGIN * 2,
  };
}
