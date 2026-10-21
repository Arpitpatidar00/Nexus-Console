import { useState } from 'react';
import {
  Zap,
  Battery,
  BatteryCharging,
  Plug,
  Pause,
  AlertCircle,
  Activity,
  Layers,
  Search,
} from 'lucide-react';
import { formatBytes } from '@/shared/lib/format';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useEnergyReport, usePauseService } from '@/features/maclean/api/useMacHealth';

export const EnergyPage = () => {
  const { data: energy, isLoading } = useEnergyReport(true);
  const pauseMutation = usePauseService();
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const isBattery = energy?.powerSource === 'battery';
  const processes = energy?.processes ?? [];

  const filteredProcesses = processes.filter((p) => {
    if (filterCategory !== 'all' && p.category !== filterCategory) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.pid.toString().includes(q);
    }
    return true;
  });

  const handlePauseService = (name: string) => {
    pauseMutation.mutate(name);
  };

  const handlePauseAllUnplugged = () => {
    if (!energy?.unpluggedSuggestion) return;
    for (const name of energy.unpluggedSuggestion.candidateNames) {
      pauseMutation.mutate(name);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-fg">Energy Accounting</h1>
          <p className="mt-1 text-xs text-fg-muted">
            Real-time per-process idle wakeups, interrupt wakeups, and disk write measurement via{' '}
            <code className="font-mono text-ember-text">proc_pid_rusage</code>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Power Source Badge */}
          <div className="flex items-center gap-2 rounded-xl border border-border bg-paper px-3 py-2 shadow-sm">
            {isBattery ? (
              energy?.isCharging ? (
                <BatteryCharging className="h-5 w-5 text-success" />
              ) : (
                <Battery className="h-5 w-5 text-warning" />
              )
            ) : (
              <Plug className="h-5 w-5 text-info" />
            )}
            <div className="text-left">
              <span className="text-xs font-semibold text-fg">
                {isBattery ? 'Battery Power' : 'AC Power'}
              </span>
              <p className="text-[10px] text-fg-muted">
                {energy?.batteryPercent != null ? `${energy.batteryPercent}% charge` : 'Connected'}
                {energy?.isCharging ? ' (charging)' : ''}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Unplugged Suggestion Banner (Opt-in) */}
      {isBattery && energy?.unpluggedSuggestion && (
        <div className="flex items-center justify-between rounded-xl border border-warning-soft bg-warning-soft p-4 text-fg">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-warning" />
            <div>
              <p className="text-xs font-semibold text-fg">{energy.unpluggedSuggestion.message}</p>
              <p className="mt-0.5 text-[11px] text-fg-muted">
                Active wakeups:{' '}
                <span className="font-mono text-fg">
                  {energy.unpluggedSuggestion.candidateNames.join(', ')}
                </span>
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePauseAllUnplugged}
            disabled={pauseMutation.isPending}
            className="border-warning-soft text-warning hover:bg-warning-soft"
          >
            <Pause className="mr-1.5 h-3.5 w-3.5" />
            Pause Background Watchers
          </Button>
        </div>
      )}

      {/* Metrics Summary Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-paper p-4 shadow-sm">
          <span className="text-xs font-medium text-fg-muted">Monitored User Processes</span>
          <div className="mt-2 flex items-center gap-2">
            <Layers className="h-5 w-5 text-ember-text" />
            <span className="text-2xl font-bold text-fg">{processes.length}</span>
          </div>
          <p className="mt-1 text-[11px] text-fg-muted">Filtered strictly to your user account</p>
        </div>

        <div className="rounded-xl border border-border bg-paper p-4 shadow-sm">
          <span className="text-xs font-medium text-fg-muted">Total Idle Wakeups</span>
          <div className="mt-2 flex items-center gap-2">
            <Zap className="h-5 w-5 text-warning" />
            <span className="font-mono text-2xl font-bold text-fg">
              {processes.reduce((acc, p) => acc + p.idleWakeups, 0).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-fg-muted">Package wakeups from sleep states</p>
        </div>

        <div className="rounded-xl border border-border bg-paper p-4 shadow-sm">
          <span className="text-xs font-medium text-fg-muted">Interrupt Wakeups</span>
          <div className="mt-2 flex items-center gap-2">
            <Activity className="h-5 w-5 text-info" />
            <span className="font-mono text-2xl font-bold text-fg">
              {processes.reduce((acc, p) => acc + p.interruptWakeups, 0).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-fg-muted">Hardware interrupt wakeups triggered</p>
        </div>

        <div className="rounded-xl border border-border bg-paper p-4 shadow-sm">
          <span className="text-xs font-medium text-fg-muted">Disk Write I/O</span>
          <div className="mt-2 flex items-center gap-2">
            <span className="font-mono text-2xl font-bold text-fg">
              {formatBytes(processes.reduce((acc, p) => acc + p.diskWriteBytes, 0))}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-fg-muted">Total bytes written to disk</p>
        </div>
      </div>

      {/* Process Filter & Search Bar */}
      <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
        <div className="flex items-center gap-2">
          {['all', 'app', 'service', 'watcher', 'system'].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCategory(cat)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                filterCategory === cat
                  ? 'bg-ember text-white'
                  : 'border border-border bg-paper text-fg-muted hover:bg-accent hover:text-fg'
              }`}
            >
              {cat === 'all' ? 'All Processes' : cat + 's'}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-fg-muted" />
          <input
            type="text"
            placeholder="Search process or PID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-paper py-1.5 pr-3 pl-8 text-xs text-fg focus:border-ember focus:outline-none"
          />
        </div>
      </div>

      {/* Processes Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-paper shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-border bg-muted text-[11px] font-semibold tracking-wider text-fg-muted uppercase">
              <th className="px-4 py-2.5">PID</th>
              <th className="px-4 py-2.5">Process Name</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5 text-right">Idle Wakeups</th>
              <th className="px-4 py-2.5 text-right">Interrupts</th>
              <th className="px-4 py-2.5 text-right">CPU Time</th>
              <th className="px-4 py-2.5 text-right">Disk Writes</th>
              <th className="px-4 py-2.5 text-right">Impact Score</th>
              <th className="px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-xs">
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-fg-muted">
                  Sampling proc_pid_rusage…
                </td>
              </tr>
            ) : filteredProcesses.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-fg-muted">
                  No matching processes found.
                </td>
              </tr>
            ) : (
              filteredProcesses.slice(0, 50).map((proc) => (
                <tr key={proc.pid} className="transition-colors hover:bg-accent">
                  <td className="px-4 py-2.5 font-mono text-[11px] text-fg-muted">{proc.pid}</td>
                  <td className="px-4 py-2.5 font-medium text-fg">{proc.name}</td>
                  <td className="px-4 py-2.5">
                    <Badge variant="neutral" className="text-[10px] uppercase">
                      {proc.category}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-fg-muted">
                    {proc.idleWakeups.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-fg-muted">
                    {proc.interruptWakeups.toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-fg-muted">
                    {(proc.cpuTimeMs / 1000).toFixed(2)}s
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-fg-muted">
                    {formatBytes(proc.diskWriteBytes)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-ember-text">
                    {proc.energyImpactScore.toFixed(1)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {proc.category === 'service' && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePauseService(proc.name)}
                        className="h-6 px-2 text-[10px] text-fg-muted hover:text-destructive"
                      >
                        <Pause className="mr-1 h-3 w-3" />
                        Pause
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
