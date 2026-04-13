import type { ManagedEventBus } from '@lifeos/event-bus';
import type { HouseholdGraphClient } from './client';
export declare function registerAuditInterceptor(eventBus: ManagedEventBus, client: HouseholdGraphClient): Promise<void>;
