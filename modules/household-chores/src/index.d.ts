import type { HouseholdChoreCreateRequested, HouseholdChoreAssigned, HouseholdChoreCompleted } from '@lifeos/contracts';
import { type LifeOSModule, type ModuleRuntimeContext } from '@lifeos/module-sdk';
import { type ObservabilityClient } from '@lifeos/observability';
export { calculateStreak } from './streak';
export { getNextDueDate, isOverdue } from './recurrence';
export type ChorePublishContext = Pick<ModuleRuntimeContext, 'publish'>;
export interface ChoreIntentStore {
    createRequestedChore(payload: HouseholdChoreCreateRequested): HouseholdChoreAssigned | null;
}
export interface ChoreAutomationFailure {
    errorCode: 'CHORE_NO_ASSIGNEE' | 'CHORE_RRULE_INVALID';
    fixSuggestion: string;
}
export declare function createChoreIntentStore(dbPath: string): Promise<ChoreIntentStore>;
interface HouseholdChoresModuleOptions {
    createIntentStore?: (dbPath: string) => Promise<ChoreIntentStore>;
    observabilityClient?: ObservabilityClient;
}
export declare function resolveChoreAutomationFailure(error: unknown, input: {
    choreTitle: string;
    recurrenceRule?: string | null;
}): ChoreAutomationFailure | null;
export declare function createHouseholdChoresModule(options?: HouseholdChoresModuleOptions): LifeOSModule;
export declare const householdChoresModule: LifeOSModule;
export declare function publishChoreAssigned(context: ChorePublishContext, payload: HouseholdChoreAssigned): Promise<void>;
export declare function publishChoreCompleted(context: ChorePublishContext, payload: HouseholdChoreCompleted): Promise<void>;
export default householdChoresModule;
//# sourceMappingURL=index.d.ts.map