import { describe, it, expect } from 'vitest';
import { secretFindingSchema, secretsScanResultSchema } from './secrets.schema';

describe('secrets.schema', () => {
  it('parses valid secret finding with masked preview', () => {
    const raw = {
      id: 'finding_1',
      projectPath: '/Users/dev/Desktop/myapp',
      filePath: 'src/config/aws.ts',
      lineNumber: 14,
      ruleId: 'aws_access_key',
      ruleName: 'AWS Access Key ID',
      severity: 'critical',
      maskedPreview: 'AKIA****1234',
      remediation: 'Rotate this key immediately in AWS IAM.',
    };

    const parsed = secretFindingSchema.parse(raw);
    expect(parsed.id).toBe('finding_1');
    expect(parsed.ruleId).toBe('aws_access_key');
    expect(parsed.maskedPreview).toBe('AKIA****1234');
  });

  it('parses secrets scan result', () => {
    const raw = {
      scannedProjects: 4,
      scannedFiles: 420,
      findings: [
        {
          id: 'finding_2',
          projectPath: '/Users/dev/Desktop/api',
          filePath: '.env',
          lineNumber: null,
          ruleId: 'unignored_env',
          ruleName: '.env file is not gitignored',
          severity: 'critical',
          maskedPreview: '.env present in repo',
          remediation: 'Add .env to your .gitignore file.',
        },
      ],
    };

    const parsed = secretsScanResultSchema.parse(raw);
    expect(parsed.scannedProjects).toBe(4);
    expect(parsed.scannedFiles).toBe(420);
    expect(parsed.findings).toHaveLength(1);
  });
});
