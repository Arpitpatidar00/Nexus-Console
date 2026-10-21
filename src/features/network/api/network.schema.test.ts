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
      bytes_in: 5242880,
      bytes_out: 1048576,
    };
    const parsed = processBandwidthSchema.parse(raw);
    expect(parsed.bytes_in).toBe(5242880);
  });

  it('validates network interfaces and dns', () => {
    const raw = {
      primary_interface: 'en0',
      ipv4_address: '192.168.1.100',
      ipv6_address: null,
      dns_servers: ['1.1.1.1', '8.8.8.8'],
    };
    const parsed = networkInfoSchema.parse(raw);
    expect(parsed.dns_servers).toContain('1.1.1.1');
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
      latency_ms: 150,
      drop_rate_pct: 10,
      reject: false,
    };
    const parsed = chaosProfileSchema.parse(raw);
    expect(parsed.latency_ms).toBe(150);
  });
});
