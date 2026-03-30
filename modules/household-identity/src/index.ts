import type { LifeOSModule, ModuleRuntimeContext } from '@lifeos/module-sdk';

import { HouseholdGraphClient } from './client';
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
    context.log('[household-identity] initialized');
  },
};

export {
  HouseholdGraphClient,
  canPerform,
  generateInviteToken,
  generateInviteExpiry,
  isInviteExpired,
};

export default householdIdentityModule;
