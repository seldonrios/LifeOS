export type ShoppingItemStatus = 'added' | 'in_cart' | 'purchased';

export const VALID_TRANSITIONS: Record<ShoppingItemStatus, ShoppingItemStatus[]> = {
  added: ['in_cart', 'purchased'],
  in_cart: ['purchased'],
  purchased: [],
};

export function isValidTransition(current: ShoppingItemStatus, next: ShoppingItemStatus): boolean {
  return VALID_TRANSITIONS[current].includes(next);
}
