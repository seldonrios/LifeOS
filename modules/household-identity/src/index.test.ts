import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { HouseholdRoleSchema } from '@lifeos/module-sdk';

import { HouseholdGraphClient } from './client';
import { generateInviteToken } from './invites';
import { canPerform } from './roles';

function createTestClient(): { client: HouseholdGraphClient; cleanup: () => void } {
  const tempDir = mkdtempSync(join(tmpdir(), 'lifeos-household-identity-'));
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

test('createHousehold returns a persisted row with UUID id and name', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold('Home Base');
    assert.match(
      household.id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.equal(household.name, 'Home Base');

    const loaded = client.getHousehold(household.id);
    assert.ok(loaded);
    assert.equal(loaded?.name, 'Home Base');
  } finally {
    cleanup();
  }
});

test('invite token store and accept transitions member status to active', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold('Home Base');
    client.addMember(household.id, 'user-1', 'Adult', 'admin-1');

    const token = generateInviteToken();
    assert.match(token, /^[0-9a-f]{64}$/i);

    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    client.storeInviteToken(household.id, 'user-1', token, expiresAt);
    const accepted = client.acceptInvite(token);

    assert.equal(accepted.status, 'active');
    assert.equal(accepted.invite_token, null);
    assert.ok(accepted.joined_at);
  } finally {
    cleanup();
  }
});

test('acceptInvite throws when invite is expired', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold('Home Base');
    client.addMember(household.id, 'user-2', 'Teen', 'admin-1');

    const token = generateInviteToken();
    const expiredAt = new Date(Date.now() - 60_000).toISOString();
    client.storeInviteToken(household.id, 'user-2', token, expiredAt);

    assert.throws(() => client.acceptInvite(token), /expired/i);
  } finally {
    cleanup();
  }
});

test('acceptInvite rejects invalid invite expiry timestamps', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold('Home Base');
    client.addMember(household.id, 'user-4', 'Adult', 'admin-1');

    const token = generateInviteToken();
    assert.throws(
      () => client.storeInviteToken(household.id, 'user-4', token, 'not-a-valid-datetime'),
      /valid ISO datetime/i,
    );
  } finally {
    cleanup();
  }
});

test('createReminder persists sensitive flag with default and explicit values', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold('Home Base');

    const defaultReminder = client.createReminder(
      household.id,
      'custom',
      'object-1',
      ['user-1'],
      '2026-04-01T10:00:00.000Z',
    );
    const sensitiveReminder = client.createReminder(
      household.id,
      'custom',
      'object-2',
      ['user-2'],
      '2026-04-02T10:00:00.000Z',
      true,
    );

    assert.equal(defaultReminder.sensitive, 0);
    assert.equal(sensitiveReminder.sensitive, 1);
  } finally {
    cleanup();
  }
});

test('updateMemberRole persists role and rejects invalid role values', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold('Home Base');
    client.addMember(household.id, 'user-3', 'Child', 'admin-1');

    const updated = client.updateMemberRole(household.id, 'user-3', 'Teen');
    assert.equal(updated.role, 'Teen');
    assert.throws(() => HouseholdRoleSchema.parse('InvalidRole'), /invalid/i);
  } finally {
    cleanup();
  }
});

test('canPerform enforces role permissions matrix', () => {
  assert.equal(canPerform('Admin', 'invite'), true);
  assert.equal(canPerform('Guest', 'invite'), false);
  assert.equal(canPerform('Adult', 'add_shopping_item'), true);
});

test('clearPurchasedItems archives purchased rows and leaves active rows untouched', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold('Shopping Home');
    const listId = (
      client as unknown as {
        getOrCreateDefaultShoppingListId: (householdId: string) => string;
      }
    ).getOrCreateDefaultShoppingListId(household.id);
    const rawDb = (
      client as unknown as {
        db: {
          prepare: (sql: string) => {
            run: (...args: unknown[]) => unknown;
            get: (...args: unknown[]) => Record<string, unknown> | undefined;
          };
        };
      }
    ).db;

    const purchasedId = 'purchased-item';
    const activeId = 'active-item';
    rawDb
      .prepare(
        `INSERT INTO shopping_items
          (id, list_id, household_id, title, added_by, added_by_user_id, status, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        purchasedId,
        listId,
        household.id,
        'Milk',
        'admin-1',
        'admin-1',
        'purchased',
        'manual',
        new Date().toISOString(),
      );
    rawDb
      .prepare(
        `INSERT INTO shopping_items
          (id, list_id, household_id, title, added_by, added_by_user_id, status, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        activeId,
        listId,
        household.id,
        'Eggs',
        'admin-1',
        'admin-1',
        'added',
        'manual',
        new Date().toISOString(),
      );

    client.clearPurchasedItems(household.id, listId);

    const purchasedRow = rawDb
      .prepare('SELECT archived_at FROM shopping_items WHERE id = ?')
      .get(purchasedId) as { archived_at: string | null };
    const activeRow = rawDb
      .prepare('SELECT archived_at FROM shopping_items WHERE id = ?')
      .get(activeId) as { archived_at: string | null };

    assert.ok(purchasedRow.archived_at);
    assert.equal(activeRow.archived_at, null);
  } finally {
    cleanup();
  }
});

test('getHouseholdContextSummary only marks activity-like device states as active', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold('Context Home');

    client.appendHomeStateLog({
      householdId: household.id,
      deviceId: 'front-door',
      stateKey: 'presence.sam',
      previousValue: 'away',
      newValue: 'home',
      source: 'ha_bridge',
      consentVerified: true,
    });
    client.appendHomeStateLog({
      householdId: household.id,
      deviceId: 'hall-motion',
      stateKey: 'sensor.hall.motion',
      previousValue: false,
      newValue: true,
      source: 'ha_bridge',
      consentVerified: true,
    });
    client.appendHomeStateLog({
      householdId: household.id,
      deviceId: 'weather-station',
      stateKey: 'sensor.weather.temperature',
      previousValue: 20,
      newValue: 23,
      source: 'ha_bridge',
      consentVerified: true,
    });

    const summary = client.getHouseholdContextSummary(household.id);

    assert.equal(summary.membersHome.includes('sam'), true);
    assert.equal(summary.activeDevices.includes('front-door'), true);
    assert.equal(summary.activeDevices.includes('hall-motion'), true);
    assert.equal(summary.activeDevices.includes('weather-station'), false);
    assert.equal(summary.recentStateChanges.length, 3);
  } finally {
    cleanup();
  }
});

test('evaluateReminderAutomationFailures returns no-token fix suggestion', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold(
      'Reminder Home',
      JSON.stringify({
        notificationRouting: {
          members: {
            'adult-1': {
              pushToken: '',
            },
          },
        },
      }),
    );
    client.addMember(household.id, 'adult-1', 'Adult', 'admin-1');
    const token = generateInviteToken();
    client.storeInviteToken(
      household.id,
      'adult-1',
      token,
      new Date(Date.now() + 60_000).toISOString(),
    );
    client.acceptInvite(token, household.id);

    const failures = client.evaluateReminderAutomationFailures(
      household.id,
      ['adult-1'],
      '2026-03-31T12:00:00.000Z',
    );

    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.errorCode, 'REMINDER_NO_TOKEN');
    assert.match(failures[0]?.fixSuggestion ?? '', /notification settings/i);
  } finally {
    cleanup();
  }
});

test('evaluateReminderAutomationFailures returns no-token failure when member profile is missing', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold(
      'Missing Profile Home',
      JSON.stringify({
        notificationRouting: {
          members: {},
        },
      }),
    );
    client.addMember(household.id, 'adult-2', 'Adult', 'admin-1');
    const token = generateInviteToken();
    client.storeInviteToken(
      household.id,
      'adult-2',
      token,
      new Date(Date.now() + 60_000).toISOString(),
    );
    client.acceptInvite(token, household.id);

    const failures = client.evaluateReminderAutomationFailures(
      household.id,
      ['adult-2'],
      '2026-03-31T12:00:00.000Z',
    );

    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.errorCode, 'REMINDER_NO_TOKEN');
    assert.ok((failures[0]?.fixSuggestion ?? '').trim().length > 0);
  } finally {
    cleanup();
  }
});

test('evaluateReminderAutomationFailures returns quiet-hours suppression', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold(
      'Quiet Home',
      JSON.stringify({
        timeZone: 'UTC',
        notificationRouting: {
          members: {
            'adult-1': {
              pushToken: 'expo-token-1',
              quietHours: {
                start: '22:00',
                end: '07:00',
              },
            },
          },
        },
      }),
    );
    client.addMember(household.id, 'adult-1', 'Adult', 'admin-1');
    const token = generateInviteToken();
    client.storeInviteToken(
      household.id,
      'adult-1',
      token,
      new Date(Date.now() + 60_000).toISOString(),
    );
    client.acceptInvite(token, household.id);

    const failures = client.evaluateReminderAutomationFailures(
      household.id,
      ['adult-1'],
      '2026-03-31T23:30:00.000Z',
    );

    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.errorCode, 'REMINDER_QUIET_HOURS');
    assert.equal(failures[0]?.deliveryStatus, 'quiet_hours_suppressed');
  } finally {
    cleanup();
  }
});

test('evaluateReminderAutomationFailures returns inactive-device failure', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold(
      'Inactive Home',
      JSON.stringify({
        notificationRouting: {
          members: {
            'adult-1': {
              pushToken: 'expo-token-1',
              deviceActive: false,
            },
          },
        },
      }),
    );
    client.addMember(household.id, 'adult-1', 'Adult', 'admin-1');
    const token = generateInviteToken();
    client.storeInviteToken(
      household.id,
      'adult-1',
      token,
      new Date(Date.now() + 60_000).toISOString(),
    );
    client.acceptInvite(token, household.id);

    const failures = client.evaluateReminderAutomationFailures(
      household.id,
      ['adult-1'],
      '2026-03-31T12:00:00.000Z',
    );

    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.errorCode, 'REMINDER_MEMBER_INACTIVE');
    assert.match(failures[0]?.fixSuggestion ?? '', /active device/i);
  } finally {
    cleanup();
  }
});

test('isWithinQuietHours — America/New_York timezone, server in UTC', () => {
  const { client, cleanup } = createTestClient();
  try {
    // 23:30 UTC = 18:30 ET (EST, UTC-5) — inside quiet hours 22:00–07:00 ET? No.
    // Use a time that IS quiet in NY: 04:00 UTC = 23:00 EST (UTC-5) — inside 22:00–07:00.
    const household = client.createHousehold(
      'TZ Home NY',
      JSON.stringify({
        timeZone: 'America/New_York',
        notificationRouting: {
          members: {
            'user-tz-1': {
              pushToken: 'expo-token-tz',
              quietHours: { start: '22:00', end: '07:00' },
            },
          },
        },
      }),
    );
    client.addMember(household.id, 'user-tz-1', 'Adult', 'admin-1');
    const token = generateInviteToken();
    client.storeInviteToken(
      household.id,
      'user-tz-1',
      token,
      new Date(Date.now() + 60_000).toISOString(),
    );
    client.acceptInvite(token, household.id);

    // 2026-04-12T04:00:00.000Z = 00:00 EDT (UTC-4) — inside quiet 22:00–07:00
    const failures = client.evaluateReminderAutomationFailures(
      household.id,
      ['user-tz-1'],
      '2026-04-12T04:00:00.000Z',
    );
    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.errorCode, 'REMINDER_QUIET_HOURS');
    assert.equal(failures[0]?.deliveryStatus, 'quiet_hours_suppressed');
  } finally {
    cleanup();
  }
});

test('isWithinQuietHours — cross-midnight range in non-UTC timezone (America/Chicago)', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold(
      'TZ Home Chicago',
      JSON.stringify({
        timeZone: 'America/Chicago',
        notificationRouting: {
          members: {
            'user-tz-2': {
              pushToken: 'expo-token-tz2',
              quietHours: { start: '22:00', end: '06:00' },
            },
          },
        },
      }),
    );
    client.addMember(household.id, 'user-tz-2', 'Adult', 'admin-1');
    const token = generateInviteToken();
    client.storeInviteToken(
      household.id,
      'user-tz-2',
      token,
      new Date(Date.now() + 60_000).toISOString(),
    );
    client.acceptInvite(token, household.id);

    // 2026-04-12T05:00:00.000Z = 00:00 CDT (UTC-5) — inside quiet 22:00–06:00
    const failuresInside = client.evaluateReminderAutomationFailures(
      household.id,
      ['user-tz-2'],
      '2026-04-12T05:00:00.000Z',
    );
    assert.equal(failuresInside.length, 1);
    assert.equal(failuresInside[0]?.errorCode, 'REMINDER_QUIET_HOURS');

    // 2026-04-12T14:00:00.000Z = 09:00 CDT — outside quiet hours
    const failuresOutside = client.evaluateReminderAutomationFailures(
      household.id,
      ['user-tz-2'],
      '2026-04-12T14:00:00.000Z',
    );
    assert.equal(failuresOutside.length, 0);
  } finally {
    cleanup();
  }
});

test('isWithinQuietHours — DST transition hour does not throw', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold(
      'TZ DST Home',
      JSON.stringify({
        timeZone: 'America/New_York',
        notificationRouting: {
          members: {
            'user-dst': {
              pushToken: 'expo-token-dst',
              quietHours: { start: '22:00', end: '07:00' },
            },
          },
        },
      }),
    );
    client.addMember(household.id, 'user-dst', 'Adult', 'admin-1');
    const token = generateInviteToken();
    client.storeInviteToken(
      household.id,
      'user-dst',
      token,
      new Date(Date.now() + 60_000).toISOString(),
    );
    client.acceptInvite(token, household.id);

    // 2026-03-08T07:00:00.000Z — DST spring-forward transition in America/New_York
    let threw = false;
    let result: unknown;
    try {
      result = client.evaluateReminderAutomationFailures(
        household.id,
        ['user-dst'],
        '2026-03-08T07:00:00.000Z',
      );
    } catch {
      threw = true;
    }
    assert.equal(threw, false);
    assert.ok(Array.isArray(result));
  } finally {
    cleanup();
  }
});

test('isWithinQuietHours — no timeZone falls back to server local time and emits warning', () => {
  const { client, cleanup } = createTestClient();
  const originalWarn = console.warn;
  const warnCalls: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args.map((arg) => String(arg)).join(' '));
  };
  try {
    const household = client.createHousehold(
      'No TZ Home',
      JSON.stringify({
        notificationRouting: {
          members: {
            'user-notz': {
              pushToken: 'expo-token-notz',
              quietHours: { start: '22:00', end: '07:00' },
            },
          },
        },
      }),
    );
    client.addMember(household.id, 'user-notz', 'Adult', 'admin-1');
    const token = generateInviteToken();
    client.storeInviteToken(
      household.id,
      'user-notz',
      token,
      new Date(Date.now() + 60_000).toISOString(),
    );
    client.acceptInvite(token, household.id);

    let threw = false;
    let result: unknown;
    try {
      result = client.evaluateReminderAutomationFailures(
        household.id,
        ['user-notz'],
        '2026-04-12T12:00:00.000Z',
      );
    } catch {
      threw = true;
    }
    assert.equal(threw, false);
    assert.ok(Array.isArray(result));
    assert.equal(warnCalls.length, 1);
    const payload = JSON.parse(warnCalls[0] ?? '{}') as {
      message?: string;
      householdId?: string;
    };
    assert.equal(
      payload.message,
      'isWithinQuietHours: no timeZone configured, falling back to server local time',
    );
    assert.equal(payload.householdId, household.id);
  } finally {
    console.warn = originalWarn;
    cleanup();
  }
});

test('listChores — 50 chores with 2 active members returns all with correct assignedTo', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold('Chore Home Large');
    client.addMember(household.id, 'member-a', 'Adult', 'admin-1');
    client.addMember(household.id, 'member-b', 'Adult', 'admin-1');
    const tokenA = generateInviteToken();
    const tokenB = generateInviteToken();
    client.storeInviteToken(
      household.id,
      'member-a',
      tokenA,
      new Date(Date.now() + 60_000).toISOString(),
    );
    client.storeInviteToken(
      household.id,
      'member-b',
      tokenB,
      new Date(Date.now() + 60_000).toISOString(),
    );
    client.acceptInvite(tokenA, household.id);
    client.acceptInvite(tokenB, household.id);

    for (let i = 0; i < 50; i++) {
      client.createChore(
        household.id,
        `Chore ${i}`,
        i % 2 === 0 ? 'member-a' : 'member-b',
        new Date(Date.now() + 86_400_000).toISOString(),
      );
    }

    const chores = client.listChores(household.id);
    assert.equal(chores.length, 50);

    for (const chore of chores) {
      const expectedUser = chore.title.endsWith('0') ||
        Number(chore.title.replace('Chore ', '')) % 2 === 0
        ? 'member-a'
        : 'member-b';
      assert.ok(
        chore.assignedTo.userId === 'member-a' || chore.assignedTo.userId === 'member-b',
        `Expected member-a or member-b, got ${chore.assignedTo.userId}`,
      );
      assert.equal(chore.assignedTo.displayName, chore.assignedTo.userId);
      void expectedUser;
    }
  } finally {
    cleanup();
  }
});

test('listChores — identical results with known assignment data', () => {
  const { client, cleanup } = createTestClient();
  try {
    const household = client.createHousehold('Chore Home Known');
    client.addMember(household.id, 'user-known', 'Adult', 'admin-1');
    const token = generateInviteToken();
    client.storeInviteToken(
      household.id,
      'user-known',
      token,
      new Date(Date.now() + 60_000).toISOString(),
    );
    client.acceptInvite(token, household.id);

    const chore = client.createChore(
      household.id,
      'Wash Dishes',
      'user-known',
      new Date(Date.now() + 86_400_000).toISOString(),
    );

    const chores = client.listChores(household.id);
    assert.equal(chores.length, 1);
    assert.equal(chores[0]?.assignedTo.userId, 'user-known');
    assert.equal(chores[0]?.assignedTo.displayName, 'user-known');
    assert.equal(chores[0]?.streakCount, 0);
    assert.equal(chores[0]?.id, chore.id);
  } finally {
    cleanup();
  }
});
