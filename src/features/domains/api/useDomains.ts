import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ipc, CMD } from '@/shared/tauri';
import {
  dnsLookupResultSchema,
  sslCertResultSchema,
  rdapResultSchema,
  propagationResultSchema,
  uptimeMonitorSchema,
  uptimePingSchema,
  type UptimeMonitor,
} from './domains.schema';

export const domainKeys = {
  dns: (domain: string, type: string) => ['domains', 'dns', domain, type] as const,
  ssl: (domain: string, port = 443) => ['domains', 'ssl', domain, port] as const,
  rdap: (domain: string) => ['domains', 'rdap', domain] as const,
  propagation: (domain: string, type: string) => ['domains', 'propagation', domain, type] as const,
  uptime: () => ['domains', 'uptime'] as const,
};

export function useDnsLookup(domain: string, recordType = 'A', enabled = false) {
  return useQuery({
    queryKey: domainKeys.dns(domain, recordType),
    queryFn: () => ipc(CMD.DOMAINS_LOOKUP_DNS, { domain, recordType }, dnsLookupResultSchema),
    enabled: Boolean(domain) && enabled,
    staleTime: 60_000,
  });
}

export function useSslCheck(domain: string, port = 443, enabled = false) {
  return useQuery({
    queryKey: domainKeys.ssl(domain, port),
    queryFn: () => ipc(CMD.DOMAINS_CHECK_SSL, { domain, port }, sslCertResultSchema),
    enabled: Boolean(domain) && enabled,
    staleTime: 60_000,
  });
}

export function useRdapCheck(domain: string, enabled = false) {
  return useQuery({
    queryKey: domainKeys.rdap(domain),
    queryFn: () => ipc(CMD.DOMAINS_CHECK_RDAP, { domain }, rdapResultSchema),
    enabled: Boolean(domain) && enabled,
    staleTime: 300_000,
  });
}

export function usePropagationCheck(domain: string, recordType = 'A', enabled = false) {
  return useQuery({
    queryKey: domainKeys.propagation(domain, recordType),
    queryFn: () =>
      ipc(CMD.DOMAINS_CHECK_PROPAGATION, { domain, recordType }, propagationResultSchema),
    enabled: Boolean(domain) && enabled,
    staleTime: 60_000,
  });
}

export function useUptimeMonitors() {
  return useQuery({
    queryKey: domainKeys.uptime(),
    queryFn: () => ipc(CMD.UPTIME_LIST_MONITORS, undefined, z.array(uptimeMonitorSchema)),
    staleTime: 10_000,
  });
}

export function useSaveUptimeMonitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (monitor: UptimeMonitor) =>
      ipc(CMD.UPTIME_SAVE_MONITOR, { monitor }, z.array(uptimeMonitorSchema)),
    onSuccess: (monitors) => {
      qc.setQueryData(domainKeys.uptime(), monitors);
    },
  });
}

export function useDeleteUptimeMonitor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      ipc(CMD.UPTIME_DELETE_MONITOR, { id }, z.array(uptimeMonitorSchema)),
    onSuccess: (monitors) => {
      qc.setQueryData(domainKeys.uptime(), monitors);
    },
  });
}

export function usePingNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, url }: { id?: string; url: string }) =>
      ipc(CMD.UPTIME_PING_NOW, { id, url }, uptimePingSchema),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: domainKeys.uptime() });
    },
  });
}
