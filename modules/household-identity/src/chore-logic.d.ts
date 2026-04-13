export interface ChoreRunInput {
    completed_at: string;
}
export declare function getNextDueDate(rrule: string, fromDate: Date): Date | null;
export declare function isOverdue(dueAt: string, now?: Date): boolean;
export declare function calculateStreak(runs: ChoreRunInput[], recurrenceRule: string | null, now?: Date): number;
