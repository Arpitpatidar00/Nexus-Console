import { useEffect, useState } from 'react';
import {
  Wifi,
  Activity,
  ShieldCheck,
  RotateCw,
  Sliders,
  Plus,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import {
  useNetworkInfo,
  useProcessBandwidth,
  useFlushDns,
  useHostsEntries,
  useSaveHosts,
  useRestoreHosts,
  useChaosProxies,
  useStartChaosProxy,
  useStopChaosProxy,
} from '../api/useNetwork';
import type { HostEntry } from '../api/network.schema';
import { Skeleton } from '@/shared/ui/Skeleton';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Field, Input } from '@/shared/ui/Field';
import { Switch } from '@/shared/ui/Switch';

const newLocalId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tmp_${Date.now()}`;

export const NetworkPage = () => {
  const [activeTab, setActiveTab] = useState<'bandwidth' | 'hosts' | 'chaos'>('bandwidth');

  // Network & Bandwidth
  const { data: netInfo } = useNetworkInfo();
  const {
    data: bandwidth = [],
    isLoading: bwLoading,
    error: bwError,
    refetch: refetchBw,
  } = useProcessBandwidth();
  const flushDnsMutation = useFlushDns();

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 text-fg">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Wifi className="h-6 w-6 text-info" />
            Network & Chaos Engineering
          </h1>
          <p className="mt-1 text-xs text-fg-muted">
            Live per-app traffic inspection via nettop, DNS flush, guarded /etc/hosts editor, and
            TCP chaos proxy.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex rounded-lg border border-border bg-card/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('bandwidth')}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'bandwidth'
                ? 'bg-ember text-ember-foreground shadow-sm'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            Bandwidth & DNS
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('hosts')}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'hosts'
                ? 'bg-ember text-ember-foreground shadow-sm'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            /etc/hosts Editor
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('chaos')}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'chaos'
                ? 'bg-ember text-ember-foreground shadow-sm'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            Chaos Proxy
          </button>
        </div>
      </div>

      {activeTab === 'bandwidth' && (
        <div className="space-y-6">
          {/* Top Interface Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-card/40 p-4 shadow-sm">
              <span className="text-xs font-semibold text-fg-muted">Primary Network Interface</span>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-fg">
                    {netInfo?.primaryInterface || 'en0'}
                  </div>
                  <div className="mt-1 font-mono text-xs text-fg-muted">
                    IPv4: {netInfo?.ipv4Address || '127.0.0.1'}
                  </div>
                </div>
                <Badge variant="default" className="text-xs">
                  Active
                </Badge>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card/40 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fg-muted">System DNS Resolvers</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => flushDnsMutation.mutate()}
                  disabled={flushDnsMutation.isPending}
                  className="flex h-7 items-center gap-1.5 text-xs"
                >
                  <RotateCw className="h-3 w-3" />
                  {flushDnsMutation.isPending ? 'Flushing...' : 'Flush DNS Cache'}
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {netInfo?.dnsServers.map((dns) => (
                  <Badge key={dns} variant="neutral" className="font-mono text-xs">
                    {dns}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Per-App Bandwidth Table */}
          <div className="overflow-hidden rounded-lg border border-border bg-card/40 shadow-sm">
            <div className="flex items-center justify-between border-b border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-fg">
                <Activity className="h-4 w-4 text-info" />
                Live Per-App Bandwidth (nettop live sampler)
              </div>
              <Badge variant="neutral" className="text-[10px]">
                Polling 3s
              </Badge>
            </div>

            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 font-semibold text-fg-muted">
                  <th className="px-4 py-3">Process Name</th>
                  <th className="px-4 py-3">PID</th>
                  <th className="px-4 py-3 text-right">Bytes In</th>
                  <th className="px-4 py-3 text-right">Bytes Out</th>
                  <th className="px-4 py-3 text-right">Total Traffic</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bwError ? (
                  <tr>
                    <td colSpan={5} className="p-4">
                      <ErrorPanel
                        error={bwError}
                        fallback="Couldn't read per-app bandwidth."
                        onRetry={() => void refetchBw()}
                      />
                    </td>
                  </tr>
                ) : bwLoading && bandwidth.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-fg-muted">
                      Sampling nettop process network data...
                    </td>
                  </tr>
                ) : bandwidth.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-fg-muted">
                      No active network processes found.
                    </td>
                  </tr>
                ) : (
                  bandwidth.map((p) => (
                    <tr
                      key={`${p.process}-${p.pid}`}
                      className="transition-colors hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-semibold text-fg">{p.process}</td>
                      <td className="px-4 py-3 font-mono text-fg-muted">{p.pid}</td>
                      <td className="px-4 py-3 text-right font-mono text-success">
                        ↓ {formatBytes(p.bytesIn)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-info">
                        ↑ {formatBytes(p.bytesOut)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-fg">
                        {formatBytes(p.bytesIn + p.bytesOut)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'hosts' && <HostsEditorSection />}

      {activeTab === 'chaos' && <ChaosProxySection />}
    </div>
  );
};

/** A row being edited: hostnames as one space-separated field, since that's
 * how they're typed and how /etc/hosts itself writes them. */
type EditableRow = Omit<HostEntry, 'hostnames'> & { hostnamesText: string };

const toEditable = (e: HostEntry): EditableRow => ({ ...e, hostnamesText: e.hostnames.join(' ') });

const HostsEditorSection = () => {
  const { data: savedEntries = [], isLoading, error, refetch } = useHostsEntries();
  const saveHosts = useSaveHosts();
  const restoreHosts = useRestoreHosts();
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seed local editable rows from the server once per load; don't clobber
  // in-progress edits on an unrelated refetch.
  useEffect(() => {
    if (rows === null && savedEntries.length >= 0 && !isLoading) {
      setRows(savedEntries.map(toEditable));
    }
  }, [savedEntries, isLoading, rows]);

  const dirty =
    rows !== null && JSON.stringify(rows) !== JSON.stringify(savedEntries.map(toEditable));

  const updateRow = (id: string, patch: Partial<EditableRow>) =>
    setRows((r) => r?.map((row) => (row.id === id ? { ...row, ...patch } : row)) ?? r);

  const addRow = () =>
    setRows((r) => [
      ...(r ?? []),
      { id: newLocalId(), ip: '', hostnamesText: '', comment: null, enabled: true },
    ]);

  const removeRow = (id: string) => setRows((r) => r?.filter((row) => row.id !== id) ?? r);

  const discard = () => setRows(savedEntries.map(toEditable));

  const problems: string[] = [];
  for (const row of rows ?? []) {
    const label = row.ip || row.hostnamesText || 'a row';
    if (!row.ip.trim()) problems.push(`${label}: missing an IP address.`);
    if (!row.hostnamesText.trim()) problems.push(`${label}: needs at least one hostname.`);
  }

  const handleSave = () => {
    if (!rows || problems.length > 0) return;
    setSaveError(null);
    const entries: HostEntry[] = rows.map((r) => ({
      id: r.id,
      ip: r.ip.trim(),
      hostnames: r.hostnamesText.trim().split(/\s+/).filter(Boolean),
      comment: r.comment?.trim() || null,
      enabled: r.enabled,
    }));
    saveHosts.mutate(entries, {
      onSuccess: () => setRows(null),
      onError: (err) => setSaveError(err.message),
    });
  };

  if (error) {
    return (
      <ErrorPanel
        error={error}
        fallback="Couldn't read /etc/hosts."
        onRetry={() => void refetch()}
      />
    );
  }
  if (isLoading || rows === null) {
    return <Skeleton lines={4} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-warning-soft bg-warning-soft p-4 text-xs text-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Changes write to <code className="font-mono">/etc/hosts</code> and need your Mac password.
          A backup of the current file is kept, so you can always{' '}
          <button
            type="button"
            onClick={() => restoreHosts.mutate()}
            disabled={restoreHosts.isPending}
            className="font-semibold text-warning underline hover:no-underline"
          >
            restore the last one
          </button>
          .
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card/40">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/40 font-semibold text-fg-muted">
              <th className="w-10 px-3 py-2" aria-label="Enabled"></th>
              <th className="px-3 py-2">IP address</th>
              <th className="px-3 py-2">Hostnames (space-separated)</th>
              <th className="px-3 py-2">Comment</th>
              <th className="w-10 px-3 py-2" aria-label="Remove"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-fg-muted">
                  No managed entries. Click “Add entry” to create one.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-1.5">
                    <Switch
                      checked={row.enabled}
                      onChange={(enabled) => updateRow(row.id, { enabled })}
                      ariaLabel={row.enabled ? 'Entry enabled' : 'Entry disabled (commented out)'}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      size="sm"
                      mono
                      value={row.ip}
                      onChange={(e) => updateRow(row.id, { ip: e.target.value })}
                      placeholder="127.0.0.1"
                      className="h-8"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      size="sm"
                      mono
                      value={row.hostnamesText}
                      onChange={(e) => updateRow(row.id, { hostnamesText: e.target.value })}
                      placeholder="api.local"
                      className="h-8"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      size="sm"
                      value={row.comment ?? ''}
                      onChange={(e) => updateRow(row.id, { comment: e.target.value })}
                      placeholder="optional"
                      className="h-8"
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Button
                      variant="ghost"
                      size="iconSm"
                      aria-label="Remove entry"
                      onClick={() => removeRow(row.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1.5 size-3.5" />
          Add entry
        </Button>

        <div className="flex items-center gap-2">
          {dirty && (
            <Button variant="ghost" size="sm" onClick={discard} disabled={saveHosts.isPending}>
              Discard changes
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!dirty || problems.length > 0 || saveHosts.isPending}
          >
            {saveHosts.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      {problems.length > 0 && <p className="text-xs text-warning">{problems[0]}</p>}
      {saveError && <p className="text-xs text-destructive">{saveError}</p>}
    </div>
  );
};

const ChaosProxySection = () => {
  const { data: proxies = [], isLoading } = useChaosProxies();
  const startProxy = useStartChaosProxy();
  const stopProxy = useStopChaosProxy();

  // Strings while editing — `parseInt(v) || 0` snapped an emptied field back
  // to 0, so a port could never be cleared and retyped.
  const [targetPort, setTargetPort] = useState('8080');
  const [chaosPort, setChaosPort] = useState('9090');
  const [latencyMs, setLatencyMs] = useState('150');
  const [dropRatePct, setDropRatePct] = useState('0');
  const [reject, setReject] = useState(false);

  const target = Number(targetPort);
  const chaos = Number(chaosPort);
  const portOk = (p: number) => Number.isInteger(p) && p >= 1 && p <= 65535;
  const problem = !portOk(target)
    ? 'Target port must be 1–65535.'
    : !portOk(chaos)
      ? 'Chaos port must be 1–65535.'
      : target === chaos
        ? 'The chaos port must differ from the target port.'
        : proxies.some((p) => p.chaosPort === chaos)
          ? `A proxy already listens on :${chaos}.`
          : null;

  const digits =
    (set: (v: string) => void, max: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value.replace(/\D/g, '');
      set(v === '' ? '' : String(Math.min(Number(v), max)));
    };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) return;
    // Errors surface through the central toast — no second inline copy.
    startProxy.mutate({
      targetPort: target,
      chaosPort: chaos,
      profile: {
        latencyMs: Number(latencyMs) || 0,
        dropRatePct: Number(dropRatePct) || 0,
        reject,
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-fg">Start a chaos proxy</h3>
        <p className="mt-1 text-xs text-fg-muted">
          Point your app at <code className="font-mono">127.0.0.1:{chaosPort || '…'}</code> instead
          of <code className="font-mono">:{targetPort || '…'}</code> to test it against slow, flaky
          or refused connections.
        </p>

        <form onSubmit={handleStart} className="mt-4 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Field label="Target port" htmlFor="chaos-target-port">
              <Input
                id="chaos-target-port"
                size="sm"
                mono
                inputMode="numeric"
                value={targetPort}
                onChange={digits(setTargetPort, 65535)}
              />
            </Field>
            <Field label="Chaos port" htmlFor="chaos-proxy-port">
              <Input
                id="chaos-proxy-port"
                size="sm"
                mono
                inputMode="numeric"
                value={chaosPort}
                onChange={digits(setChaosPort, 65535)}
              />
            </Field>
            <Field label="Latency (ms)" htmlFor="chaos-latency">
              <Input
                id="chaos-latency"
                size="sm"
                mono
                inputMode="numeric"
                disabled={reject}
                value={latencyMs}
                onChange={digits(setLatencyMs, 60000)}
              />
            </Field>
            <Field label="Drop rate (%)" htmlFor="chaos-drop-rate">
              <Input
                id="chaos-drop-rate"
                size="sm"
                mono
                inputMode="numeric"
                disabled={reject}
                value={dropRatePct}
                onChange={digits(setDropRatePct, 100)}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label htmlFor="chaos-reject" className="flex items-center gap-3 text-[13px]">
              <Switch
                id="chaos-reject"
                ariaLabel="Refuse every connection"
                checked={reject}
                onChange={setReject}
              />
              <span>
                <span className="font-medium text-fg">Refuse every connection</span>
                <span className="block text-xs text-fg-muted">
                  Simulates the service being down.
                </span>
              </span>
            </label>
            <div className="flex items-center gap-3">
              {problem && <span className="text-xs text-destructive">{problem}</span>}
              <Button
                type="submit"
                variant="ember"
                size="sm"
                disabled={!!problem || startProxy.isPending}
              >
                {startProxy.isPending ? 'Starting…' : 'Start proxy'}
              </Button>
            </div>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-fg">Running proxies</h3>
        {isLoading ? (
          <Skeleton className="py-6" lines={2} />
        ) : proxies.length === 0 ? (
          <p className="py-6 text-center text-xs text-fg-muted">No chaos proxies running.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {proxies.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-[13px] font-medium text-fg">
                    :{p.chaosPort} → :{p.targetPort}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {p.profile.reject ? (
                      <span className="text-destructive">Refusing every connection</span>
                    ) : (
                      `${p.profile.latencyMs} ms latency · ${p.profile.dropRatePct}% dropped`
                    )}
                  </p>
                </div>
                <Button
                  variant="dangerOutline"
                  size="sm"
                  disabled={stopProxy.isPending && stopProxy.variables === p.id}
                  onClick={() => stopProxy.mutate(p.id)}
                >
                  Stop
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
