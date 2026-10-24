import { useState } from 'react';
import { Wifi, Activity, ShieldCheck, RotateCw, Sliders } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import {
  useNetworkInfo,
  useProcessBandwidth,
  useFlushDns,
  useChaosProxies,
  useStartChaosProxy,
  useStopChaosProxy,
} from '../api/useNetwork';
import { Skeleton } from '@/shared/ui/Skeleton';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';
import { Field, Input } from '@/shared/ui/Field';
import { Switch } from '@/shared/ui/Switch';

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
              <span className="text-xs font-semibold tracking-wider text-fg-muted uppercase">
                Primary Network Interface
              </span>
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
                <span className="text-xs font-semibold tracking-wider text-fg-muted uppercase">
                  System DNS Resolvers
                </span>
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

      {activeTab === 'hosts' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-warning-soft bg-warning-soft p-4 text-xs text-warning">
            <div>
              <span className="font-bold">Coming back after safety review (T-05):</span>
              <p className="mt-0.5 text-warning">
                The /etc/hosts editor is temporarily frozen while being rewritten with atomic file
                writes, line preservation, input validation, and mutation gates.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'chaos' && <ChaosProxySection />}
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
