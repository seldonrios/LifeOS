import { HouseholdRoleSchema } from '@lifeos/module-sdk';

type HouseholdRole = 'Admin' | 'Adult' | 'Teen' | 'Child' | 'Guest';

const ROLE_PERMISSIONS: Record<HouseholdRole, ReadonlySet<string>> = {
  Admin: new Set([
    'invite',
    'remove_member',
    'change_role',
    'add_shopping_item',
    'complete_chore',
    'create_event',
    'view',
  ]),
  Adult: new Set(['add_shopping_item', 'complete_chore', 'create_event', 'view']),
  Teen: new Set(['add_shopping_item', 'complete_chore', 'create_event', 'view']),
  Child: new Set(['add_shopping_item', 'complete_chore', 'view']),
  Guest: new Set(['view']),
};

export function canPerform(role: HouseholdRole, action: string): boolean {
  const parsedRole = HouseholdRoleSchema.parse(role) as HouseholdRole;
  const permissions = ROLE_PERMISSIONS[parsedRole];
  if (!permissions) {
    return false;
  }

  return permissions.has(action);
}
