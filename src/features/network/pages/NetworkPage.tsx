import { useState } from 'react';
import { Wifi, Activity, ShieldCheck, RotateCw, Sliders } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useNetworkInfo, useProcessBandwidth, useFlushDns } from '../api/useNetwork';

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

      {activeTab === 'chaos' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
            <div>
              <span className="font-bold">Coming back after safety review (T-09):</span>
              <p className="mt-0.5 text-amber-300/80">
                The TCP chaos proxy is temporarily frozen while the real Tokio TCP proxy engine with
                latency, packet drops, and bandwidth throttling is implemented in Phase B.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
