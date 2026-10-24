import { useState } from 'react';
import {
  Cloud,
  Server,
  Database,
  DollarSign,
  RefreshCw,
  Search,
  Play,
  Square,
  RotateCw,
} from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { Input, Select } from '@/shared/ui/Field';
import {
  useAwsProfiles,
  useEc2Instances,
  useS3Buckets,
  useAwsCosts,
  useEc2Action,
} from '../api/useCloud';
import type { Ec2Instance } from '../api/cloud.schema';
import { ConsentGate } from '@/shared/privacy';
import { RequiresTool } from '@/shared/tools';
import { ErrorPanel } from '@/shared/ui/ErrorPanel';

/** Start/stop/reboot for one instance — the native confirm (and, for a
 * production instance, its red styling) comes from Rust's `aws_instance_action`
 * mutation gate, not from anything here. */
const InstanceActions = ({ inst, profile }: { inst: Ec2Instance; profile: string }) => {
  const ec2Action = useEc2Action();
  const isRunning = inst.state.toLowerCase() === 'running';
  const isStopped = inst.state.toLowerCase() === 'stopped';
  const run = (action: 'start' | 'stop' | 'reboot') =>
    ec2Action.mutate({ profile, region: inst.region, instanceId: inst.id, action });

  if (!isRunning && !isStopped) {
    // Pending/transitional state (e.g. "stopping") — nothing to offer yet.
    return <span className="text-[11px] text-fg-muted italic">{inst.state}</span>;
  }

  return (
    <div className="flex items-center justify-end gap-1">
      {isStopped && (
        <Button
          variant="ghost"
          size="iconSm"
          aria-label="Start instance"
          title="Start"
          disabled={ec2Action.isPending}
          onClick={() => run('start')}
        >
          <Play className="size-3.5" />
        </Button>
      )}
      {isRunning && (
        <>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Stop instance"
            title="Stop"
            disabled={ec2Action.isPending}
            onClick={() => run('stop')}
          >
            <Square className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Reboot instance"
            title="Reboot"
            disabled={ec2Action.isPending}
            onClick={() => run('reboot')}
          >
            <RotateCw className="size-3.5" />
          </Button>
        </>
      )}
    </div>
  );
};

const CloudView = () => {
  const [selectedProfile, setSelectedProfile] = useState<string>('default');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'instances' | 'buckets'>('instances');
  const [searchTerm, setSearchTerm] = useState('');
  const [shouldFetchCost, setShouldFetchCost] = useState(false);

  const { data: profiles = ['default'] } = useAwsProfiles();
  const {
    data: instances = [],
    isLoading: instancesLoading,
    error: instancesError,
    refetch: refetchInstances,
  } = useEc2Instances(selectedProfile, selectedRegion);
  const {
    data: buckets = [],
    isLoading: bucketsLoading,
    error: bucketsError,
    refetch: refetchBuckets,
  } = useS3Buckets(selectedProfile);
  const {
    data: costReport,
    isLoading: costLoading,
    error: costError,
    refetch: refetchCosts,
  } = useAwsCosts(selectedProfile, shouldFetchCost);

  const filteredInstances = instances.filter(
    (i) =>
      i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (i.publicIp && i.publicIp.includes(searchTerm)),
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
            <Cloud className="h-6 w-6 text-info" />
            Cloud & AWS Manager
          </h1>
          <p className="mt-1 text-xs text-fg-muted">
            AWS profile configuration, EC2 instance states, S3 storage buckets, and cached Cost
            Explorer insights.
          </p>
        </div>

        {/* Profile & Region selectors */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="aws-profile-select" className="text-xs font-semibold text-fg-muted">
              Profile:
            </label>
            <Select
              id="aws-profile-select"
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              size="sm"
              className="w-48"
            >
              {profiles.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="aws-region-select" className="text-xs font-semibold text-fg-muted">
              Region:
            </label>
            <Select
              id="aws-region-select"
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              size="sm"
              className="w-48"
            >
              <option value="">All Regions</option>
              <option value="us-east-1">us-east-1 (N. Virginia)</option>
              <option value="us-west-2">us-west-2 (Oregon)</option>
              <option value="eu-west-1">eu-west-1 (Ireland)</option>
              <option value="eu-central-1">eu-central-1 (Frankfurt)</option>
              <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
            </Select>
          </div>
        </div>
      </div>

      {/* Cost Explorer Card - On-demand with explicit notice */}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div className="flex items-start gap-3">
            <DollarSign className="h-5 w-5 shrink-0 text-success" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-fg">
                  AWS Cost Explorer (Profile: {selectedProfile})
                </span>
                {costReport && costReport.cachedAt > 0 && (
                  <Badge variant="neutral" className="px-1.5 py-0 text-[10px] text-fg-muted">
                    Cached {new Date(costReport.cachedAt * 1000).toLocaleTimeString()}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-fg-muted">
                Cost Explorer charges per request ($0.01 via AWS API). Queries are executed
                on-demand only and cached locally.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={costLoading}
            onClick={() => {
              setShouldFetchCost(true);
              refetchCosts();
            }}
            className="shrink-0 self-start text-xs md:self-auto"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${costLoading ? 'animate-spin' : ''}`} />
            {costLoading
              ? 'Querying CE...'
              : costReport && costReport.cachedAt > 0
                ? 'Refresh Costs'
                : 'Query AWS Costs'}
          </Button>
        </div>

        {costError && (
          <div className="mt-3 rounded border border-destructive/30 bg-danger-soft p-2.5 text-xs text-destructive">
            {costError instanceof Error ? costError.message : String(costError)}
          </div>
        )}

        {costReport && costReport.cachedAt > 0 && (
          <div className="mt-4 border-t border-border/50 pt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-fg-muted">Month-to-date Total:</span>
              <span className="text-base font-bold text-success">
                {costReport.monthToDateTotal.toFixed(2)} {costReport.currency}
              </span>
            </div>

            {costReport.topServices.length > 0 && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                {costReport.topServices.slice(0, 6).map((svc) => (
                  <div
                    key={svc.service}
                    className="rounded border border-border/40 bg-canvas/50 px-2.5 py-1.5 text-xs"
                  >
                    <div className="truncate font-medium text-fg" title={svc.service}>
                      {svc.service}
                    </div>
                    <div className="text-[11px] text-fg-muted">
                      {svc.amount.toFixed(2)} {svc.unit || 'USD'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex h-9 items-center rounded-full border border-hairline bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('instances')}
            className={`flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium transition-colors ${
              activeTab === 'instances'
                ? 'bg-ember text-ember-foreground shadow-sm'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            EC2 Instances ({instances.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('buckets')}
            className={`flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium transition-colors ${
              activeTab === 'buckets'
                ? 'bg-ember text-ember-foreground shadow-sm'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Database className="h-3.5 w-3.5" />
            S3 Buckets ({buckets.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-fg-muted" />
            <Input
              type="search"
              size="sm"
              aria-label={`Filter ${activeTab}`}
              data-nx-page-search
              placeholder={`Filter ${activeTab === 'instances' ? 'instances' : 'buckets'}…`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button
            variant="glass"
            size="iconSm"
            aria-label="Refresh"
            className="size-9"
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
              <tr className="border-b border-border bg-muted/40 font-semibold text-fg-muted">
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
              {instancesError ? (
                <tr>
                  <td colSpan={7} className="p-4">
                    <ErrorPanel
                      error={instancesError}
                      fallback="Couldn't list EC2 instances."
                      onRetry={() => void refetchInstances()}
                    />
                  </td>
                </tr>
              ) : instancesLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-fg-muted">
                    Fetching EC2 instances from AWS CLI...
                  </td>
                </tr>
              ) : filteredInstances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-fg-muted">
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
                          {inst.isProd && (
                            <Badge variant="destructive" className="text-[10px] uppercase">
                              Production
                            </Badge>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-fg-muted">{inst.id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={isRunning ? 'success' : isStopped ? 'neutral' : 'warning'}
                          className="text-[10px] capitalize"
                        >
                          {inst.state}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-fg-muted">{inst.instanceType}</td>
                      <td className="px-4 py-3 font-mono text-fg">{inst.publicIp || '—'}</td>
                      <td className="px-4 py-3 font-mono text-fg-muted">{inst.privateIp || '—'}</td>
                      <td className="px-4 py-3 text-fg-muted">{inst.region}</td>
                      <td className="px-4 py-3 text-right">
                        <InstanceActions inst={inst} profile={selectedProfile} />
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
              <tr className="border-b border-border bg-muted/40 font-semibold text-fg-muted">
                <th className="px-4 py-3">Bucket Name</th>
                <th className="px-4 py-3">Creation Date</th>
                <th className="px-4 py-3">Region</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bucketsError ? (
                <tr>
                  <td colSpan={3} className="p-4">
                    <ErrorPanel
                      error={bucketsError}
                      fallback="Couldn't list S3 buckets."
                      onRetry={() => void refetchBuckets()}
                    />
                  </td>
                </tr>
              ) : bucketsLoading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-fg-muted">
                    Fetching S3 buckets...
                  </td>
                </tr>
              ) : filteredBuckets.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-fg-muted">
                    No S3 buckets found.
                  </td>
                </tr>
              ) : (
                filteredBuckets.map((bucket) => (
                  <tr key={bucket.name} className="transition-colors hover:bg-muted/20">
                    <td className="flex items-center gap-2 px-4 py-3 font-mono font-medium text-fg">
                      <Database className="h-3.5 w-3.5 text-warning" />
                      {bucket.name}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      {new Date(bucket.creationDate).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{bucket.region || 'global'}</td>
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

export const CloudPage = () => (
  <RequiresTool anyOf={['aws']} install="brew install awscli">
    <ConsentGate
      source="aws_config"
      reason="Cloud reads your AWS profiles from ~/.aws and uses the aws CLI with them to list EC2 instances, S3 buckets and, only when you ask, costs."
    >
      <CloudView />
    </ConsentGate>
  </RequiresTool>
);
