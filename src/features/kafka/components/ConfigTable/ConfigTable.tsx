import { useId, useState } from 'react';
import { Lock } from 'lucide-react';
import { Input } from '@/shared/ui/Field';
import { Switch } from '@/shared/ui/Switch';
import { Badge } from '@/shared/ui/Badge';
import type { ConfigEntry } from '../../api/kafka.schema';

const SOURCE_LABEL: Record<string, string> = {
  topic: 'Topic override',
  dynamicBroker: 'Broker (dynamic)',
  dynamicDefaultBroker: 'Cluster default (dynamic)',
  staticBroker: 'Broker (server.properties)',
  default: 'Kafka default',
  other: 'Other',
};

interface ConfigTableProps {
  configs: ConfigEntry[];
  /** Label for the "only non-defaults" switch. */
  overridesLabel?: string;
}

export const ConfigTable = ({ configs, overridesLabel = 'Only overrides' }: ConfigTableProps) => {
  const switchId = useId();
  const [query, setQuery] = useState('');
  const [onlyOverrides, setOnlyOverrides] = useState(false);
  const q = query.trim().toLowerCase();
  const rows = configs.filter(
    (c) =>
      (!onlyOverrides || !c.isDefault) &&
      (!q || c.name.toLowerCase().includes(q) || (c.value ?? '').toLowerCase().includes(q)),
  );
  const overrides = configs.filter((c) => !c.isDefault).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          size="sm"
          type="search"
          className="w-64"
          aria-label="Filter settings"
          placeholder="Filter settings"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            id={switchId}
            checked={onlyOverrides}
            onChange={setOnlyOverrides}
            ariaLabel={overridesLabel}
          />
          <label htmlFor={switchId} className="cursor-pointer">
            {overridesLabel} ({overrides})
          </label>
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {rows.length} of {configs.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-hairline">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-popover/90 backdrop-blur-md">
            <tr className="border-b border-hairline text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Setting</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.name} className="border-b border-hairline align-top last:border-0">
                <td className="px-3 py-2 font-mono text-fg" title={c.documentation ?? undefined}>
                  {c.name}
                  {c.readOnly && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground">read-only</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono break-all text-fg">
                  {c.sensitive ? (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Lock className="size-3" aria-hidden /> hidden
                    </span>
                  ) : c.value === null ? (
                    <span className="text-muted-foreground">null</span>
                  ) : c.value === '' ? (
                    <span className="text-muted-foreground">(empty)</span>
                  ) : (
                    c.value
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {c.isDefault ? (
                    <span className="text-muted-foreground">
                      {SOURCE_LABEL[c.source] ?? c.source}
                    </span>
                  ) : (
                    <Badge tone="ember" size="sm">
                      {SOURCE_LABEL[c.source] ?? c.source}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                  No settings match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
