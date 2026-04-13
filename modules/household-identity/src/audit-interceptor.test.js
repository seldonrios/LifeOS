import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createEventBusClient, Topics, } from '@lifeos/event-bus';
import { HouseholdGraphClient } from './client';
import { registerAuditInterceptor } from './audit-interceptor';
function createTestClient() {
    const tempDir = mkdtempSync(join(tmpdir(), 'lifeos-household-audit-'));
    const dbPath = join(tempDir, 'household.db');
    const client = new HouseholdGraphClient(dbPath);
    client.initializeSchema();
    return {
        client,
        cleanup: () => {
            client.close();
            rmSync(tempDir, { recursive: true, force: true });
        },
    };
}
function getDb(client) {
    return client.db;
}
function getAuditRows(client, householdId) {
    return getDb(client)
        .prepare('SELECT * FROM audit_log WHERE household_id = ?')
        .all(householdId);
}
const fixtures = [
    {
        topic: Topics.lifeos.householdMemberInvited,
        payload: {
            householdId: 'household-1',
            invitedUserId: 'invited-user',
            role: 'Adult',
            inviteToken: 'token-1',
            expiresAt: new Date().toISOString(),
        },
        expectedObjectRef: 'member:invited-user',
    },
    {
        topic: Topics.lifeos.householdMemberJoined,
        payload: {
            householdId: 'household-1',
            userId: 'joined-user',
            role: 'Teen',
            joinedAt: new Date().toISOString(),
        },
        expectedObjectRef: 'member:joined-user',
    },
    {
        topic: Topics.lifeos.householdMemberRoleChanged,
        payload: {
            householdId: 'household-1',
            userId: 'member-user',
            previousRole: 'Teen',
            newRole: 'Adult',
        },
        expectedObjectRef: 'member:member-user',
    },
    {
        topic: Topics.lifeos.householdChoreAssigned,
        payload: {
            householdId: 'household-1',
            choreId: 'chore-1',
            choreTitle: 'Wash dishes',
            assignedToUserId: 'member-user',
            dueAt: new Date().toISOString(),
        },
        expectedObjectRef: 'chore:chore-1',
    },
    {
        topic: Topics.lifeos.householdChoreCompleted,
        payload: {
            householdId: 'household-1',
            choreId: 'chore-2',
            choreTitle: 'Take out trash',
            completedByUserId: 'member-user',
            completedAt: new Date().toISOString(),
            streakCount: 2,
        },
        expectedObjectRef: 'chore:chore-2',
    },
    {
        topic: Topics.lifeos.householdShoppingItemAdded,
        payload: {
            householdId: 'household-1',
            listId: 'list-1',
            itemId: 'item-1',
            title: 'Milk',
            addedByUserId: 'member-user',
            source: 'manual',
        },
        expectedObjectRef: 'shopping_item:item-1',
    },
    {
        topic: Topics.lifeos.householdShoppingItemPurchased,
        payload: {
            householdId: 'household-1',
            listId: 'list-1',
            itemId: 'item-2',
            title: 'Eggs',
            purchasedByUserId: 'member-user',
            purchasedAt: new Date().toISOString(),
        },
        expectedObjectRef: 'shopping_item:item-2',
    },
    {
        topic: Topics.lifeos.householdCalendarEventCreated,
        payload: {
            householdId: 'household-1',
            calendarId: 'calendar-1',
            eventId: 'event-1',
            title: 'Family Dinner',
            startAt: new Date().toISOString(),
            endAt: new Date(Date.now() + 3600_000).toISOString(),
            attendeeUserIds: ['member-user'],
        },
        expectedObjectRef: 'calendar_event:event-1',
    },
    {
        topic: Topics.lifeos.householdReminderFired,
        payload: {
            householdId: 'household-1',
            reminderId: 'reminder-1',
            objectType: 'custom',
            objectId: 'obj-1',
            targetUserIds: ['member-user'],
            firedAt: new Date().toISOString(),
            deliveryStatus: 'delivered',
        },
        expectedObjectRef: 'reminder:reminder-1',
    },
    {
        topic: Topics.lifeos.householdHomeStateChanged,
        payload: {
            householdId: 'household-1',
            deviceId: 'device-1',
            stateKey: 'power',
            previousValue: 'off',
            newValue: 'on',
            source: 'manual',
            consentVerified: true,
        },
        expectedObjectRef: 'device:device-1',
    },
    {
        topic: Topics.lifeos.householdVoiceCaptureCreated,
        payload: {
            captureId: 'capture-1',
            householdId: 'household-1',
            actorUserId: 'member-user',
            text: 'buy apples',
            audioRef: null,
            source: 'mobile',
            createdAt: new Date().toISOString(),
        },
        expectedObjectRef: 'capture:capture-1',
    },
    {
        topic: Topics.lifeos.householdShoppingItemAddRequested,
        payload: {
            householdId: 'household-1',
            actorUserId: 'member-user',
            originalCaptureId: 'capture-2',
            text: 'buy milk',
            itemTitle: 'Milk',
        },
        expectedObjectRef: 'capture:capture-2',
    },
    {
        topic: Topics.lifeos.householdChoreCreateRequested,
        payload: {
            householdId: 'household-1',
            actorUserId: 'member-user',
            originalCaptureId: 'capture-3',
            text: 'clean kitchen tonight',
            choreTitle: 'Clean kitchen',
        },
        expectedObjectRef: 'capture:capture-3',
    },
    {
        topic: Topics.lifeos.householdReminderCreateRequested,
        payload: {
            householdId: 'household-1',
            actorUserId: 'member-user',
            originalCaptureId: 'capture-4',
            text: 'remind me to water plants',
            reminderText: 'Water plants',
        },
        expectedObjectRef: 'capture:capture-4',
    },
    {
        topic: Topics.lifeos.householdNoteCreateRequested,
        payload: {
            householdId: 'household-1',
            actorUserId: 'member-user',
            originalCaptureId: 'capture-5',
            text: 'note the pantry inventory',
            noteBody: 'Pantry inventory checked',
        },
        expectedObjectRef: 'capture:capture-5',
    },
    {
        topic: Topics.lifeos.householdCaptureUnresolved,
        payload: {
            captureId: 'capture-6',
            householdId: 'household-1',
            text: 'do that thing',
            reason: 'Could not classify intent',
        },
        expectedObjectRef: 'capture:capture-6',
    },
    {
        topic: Topics.lifeos.householdAutomationFailed,
        payload: {
            household_id: 'household-1',
            actor_id: 'system',
            action_type: 'household.reminder.fire',
            error_code: 'REMINDER_NO_TOKEN',
            fix_suggestion: 'Check notification settings for member-user',
            span_id: 'span-1',
            trace_id: 'trace-1',
            object_id: 'reminder-1',
            object_ref: 'reminder:reminder-1',
        },
        expectedObjectRef: 'reminder:reminder-1',
    },
];
for (const fixture of fixtures) {
    test(`registerAuditInterceptor writes audit row for ${fixture.topic}`, async () => {
        const { client, cleanup } = createTestClient();
        const eventBus = createEventBusClient({
            servers: 'nats://127.0.0.1:1',
            timeoutMs: 25,
            maxReconnectAttempts: 0,
        });
        try {
            const household = client.createHousehold('Audit Home');
            await registerAuditInterceptor(eventBus, client);
            const event = {
                id: `evt-${fixture.topic}`,
                type: fixture.topic,
                timestamp: new Date().toISOString(),
                source: 'test-suite',
                version: '1',
                data: fixture.payload,
                metadata: {
                    household_id: household.id,
                    actor_id: 'actor-1',
                    trace_id: 'trace-1',
                },
            };
            await eventBus.publish(fixture.topic, event);
            const rows = getAuditRows(client, household.id);
            assert.equal(rows.length, 1);
            assert.equal(rows[0]?.household_id, household.id);
            assert.equal(rows[0]?.actor_id, 'actor-1');
            assert.equal(rows[0]?.action_type, fixture.topic);
            assert.equal(rows[0]?.object_ref, fixture.expectedObjectRef);
            assert.ok(rows[0]?.payload_json);
        }
        finally {
            await eventBus.close();
            cleanup();
        }
    });
}
class ThrowingTestEventBus {
    subscriptions = new Map();
    async publish(topic, event) {
        const entries = Array.from(this.subscriptions.entries());
        for (const [pattern, handler] of entries) {
            const isWildcard = pattern.endsWith('>');
            if (isWildcard) {
                const prefix = pattern.slice(0, -1);
                if (topic.startsWith(prefix)) {
                    await handler(event);
                }
                continue;
            }
            if (pattern === topic) {
                await handler(event);
            }
        }
    }
    async subscribe(topic, handler) {
        this.subscriptions.set(topic, handler);
    }
    async close() {
        this.subscriptions.clear();
    }
    getTransport() {
        return 'in-memory';
    }
}
test('registerAuditInterceptor throws when actor metadata is missing', async () => {
    const { client, cleanup } = createTestClient();
    const eventBus = new ThrowingTestEventBus();
    try {
        const household = client.createHousehold('Audit Home');
        await registerAuditInterceptor(eventBus, client);
        const event = {
            id: 'evt-missing-actor',
            type: Topics.lifeos.householdMemberInvited,
            timestamp: new Date().toISOString(),
            source: 'test-suite',
            version: '1',
            data: {
                householdId: household.id,
                invitedUserId: 'invited-user',
                role: 'Adult',
                inviteToken: 'token-1',
                expiresAt: new Date().toISOString(),
            },
            metadata: {
                household_id: household.id,
                trace_id: 'trace-missing-actor',
            },
        };
        await assert.rejects(async () => {
            await eventBus.publish(Topics.lifeos.householdMemberInvited, event);
        }, /Missing required audit metadata/i);
    }
    finally {
        await eventBus.close();
        cleanup();
    }
});
