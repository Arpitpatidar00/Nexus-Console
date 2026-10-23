import type { NginxSite, NginxUpstream } from '@/features/remote/api/remote.schema';

export type DomainEnv = 'dev' | 'staging' | 'prod' | 'other';

export const DOMAIN_ENV_LABEL: Record<DomainEnv, string> = {
  dev: 'Development',
  staging: 'Staging',
  prod: 'Production',
  other: 'Other',
};

export interface DomainRoute {
  path: string;
  /** What nginx sends it to: a URL, `return 301 …`, `root …`. */
  target: string;
  /** Upstream members when `target` names an upstream block. */
  upstream: string[] | null;
  note: string | null;
}

export interface Domain {
  /** First server_name; '' for a catch-all `server_name _` block. */
  name: string;
  aliases: string[];
  env: DomainEnv;
  https: boolean;
  /** Plain http is answered only with a redirect (to https). */
  httpRedirects: boolean;
  routes: DomainRoute[];
  files: string[];
}

const ENV_PATTERNS: [DomainEnv, RegExp][] = [
  ['staging', /(^|[.-])(staging|stage|stg|uat)([.-]|$)/],
  ['dev', /(^|[.-])(dev|develop|development|test|qa)([.-]|$)/],
  ['prod', /(^|[.-])(prod|production|www|api|app)([.-]|$)/],
];

/** Guessed from the hostname: `staging-api.x` → staging, `dev.x` → dev. A bare
 * apex like `example.com` is production. Names nothing matches stay `other`. */
export function envOfDomain(name: string): DomainEnv {
  if (!name) return 'other';
  const n = name.toLowerCase();
  for (const [env, re] of ENV_PATTERNS) if (re.test(n)) return env;
  return n.split('.').length === 2 ? 'prod' : 'other';
}

const isAcme = (path: string) => path.includes('acme-challenge');

function upstreamOf(target: string, upstreams: NginxUpstream[]): string[] | null {
  const m = /^https?:\/\/([^/:]+)/.exec(target);
  return (m && upstreams.find((u) => u.name === m[1])?.servers) || null;
}

/** nginx server blocks → one entry per domain. The port-80 redirect block and
 * the port-443 block for the same name merge; Certbot's ACME routes are noise. */
export function domainsOf(sites: NginxSite[], upstreams: NginxUpstream[]): Domain[] {
  const byName = new Map<string, Domain>();
  for (const s of sites) {
    const [name = '', ...aliases] = s.serverNames;
    let d = byName.get(name);
    if (!d) {
      d = {
        name,
        aliases,
        env: envOfDomain(name),
        https: false,
        httpRedirects: false,
        routes: [],
        files: [],
      };
      byName.set(name, d);
    }
    for (const a of aliases) if (!d.aliases.includes(a)) d.aliases.push(a);
    if (!d.files.includes(s.file)) d.files.push(s.file);
    if (s.ssl) d.https = true;
    if (s.redirectOnly) {
      d.httpRedirects = true;
      continue;
    }
    for (const r of s.routes) {
      if (isAcme(r.path) || d.routes.some((x) => x.path === r.path)) continue;
      d.routes.push({ ...r, upstream: upstreamOf(r.target, upstreams) });
    }
  }
  const order: DomainEnv[] = ['prod', 'staging', 'dev', 'other'];
  return [...byName.values()].sort(
    (a, b) =>
      order.indexOf(a.env) - order.indexOf(b.env) ||
      (a.name === '' ? 1 : 0) - (b.name === '' ? 1 : 0) ||
      a.name.localeCompare(b.name),
  );
}

/** `http://127.0.0.1:4101/` → 4101: the local port an app listens on. */
export function localPortOf(target: string): number | null {
  const m = /^https?:\/\/(?:127\.0\.0\.1|localhost|\[::1\]):(\d+)/.exec(target);
  return m ? Number(m[1]) : null;
}

const pad = (n: string) => n.padStart(2, '0');

/** The common cron shapes in words; anything else is left to the raw schedule. */
export function describeCron(schedule: string): string | null {
  if (schedule === '@reboot') return 'At every boot';
  const named: Record<string, string> = {
    '@hourly': 'Every hour',
    '@daily': 'Every day at midnight',
    '@midnight': 'Every day at midnight',
    '@weekly': 'Every Sunday at midnight',
    '@monthly': 'On the 1st of every month',
  };
  if (named[schedule]) return named[schedule];
  const f = schedule.split(' ');
  if (f.length !== 5) return null;
  const [min, hour, dom, mon, dow] = f;
  const plain = (x: string) => /^\d+$/.test(x);
  if (min === '*' && hour === '*' && dom === '*' && mon === '*' && dow === '*')
    return 'Every minute';
  const everyMin = /^\*\/(\d+)$/.exec(min);
  if (everyMin && hour === '*' && dom === '*' && mon === '*' && dow === '*')
    return `Every ${everyMin[1]} minutes`;
  if (plain(min) && hour === '*' && dom === '*' && mon === '*' && dow === '*')
    return `Every hour at :${pad(min)}`;
  const everyHour = /^\*\/(\d+)$/.exec(hour);
  if (plain(min) && everyHour && dom === '*' && mon === '*' && dow === '*')
    return `Every ${everyHour[1]} hours at :${pad(min)}`;
  if (plain(min) && plain(hour) && mon === '*') {
    const at = `${pad(hour)}:${pad(min)}`;
    if (dom === '*' && dow === '*') return `Every day at ${at}`;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (dom === '*' && plain(dow)) return `Every ${days[Number(dow) % 7]} at ${at}`;
    if (plain(dom) && dow === '*') return `Monthly on day ${dom} at ${at}`;
  }
  return null;
}
