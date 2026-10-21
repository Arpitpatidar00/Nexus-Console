import { describe, it, expect } from 'vitest';
import {
  claudeSearchResultSchema,
  sessionContextAnalysisSchema,
  projectTokenUsageSchema,
} from './archiver.schema';

describe('archiver.schema upgrades', () => {
  it('parses valid search result', () => {
    const raw = {
      dirName: '-Users-dev-Desktop-proj',
      sessionFile: 'chat-1.jsonl',
      sessionTitle: 'Refactor database',
      snippet: '...SELECT * FROM users...',
      lineNumber: 42,
    };
    const parsed = claudeSearchResultSchema.parse(raw);
    expect(parsed.sessionTitle).toBe('Refactor database');
    expect(parsed.lineNumber).toBe(42);
  });

  it('parses session context analysis', () => {
    const raw = {
      totalTokens: 120000,
      maxTokens: 200000,
      pctUsed: 60.0,
      userTokens: 20000,
      assistantTokens: 40000,
      toolResultTokens: 60000,
      largeItems: [
        {
          label: 'Tool outputs & files',
          tokenEstimate: 60000,
          pct: 50.0,
        },
      ],
      recommendation: 'Moderate context usage. Context is healthy.',
    };
    const parsed = sessionContextAnalysisSchema.parse(raw);
    expect(parsed.totalTokens).toBe(120000);
    expect(parsed.pctUsed).toBe(60.0);
    expect(parsed.largeItems).toHaveLength(1);
  });

  it('parses project token usage', () => {
    const raw = {
      inputTokens: 500000,
      outputTokens: 50000,
      cacheReadTokens: 1000000,
      estimatedCostUsd: 2.55,
    };
    const parsed = projectTokenUsageSchema.parse(raw);
    expect(parsed.inputTokens).toBe(500000);
    expect(parsed.estimatedCostUsd).toBe(2.55);
  });
});
