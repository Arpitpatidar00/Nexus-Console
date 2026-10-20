import { useState } from 'react';
import {
  Wifi,
  Activity,
  ShieldCheck,
  RotateCw,
  Plus,
  Trash2,
  Save,
  Sliders,
  Play,
  Zap,
} from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import {
  useNetworkInfo,
  useProcessBandwidth,
  useFlushDns,
  useHostsEntries,
  useSaveHosts,
  useStartChaosProxy,
  useSimulateChaos,
} from '../api/useNetwork';
import type { HostEntry, ChaosProfile } from '../api/network.schema';

export const NetworkPage = () => {
  const [activeTab, setActiveTab] = useState<'bandwidth' | 'hosts' | 'chaos'>('bandwidth');

  // Network & Bandwidth
  const { data: netInfo } = useNetworkInfo();
  const { data: bandwidth = [], isLoading: bwLoading } = useProcessBandwidth();
  const flushDnsMutation = useFlushDns();

  // Hosts Editor State
  const { data: hosts = [], isLoading: hostsLoading } = useHostsEntries();
  const saveHostsMutation = useSaveHosts();
  const [editingHosts, setEditingHosts] = useState<HostEntry[] | null>(null);

  const currentHosts = editingHosts !== null ? editingHosts : hosts;

  const handleToggleHost = (id: string) => {
    const next = currentHosts.map((h) => (h.id === id ? { ...h, enabled: !h.enabled } : h));
    setEditingHosts(next);
  };

  const handleRemoveHost = (id: string) => {
    const next = currentHosts.filter((h) => h.id !== id);
    setEditingHosts(next);
  };

  const handleAddHost = () => {
    const newEntry: HostEntry = {
      id: `custom-${Date.now()}`,
      ip: '127.0.0.1',
      hostnames: ['my-local.dev'],
      comment: 'development local override',
      enabled: true,
    };
    setEditingHosts([...currentHosts, newEntry]);
  };

  const handleSaveHosts = async () => {
    await saveHostsMutation.mutateAsync(currentHosts);
    setEditingHosts(null);
  };

  // Chaos Proxy State
  const [targetPort, setTargetPort] = useState(5432);
  const [chaosPort, setChaosPort] = useState(5433);
  const [latencyMs, setLatencyMs] = useState(150);
  const [dropRatePct, setDropRatePct] = useState(10);
  const [rejectConn, setRejectConn] = useState(false);
  const [chaosActive, setChaosActive] = useState(false);
  const [simulationResult, setSimulationResult] = useState<string | null>(null);

  const startChaosMutation = useStartChaosProxy();
  const simulateChaosMutation = useSimulateChaos();

  const handleStartChaos = async () => {
    const profile: ChaosProfile = {
      latency_ms: latencyMs,
      drop_rate_pct: dropRatePct,
      reject: rejectConn,
    };
    await startChaosMutation.mutateAsync({ targetPort, chaosPort, profile });
    setChaosActive(true);
  };

  const handleTestSimulation = async () => {
    const profile: ChaosProfile = {
      latency_ms: latencyMs,
      drop_rate_pct: dropRatePct,
      reject: rejectConn,
    };
    const dropped = await simulateChaosMutation.mutateAsync(profile);
    setSimulationResult(
      dropped
        ? `Simulation: Packet DROPPED or REJECTED according to profile (${dropRatePct}% rate / reject=${rejectConn})`
        : `Simulation: Packet PASSED with ${latencyMs}ms injected latency`,
    );
  };

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
          <div className="flex items-center justify-between">
            <div className="text-muted-fg text-xs">
              Toggle or override entries in{' '}
              <code className="rounded bg-black/20 px-1 py-0.5 font-mono">/etc/hosts</code>. Every
              modification automatically snapshots a backup in your Application Support directory.
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleAddHost} className="text-xs">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add Entry
              </Button>
              {editingHosts !== null && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSaveHosts}
                  disabled={saveHostsMutation.isPending}
                  className="text-xs"
                >
                  <Save className="mr-1 h-3.5 w-3.5" />
                  {saveHostsMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card/40 shadow-sm">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="text-muted-fg border-b border-border bg-muted/40 font-semibold">
                  <th className="w-12 px-4 py-3">Active</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3">Hostnames</th>
                  <th className="px-4 py-3">Comment / Purpose</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {hostsLoading ? (
                  <tr>
                    <td colSpan={5} className="text-muted-fg px-4 py-8 text-center">
                      Reading /etc/hosts entries...
                    </td>
                  </tr>
                ) : (
                  currentHosts.map((entry) => (
                    <tr key={entry.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Toggle host ${entry.ip}`}
                          checked={entry.enabled}
                          onChange={() => handleToggleHost(entry.id)}
                          className="rounded border-border text-primary focus:ring-0"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-fg">{entry.ip}</td>
                      <td className="text-muted-fg px-4 py-3 font-mono">
                        {entry.hostnames.join(' ')}
                      </td>
                      <td className="text-muted-fg px-4 py-3">{entry.comment || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveHost(entry.id)}
                          className="text-muted-fg hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'chaos' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-border bg-card/40 p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
              <Zap className="h-4 w-4 text-amber-400" />
              TCP Chaos Proxy Configuration
            </h3>
            <p className="text-muted-fg mt-1 text-xs">
              Intercept database or HTTP connections to test how your microservices and applications
              handle latency spikes, packet loss, or abrupt network disconnections.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label htmlFor="target-port-input" className="text-xs font-semibold text-fg">
                    Target Service Port
                  </label>
                  <input
                    id="target-port-input"
                    type="number"
                    value={targetPort}
                    onChange={(e) => setTargetPort(parseInt(e.target.value, 10) || 5432)}
                    className="mt-1 w-full rounded border border-border bg-muted/20 px-3 py-1.5 font-mono text-xs text-fg focus:outline-none"
                  />
                  <span className="text-muted-fg text-[11px]">
                    Port of the destination service (e.g. 5432 for Postgres)
                  </span>
                </div>

                <div>
                  <label htmlFor="chaos-proxy-port-input" className="text-xs font-semibold text-fg">
                    Chaos Proxy Listen Port
                  </label>
                  <input
                    id="chaos-proxy-port-input"
                    type="number"
                    value={chaosPort}
                    onChange={(e) => setChaosPort(parseInt(e.target.value, 10) || 5433)}
                    className="mt-1 w-full rounded border border-border bg-muted/20 px-3 py-1.5 font-mono text-xs text-fg focus:outline-none"
                  />
                  <span className="text-muted-fg text-[11px]">
                    Port your application should connect to for chaos testing
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="latency-slider"
                    className="flex justify-between text-xs font-semibold text-fg"
                  >
                    <span>Latency Injection</span>
                    <span className="font-mono text-amber-400">{latencyMs} ms</span>
                  </label>
                  <input
                    id="latency-slider"
                    type="range"
                    min={0}
                    max={2000}
                    step={25}
                    value={latencyMs}
                    onChange={(e) => setLatencyMs(parseInt(e.target.value, 10))}
                    className="mt-2 w-full"
                  />
                </div>

                <div>
                  <label
                    htmlFor="drop-rate-slider"
                    className="flex justify-between text-xs font-semibold text-fg"
                  >
                    <span>Packet Drop Rate</span>
                    <span className="font-mono text-destructive">{dropRatePct} %</span>
                  </label>
                  <input
                    id="drop-rate-slider"
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={dropRatePct}
                    onChange={(e) => setDropRatePct(parseInt(e.target.value, 10))}
                    className="mt-2 w-full"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    id="reject-toggle"
                    type="checkbox"
                    checked={rejectConn}
                    onChange={(e) => setRejectConn(e.target.checked)}
                    className="rounded border-border text-destructive focus:ring-0"
                  />
                  <label
                    htmlFor="reject-toggle"
                    className="cursor-pointer text-xs font-semibold text-fg"
                  >
                    Reject Incoming Connections (Simulate Hard Offline)
                  </label>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestSimulation}
                  disabled={simulateChaosMutation.isPending}
                  className="text-xs"
                >
                  <Play className="mr-1 h-3 w-3" />
                  Test Simulation Rule
                </Button>
                {simulationResult && (
                  <span className="font-mono text-xs text-amber-300">{simulationResult}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {chaosActive && (
                  <Badge variant="destructive" className="animate-pulse text-xs">
                    Chaos Proxy Running on :{chaosPort}
                  </Badge>
                )}
                <Button
                  variant={chaosActive ? 'destructive' : 'default'}
                  size="sm"
                  onClick={handleStartChaos}
                  disabled={startChaosMutation.isPending}
                  className="text-xs"
                >
                  {chaosActive ? 'Restart Chaos Proxy' : 'Start Chaos Proxy'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
