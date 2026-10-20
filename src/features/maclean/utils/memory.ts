import type { MemoryReport } from '@/features/maclean/api/maclean.schema';

export interface MemSample {
  at: number;
  usedPct: number;
  swapPct: number;
}

/** ~5 minutes at the 3 s poll. In memory only. */
export const MEM_HISTORY_CAP = 100;

export function memSample(m: MemoryReport): MemSample {
  const c = m.composition;
  return {
    at: m.sampledAtMs,
    usedPct: c.totalBytes > 0 ? (c.usedBytes * 100) / c.totalBytes : 0,
    swapPct: m.swapTotalBytes > 0 ? (m.swapUsedBytes * 100) / m.swapTotalBytes : 0,
  };
}

export function appendMem(list: MemSample[], s: MemSample, cap = MEM_HISTORY_CAP): MemSample[] {
  const last = list.at(-1);
  if (last && s.at <= last.at) return list;
  const out = [...list, s];
  return out.length > cap ? out.slice(out.length - cap) : out;
}

export type SwapState = 'none' | 'leftover' | 'active';

/** Active = pages are being written to swap right now (that's what makes a
 * Mac feel slow). Leftover = swap holds data from earlier: harmless. */
export function swapState(m: MemoryReport): SwapState {
  // At least a page a second (16 KB on Apple Silicon) counts as swapping.
  if ((m.swapoutBytesPerSec ?? 0) >= 16_384) return 'active';
  return m.swapUsedBytes > 0 ? 'leftover' : 'none';
}
