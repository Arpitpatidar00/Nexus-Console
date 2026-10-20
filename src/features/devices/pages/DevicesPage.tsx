import { useState } from 'react';
import { Smartphone, Play, Square, ExternalLink, Trash2, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import {
  useIosSimulators,
  useControlIosSimulator,
  useAndroidAvds,
  useLaunchAndroidAvd,
} from '../api/useDevices';

export const DevicesPage = () => {
  const [activeTab, setActiveTab] = useState<'ios' | 'android'>('ios');
  const [searchTerm, setSearchTerm] = useState('');

  const { data: iosDevices = [], isLoading: iosLoading, refetch: refetchIos } = useIosSimulators();
  const {
    data: androidAvds = [],
    isLoading: androidLoading,
    refetch: refetchAndroid,
  } = useAndroidAvds();
  const controlIosMutation = useControlIosSimulator();
  const launchAndroidMutation = useLaunchAndroidAvd();

  const filteredIos = iosDevices.filter(
    (d) =>
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.runtime.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.udid.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const filteredAndroid = androidAvds.filter((a) =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 text-fg">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Smartphone className="h-6 w-6 text-violet-400" />
            Simulators & Emulators Manager
          </h1>
          <p className="text-muted-fg mt-1 text-xs">
            Manage local iOS Simulators (simctl) and Android AVDs without opening heavy IDEs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => controlIosMutation.mutate({ udid: '', action: 'open' })}
            className="flex items-center gap-1.5 text-xs"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Simulator.app
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (activeTab === 'ios' ? refetchIos() : refetchAndroid())}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex rounded-lg border border-border bg-card/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('ios')}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'ios'
                ? 'text-accent-fg bg-accent shadow-sm'
                : 'text-muted-fg hover:text-fg'
            }`}
          >
            iOS Simulators ({iosDevices.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('android')}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'android'
                ? 'text-accent-fg bg-accent shadow-sm'
                : 'text-muted-fg hover:text-fg'
            }`}
          >
            Android AVDs ({androidAvds.length})
          </button>
        </div>

        <div className="relative">
          <Search className="text-muted-fg absolute top-2.5 left-2.5 h-3.5 w-3.5" />
          <input
            type="text"
            placeholder={`Search ${activeTab === 'ios' ? 'simulators' : 'AVDs'}...`}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="placeholder:text-muted-fg rounded-md border border-border bg-card/60 py-1.5 pr-3 pl-8 text-xs text-fg focus:outline-none"
          />
        </div>
      </div>

      {/* Content */}
      {activeTab === 'ios' ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card/40 shadow-sm">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="text-muted-fg border-b border-border bg-muted/40 font-semibold">
                <th className="px-4 py-3">Device Name & UDID</th>
                <th className="px-4 py-3">Runtime</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {iosLoading ? (
                <tr>
                  <td colSpan={4} className="text-muted-fg px-4 py-8 text-center">
                    Querying xcrun simctl devices...
                  </td>
                </tr>
              ) : filteredIos.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-muted-fg px-4 py-8 text-center">
                    No iOS simulators found matching search.
                  </td>
                </tr>
              ) : (
                filteredIos.map((sim) => {
                  const isBooted = sim.state.toLowerCase() === 'booted';
                  return (
                    <tr key={sim.udid} className="transition-colors hover:bg-muted/20">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-fg">{sim.name}</div>
                        <div className="text-muted-fg font-mono text-[10px]">{sim.udid}</div>
                      </td>
                      <td className="text-muted-fg px-4 py-3">{sim.runtime}</td>
                      <td className="px-4 py-3">
                        <Badge variant={isBooted ? 'success' : 'neutral'} className="text-[10px]">
                          {sim.state}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isBooted ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-amber-400 hover:text-amber-300"
                              onClick={() =>
                                controlIosMutation.mutate({ udid: sim.udid, action: 'shutdown' })
                              }
                            >
                              <Square className="mr-1 h-3 w-3" />
                              Shutdown
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-emerald-400 hover:text-emerald-300"
                              onClick={() =>
                                controlIosMutation.mutate({ udid: sim.udid, action: 'boot' })
                              }
                            >
                              <Play className="mr-1 h-3 w-3" />
                              Boot
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-fg h-7 px-2 text-[11px] hover:text-destructive"
                            onClick={() =>
                              controlIosMutation.mutate({ udid: sim.udid, action: 'erase' })
                            }
                            title="Erase Simulator Data"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card/40 shadow-sm">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="text-muted-fg border-b border-border bg-muted/40 font-semibold">
                <th className="px-4 py-3">AVD Name</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Launch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {androidLoading ? (
                <tr>
                  <td colSpan={3} className="text-muted-fg px-4 py-8 text-center">
                    Querying emulator -list-avds...
                  </td>
                </tr>
              ) : filteredAndroid.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-muted-fg px-4 py-8 text-center">
                    No Android Virtual Devices (AVDs) configured in Android SDK.
                  </td>
                </tr>
              ) : (
                filteredAndroid.map((avd) => (
                  <tr key={avd.name} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono font-semibold text-fg">{avd.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={avd.running ? 'success' : 'neutral'} className="text-[10px]">
                        {avd.running ? 'Running' : 'Ready'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={avd.running}
                        className="h-7 px-2.5 text-[11px] text-emerald-400 hover:text-emerald-300"
                        onClick={() => launchAndroidMutation.mutate(avd.name)}
                      >
                        <Play className="mr-1 h-3 w-3" />
                        Launch AVD
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
