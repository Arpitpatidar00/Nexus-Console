import { describe, it, expect } from 'vitest';
import {
  dnsLookupResultSchema,
  sslCertResultSchema,
  rdapResultSchema,
  propagationResultSchema,
  uptimeMonitorSchema,
} from './domains.schema';

describe('domains.schema', () => {
  it('parses valid DNS lookup result', () => {
    const raw = {
      domain: 'example.com',
      records: [
        {
          recordType: 'A',
          value: '93.184.216.34',
          ttl: 300,
          raw: 'example.com. 300 IN A 93.184.216.34',
        },
      ],
    };
    const parsed = dnsLookupResultSchema.parse(raw);
    expect(parsed.domain).toBe('example.com');
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].recordType).toBe('A');
  });

  it('parses SSL certificate result', () => {
    const raw = {
      domain: 'example.com',
      valid: true,
      issuer: 'DigiCert Global Root CA',
      subject: 'example.com',
      notBefore: 'Sep 26 22:49:11 2026 GMT',
      notAfter: 'Dec 25 22:56:35 2026 GMT',
      daysRemaining: 65,
      sans: ['example.com', '*.example.com'],
      error: null,
    };
    const parsed = sslCertResultSchema.parse(raw);
    expect(parsed.valid).toBe(true);
    expect(parsed.daysRemaining).toBe(65);
    expect(parsed.sans).toHaveLength(2);
  });

  it('parses RDAP domain registration result', () => {
    const raw = {
      domain: 'example.com',
      registrar: 'RESERVED-Internet Assigned Numbers Authority',
      expirationDate: '2027-08-13T04:00:00Z',
      createdDate: '1995-08-14T04:00:00Z',
      updatedDate: '2026-08-14T07:01:38Z',
      status: ['clientDeleteProhibited', 'clientTransferProhibited'],
      error: null,
    };
    const parsed = rdapResultSchema.parse(raw);
    expect(parsed.registrar).toContain('Internet Assigned Numbers');
    expect(parsed.status).toHaveLength(2);
  });

  it('parses DNS propagation result', () => {
    const raw = {
      domain: 'example.com',
      recordType: 'A',
      answers: [
        {
          resolver: '1.1.1.1',
          resolverName: 'Cloudflare',
          records: ['93.184.216.34'],
          latencyMs: 12,
        },
      ],
    };
    const parsed = propagationResultSchema.parse(raw);
    expect(parsed.answers[0].resolverName).toBe('Cloudflare');
    expect(parsed.answers[0].latencyMs).toBe(12);
  });

  it('parses Uptime monitor configuration & history', () => {
    const raw = {
      id: 'mon_1',
      name: 'Stackroost API',
      url: 'https://api.stackroost.app/health',
      intervalMins: 5,
      enabled: true,
      lastStatus: 200,
      lastLatencyMs: 45,
      isUp: true,
      uptimePercent24h: 99.8,
      history: [
        {
          timestamp: 1700000000,
          statusCode: 200,
          latencyMs: 45,
          isUp: true,
          error: null,
        },
      ],
    };
    const parsed = uptimeMonitorSchema.parse(raw);
    expect(parsed.name).toBe('Stackroost API');
    expect(parsed.isUp).toBe(true);
    expect(parsed.history).toHaveLength(1);
  });
});
