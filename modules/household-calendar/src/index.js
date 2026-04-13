import { Topics } from '@lifeos/module-sdk';
export { generateIcs } from './ics';
export const householdCalendarModule = {
    id: 'household-calendar',
    init(context) {
        context.log('[household-calendar] initialized');
    },
};
export async function publishCalendarEventCreated(context, payload) {
    await context.publish(Topics.lifeos.householdCalendarEventCreated, payload, 'dashboard-service');
}
export default householdCalendarModule;
