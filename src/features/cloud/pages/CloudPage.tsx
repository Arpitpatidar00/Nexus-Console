import { useState } from 'react';
import {
  Cloud,
  Server,
  Database,
  DollarSign,
  Play,
  Square,
  RotateCw,
  RefreshCw,
  AlertTriangle,
  Search,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import {
  useAwsProfiles,
  useEc2Instances,
  useS3Buckets,
  useAwsCosts,
  useEc2Action,
} from '../api/useCloud';
import type { Ec2Instance } from '../api/cloud.schema';

export const CloudPage = () => {
  const [selectedProfile, setSelectedProfile] = useState<string>('default');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'instances' | 'buckets'>('instances');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionModal, setActionModal] = useState<{
    open: boolean;
    instance?: Ec2Instance;
    action?: 'start' | 'stop' | 'reboot';
  }>({ open: false });

  const { data: profiles = ['default'] } = useAwsProfiles();
  const {
    data: instances = [],
    isLoading: instancesLoading,
    refetch: refetchInstances,
  } = useEc2Instances(selectedProfile, selectedRegion);
  const {
    data: buckets = [],
    isLoading: bucketsLoading,
    refetch: refetchBuckets,
  } = useS3Buckets(selectedProfile);
  const {
    data: costReport,
    isLoading: costsLoading,
    refetch: refetchCosts,
  } = useAwsCosts(selectedProfile);
  const ec2ActionMutation = useEc2Action();

  const handleAction = async () => {
    if (!actionModal.instance || !actionModal.action) return;
    try {
      await ec2ActionMutation.mutateAsync({
        profile: selectedProfile,
        region: actionModal.instance.region,
        instanceId: actionModal.instance.id,
        action: actionModal.action,
      });
      setActionModal({ open: false });
    } catch {
      // Handled by UI/mutation
    }
  };

  const filteredInstances = instances.filter(
    (i) =>
      i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (i.public_ip && i.public_ip.includes(searchTerm)),
  );

  const filteredBuckets = buckets.filter((b) =>
    b.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 text-fg">
      {/* Top Header */}
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Cloud className="h-6 w-6 text-sky-400" />
            Cloud & AWS Manager
          </h1>
          <p className="text-muted-fg mt-1 text-xs">
            AWS profile configuration, EC2 instance states, S3 storage buckets, and cached Cost
            Explorer insights.
          </p>
        </div>

        {/* Profile & Region selectors */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="aws-profile-select" className="text-muted-fg text-xs font-semibold">
              Profile:
            </label>
            <select
              id="aws-profile-select"
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              className="rounded border border-border bg-card px-2.5 py-1 text-xs font-medium text-fg shadow-sm focus:outline-none"
            >
              {profiles.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="aws-region-select" className="text-muted-fg text-xs font-semibold">
              Region:
            </label>
            <select
              id="aws-region-select"
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="rounded border border-border bg-card px-2.5 py-1 text-xs font-medium text-fg shadow-sm focus:outline-none"
            >
              <option value="">All Regions</option>
              <option value="us-east-1">us-east-1 (N. Virginia)</option>
              <option value="us-west-2">us-west-2 (Oregon)</option>
              <option value="eu-west-1">eu-west-1 (Ireland)</option>
              <option value="eu-central-1">eu-central-1 (Frankfurt)</option>
              <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Daily Cost Card */}
      <div className="rounded-lg border border-border bg-card/60 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-muted-fg text-xs font-semibold tracking-wider uppercase">
                  Month-to-Date Cost (Cached 24h)
                </span>
                <Badge variant="neutral" className="text-[10px]">
                  Daily Cache Active
                </Badge>
              </div>
              <div className="mt-0.5 text-2xl font-extrabold text-fg">
                {costsLoading ? (
                  <span className="text-muted-fg text-sm font-normal">Loading cached costs...</span>
                ) : costReport ? (
                  `$${costReport.month_to_date_total.toFixed(2)} ${costReport.currency}`
                ) : (
                  'Not Available'
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {costReport?.top_services && costReport.top_services.length > 0 && (
              <div className="hidden flex-col gap-1 text-right text-xs lg:flex">
                {costReport.top_services.slice(0, 2).map((s) => (
                  <div key={s.service} className="text-muted-fg">
                    <span className="font-medium text-fg">{s.service.split(' - ')[0]}:</span> $
                    {s.amount.toFixed(2)}
                  </div>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchCosts()}
              className="flex items-center gap-1.5 text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              Force Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex rounded-lg border border-border bg-card/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('instances')}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'instances'
                ? 'text-accent-fg bg-accent shadow-sm'
                : 'text-muted-fg hover:text-fg'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            EC2 Instances ({instances.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('buckets')}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'buckets'
                ? 'text-accent-fg bg-accent shadow-sm'
                : 'text-muted-fg hover:text-fg'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            S3 Buckets ({buckets.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="text-muted-fg absolute top-2.5 left-2.5 h-3.5 w-3.5" />
            <input
              type="text"
              placeholder={`Filter ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="placeholder:text-muted-fg rounded-md border border-border bg-card/60 py-1.5 pr-3 pl-8 text-xs text-fg focus:outline-none"
            />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (activeTab === 'instances' ? refetchInstances() : refetchBuckets())}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tab Panels */}
      {activeTab === 'instances' ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card/40 shadow-sm">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="text-muted-fg border-b border-border bg-muted/40 font-semibold">
                <th className="px-4 py-3">Name / Instance ID</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Public IP</th>
                <th className="px-4 py-3">Private IP</th>
                <th className="px-4 py-3">Region</th>
                <th className="px-4 py-3 text-right">Lifecycle Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {instancesLoading ? (
                <tr>
                  <td colSpan={7} className="text-muted-fg px-4 py-8 text-center">
                    Fetching EC2 instances from AWS CLI...
                  </td>
                </tr>
              ) : filteredInstances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted-fg px-4 py-8 text-center">
                    No EC2 instances found matching criteria.
                  </td>
                </tr>
              ) : (
                filteredInstances.map((inst) => {
                  const isRunning = inst.state.toLowerCase() === 'running';
                  const isStopped = inst.state.toLowerCase() === 'stopped';

                  return (
                    <tr key={inst.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-fg">{inst.name || 'Unnamed'}</span>
                          {inst.is_prod && (
                            <Badge variant="destructive" className="text-[10px] uppercase">
                              Production
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-fg font-mono text-[11px]">{inst.id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={isRunning ? 'success' : isStopped ? 'neutral' : 'warning'}
                          className="text-[10px] capitalize"
                        >
                          {inst.state}
                        </Badge>
                      </td>
                      <td className="text-muted-fg px-4 py-3 font-mono">{inst.instance_type}</td>
                      <td className="px-4 py-3 font-mono text-fg">{inst.public_ip || '—'}</td>
                      <td className="text-muted-fg px-4 py-3 font-mono">
                        {inst.private_ip || '—'}
                      </td>
                      <td className="text-muted-fg px-4 py-3">{inst.region}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isStopped && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px] text-emerald-400 hover:text-emerald-300"
                              onClick={() =>
                                setActionModal({ open: true, instance: inst, action: 'start' })
                              }
                            >
                              <Play className="mr-1 h-3 w-3" />
                              Start
                            </Button>
                          )}
                          {isRunning && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-amber-400 hover:text-amber-300"
                                onClick={() =>
                                  setActionModal({ open: true, instance: inst, action: 'stop' })
                                }
                              >
                                <Square className="mr-1 h-3 w-3" />
                                Stop
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-[11px] text-sky-400 hover:text-sky-300"
                                onClick={() =>
                                  setActionModal({ open: true, instance: inst, action: 'reboot' })
                                }
                              >
                                <RotateCw className="mr-1 h-3 w-3" />
                                Reboot
                              </Button>
                            </>
                          )}
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
                <th className="px-4 py-3">Bucket Name</th>
                <th className="px-4 py-3">Creation Date</th>
                <th className="px-4 py-3">Region</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bucketsLoading ? (
                <tr>
                  <td colSpan={3} className="text-muted-fg px-4 py-8 text-center">
                    Fetching S3 buckets...
                  </td>
                </tr>
              ) : filteredBuckets.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-muted-fg px-4 py-8 text-center">
                    No S3 buckets found.
                  </td>
                </tr>
              ) : (
                filteredBuckets.map((bucket) => (
                  <tr key={bucket.name} className="transition-colors hover:bg-muted/20">
                    <td className="flex items-center gap-2 px-4 py-3 font-mono font-medium text-fg">
                      <Database className="h-3.5 w-3.5 text-amber-400" />
                      {bucket.name}
                    </td>
                    <td className="text-muted-fg px-4 py-3">
                      {new Date(bucket.creation_date).toLocaleDateString()}
                    </td>
                    <td className="text-muted-fg px-4 py-3">{bucket.region || 'global'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Dialog for Destructive / Production Actions */}
      <Dialog.Root
        open={actionModal.open}
        onOpenChange={(open) => setActionModal({ ...actionModal, open })}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-2xl">
            <Dialog.Title className="flex items-center gap-2 text-base font-bold text-fg">
              {actionModal.instance?.is_prod && (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              )}
              Confirm {actionModal.action?.toUpperCase()} Action
            </Dialog.Title>
            <Dialog.Description className="text-muted-fg mt-2 text-xs">
              {actionModal.instance?.is_prod ? (
                <div className="rounded border border-destructive/40 bg-destructive/10 p-3 font-semibold text-destructive">
                  ⚠️ WARNING: This is a marked PRODUCTION instance! Performing a{' '}
                  {actionModal.action} may impact active users and customer traffic.
                </div>
              ) : (
                `Are you sure you want to ${actionModal.action} this instance?`
              )}
            </Dialog.Description>

            <div className="mt-4 space-y-1 rounded border border-border bg-muted/20 p-3 text-xs">
              <div>
                <span className="text-muted-fg font-semibold">Name:</span>{' '}
                {actionModal.instance?.name || 'Unnamed'}
              </div>
              <div className="font-mono">
                <span className="text-muted-fg font-semibold">ID:</span> {actionModal.instance?.id}
              </div>
              <div>
                <span className="text-muted-fg font-semibold">Region:</span>{' '}
                {actionModal.instance?.region}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setActionModal({ open: false })}>
                Cancel
              </Button>
              <Button
                variant={actionModal.instance?.is_prod ? 'destructive' : 'default'}
                size="sm"
                onClick={handleAction}
                disabled={ec2ActionMutation.isPending}
              >
                {ec2ActionMutation.isPending
                  ? 'Executing...'
                  : `Confirm ${actionModal.action?.toUpperCase()}`}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
