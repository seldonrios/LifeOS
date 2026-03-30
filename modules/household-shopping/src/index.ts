import { type LifeOSModule, type ModuleRuntimeContext } from '@lifeos/module-sdk';

export { isValidTransition, VALID_TRANSITIONS } from './state-machine';

type HouseholdShoppingItemAdded = Record<string, unknown> & {
  householdId: string;
  listId: string;
  itemId: string;
  title: string;
  addedByUserId: string;
  source: 'manual' | 'voice' | 'routine';
};

type HouseholdShoppingItemPurchased = Record<string, unknown> & {
  householdId: string;
  listId: string;
  itemId: string;
  title: string;
  purchasedByUserId: string;
  purchasedAt: string;
};

const SHOPPING_ITEM_ADDED_TOPIC = 'lifeos.household.shopping.item.added';
const SHOPPING_ITEM_PURCHASED_TOPIC = 'lifeos.household.shopping.item.purchased';

export type ShoppingPublishContext = Pick<ModuleRuntimeContext, 'publish'>;

export const householdShoppingModule: LifeOSModule = {
  id: 'household-shopping',
  init(context: ModuleRuntimeContext) {
    context.log('[household-shopping] initialized');
  },
};

export async function publishShoppingItemAdded(
  context: ShoppingPublishContext,
  payload: HouseholdShoppingItemAdded,
): Promise<void> {
  await context.publish(SHOPPING_ITEM_ADDED_TOPIC, payload, 'dashboard-service');
}

export async function publishShoppingItemPurchased(
  context: ShoppingPublishContext,
  payload: HouseholdShoppingItemPurchased,
): Promise<void> {
  await context.publish(SHOPPING_ITEM_PURCHASED_TOPIC, payload, 'dashboard-service');
}

export default householdShoppingModule;
