import type { HostSnapshot } from '@/features/remote/api/remote.schema';

export interface Sample {
  at: number;
  cpuPct: number | null;
  memPct: number | null;
}

/** Enough for ~10 minutes at the default 10s refresh. In memory only. */
export const HISTORY_CAP = 60;

export function sampleOf(s: HostSnapshot): Sample {
  const m = s.memory;
  return {
    at: s.capturedAt,
    cpuPct: s.cpu.usagePct,
    memPct: m.totalBytes > 0 ? ((m.totalBytes - m.availableBytes) * 100) / m.totalBytes : null,
  };
}

/** Append if newer than the last sample (the same snapshot can arrive twice:
 * from a poll and from a background check), keeping the newest `cap`. */
export function appendSample(list: Sample[], next: Sample, cap = HISTORY_CAP): Sample[] {
  const last = list.at(-1);
  if (last && next.at <= last.at) return list;
  const out = [...list, next];
  return out.length > cap ? out.slice(out.length - cap) : out;
}
