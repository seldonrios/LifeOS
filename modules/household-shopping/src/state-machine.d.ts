export type ShoppingItemStatus = 'added' | 'in_cart' | 'purchased';
export declare const VALID_TRANSITIONS: Record<ShoppingItemStatus, ShoppingItemStatus[]>;
export declare function isValidTransition(current: ShoppingItemStatus, next: ShoppingItemStatus): boolean;
