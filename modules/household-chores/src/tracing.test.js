import assert from 'node:assert/strict';
import test from 'node:test';
import { Topics } from '@lifeos/module-sdk';
import { createHouseholdChoresModule } from './index';
class TestEventBus {
    published = [];
    async publish(topic, event) {
        this.published.push({ topic, event: event });
    }
    async subscribe() {
        return;
    }
    async close() {
        return;
    }
    getTransport() {
        return 'in-memory';
    }
}
function createObservabilityDouble() {
    const logs = [];
    let counter = 0;
    return {
        logs,
        client: {
            startSpan: () => {
                counter += 1;
                return { traceId: `trace-${counter}`, spanId: `span-${counter}` };
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
async function initModule(errorMessage) {
    const eventBus = new TestEventBus();
    const subscribers = new Map();
    const observability = createObservabilityDouble();
    const module = createHouseholdChoresModule({
        observabilityClient: observability.client,
        createIntentStore: async () => ({
            createRequestedChore() {
                throw new Error(errorMessage);
            },
        }),
    });
    await module.init({
        env: {
            LIFEOS_HOUSEHOLD_DB_PATH: 'memory',
        },
        graphPath: undefined,
        eventBus,
        createLifeGraphClient: (() => {
            throw new Error('not used');
        }),
        subscribe: async (topic, handler) => {
            subscribers.set(topic, handler);
        },
        publish: async () => {
            throw new Error('not used');
        },
        log: () => {
            return;
        },
    });
    return { eventBus, subscribers, observability };
}
test('test:tracing emits CHORE_NO_ASSIGNEE automation failure', async () => {
    const { eventBus, subscribers, observability } = await initModule('Assignee not found');
    const handler = subscribers.get(Topics.lifeos.householdChoreCreateRequested);
    assert.ok(handler);
    if (!handler) {
        return;
    }
    await assert.rejects(async () => handler({
        data: {
            householdId: 'house_1',
            actorUserId: 'user_1',
            originalCaptureId: 'cap_1',
            text: 'someone needs to vacuum',
            choreTitle: 'vacuum',
        },
    }));
    assert.equal(eventBus.published.length, 1);
    assert.equal(eventBus.published[0]?.topic, Topics.lifeos.householdAutomationFailed);
    assert.equal((eventBus.published[0]?.event.data).error_code, 'CHORE_NO_ASSIGNEE');
    assert.match(String((eventBus.published[0]?.event.data).fix_suggestion), /assign a member/i);
    assert.equal(observability.logs[0]?.meta?.error_code, 'CHORE_NO_ASSIGNEE');
});
test('test:tracing emits CHORE_RRULE_INVALID automation failure', async () => {
    const { eventBus, subscribers, observability } = await initModule('Unsupported recurrence frequency: YEARLY');
    const handler = subscribers.get(Topics.lifeos.householdChoreCreateRequested);
    assert.ok(handler);
    if (!handler) {
        return;
    }
    await assert.rejects(async () => handler({
        data: {
            householdId: 'house_1',
            actorUserId: 'user_1',
            originalCaptureId: 'cap_2',
            text: 'create chore rotate pantry stock',
            choreTitle: 'rotate pantry stock',
        },
    }));
    assert.equal(eventBus.published.length, 1);
    assert.equal((eventBus.published[0]?.event.data).error_code, 'CHORE_RRULE_INVALID');
    assert.match(String((eventBus.published[0]?.event.data).fix_suggestion), /invalid recurrence rule/i);
    assert.equal(observability.logs[0]?.meta?.error_code, 'CHORE_RRULE_INVALID');
});
