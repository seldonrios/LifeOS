export { Topics } from '@lifeos/contracts';
export var EventCategory;
(function (EventCategory) {
    EventCategory["State"] = "State";
    EventCategory["Command"] = "Command";
    EventCategory["Observation"] = "Observation";
})(EventCategory || (EventCategory = {}));
export const Topics = {
    person: {
        created: 'person.created',
        updated: 'person.updated',
    },
    checkRequested: 'health.check.requested',
};
