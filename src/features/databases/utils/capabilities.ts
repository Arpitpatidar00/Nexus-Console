export type EngineFamily = 'postgres' | 'mysql' | 'mongodb' | 'redis' | 'unknown';

export interface EngineCapabilities {
  family: EngineFamily;
  displayName: string;
  isSupported: boolean;
  supportsNativeForeignKeys: boolean;
  supportsDiagram: boolean;
  supportsIndexes: boolean;
  supportsSql: boolean;
  supportsShellCommands: boolean;
  supportsDocumentBrowse: boolean;
  schemaInferenceType: 'catalog' | 'sampled' | 'keyspace_scan' | 'unsupported';
  isProbabilisticSchema: boolean;
  tableEntityLabel: string;
  tableEntityLabelPlural: string;
  queryEditorLabel: string;
  defaultQuery: string;
  unsupportedReason?: string;
}

export function normalizeEngine(driverOrEngine: string): EngineFamily {
  const norm = (driverOrEngine || '').toLowerCase().trim();
  if (norm === 'postgres' || norm === 'postgresql') return 'postgres';
  if (norm === 'mysql') return 'mysql';
  if (norm === 'mongo' || norm === 'mongodb') return 'mongodb';
  if (norm === 'redis') return 'redis';
  return 'unknown';
}

export const CAPABILITIES: Record<EngineFamily, EngineCapabilities> = {
  postgres: {
    family: 'postgres',
    displayName: 'PostgreSQL',
    isSupported: true,
    supportsNativeForeignKeys: true,
    supportsDiagram: true,
    supportsIndexes: true,
    supportsSql: true,
    supportsShellCommands: false,
    supportsDocumentBrowse: false,
    schemaInferenceType: 'catalog',
    isProbabilisticSchema: false,
    tableEntityLabel: 'table',
    tableEntityLabelPlural: 'tables',
    queryEditorLabel: 'SQL',
    defaultQuery: 'SELECT 1;',
  },
  mysql: {
    family: 'mysql',
    displayName: 'MySQL',
    isSupported: true,
    supportsNativeForeignKeys: true,
    supportsDiagram: true,
    supportsIndexes: true,
    supportsSql: true,
    supportsShellCommands: false,
    supportsDocumentBrowse: false,
    schemaInferenceType: 'catalog',
    isProbabilisticSchema: false,
    tableEntityLabel: 'table',
    tableEntityLabelPlural: 'tables',
    queryEditorLabel: 'SQL',
    defaultQuery: 'SELECT 1;',
  },
  mongodb: {
    family: 'mongodb',
    displayName: 'MongoDB',
    isSupported: true,
    supportsNativeForeignKeys: false,
    supportsDiagram: true,
    supportsIndexes: true,
    supportsSql: false,
    supportsShellCommands: true,
    supportsDocumentBrowse: true,
    schemaInferenceType: 'sampled',
    isProbabilisticSchema: true,
    tableEntityLabel: 'collection',
    tableEntityLabelPlural: 'collections',
    queryEditorLabel: 'Shell',
    defaultQuery: 'db.getCollectionNames()',
  },
  redis: {
    family: 'redis',
    displayName: 'Redis',
    isSupported: true,
    supportsNativeForeignKeys: false,
    supportsDiagram: false,
    supportsIndexes: false,
    supportsSql: false,
    supportsShellCommands: true,
    supportsDocumentBrowse: true,
    schemaInferenceType: 'keyspace_scan',
    isProbabilisticSchema: false,
    tableEntityLabel: 'prefix',
    tableEntityLabelPlural: 'prefixes',
    queryEditorLabel: 'Commands',
    defaultQuery: 'INFO keyspace',
  },
  unknown: {
    family: 'unknown',
    displayName: 'Unsupported Engine',
    isSupported: false,
    supportsNativeForeignKeys: false,
    supportsDiagram: false,
    supportsIndexes: false,
    supportsSql: false,
    supportsShellCommands: false,
    supportsDocumentBrowse: false,
    schemaInferenceType: 'unsupported',
    isProbabilisticSchema: false,
    tableEntityLabel: 'entity',
    tableEntityLabelPlural: 'entities',
    queryEditorLabel: 'Query',
    defaultQuery: '',
    unsupportedReason:
      'This database engine is not supported. Stackroost currently supports PostgreSQL, MySQL, MongoDB, and Redis.',
  },
};

export function getEngineCapabilities(driverOrEngine: string): EngineCapabilities {
  const family = normalizeEngine(driverOrEngine);
  return CAPABILITIES[family];
}

/**
 * Creates a globally unique identity key for a table or collection across
 * multiple databases in a microservice workspace.
 * Prevents homonym collisions when multiple services have same table names (e.g. `users`).
 */
export function globalTableKey(connectionId: string, schemaTableKey: string): string {
  return `${connectionId}::${schemaTableKey}`;
}

export function parseGlobalTableKey(
  globalKey: string,
): { connectionId: string; tableKey: string } | null {
  const idx = globalKey.indexOf('::');
  if (idx === -1) return null;
  return {
    connectionId: globalKey.slice(0, idx),
    tableKey: globalKey.slice(idx + 2),
  };
}

/** Validates whether a string is a 24-character hexadecimal BSON ObjectId string. */
export function isValidObjectIdString(val: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(val.trim());
}
