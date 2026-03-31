import { describe, expect, it, vi } from 'vitest';

import { createObservabilityClient, emitAutomationFailureSpan } from './index';

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

  it('emits structured automation failure span metadata', () => {
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const client = createObservabilityClient({
      serviceName: 'household-capture-router',
      environment: 'test',
    });

    const span = emitAutomationFailureSpan(client, 'household.capture.route', {
      householdId: 'house_1',
      actorId: 'user_1',
      actionType: 'household.capture.route',
      errorCode: 'CAPTURE_AMBIGUOUS',
      fixSuggestion: 'Tap to confirm what you meant: shopping, note',
      objectId: 'cap_1',
      objectRef: 'capture:cap_1',
      details: {
        transcript: 'can someone remember to buy detergent',
      },
    });

    const errorLog = stderrSpy.mock.calls
      .map(([entry]) => String(entry))
      .find((entry) => entry.includes('automation.failure:CAPTURE_AMBIGUOUS'));

    expect(span.spanId.length).toBeGreaterThan(4);
    expect(errorLog).toContain('CAPTURE_AMBIGUOUS');
    expect(errorLog).toContain('fix_suggestion');

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });
});
