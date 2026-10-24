import { describe, it, expect } from 'vitest';
import {
  processBandwidthSchema,
  networkInfoSchema,
  hostEntrySchema,
  chaosProfileSchema,
} from './network.schema';

describe('network schemas', () => {
  it('validates process bandwidth metrics', () => {
    const raw = {
      process: 'com.apple.WebKit.Networking',
      pid: 1234,
      bytesIn: 5242880,
      bytesOut: 1048576,
    };
    const parsed = processBandwidthSchema.parse(raw);
    expect(parsed.bytesIn).toBe(5242880);
  });

  it('validates network interfaces and dns', () => {
    const raw = {
      primaryInterface: 'en0',
      ipv4Address: '192.168.1.100',
      ipv6Address: null,
      dnsServers: ['1.1.1.1', '8.8.8.8'],
    };
    const parsed = networkInfoSchema.parse(raw);
    expect(parsed.dnsServers).toContain('1.1.1.1');
  });

  it('validates host entry', () => {
    const raw = {
      id: 'entry-1',
      ip: '127.0.0.1',
      hostnames: ['local.api.dev', 'auth.dev'],
      comment: 'development cluster overrides',
      enabled: true,
    };
    const parsed = hostEntrySchema.parse(raw);
    expect(parsed.hostnames).toHaveLength(2);
  });

  it('validates chaos profile', () => {
    const raw = {
      latencyMs: 150,
      dropRatePct: 10,
      reject: false,
    };
    const parsed = chaosProfileSchema.parse(raw);
    expect(parsed.latencyMs).toBe(150);
  });
});
