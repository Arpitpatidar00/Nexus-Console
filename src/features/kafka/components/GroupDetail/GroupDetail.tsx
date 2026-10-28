import { useId, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Badge } from '@/shared/ui/Badge';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Input } from '@/shared/ui/Field';
import { Skeleton } from '@/shared/ui/Skeleton';
import { Switch } from '@/shared/ui/Switch';
import { useKafkaGroupDetail } from '../../api/useKafka';
import { formatCount, groupStatus } from '../../utils/format';
import { Warnings } from '../Warnings';

export const GroupDetail = ({
  clusterId,
  group,
  onOpenTopic,
}: {
  clusterId: string;
  group: string;
  onOpenTopic: (topic: string) => void;
}) => {
  const switchId = useId();
  const [live, setLive] = useState(false);
  const q = useKafkaGroupDetail(clusterId, group, live);
  const [query, setQuery] = useState('');

  if (q.error) {
    return (
      <div className="p-6">
        <ErrorPanel
          error={q.error}
          fallback="Couldn't read this consumer group"
          onRetry={() => void q.refetch()}
        />
      </div>
    );
  }
  const d = q.data;
  if (!d) {
    return (
      <div className="p-5">
        <Skeleton lines={8} />
      </div>
    );
  }

  const s = groupStatus({ state: d.state, totalLag: d.totalLag, members: d.members.length });
  const needle = query.trim().toLowerCase();
  const offsets = d.offsets.filter(
    (o) =>
      !needle ||
      o.topic.toLowerCase().includes(needle) ||
      (o.clientId ?? '').toLowerCase().includes(needle),
  );
  const expired = d.offsets.filter((o) => o.behindLogStart).length;
  const unassigned = d.members.length > 0 ? d.offsets.filter((o) => !o.memberId).length : 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <Badge tone={s.tone} dot>
          {s.label}
        </Badge>
        <span className="text-muted-foreground">
          Total lag{' '}
          <span className="font-mono text-fg tabular-nums">{formatCount(d.totalLag)}</span>
        </span>
        <span className="text-muted-foreground">
          {d.members.length} member{d.members.length === 1 ? '' : 's'}
        </span>
        {d.assignor && (
          <span className="text-muted-foreground">
            Assignor <span className="font-mono text-fg">{d.assignor}</span>
          </span>
        )}
        <span className="text-muted-foreground">Coordinator: broker {d.coordinator}</span>
        <span className="ml-auto flex items-center gap-2 text-muted-foreground">
          <Switch
            id={switchId}
            checked={live}
            onChange={setLive}
            ariaLabel="Refresh every 5 seconds"
          />
          <label htmlFor={switchId} className="cursor-pointer">
            Live
          </label>
        </span>
      </div>

      {d.error && (
        <p className="flex items-start gap-2 text-xs text-destructive">
          <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {d.error}
        </p>
      )}
      <Warnings
        warnings={[
          ...d.warnings,
          ...(expired > 0
            ? [
                `${expired} committed offset${expired === 1 ? ' is' : 's are'} older than the log start — retention already deleted those messages, so a restarted consumer falls back to auto.offset.reset.`,
              ]
            : []),
          ...(d.protocolType && d.protocolType !== 'consumer'
            ? [
                `This group uses the “${d.protocolType}” protocol, so member assignments can't be shown.`,
              ]
            : []),
        ]}
      />

      {d.members.length > 0 && (
        <section aria-label="Members" className="flex flex-col gap-2">
          <h2 className="text-[13px] font-semibold text-fg">Members</h2>
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-hairline text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Client ID</th>
                  <th className="px-3 py-2 font-medium">Host</th>
                  <th className="px-3 py-2 font-medium">Assigned partitions</th>
                </tr>
              </thead>
              <tbody>
                {d.members.map((m) => (
                  <tr key={m.memberId} className="border-b border-hairline align-top last:border-0">
                    <td className="px-3 py-2 font-mono" title={m.memberId}>
                      {m.clientId || '—'}
                      {m.groupInstanceId && (
                        <span className="ml-1.5 font-sans text-[10px] text-muted-foreground">
                          static: {m.groupInstanceId}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{m.host}</td>
                    <td className="px-3 py-2 font-mono">
                      {m.assignment.length === 0
                        ? '—'
                        : m.assignment.map((a) => (
                            <div key={a.topic}>
                              {a.topic}: {a.partitions.join(', ')}
                            </div>
                          ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-label="Offsets" className="flex min-h-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[13px] font-semibold text-fg">Offsets and lag</h2>
          {unassigned > 0 && (
            <span className="text-xs text-warning">
              {unassigned} partition{unassigned === 1 ? '' : 's'} with commits but no member
            </span>
          )}
          <Input
            size="sm"
            type="search"
            className="ml-auto w-60"
            aria-label="Filter offsets"
            placeholder="Filter by topic or client"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {d.offsets.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            This group has no committed offsets.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-hairline">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-hairline text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Topic</th>
                  <th className="px-3 py-2 text-right font-medium">Partition</th>
                  <th className="px-3 py-2 text-right font-medium">Committed</th>
                  <th className="px-3 py-2 text-right font-medium">End offset</th>
                  <th className="px-3 py-2 text-right font-medium">Lag</th>
                  <th className="px-3 py-2 font-medium">Consumer</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {offsets.map((o) => (
                  <tr
                    key={`${o.topic}:${o.partition}`}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        className="cursor-pointer hover:text-ember-text hover:underline"
                        onClick={() => onOpenTopic(o.topic)}
                      >
                        {o.topic}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{o.partition}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {o.committed ?? <span className="font-sans text-muted-foreground">none</span>}
                      {o.behindLogStart && (
                        <span
                          className="ml-1 font-sans text-[10px] text-warning"
                          title={`Log starts at ${o.logStart}`}
                        >
                          expired
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{o.logEnd ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCount(o.lag)}</td>
                    <td
                      className="truncate px-3 py-1.5 text-muted-foreground"
                      title={o.memberId ?? undefined}
                    >
                      {o.clientId ? `${o.clientId} · ${o.host}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
