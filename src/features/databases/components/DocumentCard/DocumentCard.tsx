import { useState } from 'react';
import { ArrowRight, ChevronRight, Copy, CornerDownRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import type { Filter } from '@/features/databases/api/explorer.schema';
import type { Link } from '@/features/databases/utils/relations';
import {
  entriesOf,
  filterText,
  isNested,
  kindOf,
  preview,
  scalarText,
  type ValueKind,
} from '@/features/databases/utils/values';

export type OpenTable = (key: string, filter?: Filter) => void;

export const KIND_CLS: Record<ValueKind, string> = {
  string: 'text-chart-3',
  number: 'text-chart-4',
  boolean: 'text-chart-5',
  null: 'text-muted-foreground italic',
  objectId: 'text-chart-1',
  date: 'text-fg',
  array: 'text-muted-foreground',
  object: 'text-muted-foreground',
};

const LONG = 240;

const Scalar = ({ v }: { v: unknown }) => {
  const [full, setFull] = useState(false);
  const kind = kindOf(v);
  const text = kind === 'string' ? (v as string) : scalarText(v);
  const shown = full || text.length <= LONG ? text : `${text.slice(0, LONG)}…`;
  return (
    <span className={cn('break-words whitespace-pre-wrap', KIND_CLS[kind])}>
      {kind === 'string' ? `"${shown}"` : kind === 'objectId' ? `ObjectId(${shown})` : shown}
      {text.length > LONG && (
        <button
          type="button"
          onClick={() => setFull(!full)}
          className="ml-1.5 cursor-pointer font-sans text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {full ? 'less' : `${text.length.toLocaleString()} chars`}
        </button>
      )}
    </span>
  );
};

interface FieldProps {
  name: string;
  value: unknown;
  depth: number;
  /** Where this field points, when it's a foreign key. */
  link?: { label: string; open: () => void; guessed: boolean };
}

const Field = ({ name, value, depth, link }: FieldProps) => {
  const nested = isNested(value);
  const [open, setOpen] = useState(
    depth === 0 && Array.isArray(value) && (value as unknown[]).length <= 5,
  );
  return (
    <li>
      <div className="group flex min-w-0 items-start gap-1.5 py-0.5 leading-5">
        <button
          type="button"
          aria-label={open ? `Collapse ${name}` : `Expand ${name}`}
          disabled={!nested}
          onClick={() => setOpen(!open)}
          className={cn(
            'mt-0.5 size-4 shrink-0 cursor-pointer text-muted-foreground disabled:cursor-default',
            !nested && 'invisible',
          )}
        >
          <ChevronRight
            className={cn(
              'size-3.5 transition-transform motion-reduce:transition-none',
              open && 'rotate-90',
            )}
          />
        </button>
        <span className="shrink-0 text-muted-foreground">{name}:</span>
        <span className="min-w-0 flex-1">
          {nested ? (
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="cursor-pointer text-muted-foreground hover:text-fg"
            >
              {Array.isArray(value) ? 'Array' : 'Object'} {preview(value)}
            </button>
          ) : (
            <Scalar v={value} />
          )}
          {link && value != null && (
            <button
              type="button"
              onClick={link.open}
              title={
                link.guessed
                  ? 'Guessed from the column name — no foreign key declares it'
                  : 'Open the row this points to'
              }
              className="ml-2 inline-flex cursor-pointer items-center gap-1 rounded px-1 font-sans text-xs text-info hover:bg-info-soft"
            >
              <ArrowRight className="size-3" aria-hidden />
              {link.label}
              {link.guessed && <span className="text-muted-foreground">?</span>}
            </button>
          )}
        </span>
      </div>
      {nested && open && (
        <ul className="ml-[7px] border-l border-hairline pl-3">
          {entriesOf(value).map(([k, v]) => (
            <Field key={k} name={k} value={v} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
};

interface Props {
  row: Record<string, unknown>;
  /** Field order; extra keys a document has follow in their own order. */
  order: string[];
  outgoing: Map<string, Link>;
  incoming: Link[];
  nameOf: (tableKey: string) => string;
  onOpenTable: OpenTable;
  className?: string;
}

/** One row as a document: every field, typed and coloured, nested values
 * expandable, and the rows it points to (and that point to it) one click away. */
export const DocumentCard = ({
  row,
  order,
  outgoing,
  incoming,
  nameOf,
  onOpenTable,
  className,
}: Props) => {
  const keys = [
    ...order.filter((k) => k in row),
    ...Object.keys(row).filter((k) => !order.includes(k)),
  ];
  const copy = () => {
    void navigator.clipboard.writeText(JSON.stringify(row, null, 2));
    toast.success('Copied as JSON');
  };
  const backlinks = incoming.filter((l) => row[l.toColumns[0]] != null);
  return (
    <article
      className={cn(
        'group/doc rounded-lg border border-hairline bg-card px-3 py-2.5 font-mono text-xs',
        className,
      )}
    >
      <button
        type="button"
        onClick={copy}
        aria-label="Copy this row as JSON"
        title="Copy as JSON"
        className="float-right -mt-0.5 cursor-pointer rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover/doc:opacity-100 hover:bg-accent hover:text-fg focus-visible:opacity-100"
      >
        <Copy className="size-3.5" />
      </button>
      <ul>
        {keys.map((k) => {
          const l = outgoing.get(k);
          const idx = l ? l.fromColumns.indexOf(k) : -1;
          return (
            <Field
              key={k}
              name={k}
              value={row[k]}
              depth={0}
              link={
                l
                  ? {
                      label: nameOf(l.to),
                      guessed: l.inferred,
                      open: () =>
                        onOpenTable(l.to, {
                          column: l.toColumns[idx] ?? l.toColumns[0],
                          op: 'eq',
                          value: filterText(row[k]),
                        }),
                    }
                  : undefined
              }
            />
          );
        })}
      </ul>
      {backlinks.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2 font-sans">
          <span className="flex items-center gap-1 text-muted-foreground">
            <CornerDownRight className="size-3" aria-hidden />
            Referenced by
          </span>
          {backlinks.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() =>
                onOpenTable(l.from, {
                  column: l.fromColumns[0],
                  op: 'eq',
                  value: filterText(row[l.toColumns[0]]),
                })
              }
              title={
                l.inferred
                  ? 'Guessed from the column name'
                  : `Rows in ${nameOf(l.from)} whose ${l.fromColumns[0]} is this row`
              }
              className="cursor-pointer rounded-full border border-hairline px-2 py-0.5 text-info hover:bg-info-soft"
            >
              {nameOf(l.from)}
              <span className="text-muted-foreground">.{l.fromColumns[0]}</span>
              {l.inferred && <span className="text-muted-foreground">?</span>}
            </button>
          ))}
        </div>
      )}
    </article>
  );
};
