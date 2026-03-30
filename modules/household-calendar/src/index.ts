import type { HouseholdCalendarEventCreated } from '@lifeos/contracts';
import { Topics, type LifeOSModule, type ModuleRuntimeContext } from '@lifeos/module-sdk';

export { generateIcs } from './ics';

export type CalendarPublishContext = Pick<ModuleRuntimeContext, 'publish'>;

export const householdCalendarModule: LifeOSModule = {
  id: 'household-calendar',
  init(context: ModuleRuntimeContext) {
    context.log('[household-calendar] initialized');
  },
};

export async function publishCalendarEventCreated(
  context: CalendarPublishContext,
  payload: HouseholdCalendarEventCreated,
): Promise<void> {
  await context.publish(Topics.lifeos.householdCalendarEventCreated, payload, 'dashboard-service');
}

export default householdCalendarModule;
