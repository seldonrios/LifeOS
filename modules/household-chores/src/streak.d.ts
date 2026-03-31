export interface ChoreRunInput {
  completed_at: string;
}
export declare function calculateStreak(
  runs: ChoreRunInput[],
  recurrenceRule: string | null,
  now?: Date,
): number;
//# sourceMappingURL=streak.d.ts.map
