import { test, expect } from 'vitest';
import type { RemoteHost } from '@/features/remote/api/remote.schema';
import { guessEnv, hostAddress, splitHostPort } from './host';

const base: RemoteHost = {
  id: 'h_1',
  source: 'sshConfig',
  alias: 'fameo-prod',
  manual: null,
  label: 'Fameo API',
  project: 'Fameo',
  env: 'prod',
  order: 0,
  autoConnect: false,
};
const manual: RemoteHost = {
  ...base,
  source: 'manual',
  alias: null,
  manual: { hostname: '10.0.0.5', user: 'ubuntu', port: 2202, identityFile: '~/.ssh/prod.pem' },
};

test('alias hosts', () => {
  expect(hostAddress(base)).toBe('fameo-prod');
});

test('manual hosts', () => {
  expect(hostAddress(manual)).toBe('ubuntu@10.0.0.5:2202');
  const plain = { ...manual, manual: { ...manual.manual!, port: 22, identityFile: null } };
  expect(hostAddress(plain)).toBe('ubuntu@10.0.0.5');
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

test('a pasted address splits into host and port', () => {
  expect(splitHostPort('127.0.0.1:4101')).toEqual({ host: '127.0.0.1', port: 4101 });
  expect(splitHostPort(' localhost:3000 ')).toEqual({ host: 'localhost', port: 3000 });
  expect(splitHostPort('[::1]:8080')).toEqual({ host: '::1', port: 8080 });
  expect(splitHostPort(':4101')).toEqual({ host: '127.0.0.1', port: 4101 });
  expect(splitHostPort('127.0.0.1')).toEqual({ host: '127.0.0.1', port: null });
  expect(splitHostPort('::1')).toEqual({ host: '::1', port: null });
  expect(splitHostPort('db:99999')).toEqual({ host: 'db:99999', port: null });
});
