import { test, expect } from 'vitest';
import contract from '../../../../fixtures/projects/profile-contract.json';
import { projectProfileSchema } from '@/features/projects/api/runner.schema';
import { commandText, groupTasks, needsInstall, readiness, runPlan, sortChecks } from './runner';

// profile-contract.json is written by Rust (`profile_contract_golden`).
test('the profile schema matches the Rust DTO exactly', () => {
  expect(projectProfileSchema.parse(contract)).toEqual(contract);
});

const p = projectProfileSchema.parse(contract);

test('run plan installs first only when dependencies need it', () => {
  expect(needsInstall(p)).toBe(true);
  expect(runPlan(p, 'script:dev', true)).toEqual(['pnpm install', 'pnpm run dev']);
  expect(runPlan(p, 'script:dev', false)).toEqual(['pnpm run dev']);
  // Running the install task itself never doubles it.
  expect(runPlan(p, 'install:node', true)).toEqual(['pnpm install']);
  expect(runPlan({ ...p, deps: 'installed' }, 'script:dev', true)).toEqual(['pnpm run dev']);
  expect(runPlan(p, 'nope', true)).toEqual([]);
});

test('tasks group in reach order; commands read naturally', () => {
  expect(groupTasks(p.tasks).map((g) => g.title)).toEqual(['Run', 'Dependencies']);
  expect(
    commandText({
      steps: [
        ['python3', '-m', 'venv', '.venv'],
        ['.venv/bin/pip', 'install'],
      ],
    }),
  ).toBe('python3 -m venv .venv  →  .venv/bin/pip install');
});

test('checks sort worst first; readiness summarises', () => {
  expect(sortChecks(p.checks).map((c) => c.level)).toEqual(['error', 'warn', 'warn', 'ok']);
  expect(readiness(p)).toBe('running');
  expect(readiness({ ...p, running: [] })).toBe('blocked');
  expect(
    readiness({ ...p, running: [], checks: p.checks.filter((c) => c.level !== 'error') }),
  ).toBe('setup');
  expect(readiness({ ...p, running: [], checks: [] })).toBe('ready');
});
