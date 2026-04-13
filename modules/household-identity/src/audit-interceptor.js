import { randomUUID } from 'node:crypto';
function asNonEmptyString(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function asCaptureRef(value) {
    const captureId = asNonEmptyString(value);
    return captureId ? `capture:${captureId}` : null;
}
function deriveObjectRef(type, data) {
    switch (type) {
        case 'lifeos.household.member.invited':
            return `member:${String(data.invitedUserId ?? '')}`;
        case 'lifeos.household.member.joined':
            return `member:${String(data.userId ?? '')}`;
        case 'lifeos.household.member.role.changed':
            return `member:${String(data.userId ?? '')}`;
        case 'lifeos.household.chore.assigned':
            return `chore:${String(data.choreId ?? '')}`;
        case 'lifeos.household.chore.completed':
            return `chore:${String(data.choreId ?? '')}`;
        case 'lifeos.household.shopping.item.added':
            return `shopping_item:${String(data.itemId ?? '')}`;
        case 'lifeos.household.shopping.item.purchased':
            return `shopping_item:${String(data.itemId ?? '')}`;
        case 'lifeos.household.calendar.event.created':
            return `calendar_event:${String(data.eventId ?? '')}`;
        case 'lifeos.household.reminder.fired':
            return `reminder:${String(data.reminderId ?? '')}`;
        case 'lifeos.household.automation.failed':
            return String(data.object_ref ?? `automation:${String(data.error_code ?? '')}`);
        case 'lifeos.household.homestate.changed':
            return `device:${String(data.deviceId ?? '')}`;
        case 'lifeos.household.voice.capture.created':
            return `capture:${String(data.captureId ?? '')}`;
        case 'lifeos.household.shopping.item.add.requested':
        case 'lifeos.household.chore.create.requested':
        case 'lifeos.household.reminder.create.requested':
        case 'lifeos.household.note.create.requested':
            return asCaptureRef(data.originalCaptureId) ?? type;
        case 'lifeos.household.capture.unresolved':
            return asCaptureRef(data.captureId) ?? type;
        default:
            return type;
    }
}
export async function registerAuditInterceptor(eventBus, client) {
    await eventBus.subscribe('lifeos.household.>', async (event) => {
        const metadata = event.metadata ?? {};
        const householdId = asNonEmptyString(metadata.household_id);
        const actorId = asNonEmptyString(metadata.actor_id);
        const traceId = asNonEmptyString(metadata.trace_id);
        if (!householdId || !actorId) {
            const error = new Error(`Missing required audit metadata for event ${event.type} (trace_id=${traceId ?? 'n/a'})`);
            console.error('[household-identity] audit interceptor rejected event:', error.message);
            throw error;
        }
        const payload = (event.data ?? {});
        const objectRef = deriveObjectRef(event.type, payload);
        try {
            client.writeAuditEntry({
                id: randomUUID(),
                householdId,
                actorId,
                actionType: event.type,
                objectRef,
                payloadJson: payload,
                createdAt: new Date().toISOString(),
            });
        }
        catch (error) {
            console.error('[household-identity] failed to write audit entry:', {
                eventType: event.type,
                traceId,
                error,
            });
            throw error;
        }
    });
}
