export type Engine = 'postgres' | 'mysql' | 'redis' | 'mongodb';

interface EngineConfig {
  label: string;
  port: number;
  /** null → the engine has no login user in the usual local setup (Redis). */
  user: { placeholder: string; default: string } | null;
  database: { label: string; placeholder: string; hint?: string } | null;
  /** APFS branching snapshots a data directory — only file-backed SQL engines. */
  dataDir: string | null;
}

export const ENGINES: Record<Engine, EngineConfig> = {
  postgres: {
    label: 'PostgreSQL',
    port: 5432,
    // Blank = psql's default, the macOS user: Homebrew's Postgres has no `postgres` role.
    user: { placeholder: 'Your macOS user', default: '' },
    database: { label: 'Database', placeholder: 'postgres' },
    dataDir: '/opt/homebrew/var/postgresql@16',
  },
  mysql: {
    label: 'MySQL',
    port: 3306,
    user: { placeholder: 'root', default: 'root' },
    database: { label: 'Database', placeholder: 'app_development', hint: 'Optional.' },
    dataDir: '/opt/homebrew/var/mysql',
  },
  redis: {
    label: 'Redis',
    port: 6379,
    user: null,
    database: null,
    dataDir: null,
  },
  mongodb: {
    label: 'MongoDB',
    port: 27017,
    user: { placeholder: 'Optional', default: '' },
    database: { label: 'Database', placeholder: 'test' },
    dataDir: null,
  },
};
