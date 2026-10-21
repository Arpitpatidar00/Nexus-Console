import { test, expect } from 'vitest';
import { consentRecordSchema, netDestinationSchema } from './privacy.schema';

test('parses a consent record as Rust serializes it', () => {
  const r = consentRecordSchema.parse({
    source: 'library_scan',
    name: 'Mac Clean Library Scan (~/Library)',
    granted: true,
    grantedAtEpoch: 1_760_000_000,
  });
  expect(r.granted).toBe(true);
});

test('rejects an unknown consent source', () => {
  expect(() =>
    consentRecordSchema.parse({
      source: 'keychain',
      name: 'x',
      granted: false,
      grantedAtEpoch: null,
    }),
  ).toThrow();
});

test('parses a declared network destination', () => {
  const d = netDestinationSchema.parse({
    id: 'domains_rdap',
    hostPattern: 'rdap.org',
    purpose: 'Query domain registration',
    module: 'domains',
    outbound: true,
    userConfigured: false,
  });
  expect(d.hostPattern).toBe('rdap.org');
});
