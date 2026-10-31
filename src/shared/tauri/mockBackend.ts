import { CMD } from './commands';
import dbContracts from '../../../fixtures/databases/explorer-contracts.json';

// In-memory state for web mode
const servicesData = [
  {
    name: 'postgresql@16',
    status: 'started',
    pid: 4892,
    cpu: 0.2,
    memoryBytes: 42949672,
    uptimeSecs: 86400,
    port: 5432,
    healthy: true,
    plist: '/opt/homebrew/opt/postgresql@16/homebrew.mxcl.postgresql@16.plist',
  },
  {
    name: 'redis',
    status: 'started',
    pid: 5120,
    cpu: 0.1,
    memoryBytes: 15728640,
    uptimeSecs: 86400,
    port: 6379,
    healthy: true,
    plist: '/opt/homebrew/opt/redis/homebrew.mxcl.redis.plist',
  },
  {
    name: 'nginx',
    status: 'stopped',
    pid: null,
    cpu: null,
    memoryBytes: null,
    uptimeSecs: null,
    port: 80,
    healthy: null,
    plist: '/opt/homebrew/opt/nginx/homebrew.mxcl.nginx.plist',
  },
  {
    name: 'jenkins-lts',
    status: 'none',
    pid: null,
    cpu: null,
    memoryBytes: null,
    uptimeSecs: null,
    port: 8080,
    healthy: null,
    plist: '/opt/homebrew/opt/jenkins-lts/homebrew.mxcl.jenkins-lts.plist',
  },
  {
    name: 'ollama',
    status: 'stopped',
    pid: null,
    cpu: null,
    memoryBytes: null,
    uptimeSecs: null,
    port: 11434,
    healthy: null,
    plist: '/opt/homebrew/opt/ollama/homebrew.mxcl.ollama.plist',
  },
];

const consentData = [
  {
    source: 'ssh_config' as const,
    name: '~/.ssh/config (Remote Servers)',
    granted: true,
    grantedAtEpoch: 1792435400,
  },
  {
    source: 'aws_config' as const,
    name: '~/.aws (Cloud AWS)',
    granted: true,
    grantedAtEpoch: 1792435400,
  },
  {
    source: 'shell_history' as const,
    name: 'Shell History (.zsh_history / .bash_history)',
    granted: false,
    grantedAtEpoch: null,
  },
  {
    source: 'project_env' as const,
    name: 'Project .env Files',
    granted: false,
    grantedAtEpoch: null,
  },
  {
    source: 'library_scan' as const,
    name: '~/Library Developer Caches',
    granted: true,
    grantedAtEpoch: 1792435400,
  },
];

let portsData = [
  {
    pid: 4892,
    command: 'postgres',
    user: 'developer',
    port: 5432,
    proto: 'TCP',
    cpu: 0.2,
    memoryBytes: 42949672,
    detached: false,
    project: 'stackroost',
  },
  {
    pid: 5120,
    command: 'redis-server',
    user: 'developer',
    port: 6379,
    proto: 'TCP',
    cpu: 0.1,
    memoryBytes: 15728640,
    detached: false,
    project: 'stackroost',
  },
  {
    pid: 14210,
    command: 'node',
    user: 'developer',
    port: 3000,
    proto: 'TCP',
    cpu: 1.2,
    memoryBytes: 104857600,
    detached: false,
    project: 'stackroost',
  },
  {
    pid: 8432,
    command: 'docker-proxy',
    user: 'developer',
    port: 8080,
    proto: 'TCP',
    cpu: 0.0,
    memoryBytes: 8388608,
    detached: false,
    project: 'infra',
  },
];

const packagesData = [
  {
    name: 'node@22',
    version: '22.12.0',
    kind: 'formula' as const,
    outdated: false,
    latestVersion: null,
    pinned: false,
  },
  {
    name: 'postgresql@16',
    version: '16.6',
    kind: 'formula' as const,
    outdated: false,
    latestVersion: null,
    pinned: true,
  },
  {
    name: 'redis',
    version: '7.2.5',
    kind: 'formula' as const,
    outdated: true,
    latestVersion: '7.4.0',
    pinned: false,
  },
  {
    name: 'git',
    version: '2.46.0',
    kind: 'formula' as const,
    outdated: false,
    latestVersion: null,
    pinned: false,
  },
  {
    name: 'docker',
    version: '27.1.1',
    kind: 'cask' as const,
    outdated: false,
    latestVersion: null,
    pinned: false,
  },
  {
    name: 'visual-studio-code',
    version: '1.95.0',
    kind: 'cask' as const,
    outdated: false,
    latestVersion: null,
    pinned: false,
  },
];

const containersData = [
  {
    id: 'c1a2b3c4d5e6',
    name: 'stackroost-db',
    image: 'postgres:16-alpine',
    state: 'running',
    status: 'Up 3 days (healthy)',
    health: 'healthy',
    restartCount: 0,
    restartPolicy: 'unless-stopped',
    exitCode: null,
    cpuPct: 0.3,
    memBytes: 52428800,
    ports: '0.0.0.0:5432->5432/tcp',
    composeProject: 'stackroost',
    createdAt: '2026-10-25T08:00:00Z',
  },
  {
    id: 'f7e8d9c0b1a2',
    name: 'stackroost-redis',
    image: 'redis:7-alpine',
    state: 'running',
    status: 'Up 3 days',
    health: null,
    restartCount: 0,
    restartPolicy: 'unless-stopped',
    exitCode: null,
    cpuPct: 0.1,
    memBytes: 16777216,
    ports: '0.0.0.0:6379->6379/tcp',
    composeProject: 'stackroost',
    createdAt: '2026-10-25T08:00:00Z',
  },
  {
    id: 'a3b4c5d6e7f8',
    name: 'monitoring-prometheus',
    image: 'prom/prometheus:latest',
    state: 'exited',
    status: 'Exited (0) 5 hours ago',
    health: null,
    restartCount: 1,
    restartPolicy: 'no',
    exitCode: 0,
    cpuPct: null,
    memBytes: null,
    ports: '9090/tcp',
    composeProject: 'observability',
    createdAt: '2026-10-20T12:00:00Z',
  },
];

const macleanReportData = {
  scannedAt: 1792435438,
  scanMs: 21798,
  disk: {
    totalBytes: 245107195904,
    usedBytes: 224444084224,
    freeBytes: 20663111680,
    dataUsedBytes: 183883739136,
  },
  map: [
    {
      id: 'other',
      label: 'Other users & system data',
      bytes: 145550739136,
      note: 'Not broken down yet. A deep scan explains it.',
    },
    {
      id: 'macos',
      label: 'macOS volumes',
      bytes: 40560345088,
      note: 'System, Preboot, Recovery and swap: see Disk volumes.',
    },
    {
      id: 'library',
      label: 'Library (app data)',
      bytes: 25556000000,
      note: 'Developer build artifacts & SDK caches.',
    },
    {
      id: 'apps',
      label: 'Applications',
      bytes: 12777000000,
      note: null,
    },
  ],
  volumes: [
    {
      role: '',
      label: 'Macintosh HD',
      why: 'Another APFS volume in this container.',
      bytes: 1714196480,
      oversized: false,
    },
    {
      role: 'Preboot',
      label: 'Preboot',
      why: 'Boot files and staged macOS updates.',
      bytes: 18366169088,
      oversized: true,
    },
    {
      role: 'Recovery',
      label: 'Recovery',
      why: 'The recovery system. Normal.',
      bytes: 3441033216,
      oversized: false,
    },
    {
      role: 'VM',
      label: 'VM (swap)',
      why: 'Swap memory. Shrinks after a restart.',
      bytes: 3221463040,
      oversized: false,
    },
    {
      role: 'Data',
      label: 'Data (all your stuff)',
      why: 'Apps, users and files: broken down above.',
      bytes: 183883743232,
      oversized: false,
    },
    {
      role: 'System',
      label: 'macOS system',
      why: 'Sealed, read-only macOS. Normal.',
      bytes: 13657120768,
      oversized: false,
    },
  ],
  causes: [
    {
      bytes: 18366169088,
      text: 'The Preboot volume is oversized by a downloaded macOS update.',
      fix: 'Install it: System Settings → General → Software Update.',
    },
    {
      bytes: null,
      text: '2 Time Machine local snapshots on this disk.',
      fix: 'macOS deletes them on its own when space runs low; nothing to do unless you need the space now.',
    },
  ],
  items: [
    {
      id: 'npm',
      label: 'npm cache',
      bytes: 183920000,
      skip: null,
      defaultSelected: true,
      note: null,
      detail: [],
    },
    {
      id: 'docker_installer',
      label: 'Docker installer leftovers',
      bytes: 2340000000,
      skip: 'Docker update may be in progress',
      defaultSelected: true,
      note: null,
      detail: [],
    },
    {
      id: 'docker_images',
      label: 'Unused Docker images',
      bytes: 443900000,
      skip: null,
      defaultSelected: false,
      note: null,
      detail: ['docker:29-dind · 423 MB'],
    },
  ],
  insights: [
    {
      id: 'brew_versions',
      text: 'Multiple Node.js versions in Cellar',
      detail: ['node@20, node@22'],
    },
  ],
  largeFiles: [
    {
      path: '/Users/developer/Downloads/disk.iso',
      bytes: 4800000000,
    },
  ],
};

const memoryData = {
  sampledAtMs: 1792435438000,
  composition: {
    totalBytes: 8589934592,
    appBytes: 2338308096,
    wiredBytes: 2272346112,
    compressedBytes: 2468855808,
    cachedBytes: 855932928,
    freeBytes: 654491648,
    usedBytes: 7079510016,
  },
  pressure: 'normal' as const,
  swapTotalBytes: 5368709120,
  swapUsedBytes: 3885896826,
  swapoutBytesPerSec: 204800.0,
  uptimeSecs: 260233,
  restartSuggested: false,
  topApps: [
    {
      name: 'Google Chrome',
      processes: 20,
      bytes: 1439186944,
    },
    {
      name: 'Stackroost',
      processes: 2,
      bytes: 747929600,
    },
    {
      name: 'Docker Desktop',
      processes: 8,
      bytes: 624535040,
    },
  ],
};

export async function mockInvoke(cmd: string, args?: Record<string, unknown>): Promise<unknown> {
  switch (cmd) {
    case CMD.GET_APP_CONTEXT:
      return {
        platform: 'macos',
        arch: 'aarch64',
        brewPrefix: '/opt/homebrew',
        brewBin: '/opt/homebrew/bin/brew',
        brewVersion: '6.0.10',
        maxPtys: 8,
      };

    case CMD.SYSTEM_DETECT_TOOLS:
      return [
        { id: 'brew', label: 'Homebrew', installed: true },
        { id: 'docker', label: 'Docker Desktop / OrbStack', installed: true },
        { id: 'psql', label: 'PostgreSQL CLI', installed: true },
        { id: 'mysql', label: 'MySQL Client', installed: true },
        { id: 'redis-cli', label: 'Redis CLI', installed: true },
        { id: 'ssh', label: 'OpenSSH Client', installed: true },
        { id: 'aws', label: 'AWS CLI', installed: true },
        { id: 'gh', label: 'GitHub CLI', installed: true },
        { id: 'claude', label: 'Claude Code', installed: true },
        { id: 'xcode', label: 'Xcode Command Line Tools', installed: true },
        { id: 'android', label: 'Android SDK / Studio', installed: true },
        { id: 'ollama', label: 'Ollama AI', installed: false },
      ];

    case CMD.SYSTEM_DISK_FREE:
      return {
        totalBytes: 245107195904,
        freeBytes: 20663111680,
      };

    case CMD.LIST_SERVICES:
      return servicesData;

    case CMD.START_SERVICE: {
      const name = args?.name as string;
      const s = servicesData.find((svc) => svc.name === name);
      if (s) {
        s.status = 'started';
        s.pid = s.pid ?? 54321;
        s.healthy = true;
      }
      return null;
    }

    case CMD.STOP_SERVICE: {
      const name = args?.name as string;
      const s = servicesData.find((svc) => svc.name === name);
      if (s) {
        s.status = 'stopped';
        s.pid = null;
        s.healthy = null;
      }
      return null;
    }

    case CMD.RESTART_SERVICE: {
      const name = args?.name as string;
      const s = servicesData.find((svc) => svc.name === name);
      if (s) {
        s.status = 'started';
        s.pid = Math.floor(Math.random() * 10000) + 1000;
        s.healthy = true;
      }
      return null;
    }

    case CMD.SERVICES_DIAGNOSE:
      return {
        formula: args?.formula || 'postgresql@16',
        logTail: [
          '2026-10-28 10:00:00 [info] database system was shut down at 2026-10-28 09:59:58 UTC',
          '2026-10-28 10:00:01 [info] database system is ready to accept connections',
        ],
        portConflict: null,
        exitStatus: 'clean',
        recommendations: [],
      };

    case CMD.LIST_PORTS:
      return portsData;

    case CMD.KILL_PROCESS: {
      const pid = args?.pid as number;
      portsData = portsData.filter((p) => p.pid !== pid);
      return null;
    }

    case CMD.PROBE_PORT_HTTP:
      return { status: 200, title: 'Stackroost API Server' };

    case CMD.LIST_PACKAGES:
      return packagesData;

    case CMD.PACKAGES_OUTDATED:
      return [{ name: 'redis', currentVersion: '7.2.5', latestVersion: '7.4.0', pinned: false }];

    case CMD.PACKAGE_INFO:
      return {
        name: (args?.name as string) || 'redis',
        description: 'Persistent key-value database with network interface',
        homepage: 'https://redis.io/',
        version: '7.2.5',
        dependencies: ['openssl@3'],
        isService: true,
        isCask: false,
      };

    case CMD.PACKAGE_DEPENDENTS:
      return [];

    case CMD.DOCKER_RUNTIME_STATUS:
      return {
        runtime: 'Docker Desktop',
        running: true,
        containerCount: containersData.length,
        version: '27.1.1',
      };

    case CMD.DOCKER_LIST_CONTAINERS:
      return containersData;

    case CMD.DOCKER_CONTAINER_ACTION: {
      const id = args?.id as string;
      const action = args?.action as string;
      const c = containersData.find((x) => x.id === id);
      if (c) {
        if (action === 'stop') c.state = 'exited';
        if (action === 'start') c.state = 'running';
        if (action === 'restart') c.state = 'running';
      }
      return null;
    }

    case CMD.MACLEAN_SCAN:
      return macleanReportData;

    case CMD.MACLEAN_MEMORY:
      return memoryData;

    case CMD.MACLEAN_RULES:
      return {
        protectedNames: ['node_modules', '.git'],
        projectRoots: ['~/Projects', '~/Documents/code'],
        nextIdleDays: 7,
        logAgeDays: 14,
        staleNodeModulesDays: 30,
      };

    case CMD.MACLEAN_JOURNAL:
      return [];

    case CMD.MACLEAN_CLEAN:
      return {
        atEpoch: Math.floor(Date.now() / 1000),
        freedBytes: 2523920000,
        items: [{ id: 'npm', label: 'npm cache', ok: true, message: 'Freed 184 MB' }],
      };

    case CMD.MACLEAN_GHOST_SCAN:
      return {
        leftovers: [],
        totalReclaimableBytes: 0,
        scanTimeEpoch: Math.floor(Date.now() / 1000),
      };

    case CMD.MACLEAN_ENERGY_SAMPLE:
      return {
        powerSource: 'Battery',
        isCharging: false,
        batteryPercent: 88,
        processes: [
          {
            pid: 14210,
            name: 'node',
            category: 'Developer Tool',
            idleWakeups: 12,
            interruptWakeups: 8,
            cpuTimeMs: 1420,
            diskWriteBytes: 1048576,
            energyImpactScore: 4.2,
          },
          {
            pid: 4892,
            name: 'postgres',
            category: 'Database',
            idleWakeups: 2,
            interruptWakeups: 1,
            cpuTimeMs: 500,
            diskWriteBytes: 409600,
            energyImpactScore: 1.1,
          },
        ],
        unpluggedSuggestion: null,
      };

    case CMD.MACLEAN_TRENDS:
      return {
        records: [],
        weeklyFreeDeltaBytes: 1073741824,
        biggestGrowers: [],
      };

    case CMD.MACLEAN_DUPLICATES_SCAN:
      return {
        groups: [],
        totalReclaimableBytes: 0,
        scannedFilesCount: 142,
      };

    case CMD.DOCTOR_SCAN:
    case CMD.DOCTOR_DEEP_SCAN:
      return [
        {
          probeId: 'disk_space',
          scope: 'disk',
          severity: 'green',
          tag: 'storage',
          summary: 'Disk Space Healthy',
          explain: '20.6 GB free on system volume.',
          guide: null,
          fix: null,
        },
        {
          probeId: 'brew_health',
          scope: 'system',
          severity: 'green',
          tag: 'speed',
          summary: 'Homebrew Healthy',
          explain: 'All packages and dependencies are in good state.',
          guide: null,
          fix: null,
        },
        {
          probeId: 'vscode_cache',
          scope: 'vscode',
          severity: 'yellow',
          tag: 'storage',
          summary: 'VS Code Cached Extensions',
          explain: '3 orphaned extension data directories found (420 MB).',
          guide: ['Clear orphaned extensions in ~/Library/Application Support/Code'],
          fix: 'Clean up orphaned caches',
        },
      ];

    case CMD.DOCTOR_JOURNAL:
      return [];

    case CMD.REMOTE_STATE:
      return {
        consent: { granted: true, grantedAtEpoch: Math.floor(Date.now() / 1000) },
        hosts: [
          {
            id: 'h-prod-api',
            source: 'manual',
            alias: 'api-prod',
            manual: {
              hostname: 'api.production.internal',
              user: 'ubuntu',
              port: 22,
              identityFile: null,
            },
            label: 'Production API Gateway',
            project: 'Stackroost Cloud',
            env: 'prod',
            order: 0,
            autoConnect: false,
          },
          {
            id: 'h-staging',
            source: 'manual',
            alias: 'staging-box',
            manual: { hostname: 'staging.internal', user: 'deploy', port: 22, identityFile: null },
            label: 'Staging Cluster',
            project: 'Stackroost Cloud',
            env: 'staging',
            order: 1,
            autoConnect: false,
          },
        ],
        tunnels: [],
      };

    case CMD.REMOTE_STATUS:
      return [
        { id: 'h-prod-api', connected: true },
        { id: 'h-staging', connected: false },
      ];

    case CMD.REMOTE_SNAPSHOT:
      return {
        capturedAt: Math.floor(Date.now() / 1000),
        probeMs: 120,
        system: {
          hostname: 'api-prod',
          os: 'Ubuntu 24.04 LTS',
          kernel: '6.8.0-generic',
          arch: 'x86_64',
          uptimeSecs: 864000,
          rebootRequired: false,
        },
        cpu: {
          cores: 8,
          usagePct: 14.2,
          load1: 0.88,
          load5: 0.59,
          load15: 0.28,
        },
        memory: {
          totalBytes: 16777216000,
          availableBytes: 11811160000,
          swapTotalBytes: 4294967296,
          swapFreeBytes: 4294967296,
        },
        disks: [
          {
            mount: '/',
            fs: '/dev/root',
            totalBytes: 107374182400,
            usedBytes: 42949672960,
            availBytes: 64424509440,
          },
        ],
        docker: {
          state: 'ok',
          version: '27.1.1',
        },
        containers: [
          {
            id: 'c1122334455',
            name: 'api-backend-1',
            image: 'stackroost/api:v1.2',
            state: 'running',
            status: 'Up 10 days (healthy)',
            health: 'healthy',
            restartCount: 0,
            restartPolicy: 'always',
            exitCode: null,
            cpuPct: 2.1,
            memBytes: 157286400,
            ports: '0.0.0.0:8000->8000/tcp',
            composeProject: 'backend',
            createdAt: '2026-10-18T10:00:00Z',
          },
        ],
        composeProjects: [
          { name: 'backend', status: 'running', configFiles: '/opt/stackroost/docker-compose.yml' },
        ],
        services: [
          { unit: 'sshd.service', description: 'OpenSSH server daemon' },
          { unit: 'nginx.service', description: 'A high performance web server' },
        ],
        failedUnits: [],
        pm2: null,
        ports: [
          { proto: 'tcp', local: '0.0.0.0', port: 22, process: 'sshd' },
          { proto: 'tcp', local: '0.0.0.0', port: 8000, process: 'docker-proxy' },
        ],
        recentErrors: [],
        oomKills24h: 0,
        findings: [],
        warnings: [],
      };

    case CMD.REMOTE_SCAN_CONFIG:
      return [];

    case CMD.REMOTE_GET_TUNNELS:
      return [];

    case CMD.REMOTE_GET_HISTORY:
      return [];

    case CMD.REMOTE_GET_RUNBOOKS:
      return [];

    case CMD.REMOTE_GET_DEPLOYS:
      return [];

    case CMD.DB_DISCOVER_CONNECTIONS:
      return [
        {
          name: 'PostgreSQL 16',
          driver: 'postgres',
          port: 5432,
          source: 'Homebrew Service',
          dataDir: '/opt/homebrew/var/postgresql@16',
        },
      ];

    case CMD.DB_LIST_CONNECTIONS:
      return [
        {
          id: 'local-postgres',
          name: 'Local Dev Postgres',
          driver: 'postgres',
          host: '127.0.0.1',
          port: 5432,
          user: 'postgres',
          database: 'stackroost_dev',
          tunnelId: null,
          allowWrites: true,
          env: 'dev',
          dataDir: '/opt/homebrew/var/postgresql@16',
        },
      ];

    case CMD.DB_SCHEMA:
      return dbContracts.postgres;

    case CMD.DB_BROWSE:
      return dbContracts.browsePage;

    case CMD.DB_LIST_GROUPS:
      return [];

    case CMD.DB_LIST_CUSTOM_MAPPINGS:
      return [];

    case CMD.DB_LIST_REJECTED_CANDIDATES:
      return [];

    case CMD.DB_PING:
      return { ok: true, latencyMs: 5, error: null };

    case CMD.DB_SAVE_EXPORT:
      return '/Users/developer/Downloads/schema-export.sql';

    case CMD.DB_RUN_QUERY:
      return {
        columns: ['id', 'name', 'status', 'created_at'],
        rows: [
          ['1', 'alpha', 'active', '2026-10-01'],
          ['2', 'beta', 'idle', '2026-10-15'],
        ],
        rowCount: 2,
        durationMs: 4,
      };

    case CMD.DB_LIST_SNAPSHOTS:
      return [
        {
          id: 'snap-1',
          service: 'postgresql@16',
          label: 'pre-migration',
          path: '~/.stackroost/backups/pg_snap1.sql',
          createdAt: 1792430000,
          sizeBytes: 1542000,
        },
      ];

    case CMD.PROJECTS_DISCOVER:
      return [
        {
          name: 'Stackroost',
          path: '~/Developer/Stackroost',
          framework: 'React / Vite',
          git: {
            branch: 'main',
            dirtyCount: 0,
            ahead: 0,
            behind: 0,
            stashCount: 0,
            lastCommit: {
              hash: 'a1b2c3d',
              message: 'feat: developer workspace dashboard',
              relativeTime: '2 hours ago',
              author: 'Developer',
            },
            mergedBranches: [],
          },
        },
      ];

    case CMD.PROJECTS_LIST_WORKSPACES:
      return [];

    case CMD.PROJECTS_LIST_SAVED_COMMANDS:
      return [];

    case CMD.PROJECTS_PROFILE:
      return {
        path: (args?.path as string) || '~/Developer/Stackroost',
        name: 'Stackroost',
        stacks: ['Node.js', 'React'],
        frameworks: ['Vite', 'Tailwind CSS'],
        packageManager: 'bun',
        tasks: [
          {
            id: 'dev',
            label: 'dev',
            kind: 'dev',
            steps: [['bun', 'run', 'dev']],
            source: 'package.json',
            longRunning: true,
          },
          {
            id: 'build',
            label: 'build',
            kind: 'build',
            steps: [['bun', 'run', 'build']],
            source: 'package.json',
            longRunning: false,
          },
          {
            id: 'test',
            label: 'test',
            kind: 'test',
            steps: [['bun', 'run', 'test']],
            source: 'package.json',
            longRunning: false,
          },
        ],
        primary: 'dev',
        install: 'bun install',
        deps: 'installed',
        hasEnv: true,
        envRead: true,
        envTemplate: '.env.example',
        envMissingKeys: [],
        expectedPort: 3000,
        tools: [
          {
            name: 'bun',
            label: 'Bun',
            neededFor: 'Package manager and runtime',
            install: 'curl -fsSL https://bun.sh/install | bash',
            found: true,
            version: '1.1.29',
          },
        ],
        running: [{ pid: 14210, command: 'node', port: 3000 }],
        checks: [
          {
            id: 'deps',
            level: 'ok',
            title: 'Dependencies installed',
            detail: 'node_modules up to date',
            fix: null,
          },
          {
            id: 'port',
            level: 'ok',
            title: 'Listening on :3000',
            detail: 'PID 14210',
            fix: null,
          },
        ],
      };

    case CMD.PROJECTS_GET_GITHUB_STATUS:
      return {
        ghInstalled: true,
        loggedIn: true,
        pullRequests: [],
        ciStatus: 'passing',
      };

    case CMD.UPTIME_LIST_MONITORS:
      return [
        {
          id: 'mon-1',
          name: 'Stackroost Production',
          url: 'https://stackroost.dev',
          intervalMins: 5,
          enabled: true,
          lastStatus: 200,
          lastLatencyMs: 38,
          isUp: true,
          uptimePercent24h: 100,
          history: [
            {
              timestamp: Math.floor(Date.now() / 1000) - 300,
              statusCode: 200,
              latencyMs: 42,
              isUp: true,
              error: null,
            },
            {
              timestamp: Math.floor(Date.now() / 1000),
              statusCode: 200,
              latencyMs: 38,
              isUp: true,
              error: null,
            },
          ],
        },
      ];

    case CMD.DOMAINS_LOOKUP_DNS:
      return {
        domain: (args?.domain as string) || 'stackroost.dev',
        records: [
          { recordType: 'A', value: '76.76.21.21', ttl: 300, raw: '76.76.21.21' },
          {
            recordType: 'CNAME',
            value: 'cname.vercel-dns.com',
            ttl: 300,
            raw: 'cname.vercel-dns.com',
          },
        ],
      };

    case CMD.DOMAINS_CHECK_SSL:
      return {
        domain: (args?.domain as string) || 'stackroost.dev',
        valid: true,
        issuer: "Let's Encrypt Authority X3",
        subject: 'CN=stackroost.dev',
        notBefore: '2026-08-01T00:00:00Z',
        notAfter: '2026-11-01T00:00:00Z',
        daysRemaining: 64,
        sans: ['stackroost.dev', '*.stackroost.dev'],
        error: null,
      };

    case CMD.DOMAINS_CHECK_RDAP:
      return {
        domain: (args?.domain as string) || 'stackroost.dev',
        registrar: 'Namecheap Inc.',
        expirationDate: '2027-10-01T00:00:00Z',
        createdDate: '2024-10-01T00:00:00Z',
        updatedDate: '2026-09-15T00:00:00Z',
        status: ['clientTransferProhibited'],
        error: null,
      };

    case CMD.DOMAINS_CHECK_PROPAGATION:
      return {
        domain: (args?.domain as string) || 'stackroost.dev',
        recordType: 'A',
        answers: [
          {
            resolver: '1.1.1.1',
            resolverName: 'Cloudflare',
            records: ['76.76.21.21'],
            latencyMs: 14,
          },
          { resolver: '8.8.8.8', resolverName: 'Google', records: ['76.76.21.21'], latencyMs: 18 },
        ],
      };

    case CMD.AWS_LIST_PROFILES:
      return ['default', 'production'];

    case CMD.AWS_LIST_EC2_INSTANCES:
      return [
        {
          id: 'i-0123456789abcdef0',
          name: 'api-production-us-east',
          state: 'running',
          instanceType: 't3.medium',
          publicIp: '54.210.12.34',
          privateIp: '10.0.1.25',
          region: 'us-east-1',
          isProd: true,
          tags: [
            ['Name', 'api-production-us-east'],
            ['Environment', 'production'],
          ],
        },
        {
          id: 'i-0987654321fedcba1',
          name: 'worker-staging',
          state: 'stopped',
          instanceType: 't3.small',
          publicIp: null,
          privateIp: '10.0.2.14',
          region: 'us-east-1',
          isProd: false,
          tags: [
            ['Name', 'worker-staging'],
            ['Environment', 'staging'],
          ],
        },
      ];

    case CMD.AWS_INSTANCE_ACTION:
      return 'Action completed successfully';

    case CMD.AWS_LIST_S3_BUCKETS:
      return [
        {
          name: 'stackroost-backups-us-east',
          creationDate: '2026-01-15T10:00:00Z',
          region: 'us-east-1',
        },
        {
          name: 'stackroost-assets-prod',
          creationDate: '2026-02-01T12:00:00Z',
          region: 'us-east-1',
        },
      ];

    case CMD.AWS_GET_COSTS:
      return {
        monthToDateTotal: 148.52,
        currency: 'USD',
        topServices: [
          { service: 'Amazon Elastic Compute Cloud - Compute', amount: 84.2, unit: 'USD' },
          { service: 'Amazon Relational Database Service', amount: 42.12, unit: 'USD' },
          { service: 'Amazon Simple Storage Service', amount: 22.2, unit: 'USD' },
        ],
        cachedAt: Math.floor(Date.now() / 1000),
      };

    case CMD.CONSENT_GET_ALL:
      return consentData;

    case CMD.CONSENT_SET: {
      const source = args?.source as string;
      const granted = Boolean(args?.granted);
      const entry = consentData.find((c) => c.source === source);
      if (entry) {
        entry.granted = granted;
        entry.grantedAtEpoch = granted ? Math.floor(Date.now() / 1000) : null;
        return entry;
      }
      return {
        source,
        name: source,
        granted,
        grantedAtEpoch: granted ? Math.floor(Date.now() / 1000) : null,
      };
    }

    case CMD.NET_GET_DECLARED_DESTINATIONS:
      return [
        {
          id: 'github_api',
          hostPattern: 'api.github.com',
          purpose: 'Release check; PR status via gh CLI',
          module: 'Projects / Updater',
          outbound: true,
          userConfigured: false,
        },
        {
          id: 'rdap',
          hostPattern: 'rdap.org',
          purpose: 'Registration and expiry domain lookup',
          module: 'Domains',
          outbound: true,
          userConfigured: false,
        },
        {
          id: 'dns_check',
          hostPattern: '1.1.1.1, 8.8.8.8, 9.9.9.9',
          purpose: 'DNS propagation check',
          module: 'Domains',
          outbound: true,
          userConfigured: false,
        },
        {
          id: 'aws',
          hostPattern: '*.amazonaws.com',
          purpose: 'AWS EC2, S3, Cost Explorer via aws CLI',
          module: 'Cloud',
          outbound: true,
          userConfigured: false,
        },
        {
          id: 'ollama',
          hostPattern: '127.0.0.1:11434',
          purpose: 'Local Ollama AI inference',
          module: 'AI',
          outbound: true,
          userConfigured: false,
        },
      ];

    case CMD.DEVICES_LIST_IOS:
      return [
        {
          udid: 'E3B94D99-A05E-4B02-86FD-311DFA3C9A12',
          name: 'iPhone 16 Pro',
          state: 'Booted',
          runtime: 'iOS 18.0',
          is_available: true,
        },
        {
          udid: 'F5C82A11-D14C-4E23-92AB-872BCF1A5B34',
          name: 'iPad Pro 13-inch (M4)',
          state: 'Shutdown',
          runtime: 'iPadOS 18.0',
          is_available: true,
        },
      ];

    case CMD.DEVICES_LIST_ANDROID:
      return [
        {
          name: 'Pixel_8_API_34',
          running: true,
        },
        {
          name: 'Pixel_Fold_API_34',
          running: false,
        },
      ];

    case CMD.DEVICES_CONTROL_IOS:
      return 'Simulator command executed';

    case CMD.DEVICES_LAUNCH_ANDROID:
      return 'AVD launched';

    case CMD.RELEASES_DETECT_CONFIG:
      return {
        project_path: (args?.projectPath as string) || '~/Developer/Stackroost',
        platform: 'React / Web',
        has_fastlane: true,
        lanes: ['deploy_staging', 'deploy_production', 'build_bundle'],
        version_name: '0.2.0',
        build_number: '42',
      };

    case CMD.AI_CHECK_OLLAMA:
      return { running: false, models: [] };

    case CMD.AI_GET_MODEL_PRICING:
      return [];

    case CMD.BACKUP_LIST_HISTORY:
      return [];

    case CMD.NETWORK_GET_INTERFACES:
      return {
        primaryInterface: 'en0',
        ipv4Address: '192.168.1.150',
        ipv6Address: 'fe80::1042:a3ff:fe91:b2c3',
        dnsServers: ['1.1.1.1', '8.8.8.8'],
      };

    case CMD.NETWORK_GET_BANDWIDTH:
      return [
        { process: 'Google Chrome', pid: 1420, bytesIn: 1048576, bytesOut: 204800 },
        { process: 'node', pid: 14210, bytesIn: 524288, bytesOut: 102400 },
        { process: 'Docker Desktop', pid: 3201, bytesIn: 262144, bytesOut: 65536 },
      ];

    case CMD.NETWORK_GET_HOSTS:
      return [
        {
          id: 'h-1',
          ip: '127.0.0.1',
          hostnames: ['localhost', 'stackroost.local'],
          comment: 'Local dev loopback',
          enabled: true,
        },
        {
          id: 'h-2',
          ip: '::1',
          hostnames: ['localhost'],
          comment: 'IPv6 localhost',
          enabled: true,
        },
        {
          id: 'h-3',
          ip: '10.0.0.50',
          hostnames: ['staging.internal'],
          comment: 'Staging cluster DNS override',
          enabled: false,
        },
      ];

    case CMD.NETWORK_FLUSH_DNS:
      return 'DNS cache flushed';

    case CMD.NETWORK_SAVE_HOSTS:
    case CMD.NETWORK_RESTORE_HOSTS:
      return null;

    case CMD.CHAOS_LIST_PROXIES:
      return [
        {
          id: 'chaos-postgres',
          targetPort: 5432,
          chaosPort: 5433,
          profile: { latencyMs: 200, dropRatePct: 5, reject: false },
          active: true,
        },
      ];

    case CMD.CHAOS_START_PROXY:
      return {
        id: 'chaos-proxy-dynamic',
        targetPort: (args?.targetPort as number) || 8000,
        chaosPort: (args?.chaosPort as number) || 8001,
        profile: (args?.profile as { latencyMs: number; dropRatePct: number; reject: boolean }) || {
          latencyMs: 100,
          dropRatePct: 0,
          reject: false,
        },
        active: true,
      };

    case CMD.CHAOS_STOP_PROXY:
      return null;

    case CMD.CHAOS_SIMULATE:
      return true;

    case CMD.CLAUDE_INSTALLED:
      return true;

    case CMD.CLAUDE_SETTINGS:
      return {
        cleanupPeriodDays: 90,
        archiveRoot: '~/.stackroost/claude-archives',
      };

    case CMD.CLAUDE_PROJECTS:
      return [
        {
          dirName: '-Users-developer-Developer-Stackroost',
          displayName: 'Stackroost',
          realPath: '/Users/developer/Developer/Stackroost',
          sessions: 14,
          totalBytes: 2450000,
          newestEpoch: Math.floor(Date.now() / 1000) - 3600,
          cacheBytes: 520000,
        },
      ];

    case CMD.CLAUDE_SESSIONS:
      return [
        {
          file: 'session-2026-10-28.json',
          epoch: Math.floor(Date.now() / 1000) - 3600,
          title: 'Implement database explorer & Kafka explorer features',
        },
      ];

    case CMD.CLAUDE_ARCHIVED:
      return [];

    case CMD.CLAUDE_SEARCH_TRANSCRIPTS:
      return [];

    case CMD.CLAUDE_EXPORT_MARKDOWN:
      return '# Claude Code Session\n\n**User**: Implement database explorer\n**Assistant**: Added PostgreSQL schema inspector';

    case CMD.CLAUDE_SESSION_CONTEXT:
      return {
        totalTokens: 45000,
        maxTokens: 200000,
        pctUsed: 22.5,
        userTokens: 8000,
        assistantTokens: 12000,
        toolResultTokens: 25000,
        largeItems: [
          { label: 'schema.json', tokenEstimate: 15000, pct: 33.3 },
          { label: 'git diff', tokenEstimate: 7000, pct: 15.5 },
        ],
        recommendation: 'Context is healthy. 155,000 tokens remaining in active window.',
      };

    case CMD.CLAUDE_PROJECT_USAGE:
      return {
        inputTokens: 120500,
        outputTokens: 24300,
        cacheReadTokens: 450000,
        estimatedCostUsd: 4.82,
      };

    case CMD.APP_ABOUT:
      return {
        version: '0.2.0',
        gitSha: '6af51d8',
        buildEpoch: 1792435400,
        arch: 'arm64',
        macos: '15.0',
      };

    case CMD.DIAG_LIST_ERRORS:
      return [];

    case CMD.DIAG_REPORT:
      return 'Stackroost v0.2.0 (web-arm64, macOS 15.0)\nGit: 6af51d8\nModules: all enabled\nNo errors recorded.';

    case CMD.SECRETS_SCAN_PROJECTS:
      return {
        scannedProjects: 1,
        scannedFiles: 42,
        findings: [
          {
            id: 'sec-1',
            projectPath: '~/Developer/Stackroost',
            filePath: '.env.local',
            lineNumber: 4,
            ruleId: 'aws-access-key',
            ruleName: 'AWS Access Key ID',
            severity: 'critical',
            maskedPreview: 'AKIA************',
            remediation:
              'Move key to macOS Keychain or AWS Secrets Manager; add .env.local to .gitignore',
          },
        ],
      };

    case CMD.SECRETS_SCAN_HISTORY:
      return [];

    case CMD.KAFKA_LIST_CLUSTERS:
      return [
        {
          id: 'k-local',
          name: 'Local Dev Cluster',
          bootstrap: ['localhost:9092'],
          security: 'plaintext',
          saslMechanism: null,
          username: null,
          caCertPath: null,
          env: 'local',
          createdAt: 1700000000000,
          updatedAt: 1700000000000,
          hasPassword: false,
        },
      ];

    case CMD.KAFKA_ADD_CLUSTER: {
      const input =
        (args?.input as {
          name?: string;
          bootstrap?: string;
          security?: string;
          env?: string;
          password?: string;
        }) || {};
      return {
        id: `kafka_${Date.now()}`,
        name: input.name || 'Kafka Cluster',
        bootstrap: (input.bootstrap || 'localhost:9092').split(',').map((s: string) => s.trim()),
        security: input.security || 'plaintext',
        saslMechanism: null,
        username: null,
        caCertPath: null,
        env: input.env || 'local',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        hasPassword: Boolean(input.password),
      };
    }

    case CMD.KAFKA_TEST_CONNECTION:
    case CMD.KAFKA_PING:
      return {
        ok: true,
        latencyMs: 12,
        clusterId: 'dev-cluster-uuid',
        brokerCount: 1,
        topicCount: 2,
        error: null,
        warnings: [],
      };

    case CMD.KAFKA_OVERVIEW:
      return {
        clusterId: 'c-local-uuid',
        controllerId: 1,
        brokers: [
          {
            id: 1,
            host: 'localhost',
            port: 9092,
            rack: null,
            isController: true,
            leaderCount: 3,
            replicaCount: 3,
            sizeBytes: 1048576,
            diskTotalBytes: 107374182400,
            diskUsableBytes: 64424509440,
            error: null,
          },
        ],
        topicCount: 2,
        internalTopicCount: 1,
        partitionCount: 3,
        underReplicatedPartitions: 0,
        offlinePartitions: 0,
        nonPreferredLeaders: 0,
        features: [{ name: 'metadata.version', level: 21 }],
        warnings: [],
      };

    case CMD.KAFKA_TOPICS:
      return {
        topics: [
          {
            name: 'orders',
            internal: false,
            partitions: 3,
            replicationFactor: 1,
            underReplicated: 0,
            offline: 0,
            messages: 1420,
            sizeBytes: 245760,
            error: null,
          },
          {
            name: '__consumer_offsets',
            internal: true,
            partitions: 50,
            replicationFactor: 1,
            underReplicated: 0,
            offline: 0,
            messages: 890,
            sizeBytes: 524288,
            error: null,
          },
        ],
        warnings: [],
      };

    case CMD.KAFKA_TOPIC_DETAIL:
      return {
        name: (args?.topic as string) || 'orders',
        topicId: 'uuid-topic-orders',
        internal: false,
        partitions: [
          {
            partition: 0,
            leader: 1,
            replicas: [1],
            isr: [1],
            offlineReplicas: [],
            low: 0,
            high: 500,
            messages: 500,
            sizeBytes: 81920,
            error: null,
          },
          {
            partition: 1,
            leader: 1,
            replicas: [1],
            isr: [1],
            offlineReplicas: [],
            low: 0,
            high: 460,
            messages: 460,
            sizeBytes: 78000,
            error: null,
          },
          {
            partition: 2,
            leader: 1,
            replicas: [1],
            isr: [1],
            offlineReplicas: [],
            low: 0,
            high: 460,
            messages: 460,
            sizeBytes: 85840,
            error: null,
          },
        ],
        configs: [
          {
            name: 'cleanup.policy',
            value: 'delete',
            source: 'default',
            isDefault: true,
            readOnly: false,
            sensitive: false,
            documentation: null,
          },
        ],
        configsError: null,
        warnings: [],
      };

    case CMD.KAFKA_GROUPS:
      return {
        groups: [
          {
            groupId: 'billing-consumer-group',
            protocolType: 'consumer',
            groupType: 'classic',
            state: 'Stable',
            assignor: 'range',
            coordinator: 1,
            members: 2,
            totalLag: 4,
            topics: [{ topic: 'orders', partitions: 3, lag: 4 }],
            error: null,
          },
        ],
        warnings: [],
      };

    case CMD.KAFKA_GROUP_DETAIL:
      return {
        groupId: (args?.group as string) || 'billing-consumer-group',
        protocolType: 'consumer',
        state: 'Stable',
        assignor: 'range',
        coordinator: 1,
        members: [
          {
            memberId: 'member-1-client-a',
            clientId: 'billing-service-instance-1',
            host: '/127.0.0.1',
            groupInstanceId: null,
            assignment: [{ topic: 'orders', partitions: [0, 1] }],
          },
        ],
        offsets: [
          {
            topic: 'orders',
            partition: 0,
            committed: 498,
            logStart: 0,
            logEnd: 500,
            lag: 2,
            behindLogStart: false,
            memberId: 'member-1-client-a',
            clientId: 'billing-service-instance-1',
            host: '/127.0.0.1',
          },
        ],
        totalLag: 2,
        error: null,
        warnings: [],
      };

    case CMD.KAFKA_CONSUME:
      return {
        messages: [
          {
            partition: 0,
            offset: 499,
            timestamp: Date.now() - 60000,
            timestampType: 'create',
            key: {
              text: 'order-10492',
              size: 11,
              format: 'text',
              base64: false,
              truncated: false,
              schemaId: null,
            },
            value: {
              text: '{"orderId":"10492","amount":89.50,"currency":"USD"}',
              size: 52,
              format: 'json',
              base64: false,
              truncated: false,
              schemaId: null,
            },
            headers: [
              {
                key: 'traceId',
                value: {
                  text: 'trace-abc-123',
                  size: 13,
                  format: 'text',
                  base64: false,
                  truncated: false,
                  schemaId: null,
                },
              },
            ],
            size: 76,
          },
        ],
        partitions: [{ partition: 0, start: 490, reached: 500, low: 0, high: 500, error: null }],
        scanned: 10,
        durationMs: 8,
        partial: null,
        warnings: [],
      };

    case CMD.KAFKA_BROKER_CONFIGS:
      return [
        {
          name: 'log.retention.hours',
          value: '168',
          source: 'default',
          isDefault: true,
          readOnly: true,
          sensitive: false,
          documentation: null,
        },
      ];

    default:
      return [];
  }
}

export async function mockInvokeVoid(_cmd: string, _args?: Record<string, unknown>): Promise<void> {
  // Mutations in web preview succeed cleanly
}
