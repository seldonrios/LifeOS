import { getNextDueDate } from './recurrence';
export function calculateStreak(runs, recurrenceRule, now = new Date()) {
    void now;
    if (runs.length === 0) {
        return 0;
    }
    if (!recurrenceRule) {
        return runs.length;
    }
    let streak = 1;
    for (let index = 0; index < runs.length - 1; index += 1) {
        const newerRun = runs[index];
        const olderRun = runs[index + 1];
        if (!newerRun || !olderRun) {
            return 0;
        }
        const newerCompletedAt = new Date(newerRun.completed_at);
        const olderCompletedAt = new Date(olderRun.completed_at);
        if (Number.isNaN(newerCompletedAt.getTime()) || Number.isNaN(olderCompletedAt.getTime())) {
            return 0;
        }
        const expectedNext = getNextDueDate(recurrenceRule, olderCompletedAt);
        if (!expectedNext) {
            return 0;
        }
        const allowedIntervalMs = expectedNext.getTime() - olderCompletedAt.getTime();
        if (allowedIntervalMs <= 0) {
            return 0;
        }
        const actualIntervalMs = newerCompletedAt.getTime() - olderCompletedAt.getTime();
        if (actualIntervalMs > allowedIntervalMs) {
            return 0;
        }
        streak += 1;
    }
    return streak;
}
