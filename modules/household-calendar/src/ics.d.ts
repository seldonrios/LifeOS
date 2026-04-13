export interface CalendarEventRow {
    id: string;
    calendar_id: string;
    title: string;
    start_at: string;
    end_at: string;
    status: 'confirmed' | 'tentative' | 'cancelled';
    recurrence_rule: string | null;
    reminder_at: string | null;
    attendee_user_ids_json: string;
}
export declare function generateIcs(events: CalendarEventRow[], calendarName?: string): string;
