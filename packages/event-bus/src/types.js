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
    health: {
        changed: 'health.changed',
        checkRequested: 'health.check.requested',
    },
    production: {
        taskCreated: 'production.task.created',
        taskCompleted: 'production.task.completed',
    },
    goal: {
        proposed: 'goal.proposed',
        updated: 'goal.updated',
    },
    plan: {
        created: 'plan.created',
        revised: 'plan.revised',
    },
    task: {
        scheduled: 'task.scheduled',
        statusChanged: 'task.status.changed',
    },
    module: {
        loaded: 'module.loaded',
        failed: 'module.failed',
    },
    device: {
        stateChanged: 'device.state.changed',
        commandIssued: 'device.command.issued',
    },
    automation: {
        triggerFired: 'automation.trigger.fired',
        actionExecuted: 'automation.action.executed',
    },
    agent: {
        workRequested: 'agent.work.requested',
        workCompleted: 'agent.work.completed',
    },
};
