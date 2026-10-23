import type { LogLine } from '@/features/remote/api/remote.schema';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  key: string;
  /** Epoch ms from Docker's receive time; null for journal lines. */
  at: number | null;
  /** First line plus any indented continuation lines (stack traces, SQL). */
  text: string;
  level: LogLevel;
  /** Health checks and per-query SQL: real, but drown everything else. */
  noise: boolean;
  requestId: string | null;
}

const BRACKET_LEVEL = /\[\s*(ERROR|FATAL|WARN(?:ING)?|INFO|LOG|DEBUG|VERBOSE|TRACE)\s*\]/i;
const JSON_LEVEL = /"(?:level|severity)"\s*:\s*"(\w+)"/i;
const ACCESS_STATUS = /"\s(\d{3})\s(?:\d+|-)/;
const ERROR_WORD =
  /\b(error|errors|err|fatal|panic|exception|unhandled|crit(?:ical)?|failed|failure)\b/i;
/** `TypeError: …`, `PrismaClientKnownRequestError: …`, `NullPointerException: …` */
const THROWN = /\b\w*(?:Error|Exception):/;
const WARN_WORD = /\b(warn|warning|deprecated|retry(?:ing)?|timeout|timed out)\b/i;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const NOISE = [
  /"(?:GET|HEAD) \/(?:health|healthz|ready|readyz|live|livez|ping|nginx-health)\b/,
  /\((?:GET|HEAD) \/(?:health|healthz|ready|live|ping)\)/,
  /^prisma:query\b/,
];

function wordLevel(word: string): LogLevel {
  const w = word.toLowerCase();
  if (w.startsWith('err') || w === 'fatal' || w === 'critical' || w === 'panic') return 'error';
  if (w.startsWith('warn')) return 'warn';
  if (w === 'debug' || w === 'verbose' || w === 'trace') return 'debug';
  return 'info';
}

/** The level a line declares, else what its words say. HTTP status counts:
 * 5xx is an error, 4xx a warning. */
export function levelOf(text: string): LogLevel {
  const b = BRACKET_LEVEL.exec(text) ?? JSON_LEVEL.exec(text);
  if (b) return wordLevel(b[1]);
  const status = ACCESS_STATUS.exec(text);
  if (status) {
    const code = Number(status[1]);
    return code >= 500 ? 'error' : code >= 400 ? 'warn' : 'info';
  }
  if (/^prisma:query\b/.test(text)) return 'debug';
  if (ERROR_WORD.test(text) || THROWN.test(text)) return 'error';
  if (WARN_WORD.test(text)) return 'warn';
  return 'info';
}

export const isNoise = (text: string) => NOISE.some((re) => re.test(text));

/** Indented lines and closing brackets continue the entry above them. */
const isContinuation = (text: string) => /^(\s|[}\])]|at\s)/.test(text);

/** Docker lines → entries, oldest first, continuations folded in. */
export function entriesOf(lines: LogLine[]): LogEntry[] {
  const out: LogEntry[] = [];
  lines.forEach((l, i) => {
    const prev = out.at(-1);
    if (prev && isContinuation(l.text)) {
      prev.text += `\n${l.text}`;
      if (prev.level !== 'error') {
        const lv = levelOf(l.text);
        if (lv === 'error') prev.level = 'error';
      }
      return;
    }
    const at = l.at ? Date.parse(l.at) : NaN;
    out.push({
      key: `${i}`,
      at: Number.isNaN(at) ? null : at,
      text: l.text,
      level: levelOf(l.text),
      noise: isNoise(l.text),
      requestId: UUID.exec(l.text)?.[0] ?? null,
    });
  });
  return out;
}

/** journalctl -o short-iso lines: `2026-10-23T17:41:15+0000 host unit[pid]: msg`. */
export function journalEntriesOf(lines: string[]): LogEntry[] {
  return lines.map((raw, i) => {
    const m = /^(\S+)\s+\S+\s+(.*)$/.exec(raw);
    const at = m ? Date.parse(m[1].replace(/([+-]\d{2})(\d{2})$/, '$1:$2')) : NaN;
    const text = m && !Number.isNaN(at) ? m[2] : raw;
    return {
      key: `j${i}`,
      at: Number.isNaN(at) ? null : at,
      text,
      level: 'error' as const,
      noise: false,
      requestId: null,
    };
  });
}

export type LevelFilter = 'all' | 'warn' | 'error';

export function filterEntries(
  entries: LogEntry[],
  { level, hideNoise, query }: { level: LevelFilter; hideNoise: boolean; query: string },
): LogEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter(
    (e) =>
      (!hideNoise || !e.noise) &&
      (level === 'all' || e.level === 'error' || (level === 'warn' && e.level === 'warn')) &&
      (!q || e.text.toLowerCase().includes(q)),
  );
}
