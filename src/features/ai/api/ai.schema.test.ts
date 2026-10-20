import { describe, it, expect } from 'vitest';
import { ollamaStatusSchema, explainResponseSchema } from './ai.schema';

describe('ai schemas', () => {
  it('validates ollama status with local models', () => {
    const raw = {
      online: true,
      models: ['llama3.2:latest', 'qwen2.5-coder:7b'],
      endpoint: 'http://127.0.0.1:11434',
    };
    const parsed = ollamaStatusSchema.parse(raw);
    expect(parsed.online).toBe(true);
    expect(parsed.models).toHaveLength(2);
  });

  it('validates explain response', () => {
    const raw = {
      explanation: 'Exit code 137 indicates process was terminated by SIGKILL (OOM Killer).',
      model: 'llama3.2:latest',
    };
    const parsed = explainResponseSchema.parse(raw);
    expect(parsed.model).toBe('llama3.2:latest');
  });
});
