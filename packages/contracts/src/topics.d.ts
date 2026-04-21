/**
 * Canonical NATS topic names shared across all LifeOS packages.
 *
 * Defined here (in contracts) so that mobile and other client packages can
 * import topic names without pulling in the server-side NATS runtime from
 * @lifeos/event-bus.
 */
export declare const Topics: {
    readonly person: {
        readonly created: "person.created";
        readonly updated: "person.updated";
    };
    readonly health: {
        readonly changed: "health.changed";
        readonly checkRequested: "health.check.requested";
    };
    readonly production: {
        readonly taskCreated: "production.task.created";
        readonly taskCompleted: "production.task.completed";
    };
    readonly goal: {
        readonly proposed: "goal.proposed";
        readonly updated: "goal.updated";
    };
    readonly plan: {
        readonly created: "plan.created";
        readonly revised: "plan.revised";
    };
    readonly task: {
        readonly scheduled: "task.scheduled";
        readonly statusChanged: "task.status.changed";
    };
    readonly module: {
        readonly loaded: "module.loaded";
        readonly failed: "module.failed";
    };
    readonly device: {
        readonly stateChanged: "device.state.changed";
        readonly commandIssued: "device.command.issued";
    };
    readonly automation: {
        readonly triggerFired: "automation.trigger.fired";
        readonly actionExecuted: "automation.action.executed";
    };
    readonly agent: {
        readonly workRequested: "agent.work.requested";
        readonly workCompleted: "agent.work.completed";
    };
    readonly lifeos: {
        readonly tickOverdue: "lifeos.tick.overdue";
        readonly taskCompleted: "lifeos.task.completed";
        readonly reminderFollowupCreated: "lifeos.reminder.followup.created";
        readonly voiceWakeDetected: "lifeos.voice.wake.detected";
        readonly voiceCommandReceived: "lifeos.voice.command.received";
        readonly voiceCommandProcessed: "lifeos.voice.command.processed";
        readonly voiceCommandUnhandled: "lifeos.voice.command.unhandled";
        readonly voiceIntentCalendarAdd: "lifeos.voice.intent.calendar.add";
        readonly voiceIntentTaskAdd: "lifeos.voice.intent.task.add";
        readonly voiceIntentResearch: "lifeos.voice.intent.research";
        readonly voiceIntentNoteAdd: "lifeos.voice.intent.note.add";
        readonly voiceIntentNoteSearch: "lifeos.voice.intent.note.search";
        readonly voiceIntentWeather: "lifeos.voice.intent.weather";
        readonly voiceIntentNews: "lifeos.voice.intent.news";
        readonly voiceIntentEmailSummarize: "lifeos.voice.intent.email.summarize";
        readonly voiceIntentBriefing: "lifeos.voice.intent.briefing";
        readonly voiceIntentPreferenceSet: "lifeos.voice.intent.preference.set";
        readonly voiceIntentHealthLog: "lifeos.voice.intent.health.log";
        readonly voiceIntentHealthQuery: "lifeos.voice.intent.health.query";
        readonly voiceIntentHabitCreate: "lifeos.voice.intent.habit.create";
        readonly voiceIntentHabitCheckin: "lifeos.voice.intent.habit.checkin";
        readonly voiceIntentHabitStatus: "lifeos.voice.intent.habit.status";
        readonly calendarEventAdded: "lifeos.calendar.event.added";
        readonly taskRescheduleSuggested: "lifeos.task.reschedule.suggested";
        readonly noteAdded: "lifeos.note.added";
        readonly noteSearchCompleted: "lifeos.note.search.completed";
        readonly researchCompleted: "lifeos.research.completed";
        readonly weatherSnapshotCaptured: "lifeos.weather.snapshot.captured";
        readonly healthMetricLogged: "lifeos.health.metric.logged";
        readonly healthStreakUpdated: "lifeos.health.streak.updated";
        readonly habitCheckinRecorded: "lifeos.habit.checkin.recorded";
        readonly habitStreakMilestone: "lifeos.habit.streak.milestone";
        readonly planningAssistantTaskPlanned: "lifeos.planning-assistant.task.planned";
        readonly planningAssistantReminderScheduled: "lifeos.planning-assistant.reminder.scheduled";
        readonly planningAssistantPlanUpdated: "lifeos.planning-assistant.plan.updated";
        readonly notificationBridgeSent: "lifeos.notification-bridge.sent";
        readonly notificationBridgeFailed: "lifeos.notification-bridge.failed";
        readonly newsDigestReady: "lifeos.news.digest.ready";
        readonly emailDigestReady: "lifeos.email.digest.ready";
        readonly orchestratorSuggestion: "lifeos.orchestrator.suggestion";
        readonly briefingGenerated: "lifeos.briefing.generated";
        readonly personalityUpdated: "lifeos.personality.updated";
        readonly memoryStatusGenerated: "lifeos.memory.status.generated";
        readonly syncDelta: "lifeos.sync.delta";
        readonly syncAuditLogged: "lifeos.sync.audit.logged";
        readonly syncConflictDetected: "lifeos.sync.conflict.detected";
        readonly syncDevicePaired: "lifeos.sync.device.paired";
        readonly syncDevicesListed: "lifeos.sync.devices.listed";
        readonly syncDemoCompleted: "lifeos.sync.demo.completed";
        readonly meshNodeHeartbeat: "lifeos.mesh.node.heartbeat";
        readonly meshNodeLeft: "lifeos.mesh.node.left";
        readonly meshLeaderElected: "lifeos.mesh.leader.elected";
        readonly meshLeaderChanged: "lifeos.mesh.leader.changed";
        readonly meshLeaderLost: "lifeos.mesh.leader.lost";
        readonly meshDelegateRequested: "lifeos.mesh.delegate.requested";
        readonly meshDelegateAccepted: "lifeos.mesh.delegate.accepted";
        readonly meshDelegateCompleted: "lifeos.mesh.delegate.completed";
        readonly meshDelegateFailed: "lifeos.mesh.delegate.failed";
        readonly meshDelegateFallbackLocal: "lifeos.mesh.delegate.fallback_local";
        readonly securityPolicyDenied: "lifeos.security.policy.denied";
        readonly securityAuthFailed: "lifeos.security.auth.failed";
        readonly trustExplanationLogged: "lifeos.trust.explanation.logged";
        readonly householdMemberInvited: "lifeos.household.member.invited";
        readonly householdMemberJoined: "lifeos.household.member.joined";
        readonly householdMemberRoleChanged: "lifeos.household.member.role.changed";
        readonly householdChoreAssigned: "lifeos.household.chore.assigned";
        readonly householdChoreCompleted: "lifeos.household.chore.completed";
        readonly householdShoppingItemAdded: "lifeos.household.shopping.item.added";
        readonly householdShoppingItemPurchased: "lifeos.household.shopping.item.purchased";
        readonly householdCalendarEventCreated: "lifeos.household.calendar.event.created";
        readonly householdReminderFired: "lifeos.household.reminder.fired";
        readonly householdHomeStateChanged: "lifeos.household.homestate.changed";
        readonly householdVoiceCaptureCreated: "lifeos.household.voice.capture.created";
        readonly householdShoppingItemAddRequested: "lifeos.household.shopping.item.add.requested";
        readonly householdChoreCreateRequested: "lifeos.household.chore.create.requested";
        readonly householdReminderCreateRequested: "lifeos.household.reminder.create.requested";
        readonly householdNoteCreateRequested: "lifeos.household.note.create.requested";
        readonly householdCaptureUnresolved: "lifeos.household.capture.unresolved";
        readonly householdAutomationFailed: "lifeos.household.automation.failed";
        readonly homeNodeSurfaceRegistered: "lifeos.homenode.surface.registered";
        readonly homeNodeSurfaceDeregistered: "lifeos.homenode.surface.deregistered";
        readonly homeNodeStateSnapshotUpdated: "lifeos.homenode.state.snapshot.updated";
        readonly homeNodeDisplayFeedUpdated: "lifeos.homenode.display.feed.updated";
        readonly homeNodeVoiceSessionStarted: "lifeos.homenode.voice.session.started";
        readonly homeNodeVoiceSessionCompleted: "lifeos.homenode.voice.session.completed";
        readonly homeNodeVoiceSessionFailed: "lifeos.homenode.voice.session.failed";
        readonly homeNodeHealthChanged: "lifeos.homenode.health.changed";
    };
};
