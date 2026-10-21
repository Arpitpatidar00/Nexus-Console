import { describe, it, expect } from 'vitest';
import { ec2InstanceSchema, s3BucketSchema, awsCostReportSchema } from './cloud.schema';

describe('cloud schemas', () => {
  it('validates ec2 instance with prod flag', () => {
    const raw = {
      id: 'i-1234567890abcdef0',
      name: 'api-prod-01',
      state: 'running',
      instance_type: 't3.large',
      public_ip: '54.210.10.1',
      private_ip: '10.0.1.5',
      region: 'us-east-1',
      is_prod: true,
      tags: [['Environment', 'production']],
    };
    const parsed = ec2InstanceSchema.parse(raw);
    expect(parsed.is_prod).toBe(true);
    expect(parsed.name).toBe('api-prod-01');
  });

  it('validates s3 bucket', () => {
    const raw = {
      name: 'stackroost-backups-vault',
      creation_date: '2026-01-15T10:00:00Z',
      region: 'us-east-1',
    };
    const parsed = s3BucketSchema.parse(raw);
    expect(parsed.name).toBe('stackroost-backups-vault');
  });

  it('validates cached aws cost report', () => {
    const raw = {
      month_to_date_total: 142.5,
      currency: 'USD',
      top_services: [
        { service: 'Amazon Elastic Compute Cloud - Compute', amount: 98.2, unit: 'USD' },
        { service: 'Amazon Simple Storage Service', amount: 44.3, unit: 'USD' },
      ],
      cached_at: 1773900000,
    };
    const parsed = awsCostReportSchema.parse(raw);
    expect(parsed.month_to_date_total).toBe(142.5);
    expect(parsed.top_services).toHaveLength(2);
  });
});
