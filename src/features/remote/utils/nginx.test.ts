import { test, expect } from 'vitest';
import contracts from '../../../../fixtures/remote/contracts.json';
import { inspectionDataSchema, type NginxSite } from '@/features/remote/api/remote.schema';
import { describeCron, domainsOf, envOfDomain, localPortOf } from './nginx';

const site = (p: Partial<NginxSite>): NginxSite => ({
  file: '/etc/nginx/conf.d/app.conf',
  serverNames: [],
  listenPorts: [],
  ssl: false,
  redirectOnly: false,
  routes: [],
  ...p,
});

test('environments come from the hostname', () => {
  expect(envOfDomain('dev-api.fameo.info')).toBe('dev');
  expect(envOfDomain('dev.fameo.vip')).toBe('dev');
  expect(envOfDomain('staging-api.fameo.vip')).toBe('staging');
  expect(envOfDomain('api.fameo.info')).toBe('prod');
  expect(envOfDomain('fameo.info')).toBe('prod');
  expect(envOfDomain('devices.example.co.uk')).toBe('other');
  expect(envOfDomain('')).toBe('other');
});

test('http redirect and https blocks merge into one domain; acme routes drop', () => {
  const ds = domainsOf(
    [
      site({
        serverNames: ['dev.example.com'],
        listenPorts: [80],
        redirectOnly: true,
        routes: [{ path: '/', target: 'return 301 https://$host$request_uri', note: null }],
      }),
      site({
        serverNames: ['dev.example.com'],
        listenPorts: [443],
        ssl: true,
        routes: [
          { path: '/.well-known/acme-challenge/', target: 'root /var/www/certbot', note: null },
          { path: '/', target: 'http://127.0.0.1:4105', note: 'web (UI)' },
        ],
      }),
      site({
        serverNames: [],
        listenPorts: [80],
        routes: [{ path: '/', target: 'return 444', note: null }],
      }),
      site({ serverNames: ['staging.example.com'], ssl: true }),
    ],
    [],
  );
  expect(ds.map((d) => [d.name, d.env])).toEqual([
    ['staging.example.com', 'staging'],
    ['dev.example.com', 'dev'],
    ['', 'other'],
  ]);
  const dev = ds[1];
  expect(dev.https && dev.httpRedirects).toBe(true);
  expect(dev.routes).toEqual([
    { path: '/', target: 'http://127.0.0.1:4105', note: 'web (UI)', upstream: null },
  ]);
});

test('upstream names resolve to their servers (real Rust output)', () => {
  const data = inspectionDataSchema.parse(contracts.inspection);
  const [d] = domainsOf(data.nginxSites, data.upstreams);
  expect(d.name).toBe('dev.example.com');
  expect(d.routes.find((r) => r.path === '/')?.upstream).toEqual(['127.0.0.1:3101']);
  expect(d.routes.find((r) => r.path === '/api/')?.note).toBe('backend');
});

test('local ports', () => {
  expect(localPortOf('http://127.0.0.1:4101/')).toBe(4101);
  expect(localPortOf('http://localhost:3000')).toBe(3000);
  expect(localPortOf('http://web_dev')).toBe(null);
});

test('cron in words', () => {
  expect(describeCron('@reboot')).toBe('At every boot');
  expect(describeCron('*/10 * * * *')).toBe('Every 10 minutes');
  expect(describeCron('5 * * * *')).toBe('Every hour at :05');
  expect(describeCron('0 */12 * * *')).toBe('Every 12 hours at :00');
  expect(describeCron('10 3 * * *')).toBe('Every day at 03:10');
  expect(describeCron('30 3 * * 0')).toBe('Every Sunday at 03:30');
  expect(describeCron('5-55/10 * * * *')).toBe(null);
});
