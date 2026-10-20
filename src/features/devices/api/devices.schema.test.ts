import { describe, it, expect } from 'vitest';
import { iosSimulatorSchema, androidAvdSchema } from './devices.schema';

describe('devices schemas', () => {
  it('validates ios simulator device', () => {
    const raw = {
      udid: 'E7B5474D-3183-49F1-8B04-1C24D3E021AB',
      name: 'iPhone 16 Pro',
      state: 'Booted',
      runtime: 'iOS 18.0',
      is_available: true,
    };
    const parsed = iosSimulatorSchema.parse(raw);
    expect(parsed.name).toBe('iPhone 16 Pro');
    expect(parsed.state).toBe('Booted');
  });

  it('validates android avd device', () => {
    const raw = {
      name: 'Pixel_8_Pro_API_34',
      running: true,
    };
    const parsed = androidAvdSchema.parse(raw);
    expect(parsed.name).toBe('Pixel_8_Pro_API_34');
    expect(parsed.running).toBe(true);
  });
});
