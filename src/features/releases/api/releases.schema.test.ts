import { describe, it, expect } from 'vitest';
import { projectReleaseConfigSchema } from './releases.schema';

describe('releases schemas', () => {
  it('validates project release configuration', () => {
    const raw = {
      project_path: '/Users/test/workspace/my-app',
      platform: 'flutter',
      has_fastlane: true,
      lanes: ['beta', 'deploy_ios', 'deploy_android'],
      version_name: '2.1.0',
      build_number: '142',
    };
    const parsed = projectReleaseConfigSchema.parse(raw);
    expect(parsed.platform).toBe('flutter');
    expect(parsed.lanes).toHaveLength(3);
    expect(parsed.version_name).toBe('2.1.0');
  });
});
