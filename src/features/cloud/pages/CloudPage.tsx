import { useState } from 'react';
import { Cloud, Server, Database, DollarSign, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import { useAwsProfiles, useEc2Instances, useS3Buckets, useAwsCosts } from '../api/useCloud';
import { ConsentGate } from '@/shared/privacy';

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
    refetch: refetchInstances,
  } = useEc2Instances(selectedProfile, selectedRegion);
  const {
    data: buckets = [],
    isLoading: bucketsLoading,
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
            <label htmlFor="aws-region-select" className="text-xs font-semibold text-fg-muted">
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
                {costReport && costReport.cached_at > 0 && (
                  <Badge variant="neutral" className="px-1.5 py-0 text-[10px] text-fg-muted">
                    Cached {new Date(costReport.cached_at * 1000).toLocaleTimeString()}
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
              : costReport && costReport.cached_at > 0
                ? 'Refresh Costs'
                : 'Query AWS Costs'}
          </Button>
        </div>

        {costError && (
          <div className="mt-3 rounded border border-destructive/30 bg-danger-soft p-2.5 text-xs text-destructive">
            {costError instanceof Error ? costError.message : String(costError)}
          </div>
        )}

        {costReport && costReport.cached_at > 0 && (
          <div className="mt-4 border-t border-border/50 pt-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-fg-muted">Month-to-date Total:</span>
              <span className="text-base font-bold text-success">
                {costReport.month_to_date_total.toFixed(2)} {costReport.currency}
              </span>
            </div>

            {costReport.top_services.length > 0 && (
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                {costReport.top_services.slice(0, 6).map((svc) => (
                  <div
                    key={svc.service}
                    className="rounded border border-border/40 bg-canvas/50 px-2.5 py-1.5 text-xs"
                  >
                    <div className="truncate font-medium text-fg" title={svc.service}>
                      {svc.service}
                    </div>
                    <div className="text-[11px] text-fg-muted">
                      {svc.amount.toFixed(2)} {svc.currency || svc.unit || 'USD'}
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
        <div className="flex rounded-lg border border-border bg-card/40 p-1">
          <button
            type="button"
            onClick={() => setActiveTab('instances')}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
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
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
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
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 h-3.5 w-3.5 text-fg-muted" />
            <input
              type="text"
              placeholder={`Filter ${activeTab}...`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="rounded-md border border-border bg-card/60 py-1.5 pr-3 pl-8 text-xs text-fg placeholder:text-fg-muted focus:outline-none"
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
              {instancesLoading ? (
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
                          {inst.is_prod && (
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
                      <td className="px-4 py-3 font-mono text-fg-muted">{inst.instance_type}</td>
                      <td className="px-4 py-3 font-mono text-fg">{inst.public_ip || '—'}</td>
                      <td className="px-4 py-3 font-mono text-fg-muted">
                        {inst.private_ip || '—'}
                      </td>
                      <td className="px-4 py-3 text-fg-muted">{inst.region}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[11px] text-fg-muted italic">
                          Actions frozen (T-06)
                        </span>
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
              {bucketsLoading ? (
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
                      {new Date(bucket.creation_date).toLocaleDateString()}
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
  <ConsentGate
    source="aws_config"
    reason="Cloud reads your AWS profiles from ~/.aws and uses the aws CLI with them to list EC2 instances, S3 buckets and, only when you ask, costs."
  >
    <CloudView />
  </ConsentGate>
);
