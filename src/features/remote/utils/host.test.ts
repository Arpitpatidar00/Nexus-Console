import { test, expect } from 'vitest';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { guessEnv, hostAddress, sshCommand } from './host';

const base: RemoteHost = {
  id: 'h_1',
  source: 'sshConfig',
  alias: 'fameo-prod',
  manual: null,
  label: 'Fameo API',
  project: 'Fameo',
  env: 'prod',
  order: 0,
};
const manual: RemoteHost = {
  ...base,
  source: 'manual',
  alias: null,
  manual: { hostname: '10.0.0.5', user: 'ubuntu', port: 2202, identityFile: '~/.ssh/prod.pem' },
};

test('alias hosts', () => {
  expect(hostAddress(base)).toBe('fameo-prod');
  expect(sshCommand(base)).toBe('ssh fameo-prod');
});

test('manual hosts', () => {
  expect(hostAddress(manual)).toBe('ubuntu@10.0.0.5:2202');
  expect(sshCommand(manual)).toBe('ssh -p 2202 -i ~/.ssh/prod.pem ubuntu@10.0.0.5');
  const plain = { ...manual, manual: { ...manual.manual!, port: 22, identityFile: null } };
  expect(hostAddress(plain)).toBe('ubuntu@10.0.0.5');
  expect(sshCommand(plain)).toBe('ssh ubuntu@10.0.0.5');
});

test('env guesses from alias words, not substrings', () => {
  expect(guessEnv('fameo-prod')).toBe('prod');
  expect(guessEnv('api.production')).toBe('prod');
  expect(guessEnv('shop-staging-2')).toBe('staging');
  expect(guessEnv('db_dev1')).toBe('dev');
  expect(guessEnv('product-db')).toBe('other');
  expect(guessEnv('devops-box')).toBe('other');
  expect(guessEnv('bastion')).toBe('other');
});
