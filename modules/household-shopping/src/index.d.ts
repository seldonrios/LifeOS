import { type HouseholdShoppingItemAdded, type HouseholdShoppingItemAddRequested, type HouseholdShoppingItemPurchased, type LifeOSModule, type ModuleRuntimeContext } from '@lifeos/module-sdk';
export { isValidTransition, VALID_TRANSITIONS } from './state-machine';
export type ShoppingPublishContext = Pick<ModuleRuntimeContext, 'publish'>;
export interface ShoppingIntentStore {
    addRequestedItem(payload: HouseholdShoppingItemAddRequested): HouseholdShoppingItemAdded | null;
}
export declare function createShoppingIntentStore(dbPath: string): Promise<ShoppingIntentStore>;
interface HouseholdShoppingModuleOptions {
    createIntentStore?: (dbPath: string) => Promise<ShoppingIntentStore>;
}
export declare function createHouseholdShoppingModule(options?: HouseholdShoppingModuleOptions): LifeOSModule;
export declare const householdShoppingModule: LifeOSModule;
export declare function publishShoppingItemAdded(context: ShoppingPublishContext, payload: HouseholdShoppingItemAdded): Promise<void>;
export declare function publishShoppingItemPurchased(context: ShoppingPublishContext, payload: HouseholdShoppingItemPurchased): Promise<void>;
export default householdShoppingModule;
//# sourceMappingURL=index.d.ts.map