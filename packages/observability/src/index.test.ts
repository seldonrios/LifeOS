import { describe, expect, it, vi } from 'vitest';

import { createObservabilityClient } from './index';

describe('observability client', () => {
  it('creates trace spans and metrics without throwing', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const client = createObservabilityClient({
      serviceName: 'goal-engine',
      environment: 'test',
    });

    const span = client.startSpan('goal.interpret');
    client.recordMetric('goals.interpreted', 1, { model: 'llama3.1:8b' });
    client.log('info', 'goal interpretation complete', { traceId: span.traceId });
    client.endSpan(span);

    expect(span.traceId.length).toBeGreaterThan(8);
    expect(span.spanId.length).toBeGreaterThan(8);
    expect(stdoutSpy).toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('fails fast when required config is missing', () => {
    expect(() =>
      createObservabilityClient({
        serviceName: '',
        environment: 'test',
      }),
    ).toThrow(/serviceName/i);
  });
});
