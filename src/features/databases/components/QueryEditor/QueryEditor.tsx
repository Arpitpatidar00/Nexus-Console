import { useState } from 'react';
import { Play, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { useRunQuery } from '../../api/useDatabases';
import type { QueryResult } from '../../api/databases.schema';

interface QueryEditorProps {
  connectionId: string;
  allowWrites: boolean;
  defaultQuery?: string;
}

export function QueryEditor({
  connectionId,
  allowWrites,
  defaultQuery = 'SELECT 1;',
}: QueryEditorProps) {
  const [query, setQuery] = useState(defaultQuery);
  const runQuery = useRunQuery();
  const [result, setResult] = useState<QueryResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleExecute = () => {
    setErrorMsg(null);
    runQuery.mutate(
      { id: connectionId, query },
      {
        onSuccess: (data) => setResult(data),
        onError: (err) => setErrorMsg(err.message),
      },
    );
  };

  return (
    <div className="flex h-full flex-col space-y-4">
      {/* Editor & Run Control */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted p-2.5">
          <div className="flex items-center gap-2 text-xs text-fg-muted">
            <span className="font-mono">SQL Query</span>
            {!allowWrites && (
              <span className="rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-medium text-info">
                Read-Only (SELECT / EXPLAIN auto-capped)
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleExecute}
            disabled={runQuery.isPending || !query.trim()}
            className="flex items-center gap-1.5 rounded bg-info px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-info disabled:opacity-50"
          >
            <Play className="h-3 w-3 fill-current" />
            {runQuery.isPending ? 'Running...' : 'Execute'}
          </button>
        </div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter SQL statement (e.g. SELECT * FROM users;)"
          rows={5}
          className="w-full resize-none bg-transparent p-3 font-mono text-xs text-fg focus:outline-none"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              handleExecute();
            }
          }}
        />
      </div>

      {/* Query Error Banner */}
      {errorMsg && (
        <div className="flex items-start gap-2.5 rounded-lg border border-danger-soft bg-danger-soft p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <div className="font-semibold">Query Blocked / Failed</div>
            <div className="font-mono text-[11px] break-all">{errorMsg}</div>
          </div>
        </div>
      )}

      {/* Result Metrics */}
      {result && (
        <div className="flex items-center gap-4 px-1 text-xs text-fg-muted">
          <span className="flex items-center gap-1">
            <CheckCircle className="h-3.5 w-3.5 text-success" />
            {result.rowCount} rows returned
          </span>
          <span className="flex items-center gap-1 font-mono">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
            {result.durationMs}ms
          </span>
        </div>
      )}

      {/* Results Table */}
      {result && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="sticky top-0 border-b border-border bg-muted text-fg-muted">
                <tr>
                  {result.columns.map((col, idx) => (
                    <th
                      key={idx}
                      className="border-r border-border px-3 py-2 font-semibold last:border-r-0"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={result.columns.length}
                      className="py-8 text-center font-sans text-fg-muted"
                    >
                      Query returned 0 rows.
                    </td>
                  </tr>
                ) : (
                  result.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="transition-colors hover:bg-muted/50">
                      {row.map((val, cIdx) => (
                        <td
                          key={cIdx}
                          className="max-w-[250px] truncate border-r border-border px-3 py-1.5 last:border-r-0"
                        >
                          {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
