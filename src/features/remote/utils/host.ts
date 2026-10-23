import type { HostEnv, RemoteHost } from '@/features/remote/api/remote.schema';

/** How the host is reached, as the user would type it: the ssh_config alias,
 * or `user@host:port` for manual hosts (`:22` omitted). */
export function hostAddress(h: RemoteHost): string {
  if (h.manual) {
    const port = h.manual.port === 22 ? '' : `:${h.manual.port}`;
    return `${h.manual.user}@${h.manual.hostname}${port}`;
  }
  return h.alias ?? '';
}

/** Guess an env from an alias (`fameo-prod`, `api.staging`). Only pre-fills
 * the import row; the user confirms it. */
export function guessEnv(alias: string): HostEnv {
  const a = alias.toLowerCase();
  const word = (w: string) => new RegExp(`(^|[-_.])(${w})([-_.\\d]|$)`).test(a);
  if (word('prod|production|live')) return 'prod';
  if (word('stag|staging|stg|uat|qa')) return 'staging';
  if (word('dev|development|test|sandbox')) return 'dev';
  return 'other';
}

/** `127.0.0.1:4101`, `localhost:4101`, `[::1]:4101` or `:4101` → host + port, so
 * a pasted address fills both tunnel fields. A bare host (or IPv6 without
 * brackets) has no port. */
export function splitHostPort(input: string): { host: string; port: number | null } {
  const s = input.trim();
  const m = /^\[([^\]]+)\]:(\d{1,5})$/.exec(s) ?? /^([^:]*):(\d{1,5})$/.exec(s);
  if (!m) return { host: s.replace(/^\[(.*)\]$/, '$1'), port: null };
  const port = Number(m[2]);
  return port >= 1 && port <= 65535 ? { host: m[1] || '127.0.0.1', port } : { host: s, port: null };
}
