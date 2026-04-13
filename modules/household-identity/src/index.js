import { createEventBusClient } from '@lifeos/event-bus';
import { HouseholdGraphClient, InvalidAttendeeError, InvalidShoppingItemTransitionError, } from './client';
import { registerAuditInterceptor } from './audit-interceptor';
import { generateInviteExpiry, generateInviteToken, isInviteExpired } from './invites';
import { canPerform } from './roles';
let householdGraphClient = null;
export function getHouseholdGraphClient() {
    if (!householdGraphClient) {
        throw new Error('household-identity module has not been initialized');
    }
    return householdGraphClient;
}
export const householdIdentityModule = {
    id: 'household-identity',
    async init(context) {
        const dbPath = context.env.LIFEOS_HOUSEHOLD_DB_PATH;
        if (!dbPath || dbPath.trim().length === 0) {
            throw new Error('household-identity requires LIFEOS_HOUSEHOLD_DB_PATH in context.env');
        }
        householdGraphClient = new HouseholdGraphClient(dbPath);
        householdGraphClient.initializeSchema();
        const eventBus = context.eventBus ??
            createEventBusClient({ env: process.env, logger: context.log });
        await registerAuditInterceptor(eventBus, householdGraphClient);
        context.log('[household-identity] initialized');
    },
};
export { HouseholdGraphClient, InvalidAttendeeError, InvalidShoppingItemTransitionError, registerAuditInterceptor, canPerform, generateInviteToken, generateInviteExpiry, isInviteExpired, };
export default householdIdentityModule;
