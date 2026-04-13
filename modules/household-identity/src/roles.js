import { HouseholdRoleSchema } from '@lifeos/module-sdk';
const ROLE_PERMISSIONS = {
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
    Child: new Set(['view']),
    Guest: new Set(['view']),
};
export function canPerform(role, action) {
    const parsedRole = HouseholdRoleSchema.parse(role);
    const permissions = ROLE_PERMISSIONS[parsedRole];
    if (!permissions) {
        return false;
    }
    return permissions.has(action);
}
