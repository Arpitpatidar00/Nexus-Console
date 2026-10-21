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

export const NetworkPage = () => {
  const [activeTab, setActiveTab] = useState<'bandwidth' | 'hosts' | 'chaos'>('bandwidth');

  // Network & Bandwidth
  const { data: netInfo } = useNetworkInfo();
  const { data: bandwidth = [], isLoading: bwLoading } = useProcessBandwidth();
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
            <Wifi className="h-6 w-6 text-cyan-400" />
            Network & Chaos Engineering
          </h1>
          <p className="text-muted-fg mt-1 text-xs">
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
                ? 'text-accent-fg bg-accent shadow-sm'
                : 'text-muted-fg hover:text-fg'
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
                ? 'text-accent-fg bg-accent shadow-sm'
                : 'text-muted-fg hover:text-fg'
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
                ? 'text-accent-fg bg-accent shadow-sm'
                : 'text-muted-fg hover:text-fg'
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
              <span className="text-muted-fg text-xs font-semibold tracking-wider uppercase">
                Primary Network Interface
              </span>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-fg">
                    {netInfo?.primary_interface || 'en0'}
                  </div>
                  <div className="text-muted-fg mt-1 font-mono text-xs">
                    IPv4: {netInfo?.ipv4_address || '127.0.0.1'}
                  </div>
                </div>
                <Badge variant="default" className="text-xs">
                  Active
                </Badge>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card/40 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-fg text-xs font-semibold tracking-wider uppercase">
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
                {netInfo?.dns_servers.map((dns) => (
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
                <Activity className="h-4 w-4 text-cyan-400" />
                Live Per-App Bandwidth (nettop live sampler)
              </div>
              <Badge variant="neutral" className="text-[10px]">
                Polling 3s
              </Badge>
            </div>

            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="text-muted-fg border-b border-border bg-muted/40 font-semibold">
                  <th className="px-4 py-3">Process Name</th>
                  <th className="px-4 py-3">PID</th>
                  <th className="px-4 py-3 text-right">Bytes In</th>
                  <th className="px-4 py-3 text-right">Bytes Out</th>
                  <th className="px-4 py-3 text-right">Total Traffic</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bwLoading && bandwidth.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted-fg px-4 py-8 text-center">
                      Sampling nettop process network data...
                    </td>
                  </tr>
                ) : bandwidth.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-muted-fg px-4 py-8 text-center">
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
                      <td className="text-muted-fg px-4 py-3 font-mono">{p.pid}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-400">
                        ↓ {formatBytes(p.bytes_in)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sky-400">
                        ↑ {formatBytes(p.bytes_out)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-fg">
                        {formatBytes(p.bytes_in + p.bytes_out)}
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
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
            <div>
              <span className="font-bold">Coming back after safety review (T-05):</span>
              <p className="mt-0.5 text-amber-300/80">
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

  const [targetPort, setTargetPort] = useState(8080);
  const [chaosPort, setChaosPort] = useState(9090);
  const [latencyMs, setLatencyMs] = useState(150);
  const [dropRatePct, setDropRatePct] = useState(0);
  const [reject, setReject] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await startProxy.mutateAsync({
        targetPort,
        chaosPort,
        profile: {
          latency_ms: latencyMs,
          drop_rate_pct: dropRatePct,
          reject,
        },
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">Start TCP Chaos Proxy (Tokio Engine)</h3>
        <p className="mt-1 text-xs text-muted">
          Routes connections from <code>127.0.0.1:&lt;chaosPort&gt;</code> to your target service
          with configurable latency, packet drops, or immediate rejection.
        </p>

        <form
          onSubmit={handleStart}
          className="mt-4 grid grid-cols-1 items-end gap-4 sm:grid-cols-2 md:grid-cols-5"
        >
          <div>
            <label
              htmlFor="chaos-target-port"
              className="mb-1 block text-xs font-medium text-muted"
            >
              Target Port
            </label>
            <input
              id="chaos-target-port"
              type="number"
              min={1}
              max={65535}
              value={targetPort}
              onChange={(e) => setTargetPort(parseInt(e.target.value) || 0)}
              className="bg-bg w-full rounded border border-border px-3 py-1.5 text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label htmlFor="chaos-proxy-port" className="mb-1 block text-xs font-medium text-muted">
              Chaos Port
            </label>
            <input
              id="chaos-proxy-port"
              type="number"
              min={1}
              max={65535}
              value={chaosPort}
              onChange={(e) => setChaosPort(parseInt(e.target.value) || 0)}
              className="bg-bg w-full rounded border border-border px-3 py-1.5 text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label htmlFor="chaos-latency" className="mb-1 block text-xs font-medium text-muted">
              Latency (ms)
            </label>
            <input
              id="chaos-latency"
              type="number"
              min={0}
              max={60000}
              value={latencyMs}
              onChange={(e) => setLatencyMs(parseInt(e.target.value) || 0)}
              className="bg-bg w-full rounded border border-border px-3 py-1.5 text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="chaos-drop-rate" className="mb-1 block text-xs font-medium text-muted">
              Drop Rate (%)
            </label>
            <input
              id="chaos-drop-rate"
              type="number"
              min={0}
              max={100}
              value={dropRatePct}
              onChange={(e) => setDropRatePct(parseInt(e.target.value) || 0)}
              className="bg-bg w-full rounded border border-border px-3 py-1.5 text-xs focus:ring-1 focus:ring-cyan-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={reject}
                onChange={(e) => setReject(e.target.checked)}
                className="rounded border-border text-cyan-500 focus:ring-0"
              />
              Reject
            </label>
            <Button
              type="submit"
              disabled={startProxy.isPending}
              className="ml-auto h-auto bg-cyan-600 px-3 py-1.5 text-xs text-white hover:bg-cyan-500"
            >
              {startProxy.isPending ? 'Starting...' : 'Start Proxy'}
            </Button>
          </div>
        </form>

        {errorMsg && <div className="mt-3 text-xs text-red-400">{errorMsg}</div>}
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">Active Chaos Proxies</h3>
        {isLoading ? (
          <div className="py-6 text-center text-xs text-muted">Loading active proxies...</div>
        ) : proxies.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted">
            No active chaos proxies running.
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border/50">
            {proxies.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-3 text-xs">
                <div>
                  <div className="font-mono font-medium text-cyan-400">
                    127.0.0.1:{p.chaosPort} &rarr; 127.0.0.1:{p.targetPort}
                  </div>
                  <div className="mt-0.5 text-muted">
                    {p.profile.reject ? (
                      <span className="font-medium text-red-400">Rejecting all traffic</span>
                    ) : (
                      <span>
                        Latency: {p.profile.latency_ms}ms &bull; Drops: {p.profile.drop_rate_pct}%
                      </span>
                    )}
                  </div>
                </div>

                <Button
                  onClick={() => stopProxy.mutate(p.id)}
                  disabled={stopProxy.isPending}
                  className="h-auto bg-red-500/20 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/30"
                >
                  Stop
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
