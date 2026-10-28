import type { GroupSummary, KafkaMessage, Payload } from '../api/kafka.schema';

/** 1234 → "1,234"; 1_234_567 → "1.2M". `null` → "—". */
export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  const abs = Math.abs(n);
  if (abs < 100_000) return n.toLocaleString('en-US');
  if (abs < 1e6) return `${(n / 1e3).toFixed(abs < 1e4 ? 1 : 0)}K`;
  if (abs < 1e9) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
}

/** The body as a person would want to read it: JSON indented, rest as-is. */
export function prettyPayload(p: Payload): string {
  if (p.base64) return hexDump(p.text);
  if (p.format === 'json' || (p.format === 'schemaRegistry' && /^\s*[[{]/.test(p.text))) {
    try {
      return JSON.stringify(JSON.parse(p.text), null, 2);
    } catch {
      return p.text; // cut mid-document
    }
  }
  return p.text;
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** `xxd`-style dump: offset, 16 hex bytes, printable ASCII. */
export function hexDump(b64: string, maxBytes = 4096): string {
  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(b64);
  } catch {
    return b64;
  }
  const shown = bytes.subarray(0, maxBytes);
  const lines: string[] = [];
  for (let i = 0; i < shown.length; i += 16) {
    const row = shown.subarray(i, i + 16);
    const hex = Array.from(row, (b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(row, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.'));
    lines.push(`${i.toString(16).padStart(8, '0')}  ${hex.padEnd(47)}  ${ascii.join('')}`);
  }
  if (bytes.length > maxBytes) lines.push(`… ${bytes.length - maxBytes} more bytes`);
  return lines.join('\n');
}

/** One line for a list row. */
export function payloadPreview(p: Payload | null, max = 160): string {
  if (!p) return 'null';
  if (p.base64) {
    const prefix = p.schemaId !== null ? `schema #${p.schemaId} · ` : '';
    return `${prefix}binary · ${p.size.toLocaleString('en-US')} B`;
  }
  let text = p.text;
  if (p.format === 'json') {
    try {
      text = JSON.stringify(JSON.parse(p.text));
    } catch {
      // truncated: show it raw
    }
  }
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > max ? `${line.slice(0, max)}…` : line || '(empty)';
}

export const FORMAT_LABEL: Record<Payload['format'], string> = {
  json: 'JSON',
  text: 'Text',
  binary: 'Binary',
  schemaRegistry: 'Schema Registry',
};

/** Plain-data shape of a message for copying: bodies decoded where they can be. */
export function messageToJson(m: KafkaMessage): unknown {
  const body = (p: Payload | null) => {
    if (!p) return null;
    if (p.base64) return { base64: p.text, ...(p.schemaId !== null && { schemaId: p.schemaId }) };
    if (p.format === 'json') {
      try {
        return JSON.parse(p.text);
      } catch {
        return p.text;
      }
    }
    return p.text;
  };
  return {
    partition: m.partition,
    offset: m.offset,
    timestamp: new Date(m.timestamp).toISOString(),
    key: body(m.key),
    value: body(m.value),
    headers: Object.fromEntries(m.headers.map((h) => [h.key, body(h.value)])),
  };
}

export type Tone = 'success' | 'warning' | 'info' | 'neutral' | 'destructive';

/** A group's state as a label and tone. Lag alone isn't alarming; lag with
 * nobody consuming is worth a look. */
export function groupStatus(g: Pick<GroupSummary, 'state' | 'totalLag' | 'members'>): {
  label: string;
  tone: Tone;
} {
  switch (g.state) {
    case 'Stable':
      return { label: 'Stable', tone: 'success' };
    case 'PreparingRebalance':
    case 'CompletingRebalance':
    case 'Assigning':
    case 'Reconciling':
      return { label: 'Rebalancing', tone: 'info' };
    case 'Empty':
      return (g.totalLag ?? 0) > 0
        ? { label: 'Inactive · lagging', tone: 'warning' }
        : { label: 'Inactive', tone: 'neutral' };
    case 'Dead':
      return { label: 'Dead', tone: 'neutral' };
    default:
      return { label: g.state || 'Unknown', tone: 'neutral' };
  }
}

/** `<input type="datetime-local">` value for a ms timestamp, in local time. */
export function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Back from a datetime-local value; `null` when empty or invalid. */
export function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** "2026-10-26 14:03:07.123" in local time. */
export function formatTimestamp(ms: number): string {
  if (ms < 0) return '—';
  return `${toLocalInput(ms).replace('T', ' ')}.${String(ms % 1000).padStart(3, '0')}`;
}

/** Normalize a typed bootstrap list for display: one seed per comma. */
export function normalizeBootstrap(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** PLAIN over an unencrypted connection to something other than this Mac
 * sends the password in the clear. */
export function plaintextPasswordRisk(
  security: string,
  mechanism: string | null | undefined,
  bootstrap: string,
): boolean {
  if (security !== 'saslPlaintext' || (mechanism ?? '').toUpperCase() !== 'PLAIN') return false;
  return normalizeBootstrap(bootstrap).some(
    (seed) => !/^(?:[a-z_]+:\/\/)?(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(seed),
  );
}
