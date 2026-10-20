import { describe, it, expect } from 'vitest';
import { tunnelConfigSchema, tunnelStatusSchema } from './remote.schema';

describe('Tunnel Schemas', () => {
  it('validates port range bounds', () => {
    const valid = {
      id: 'tun_1',
      hostId: 'h_1',
      name: 'DB',
      localPort: 5433,
      remoteHost: '127.0.0.1',
      remotePort: 5432,
      autoStart: false,
    };
    expect(tunnelConfigSchema.parse(valid)).toMatchObject(valid);

    // Reject 0 port
    expect(() => tunnelConfigSchema.parse({ ...valid, localPort: 0 })).toThrow();

    // Reject port > 65535
    expect(() => tunnelConfigSchema.parse({ ...valid, localPort: 70000 })).toThrow();
  });

  it('applies defaults for remoteHost and autoStart', () => {
    const minimal = {
      id: 'tun_2',
      hostId: 'h_1',
      name: 'Redis',
      localPort: 6380,
      remotePort: 6379,
    };
    const parsed = tunnelConfigSchema.parse(minimal);
    expect(parsed.remoteHost).toBe('127.0.0.1');
    expect(parsed.autoStart).toBe(false);
  });

  it('parses tunnelStatusSchema in various states', () => {
    const config = {
      id: 'tun_3',
      hostId: 'h_1',
      name: 'Web',
      localPort: 8080,
      remoteHost: '127.0.0.1',
      remotePort: 80,
      autoStart: false,
    };

    const openStatus = tunnelStatusSchema.parse({
      config,
      state: { state: 'open' },
      isMultiplexed: true,
      connectionTemplate: 'http://127.0.0.1:8080',
    });
    expect(openStatus.state.state).toBe('open');
    expect(openStatus.isMultiplexed).toBe(true);

    const reconnStatus = tunnelStatusSchema.parse({
      config,
      state: { state: 'reconnecting', attempt: 2 },
      isMultiplexed: true,
      connectionTemplate: 'http://127.0.0.1:8080',
    });
    expect(reconnStatus.state.state).toBe('reconnecting');

    const failedStatus = tunnelStatusSchema.parse({
      config,
      state: { state: 'failed', reason: 'Connection refused' },
      isMultiplexed: false,
      connectionTemplate: 'http://127.0.0.1:8080',
    });
    expect(failedStatus.state.state).toBe('failed');

    const closedStatus = tunnelStatusSchema.parse({
      config,
      state: { state: 'closed' },
      isMultiplexed: false,
      connectionTemplate: 'http://127.0.0.1:8080',
    });
    expect(closedStatus.state.state).toBe('closed');
  });
});
