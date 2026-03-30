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
