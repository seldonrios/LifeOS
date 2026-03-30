import type {
  HouseholdChoreAssigned,
  HouseholdChoreCompleted,
} from '@lifeos/contracts';
import { Topics, type LifeOSModule, type ModuleRuntimeContext } from '@lifeos/module-sdk';

export { calculateStreak } from './streak';
export { getNextDueDate, isOverdue } from './recurrence';

export type ChorePublishContext = Pick<ModuleRuntimeContext, 'publish'>;

export const householdChoresModule: LifeOSModule = {
  id: 'household-chores',
  init(context: ModuleRuntimeContext) {
    context.log('[household-chores] initialized');
  },
};

export async function publishChoreAssigned(
  context: ChorePublishContext,
  payload: HouseholdChoreAssigned,
): Promise<void> {
  await context.publish(Topics.lifeos.householdChoreAssigned, payload, 'dashboard-service');
}

export async function publishChoreCompleted(
  context: ChorePublishContext,
  payload: HouseholdChoreCompleted,
): Promise<void> {
  await context.publish(Topics.lifeos.householdChoreCompleted, payload, 'dashboard-service');
}

export default householdChoresModule;
