import { describe, it, expect } from 'vitest';
import {
  macBlueprintSchema,
  blueprintDiffReportSchema,
  updateCheckResultSchema,
} from './blueprint.schema';

describe('blueprint.schema', () => {
  it('parses valid Mac blueprint schema', () => {
    const raw = {
      schemaVersion: 1,
      exportedAtEpoch: 1700000000,
      macHostname: 'Arpits-MacBook-Pro.local',
      brewfile: 'brew "git"\ncask "docker"\n',
      remoteHosts: [
        {
          id: 'host-1',
          alias: 'prod-bastion',
          label: 'Production Bastion',
          project: 'Core',
          env: 'prod',
        },
      ],
      tunnels: [
        {
          id: 'tun-1',
          hostId: 'host-1',
          localPort: 5432,
          remotePort: 5432,
          remoteHost: '127.0.0.1',
        },
      ],
      workspaces: [],
      savedCommands: [],
      macleanRules: null,
      vscodeExtensions: ['dbaeumer.vscode-eslint'],
    };

    const parsed = macBlueprintSchema.parse(raw);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.macHostname).toBe('Arpits-MacBook-Pro.local');
    expect(parsed.remoteHosts).toHaveLength(1);
    expect(parsed.tunnels).toHaveLength(1);
  });

  it('parses blueprint diff report schema', () => {
    const raw = {
      missingFormulae: ['htop'],
      missingCasks: ['raycast'],
      missingTaps: ['homebrew/cask-fonts'],
      missingHosts: [
        {
          id: 'h2',
          alias: 'staging',
          label: 'Staging Server',
          project: 'Web',
          env: 'staging',
        },
      ],
      conflictingHosts: [],
      missingWorkspaces: ['ws_mobile'],
      missingExtensions: ['ms-python.python'],
      macleanRulesDifferent: true,
    };

    const parsed = blueprintDiffReportSchema.parse(raw);
    expect(parsed.missingFormulae).toContain('htop');
    expect(parsed.missingCasks).toContain('raycast');
    expect(parsed.macleanRulesDifferent).toBe(true);
  });

  it('parses update check result schema', () => {
    const raw = {
      hasUpdate: true,
      currentVersion: '1.2.0',
      latestVersion: '1.3.0',
      releaseUrl: 'https://github.com/stackroost/stackroost/releases/tag/v1.3.0',
      releaseNotes: '### Features\n- Added new blueprint engine',
    };

    const parsed = updateCheckResultSchema.parse(raw);
    expect(parsed.hasUpdate).toBe(true);
    expect(parsed.latestVersion).toBe('1.3.0');
    expect(parsed.releaseNotes).toBeDefined();
  });
});
