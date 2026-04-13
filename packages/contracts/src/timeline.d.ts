/**
 * Timeline-related types for the LifeOS mobile SDK.
 */
export type TimelineTaskStatus = 'todo' | 'in-progress' | 'done';
export type TimelineEventStatus = 'confirmed' | 'tentative' | 'cancelled';
export interface TimelineEntry {
    id: string;
    title: string;
    goalId?: string;
    type: 'task' | 'event';
    status: TimelineTaskStatus | TimelineEventStatus;
    start?: string;
    end?: string;
    dueDate?: string;
    description?: string;
    priority?: number;
}
export interface GoalSummary {
    id: string;
    title: string;
    totalTasks: number;
    completedTasks: number;
    priority: number;
    deadline: string | null;
}
