const DAY_TO_UTC_INDEX = {
    SU: 0,
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6,
};
function parseDateValue(value) {
    const raw = value.trim();
    if (/^\d{8}$/.test(raw)) {
        const year = Number(raw.slice(0, 4));
        const month = Number(raw.slice(4, 6)) - 1;
        const day = Number(raw.slice(6, 8));
        return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    }
    if (/^\d{8}T\d{6}Z$/.test(raw)) {
        const year = Number(raw.slice(0, 4));
        const month = Number(raw.slice(4, 6)) - 1;
        const day = Number(raw.slice(6, 8));
        const hour = Number(raw.slice(9, 11));
        const minute = Number(raw.slice(11, 13));
        const second = Number(raw.slice(13, 15));
        return new Date(Date.UTC(year, month, day, hour, minute, second));
    }
    const isoDate = new Date(raw);
    return Number.isNaN(isoDate.getTime()) ? null : isoDate;
}
function parseRRule(rrule) {
    const parts = rrule
        .split(';')
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
    const options = new Map();
    for (const part of parts) {
        const [rawKey, rawValue] = part.split('=', 2);
        if (!rawKey || !rawValue) {
            continue;
        }
        options.set(rawKey.toUpperCase(), rawValue.toUpperCase());
    }
    const freqValue = options.get('FREQ');
    if (!freqValue || (freqValue !== 'DAILY' && freqValue !== 'WEEKLY' && freqValue !== 'MONTHLY')) {
        throw new Error(`Unsupported recurrence frequency: ${freqValue ?? 'missing'}`);
    }
    const byDay = (options.get('BYDAY') ?? '')
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token.length > 0)
        .map((token) => DAY_TO_UTC_INDEX[token])
        .filter((day) => typeof day === 'number' && Number.isInteger(day));
    const untilRaw = options.get('UNTIL');
    const until = untilRaw ? parseDateValue(untilRaw) : null;
    return {
        freq: freqValue,
        byDay,
        until,
    };
}
function addUtcDays(fromDate, days) {
    const result = new Date(fromDate);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
}
function addUtcMonthsClamped(fromDate, months) {
    const year = fromDate.getUTCFullYear();
    const month = fromDate.getUTCMonth();
    const day = fromDate.getUTCDate();
    const targetMonth = month + months;
    const targetYear = year + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
    const result = new Date(fromDate);
    result.setUTCFullYear(targetYear, normalizedMonth, Math.min(day, lastDayOfTargetMonth));
    return result;
}
function matchesByDay(date, allowedDays) {
    if (allowedDays.length === 0) {
        return true;
    }
    return allowedDays.includes(date.getUTCDay());
}
function advanceToNextAllowedDay(fromDate, allowedDays) {
    let cursor = addUtcDays(fromDate, 1);
    for (let index = 0; index < 370; index += 1) {
        if (matchesByDay(cursor, allowedDays)) {
            return cursor;
        }
        cursor = addUtcDays(cursor, 1);
    }
    throw new Error('Unable to compute next allowed BYDAY occurrence');
}
export function getNextDueDate(rrule, fromDate) {
    const parsed = parseRRule(rrule);
    if (parsed.until && fromDate.getTime() > parsed.until.getTime()) {
        return null;
    }
    let nextDate;
    if (parsed.freq === 'DAILY') {
        nextDate = parsed.byDay.length > 0 ? advanceToNextAllowedDay(fromDate, parsed.byDay) : addUtcDays(fromDate, 1);
    }
    else if (parsed.freq === 'WEEKLY') {
        if (parsed.byDay.length === 0) {
            nextDate = addUtcDays(fromDate, 7);
        }
        else {
            nextDate = advanceToNextAllowedDay(fromDate, parsed.byDay);
        }
    }
    else {
        nextDate = addUtcMonthsClamped(fromDate, 1);
        if (parsed.byDay.length > 0 && !matchesByDay(nextDate, parsed.byDay)) {
            nextDate = advanceToNextAllowedDay(nextDate, parsed.byDay);
        }
    }
    if (parsed.until && nextDate.getTime() > parsed.until.getTime()) {
        return null;
    }
    return nextDate;
}
export function isOverdue(dueAt, now = new Date()) {
    const dueDate = new Date(dueAt);
    if (Number.isNaN(dueDate.getTime())) {
        return false;
    }
    return dueDate.getTime() < now.getTime();
}
//# sourceMappingURL=recurrence.js.map