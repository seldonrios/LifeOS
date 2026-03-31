import assert from 'node:assert/strict';
import test from 'node:test';

import type { BaseEvent, ManagedEventBus } from '@lifeos/event-bus';

import { Topics } from '@lifeos/module-sdk';
import type { ObservabilityClient, TraceContext } from '@lifeos/observability';

import { createHouseholdCaptureRouterModule } from './index';

class TestEventBus implements ManagedEventBus {
  readonly published: Array<{ topic: string; event: BaseEvent<unknown> }> = [];

  async publish<T>(topic: string, event: BaseEvent<T>): Promise<void> {
    this.published.push({ topic, event: event as BaseEvent<unknown> });
  }

  async subscribe(): Promise<void> {
    return;
  }

  async close(): Promise<void> {
    return;
  }

  getTransport(): 'in-memory' {
    return 'in-memory';
  }
}

function createObservabilityDouble(): {
  client: ObservabilityClient;
  logs: Array<{ level: string; message: string; meta?: Record<string, unknown> }>;
} {
  const logs: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];
  let counter = 0;
  return {
    logs,
    client: {
      startSpan: () => {
        counter += 1;
        return { traceId: `trace-${counter}`, spanId: `span-${counter}` } satisfies TraceContext;
      },
      endSpan: () => {
        return;
      },
      recordMetric: () => {
        return;
      },
      log: (level, message, meta) => {
        logs.push({ level, message, meta });
      },
    },
  };
}

async function runCapture(text: string, captureId: string) {
  const eventBus = new TestEventBus();
  const subscribers = new Map<
    string,
    (event: { data: Record<string, unknown> }) => Promise<void>
  >();
  const observability = createObservabilityDouble();
  const module = createHouseholdCaptureRouterModule({
    observabilityClient: observability.client,
  });

  await module.init({
    env: {
      LIFEOS_AI_ENABLED: 'false',
    } as NodeJS.ProcessEnv,
    graphPath: undefined,
    eventBus,
    createLifeGraphClient: (() => {
      throw new Error('not used');
    }) as never,
    subscribe: async (topic, handler) => {
      subscribers.set(
        topic,
        handler as (event: { data: Record<string, unknown> }) => Promise<void>,
      );
    },
    publish: async (topic, data) => {
      const event = {
        id: `${topic}-id`,
        type: topic,
        timestamp: new Date().toISOString(),
        source: 'test-runtime',
        version: 'test',
        data,
      };
      await eventBus.publish(topic, event);
      return event;
    },
    log: () => {
      return;
    },
  });

  const handler = subscribers.get(Topics.lifeos.householdVoiceCaptureCreated);
  assert.ok(handler);
  if (!handler) {
    throw new Error('missing voice capture handler');
  }

  await handler({
    data: {
      captureId,
      householdId: 'house_1',
      actorUserId: 'user_1',
      text,
      audioRef: null,
      source: 'mobile',
      createdAt: '2026-03-31T12:00:00.000Z',
    },
  });

  return { eventBus, observability };
}

test('test:tracing emits CAPTURE_AMBIGUOUS automation failure', async () => {
  const { eventBus, observability } = await runCapture(
    'can someone remember to buy detergent',
    'cap_1',
  );

  const failure = eventBus.published.find(
    (entry) => entry.topic === Topics.lifeos.householdAutomationFailed,
  );
  assert.ok(failure);
  assert.equal((failure?.event.data as { error_code?: string }).error_code, 'CAPTURE_AMBIGUOUS');
  assert.match(
    String((failure?.event.data as { fix_suggestion?: string }).fix_suggestion),
    /tap to confirm/i,
  );
  assert.ok(
    eventBus.published.find((entry) => entry.topic === Topics.lifeos.householdCaptureUnresolved),
  );
  assert.equal(observability.logs[0]?.meta?.error_code, 'CAPTURE_AMBIGUOUS');
});

test('test:tracing emits CAPTURE_NO_RULE_MATCH automation failure', async () => {
  const { eventBus, observability } = await runCapture('thing for Saturday', 'cap_2');

  const failure = eventBus.published.find(
    (entry) => entry.topic === Topics.lifeos.householdAutomationFailed,
  );
  assert.ok(failure);
  assert.equal(
    (failure?.event.data as { error_code?: string }).error_code,
    'CAPTURE_NO_RULE_MATCH',
  );
  assert.match(
    String((failure?.event.data as { fix_suggestion?: string }).fix_suggestion),
    /no household action matched/i,
  );
  assert.equal(observability.logs[0]?.meta?.error_code, 'CAPTURE_NO_RULE_MATCH');
});
