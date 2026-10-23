export interface ParsedConnection {
  engine: 'postgres' | 'mysql' | 'mongodb' | 'redis';
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** e.g. `sslmode=require` — shown so the user knows it was understood. */
  params: Record<string, string>;
}

const ENGINES: Record<string, { engine: ParsedConnection['engine']; port: number }> = {
  postgres: { engine: 'postgres', port: 5432 },
  postgresql: { engine: 'postgres', port: 5432 },
  mysql: { engine: 'mysql', port: 3306 },
  mariadb: { engine: 'mysql', port: 3306 },
  mongodb: { engine: 'mongodb', port: 27017 },
  redis: { engine: 'redis', port: 6379 },
  rediss: { engine: 'redis', port: 6379 },
};

/** A `DATABASE_URL` (Prisma, Neon, Heroku, Railway…) split into the form's
 * fields. Errors say what can't be used, e.g. `mongodb+srv`. */
export function parseConnectionUrl(input: string): ParsedConnection | { error: string } {
  const raw = input
    .trim()
    .replace(/^(?:export\s+)?[A-Z_][A-Z0-9_]*=/, '')
    .replace(/^["']|["']$/g, '');
  const scheme = /^([a-z+]+):\/\//i.exec(raw)?.[1].toLowerCase();
  if (!scheme) return { error: 'Paste a URL like postgresql://user:password@host:5432/db' };
  if (scheme === 'mongodb+srv') {
    return {
      error: 'mongodb+srv (Atlas) URLs need DNS lookup; use the host and port of one member.',
    };
  }
  const known = ENGINES[scheme];
  if (!known) return { error: `Unsupported database: ${scheme}` };
  let url: URL;
  try {
    // Non-special schemes don't get host parsing in every engine: borrow http.
    url = new URL(raw.replace(/^[a-z+]+:/i, 'http:'));
  } catch {
    return { error: 'That URL could not be read.' };
  }
  if (
    raw
      .slice(scheme.length + 3)
      .split('@')
      .pop()!
      .split('/')[0]
      .includes(',')
  ) {
    return { error: 'Multi-host URLs aren’t supported; use one host.' };
  }
  const params = Object.fromEntries(url.searchParams.entries());
  const db = decodeURIComponent(url.pathname.replace(/^\//, ''));
  return {
    engine: known.engine,
    host: url.hostname.replace(/^\[|\]$/g, ''),
    port: url.port ? Number(url.port) : known.port,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: known.engine === 'redis' ? db || '0' : db,
    params,
  };
}
