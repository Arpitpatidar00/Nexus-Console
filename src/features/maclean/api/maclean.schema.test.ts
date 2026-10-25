import { test, expect } from 'vitest';
// Golden JSON written by the Rust test `maclean_golden_report_json` from the
// real captures in fixtures/maclean, so this checks the zod mirror against
// what Rust actually sends.
import golden from '../../../../fixtures/maclean/report.json';
import memoryGolden from '../../../../fixtures/maclean/memory.json';
import {
  cleanResultSchema,
  deepReportSchema,
  drillSchema,
  memorySchema,
  reportSchema,
  rulesSchema,
  ghostScanReportSchema,
  energyReportSchema,
  trendsReportSchema,
  duplicateReportSchema,
} from './maclean.schema';

test('parses the Rust storage report', () => {
  const r = reportSchema.parse(golden);
  expect(r.volumes.find((v) => v.role === 'Preboot')?.oversized).toBe(true);
  expect(r.items.find((i) => i.id === 'docker_images')?.defaultSelected).toBe(false);
  expect(r.items.find((i) => i.id === 'docker_installer')?.skip).toContain('update');
  expect(r.map[0].bytes).toBeGreaterThanOrEqual(r.map.at(-1)!.bytes);
  expect(r.largeFiles[0].path).toMatch(/^\//);
});

test('rejects a reshaped report', () => {
  expect(() => reportSchema.parse({ ...golden, items: [{ id: 'npm' }] })).toThrow();
});

test('clean result and rules', () => {
  expect(
    cleanResultSchema.parse({
      atEpoch: 1,
      freedBytes: 12_000_000_000,
      items: [{ id: 'npm', label: 'npm cache', ok: true, message: 'cleaned' }],
    }).freedBytes,
  ).toBe(12_000_000_000);
  expect(
    rulesSchema.parse({
      protectedNames: ['Fameo'],
      projectRoots: ['~/Desktop'],
      nextIdleDays: 7,
      logAgeDays: 7,
      staleNodeModulesDays: 60,
    }).protectedNames,
  ).toEqual(['Fameo']);
});

test('parses the Rust memory report', () => {
  const m = memorySchema.parse(memoryGolden);
  const c = m.composition;
  expect(c.usedBytes + c.cachedBytes + c.freeBytes).toBe(c.totalBytes);
  expect(m.pressure).toBe('warning');
  expect(m.topApps[0].bytes).toBeGreaterThanOrEqual(m.topApps[1].bytes);
});

test('deep report and drill rows', () => {
  expect(
    deepReportSchema.parse({
      entries: [{ label: 'User: arpit', why: 'x', bytes: 12, flagged: true }],
      causes: [{ bytes: 12, text: 't', fix: 'f' }],
    }).entries[0].flagged,
  ).toBe(true);
  expect(drillSchema.parse([{ name: 'Caches', bytes: 3 }])).toHaveLength(1);
});

test('parses rich deepReportSchema with categories and sub-items', () => {
  const sample = {
    entries: [{ label: 'User: arpit', why: 'x', bytes: 12, flagged: true }],
    causes: [{ bytes: 12, text: 't', fix: 'f' }],
    categories: [
      {
        id: 'snapshots_purgeable',
        title: 'Snapshots & Purgeable',
        subtitle: 'APFS copy-on-write snapshots and macOS evictable caches',
        totalBytes: 52_000_000_000,
        percentageOfVolume: 21.5,
        severity: 'actionable',
        permissionBlockedCount: 0,
        subItems: [
          {
            name: 'com.apple.TimeMachine.2026-10-24-220511.local',
            path: 'com.apple.TimeMachine.2026-10-24-220511.local',
            bytes: 12_000_000_000,
            kind: 'time_machine',
            isDeletable: true,
          },
          {
            name: 'macOS Purgeable Cache',
            path: 'macOS Purgeable Cache',
            bytes: 40_000_000_000,
            kind: 'cache',
            isDeletable: false,
          },
        ],
        availableActions: ['thin_snapshots'],
      },
    ],
    purgeableBytes: 40_000_000_000,
    permissionDeniedPaths: ['/Library/Application Support/com.apple.TCC'],
    totalDataUsedBytes: 240_000_000_000,
    scanDurationMs: 4200,
  };
  const parsed = deepReportSchema.parse(sample);
  expect(parsed.categories).toHaveLength(1);
  expect(parsed.categories?.[0].subItems).toHaveLength(2);
  expect(parsed.categories?.[0].severity).toBe('actionable');
  expect(parsed.categories?.[0].availableActions).toContain('thin_snapshots');
  expect(parsed.purgeableBytes).toBe(40_000_000_000);
  expect(parsed.permissionDeniedPaths).toContain('/Library/Application Support/com.apple.TCC');
});

test('parses ghostScanReportSchema', () => {
  const sample = {
    leftovers: [
      {
        id: 'cache_com.test.app',
        name: 'com.test.app',
        bundleId: 'com.test.app',
        path: '/Users/test/Library/Caches/com.test.app',
        sizeBytes: 15_000_000,
        modifiedAt: 1729468800,
        kind: 'cache',
        isSafe: true,
      },
      {
        id: 'agent_orphan',
        name: 'orphan.plist',
        path: '/Users/test/Library/LaunchAgents/orphan.plist',
        sizeBytes: 1024,
        modifiedAt: 1729468800,
        kind: 'launch_agent',
        isSafe: true,
      },
    ],
    totalReclaimableBytes: 15_001_024,
    scanTimeEpoch: 1729468800,
  };
  const parsed = ghostScanReportSchema.parse(sample);
  expect(parsed.leftovers).toHaveLength(2);
  expect(parsed.totalReclaimableBytes).toBe(15_001_024);
  expect(parsed.leftovers[0].isSafe).toBe(true);
});

test('parses energyReportSchema', () => {
  const sample = {
    powerSource: 'battery',
    isCharging: false,
    batteryPercent: 82,
    processes: [
      {
        pid: 1234,
        name: 'vite',
        category: 'watcher',
        idleWakeups: 450,
        interruptWakeups: 120,
        cpuTimeMs: 15000,
        diskWriteBytes: 2_048_000,
        energyImpactScore: 65.5,
      },
    ],
    unpluggedSuggestion: {
      message: 'On battery: 1 background service waking CPU often.',
      candidatePids: [1234],
      candidateNames: ['vite'],
    },
  };
  const parsed = energyReportSchema.parse(sample);
  expect(parsed.powerSource).toBe('battery');
  expect(parsed.processes[0].idleWakeups).toBe(450);
  expect(parsed.unpluggedSuggestion?.candidateNames).toContain('vite');
});

test('parses trendsReportSchema', () => {
  const sample = {
    records: [
      {
        date: '2026-10-14',
        timestamp: 1728864000,
        freeDiskBytes: 50_000_000_000,
        totalDiskBytes: 500_000_000_000,
        swapUsedBytes: 0,
        categories: { caches: 5_000_000_000 },
      },
    ],
    weeklyFreeDeltaBytes: -2_000_000_000,
    biggestGrowers: [
      {
        category: 'caches',
        deltaBytes: 1_000_000_000,
        currentBytes: 5_000_000_000,
      },
    ],
  };
  const parsed = trendsReportSchema.parse(sample);
  expect(parsed.weeklyFreeDeltaBytes).toBe(-2_000_000_000);
  expect(parsed.biggestGrowers[0].category).toBe('caches');
});

test('parses duplicateReportSchema', () => {
  const sample = {
    groups: [
      {
        hash: 'b3_sample_hash_123',
        sizeBytes: 5_000_000,
        files: [
          {
            path: '/Users/test/Downloads/installer.dmg',
            sizeBytes: 5_000_000,
            modifiedAt: 1729468800,
          },
          {
            path: '/Users/test/Desktop/installer (1).dmg',
            sizeBytes: 5_000_000,
            modifiedAt: 1729468800,
          },
        ],
      },
    ],
    totalReclaimableBytes: 5_000_000,
    scannedFilesCount: 42,
  };
  const parsed = duplicateReportSchema.parse(sample);
  expect(parsed.groups).toHaveLength(1);
  expect(parsed.totalReclaimableBytes).toBe(5_000_000);
});
