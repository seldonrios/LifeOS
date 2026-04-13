function formatIcsDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`Invalid datetime: ${value}`);
    }
    return date
        .toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z');
}
function escapeText(value) {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}
function foldLine(line) {
    const maxOctets = 75;
    const chars = [...line];
    let current = '';
    let currentOctets = 0;
    const segments = [];
    for (const ch of chars) {
        const chOctets = Buffer.byteLength(ch, 'utf8');
        if (currentOctets + chOctets > maxOctets) {
            segments.push(current);
            current = ch;
            currentOctets = chOctets;
        }
        else {
            current += ch;
            currentOctets += chOctets;
        }
    }
    if (current.length > 0) {
        segments.push(current);
    }
    if (segments.length === 0) {
        return line;
    }
    return segments.map((segment, index) => (index === 0 ? segment : ` ${segment}`)).join('\r\n');
}
export function generateIcs(events, calendarName) {
    const dtstamp = formatIcsDate(new Date().toISOString());
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//LifeOS//household-calendar//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
    ];
    if (calendarName && calendarName.length > 0) {
        lines.push(foldLine(`X-WR-CALNAME:${escapeText(calendarName)}`));
    }
    for (const event of events) {
        if (event.status === 'cancelled') {
            continue;
        }
        lines.push('BEGIN:VEVENT');
        lines.push(`UID:${event.id}@lifeos`);
        lines.push(`DTSTAMP:${dtstamp}`);
        lines.push(foldLine(`SUMMARY:${escapeText(event.title)}`));
        lines.push(`DTSTART:${formatIcsDate(event.start_at)}`);
        lines.push(`DTEND:${formatIcsDate(event.end_at)}`);
        lines.push(`STATUS:${event.status === 'tentative' ? 'TENTATIVE' : 'CONFIRMED'}`);
        if (event.recurrence_rule) {
            lines.push(foldLine(`RRULE:${event.recurrence_rule}`));
        }
        if (event.reminder_at) {
            lines.push('BEGIN:VALARM');
            lines.push('ACTION:DISPLAY');
            lines.push('DESCRIPTION:Reminder');
            lines.push(`TRIGGER;VALUE=DATE-TIME:${formatIcsDate(event.reminder_at)}`);
            lines.push('END:VALARM');
        }
        lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return `${lines.join('\r\n')}\r\n`;
}
