import type { TableInfo } from '@/features/databases/api/explorer.schema';
import { keyOf, type Link } from './relations';

/** Mermaid identifiers: letters, digits and underscores. */
const ident = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');

/** The tables as a Mermaid `erDiagram` (GitHub, Notion and most wikis render
 * it). Guessed links are kept but say so in their label. */
export function toMermaid(tables: TableInfo[], links: Link[]): string {
  const multiSchema = new Set(tables.map((t) => t.schema)).size > 1;
  const name = new Map(
    tables.map((t) => [keyOf(t), ident(multiSchema ? `${t.schema}_${t.name}` : t.name)]),
  );
  const fkCols = new Set(links.flatMap((l) => l.fromColumns.map((c) => `${l.from}:${c}`)));
  const lines = ['erDiagram'];
  for (const t of tables) {
    lines.push(`  ${name.get(keyOf(t))} {`);
    for (const c of t.columns) {
      const keys = [
        c.isPrimary && 'PK',
        fkCols.has(`${keyOf(t)}:${c.name}`) && 'FK',
        c.isUnique && !c.isPrimary && 'UK',
      ]
        .filter(Boolean)
        .join(', ');
      const comment = c.comment ? ` "${c.comment.replace(/"/g, "'")}"` : '';
      lines.push(
        `    ${ident(c.dataType) || 'unknown'} ${ident(c.name)}${keys ? ` ${keys}` : ''}${comment}`,
      );
    }
    lines.push('  }');
  }
  for (const l of links) {
    const from = name.get(l.from);
    const to = name.get(l.to);
    if (!from || !to) continue;
    const child = tables.find((t) => keyOf(t) === l.from);
    const optional = l.fromColumns.some((c) => child?.columns.find((x) => x.name === c)?.nullable);
    const label = `${l.fromColumns.join(', ')}${l.inferred ? ' (guessed)' : ''}`;
    lines.push(`  ${to} ${optional ? '|o' : '||'}--o{ ${from} : "${label.replace(/"/g, "'")}"`);
  }
  return `${lines.join('\n')}\n`;
}

/** `Fameo DEV (Neon)` + `diagram` → `fameo-dev-neon-diagram`. */
export const fileStem = (...parts: string[]) =>
  parts
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'database';
