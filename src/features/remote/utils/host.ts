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

/** The interactive command that reaches this host from Terminal — shown when
 * the user must verify a host key or unlock a key themselves. */
export function sshCommand(h: RemoteHost): string {
  if (!h.manual) return `ssh ${h.alias ?? ''}`;
  const m = h.manual;
  const port = m.port === 22 ? '' : ` -p ${m.port}`;
  const key = m.identityFile ? ` -i ${m.identityFile}` : '';
  return `ssh${port}${key} ${m.user}@${m.hostname}`;
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
