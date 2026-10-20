import { useState } from 'react';
import { Table, Search, RefreshCw } from 'lucide-react';
import { useDbSchema } from '../../api/useDatabases';

interface SchemaBrowserProps {
  connectionId: string;
  onSelectTable: (tableName: string) => void;
}

export function SchemaBrowser({ connectionId, onSelectTable }: SchemaBrowserProps) {
  const { data: tables = [], isLoading, refetch } = useDbSchema(connectionId);
  const [filter, setFilter] = useState('');

  const filtered = tables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="border-border-subtle bg-surface-elevated flex h-full w-64 flex-col border-r">
      <div className="border-border-subtle flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Table className="h-3.5 w-3.5 text-blue-400" />
          <span>Tables & Views</span>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          title="Refresh schema"
          className="hover:bg-surface-subtle text-text-muted hover:text-text-primary rounded p-1 transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="border-border-subtle border-b p-2">
        <div className="relative">
          <Search className="text-text-muted absolute top-2 left-2.5 h-3 w-3" />
          <input
            type="text"
            placeholder="Filter tables..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-surface-subtle border-border-subtle text-text-primary w-full rounded border py-1 pr-2 pl-7 text-xs focus:outline-none"
          />
        </div>
      </div>

      <div className="divide-border-subtle/50 flex-1 divide-y overflow-y-auto p-1">
        {isLoading ? (
          <div className="text-text-muted p-4 text-center text-xs">Loading schema...</div>
        ) : filtered.length === 0 ? (
          <div className="text-text-muted p-4 text-center text-xs">No tables found.</div>
        ) : (
          filtered.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => onSelectTable(t.name)}
              className="hover:bg-surface-subtle group flex w-full items-center justify-between rounded p-2 text-left transition-colors"
            >
              <span className="text-text-primary truncate font-mono text-xs group-hover:text-blue-400">
                {t.name}
              </span>
              <span className="text-text-muted text-[10px]">{t.sizePretty}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
