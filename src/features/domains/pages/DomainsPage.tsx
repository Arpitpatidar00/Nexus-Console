import { useState } from 'react';
import {
  Globe,
  Activity,
  ShieldCheck,
  ShieldAlert,
  Search,
  RefreshCw,
  Clock,
  Layers,
  Radio,
} from 'lucide-react';
import { Badge } from '@/shared/ui/Badge';
import { Button } from '@/shared/ui/Button';
import { useDnsLookup, useSslCheck, useRdapCheck, usePropagationCheck } from '../api/useDomains';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Skeleton } from '@/shared/ui/Skeleton';
import { cn } from '@/shared/lib/cn';

export const DomainsPage = () => {
  const [activeTab, setActiveTab] = useState<'inspector' | 'uptime'>('inspector');

  // Inspector State
  const [domainInput, setDomainInput] = useState('');
  // Nothing is looked up until you submit a domain: each lookup reaches DNS,
  // RDAP and the domain itself (PLAN F.5 — no traffic on page open).
  const [queryDomain, setQueryDomain] = useState('');
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
                ? 'bg-ember-soft font-semibold text-ember-text shadow-xs'
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
                ? 'bg-ember-soft font-semibold text-ember-text shadow-xs'
                : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            Uptime Monitors (Frozen)
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
                className="w-full rounded-lg border border-border bg-black/10 py-1.5 pr-3 pl-9 text-xs text-fg focus:border-ember focus:outline-none"
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

          {!queryDomain && (
            <EmptyState
              icon={<Globe className="size-10" />}
              title="Inspect a domain"
              description="Enter a domain above. Stackroost then checks its certificate, registration and DNS — nothing is looked up before you ask."
            />
          )}

          {/* Inspection Cards Grid */}
          <div className={cn('grid grid-cols-2 gap-5', !queryDomain && 'hidden')}>
            {/* 1. SSL Certificate */}
            <div className="flex flex-col rounded-xl border border-border bg-paper p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  {ssl?.valid ? (
                    <ShieldCheck className="h-4 w-4 text-success" />
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
                <Skeleton className="mt-2" />
              )}
            </div>

            {/* 2. RDAP Registration */}
            <div className="flex flex-col rounded-xl border border-border bg-paper p-4 shadow-xs">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-ember-text" />
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
                <Skeleton className="mt-2" />
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
                  <Radio className="h-4 w-4 text-ember-text" />
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
        /* Uptime Monitors View - Frozen */
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <div className="flex items-start gap-3 rounded-xl border border-warning-soft bg-warning-soft p-4 text-xs text-warning">
            <div>
              <span className="font-bold">Coming back after safety review (T-14):</span>
              <p className="mt-0.5 text-warning">
                Uptime monitoring is temporarily frozen while real background periodic scheduling
                and native system notifications are implemented in Phase B.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
