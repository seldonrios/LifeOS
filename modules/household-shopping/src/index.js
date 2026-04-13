import { randomUUID } from 'node:crypto';
import { HouseholdShoppingItemAddRequestedSchema, Topics, } from '@lifeos/module-sdk';
export { isValidTransition, VALID_TRANSITIONS } from './state-machine';
const SHOPPING_ITEM_ADDED_TOPIC = 'lifeos.household.shopping.item.added';
const SHOPPING_ITEM_PURCHASED_TOPIC = 'lifeos.household.shopping.item.purchased';
function applyBestEffortMigration(db, sql) {
    try {
        db.exec(sql);
    }
    catch {
        return;
    }
}
function getOrCreateDefaultListId(db, householdId) {
    const existing = db
        .prepare(`SELECT id
       FROM shopping_lists
       WHERE household_id = ?
       ORDER BY rowid ASC
       LIMIT 1`)
        .get(householdId);
    if (existing?.id) {
        return existing.id;
    }
    const listId = randomUUID();
    db.prepare('INSERT INTO shopping_lists (id, household_id, name) VALUES (?, ?, ?)').run(listId, householdId, 'Shared');
    return listId;
}
export async function createShoppingIntentStore(dbPath) {
    const sqlite = await import('better-sqlite3');
    const Database = sqlite.default;
    const db = new Database(dbPath);
    applyBestEffortMigration(db, 'ALTER TABLE shopping_items ADD COLUMN original_capture_id TEXT');
    applyBestEffortMigration(db, 'CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_items_original_capture_id ON shopping_items(original_capture_id) WHERE original_capture_id IS NOT NULL');
    return {
        addRequestedItem(payload) {
            const existing = db
                .prepare(`SELECT id, list_id, title, added_by_user_id
           FROM shopping_items
           WHERE original_capture_id = ?
           LIMIT 1`)
                .get(payload.originalCaptureId);
            if (existing?.id && existing.list_id && existing.title && existing.added_by_user_id) {
                return {
                    householdId: payload.householdId,
                    listId: existing.list_id,
                    itemId: existing.id,
                    title: existing.title,
                    addedByUserId: existing.added_by_user_id,
                    source: 'voice',
                };
            }
            const itemId = randomUUID();
            const createdAt = new Date().toISOString();
            const listId = getOrCreateDefaultListId(db, payload.householdId);
            db.prepare(`INSERT INTO shopping_items
          (id, list_id, household_id, title, added_by, added_by_user_id, status, source, created_at, original_capture_id)
         VALUES (?, ?, ?, ?, ?, ?, 'added', 'voice', ?, ?)`).run(itemId, listId, payload.householdId, payload.itemTitle, payload.actorUserId, payload.actorUserId, createdAt, payload.originalCaptureId);
            return {
                householdId: payload.householdId,
                listId,
                itemId,
                title: payload.itemTitle,
                addedByUserId: payload.actorUserId,
                source: 'voice',
            };
        },
    };
}
export function createHouseholdShoppingModule(options = {}) {
    const createIntentStore = options.createIntentStore ?? createShoppingIntentStore;
    return {
        id: 'household-shopping',
        async init(context) {
            const dbPath = context.env.LIFEOS_HOUSEHOLD_DB_PATH?.trim();
            if (!dbPath) {
                context.log('[household-shopping] skipped intent subscription: missing LIFEOS_HOUSEHOLD_DB_PATH');
                return;
            }
            const store = await createIntentStore(dbPath);
            await context.subscribe(Topics.lifeos.householdShoppingItemAddRequested, async (event) => {
                const payload = HouseholdShoppingItemAddRequestedSchema.parse(event.data);
                const added = store.addRequestedItem(payload);
                if (!added) {
                    return;
                }
                await publishShoppingItemAdded(context, added);
            });
            context.log('[household-shopping] initialized');
        },
    };
}
export const householdShoppingModule = createHouseholdShoppingModule();
export async function publishShoppingItemAdded(context, payload) {
    await context.publish(SHOPPING_ITEM_ADDED_TOPIC, payload, 'dashboard-service');
}
export async function publishShoppingItemPurchased(context, payload) {
    await context.publish(SHOPPING_ITEM_PURCHASED_TOPIC, payload, 'dashboard-service');
}
export default householdShoppingModule;
