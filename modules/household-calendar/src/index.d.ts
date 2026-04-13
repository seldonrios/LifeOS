import type { HouseholdCalendarEventCreated } from '@lifeos/contracts';
import { type LifeOSModule, type ModuleRuntimeContext } from '@lifeos/module-sdk';
export { generateIcs } from './ics';
export type CalendarPublishContext = Pick<ModuleRuntimeContext, 'publish'>;
export declare const householdCalendarModule: LifeOSModule;
export declare function publishCalendarEventCreated(context: CalendarPublishContext, payload: HouseholdCalendarEventCreated): Promise<void>;
export default householdCalendarModule;
