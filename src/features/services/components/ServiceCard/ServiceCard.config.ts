const DB = [
  'postgresql',
  'postgres',
  'mysql',
  'mariadb',
  'mongodb',
  'mongodb-community',
  'memcached',
];

export type ServiceKind = 'cache' | 'web' | 'db' | 'other';

/** Kind per formula (ignoring @version) — picks its icon, matching the original app. */
export function serviceKind(formula: string): ServiceKind {
  const base = formula.split('@')[0];
  if (base === 'redis' || base === 'valkey') return 'cache';
  if (base === 'nginx') return 'web';
  if (DB.includes(base)) return 'db';
  return 'other';
}
