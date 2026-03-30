import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-sdk';
import type { AuditLogEntry } from '@lifeos/contracts';
import { createEventBusClient, type ManagedEventBus } from '@lifeos/event-bus';

import { HouseholdGraphClient, InvalidShoppingItemTransitionError } from './client';
import { registerAuditInterceptor } from './audit-interceptor';
import { generateInviteExpiry, generateInviteToken, isInviteExpired } from './invites';
import { canPerform } from './roles';

let householdGraphClient: HouseholdGraphClient | null = null;

export function getHouseholdGraphClient(): HouseholdGraphClient {
  if (!householdGraphClient) {
    throw new Error('household-identity module has not been initialized');
  }
  return householdGraphClient;
}

export const householdIdentityModule: LifeOSModule = {
  id: 'household-identity',
  async init(context: ModuleRuntimeContext) {
    const dbPath = context.env.LIFEOS_HOUSEHOLD_DB_PATH;
    if (!dbPath || dbPath.trim().length === 0) {
      throw new Error('household-identity requires LIFEOS_HOUSEHOLD_DB_PATH in context.env');
    }

    householdGraphClient = new HouseholdGraphClient(dbPath);
    householdGraphClient.initializeSchema();

    const eventBus =
      (context as ModuleRuntimeContext & { eventBus?: ManagedEventBus }).eventBus ??
      createEventBusClient({ env: process.env, logger: context.log });
    await registerAuditInterceptor(eventBus, householdGraphClient);

    context.log('[household-identity] initialized');
  },
};

export {
  HouseholdGraphClient,
  InvalidShoppingItemTransitionError,
  registerAuditInterceptor,
  canPerform,
  generateInviteToken,
  generateInviteExpiry,
  isInviteExpired,
  type AuditLogEntry,
};

export default householdIdentityModule;
