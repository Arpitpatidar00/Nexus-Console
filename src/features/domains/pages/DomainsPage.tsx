import { useState } from 'react';
import {
  Globe,
  Activity,
  ShieldCheck,
  ShieldAlert,
  Search,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  Layers,
  X,
  Radio,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/shared/ui/Button';
import { Badge } from '@/shared/ui/Badge';
import {
  useDnsLookup,
  useSslCheck,
  useRdapCheck,
  usePropagationCheck,
  useUptimeMonitors,
  useSaveUptimeMonitor,
  useDeleteUptimeMonitor,
  usePingNow,
} from '../api/useDomains';
import type { UptimeMonitor } from '../api/domains.schema';

export const DomainsPage = () => {
  const [activeTab, setActiveTab] = useState<'inspector' | 'uptime'>('inspector');

  // Inspector State
  const [domainInput, setDomainInput] = useState('example.com');
  const [queryDomain, setQueryDomain] = useState('example.com');
  const [recordType, setRecordType] = useState('A');

  const { data: dns, isFetching: dnsFetching } = useDnsLookup(queryDomain, recordType, true);
  const { data: ssl, isFetching: sslFetching } = useSslCheck(queryDomain, 443, true);
  const { data: rdap, isFetching: rdapFetching } = useRdapCheck(queryDomain, true);
  const { data: prop, isFetching: propFetching } = usePropagationCheck(
    queryDomain,
    recordType,
    true,
  );

  const isInspecting = dnsFetching || sslFetching || rdapFetching || propFetching;

  const handleInspect = (e: React.FormEvent) => {
    e.preventDefault();
    if (domainInput.trim()) {
      setQueryDomain(domainInput.trim());
    }
  };

  // Uptime State
  const { data: monitors = [] } = useUptimeMonitors();
  const saveMonitor = useSaveUptimeMonitor();
  const deleteMonitor = useDeleteUptimeMonitor();
  const pingNow = usePingNow();

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newMonName, setNewMonName] = useState('');
  const [newMonUrl, setNewMonUrl] = useState('https://');
  const [newMonInterval, setNewMonInterval] = useState(5);

  const handleAddMonitor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMonName.trim() || !newMonUrl.trim()) return;

    const monitor: UptimeMonitor = {
      id: '',
      name: newMonName.trim(),
      url: newMonUrl.trim(),
      intervalMins: newMonInterval,
      enabled: true,
      lastStatus: null,
      lastLatencyMs: null,
      isUp: true,
      uptimePercent24h: 100.0,
      history: [],
    };

    saveMonitor.mutate(monitor, {
      onSuccess: () => {
        setAddModalOpen(false);
        setNewMonName('');
        setNewMonUrl('https://');
      },
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden p-6">
      {/* Header */}
      <div className="mb-5 flex shrink-0 items-center justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-fg">Domains &amp; Uptime</h1>
          <p className="text-xs text-fg-muted">
            DNS records, SSL certificates, RDAP domain expiry &amp; endpoint availability
            monitoring.
          </p>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-border bg-paper p-1 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('inspector')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'inspector'
                ? 'bg-accent-soft font-semibold text-accent shadow-xs'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            Domain Inspector
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('uptime')}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === 'uptime'
                ? 'bg-accent-soft font-semibold text-accent shadow-xs'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            Uptime Monitors ({monitors.length})
          </button>
        </div>
      </div>

      {activeTab === 'inspector' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pr-1">
          {/* Query Bar */}
          <form
            onSubmit={handleInspect}
            className="flex items-center gap-3 rounded-xl border border-border bg-paper p-3 shadow-xs"
          >
            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-3 h-4 w-4 text-fg-muted" />
              <input
                type="text"
                placeholder="Domain name (e.g. example.com or api.stripe.com)"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                className="w-full rounded-lg border border-border bg-black/10 py-1.5 pr-3 pl-9 text-xs text-fg focus:border-accent focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-fg-muted">Type:</span>
              <select
                value={recordType}
                onChange={(e) => setRecordType(e.target.value)}
                className="rounded-lg border border-border bg-paper px-2.5 py-1.5 text-xs text-fg focus:outline-none"
              >
                {['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS'].map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>

              <Button type="submit" variant="default" size="sm" disabled={isInspecting}>
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isInspecting ? 'animate-spin' : ''}`} />
                {isInspecting ? 'Inspecting…' : 'Inspect Domain'}
              </Button>
            </div>
          </form>

          {/* Inspection Cards Grid */}
          <div className="grid grid-cols-2 gap-5">
            {/* 1. SSL Certificate */}
            <div className="flex flex-col rounded-xl border border-border bg-paper p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  {ssl?.valid ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-danger" />
                  )}
                  <span className="text-xs font-semibold text-fg">SSL / TLS Certificate</span>
                </div>
                {ssl && (
                  <Badge variant={ssl.valid ? 'success' : 'danger'}>
                    {ssl.valid ? `${ssl.daysRemaining} days left` : 'Expired / Invalid'}
                  </Badge>
                )}
              </div>

              {ssl ? (
                <div className="mt-3 flex flex-col gap-2 text-xs">
                  {ssl.error ? (
                    <p className="text-danger">⚠️ {ssl.error}</p>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-fg-muted">Issuer:</span>
                        <span className="max-w-xs truncate text-right font-mono text-fg">
                          {ssl.issuer}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-fg-muted">Subject:</span>
                        <span className="font-mono text-fg">{ssl.subject}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-fg-muted">Expires:</span>
                        <span className="font-mono text-fg">{ssl.notAfter}</span>
                      </div>
                      {ssl.sans.length > 0 && (
                        <div className="mt-1">
                          <span className="text-fg-muted">Subject Alternative Names:</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {ssl.sans.map((s) => (
                              <Badge key={s} variant="neutral" className="font-mono text-[10px]">
                                {s}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-fg-muted">Loading certificate details…</p>
              )}
            </div>

            {/* 2. RDAP Registration */}
            <div className="flex flex-col rounded-xl border border-border bg-paper p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-accent" />
                  <span className="text-xs font-semibold text-fg">Domain Registration (RDAP)</span>
                </div>
              </div>

              {rdap ? (
                <div className="mt-3 flex flex-col gap-2 text-xs">
                  {rdap.error ? (
                    <p className="text-fg-muted">ℹ️ {rdap.error}</p>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-fg-muted">Registrar:</span>
                        <span className="font-medium text-fg">{rdap.registrar || 'Unknown'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-fg-muted">Expires:</span>
                        <span className="font-mono font-semibold text-fg">
                          {rdap.expirationDate
                            ? new Date(rdap.expirationDate).toLocaleDateString()
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-fg-muted">Registered On:</span>
                        <span className="font-mono text-fg">
                          {rdap.createdDate ? new Date(rdap.createdDate).toLocaleDateString() : '—'}
                        </span>
                      </div>
                      {rdap.status.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {rdap.status.map((st) => (
                            <Badge key={st} variant="neutral" className="text-[10px]">
                              {st}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-xs text-fg-muted">Loading registration details…</p>
              )}
            </div>

            {/* 3. DNS Records */}
            <div className="col-span-2 flex flex-col rounded-xl border border-border bg-paper p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-fg" />
                  <span className="text-xs font-semibold text-fg">
                    DNS Records for {queryDomain} ({recordType})
                  </span>
                </div>
                <Badge variant="neutral">{dns?.records.length || 0} records</Badge>
              </div>

              <div className="mt-3 divide-y divide-border">
                {dns?.records && dns.records.length > 0 ? (
                  dns.records.map((r, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <Badge variant="neutral" className="font-mono">
                          {r.recordType}
                        </Badge>
                        <span className="font-mono text-fg">{r.value}</span>
                      </div>
                      {r.ttl && <span className="text-fg-muted">TTL: {r.ttl}s</span>}
                    </div>
                  ))
                ) : (
                  <p className="py-2 text-xs text-fg-muted">No {recordType} records found.</p>
                )}
              </div>
            </div>

            {/* 4. Global Propagation Check */}
            <div className="col-span-2 flex flex-col rounded-xl border border-border bg-paper p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-accent" />
                  <span className="text-xs font-semibold text-fg">
                    Multi-Resolver Propagation Check
                  </span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-3">
                {prop?.answers.map((ans) => (
                  <div
                    key={ans.resolver}
                    className="rounded-lg border border-border bg-black/10 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-fg">{ans.resolverName}</span>
                      <span className="font-mono text-[11px] text-fg-muted">{ans.latencyMs}ms</span>
                    </div>
                    <span className="font-mono text-[11px] text-fg-muted">({ans.resolver})</span>
                    <div className="mt-2 flex flex-col gap-1">
                      {ans.records.length > 0 ? (
                        ans.records.map((rec, i) => (
                          <span key={i} className="truncate font-mono text-xs text-fg">
                            {rec}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-fg-muted">No answer</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Uptime Monitors View */
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-fg-muted">
              Endpoints pinged via background agent. Alerts on status code &gt;= 400 or latency
              spike.
            </span>
            <Button variant="default" size="sm" onClick={() => setAddModalOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Monitor
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {monitors.map((mon) => (
              <div
                key={mon.id}
                className="flex items-center justify-between rounded-xl border border-border bg-paper p-4 shadow-xs"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      mon.isUp ? 'bg-emerald-500/10 text-emerald-500' : 'bg-danger/10 text-danger'
                    }`}
                  >
                    <Activity className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-fg">{mon.name}</h4>
                      <Badge variant={mon.isUp ? 'success' : 'danger'}>
                        {mon.isUp ? 'Operational' : 'Down'}
                      </Badge>
                      {mon.lastStatus && (
                        <span className="font-mono text-xs text-fg-muted">
                          HTTP {mon.lastStatus}
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-xs text-fg-muted">{mon.url}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex flex-col text-right">
                    <span className="text-xs font-semibold text-fg">
                      {mon.uptimePercent24h.toFixed(1)}% uptime
                    </span>
                    <span className="text-[11px] text-fg-muted">
                      {mon.lastLatencyMs !== null && mon.lastLatencyMs !== undefined
                        ? `${mon.lastLatencyMs}ms response`
                        : 'Every ' + mon.intervalMins + 'm'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => pingNow.mutate({ id: mon.id, url: mon.url })}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteMonitor.mutate(mon.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-danger" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {monitors.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-12 text-center">
                <Globe className="h-10 w-10 text-fg-muted/40" />
                <h3 className="mt-3 text-sm font-semibold text-fg">No Uptime Monitors Added</h3>
                <p className="mt-1 text-xs text-fg-muted">
                  Add endpoints to track uptime, response time, and SSL validity.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => setAddModalOpen(true)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add First Monitor
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Monitor Modal */}
      <Dialog.Root open={addModalOpen} onOpenChange={setAddModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-paper p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <Dialog.Title className="text-base font-semibold text-fg">
                Add Uptime Monitor
              </Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="text-fg-muted hover:text-fg">
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={handleAddMonitor} className="mt-4 flex flex-col gap-3">
              <div>
                <label htmlFor="mon-name" className="text-xs font-semibold text-fg">
                  Friendly Name
                </label>
                <input
                  id="mon-name"
                  type="text"
                  required
                  placeholder="e.g. Production API"
                  value={newMonName}
                  onChange={(e) => setNewMonName(e.target.value)}
                  className="mt-1 w-full rounded border border-border bg-black/10 px-3 py-1.5 text-xs text-fg focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="mon-url" className="text-xs font-semibold text-fg">
                  Target URL
                </label>
                <input
                  id="mon-url"
                  type="url"
                  required
                  placeholder="https://api.example.com/health"
                  value={newMonUrl}
                  onChange={(e) => setNewMonUrl(e.target.value)}
                  className="mt-1 w-full rounded border border-border bg-black/10 px-3 py-1.5 font-mono text-xs text-fg focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="mon-interval" className="text-xs font-semibold text-fg">
                  Check Interval (Minutes)
                </label>
                <input
                  id="mon-interval"
                  type="number"
                  min={1}
                  max={60}
                  value={newMonInterval}
                  onChange={(e) => setNewMonInterval(parseInt(e.target.value, 10) || 5)}
                  className="mt-1 w-full rounded border border-border bg-black/10 px-3 py-1.5 text-xs text-fg focus:outline-none"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="default" size="sm">
                  Save Monitor
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
};
