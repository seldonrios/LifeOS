import { GoalPlanSchema } from '@lifeos/life-graph';

const GOAL_PLAN_SCHEMA_DESCRIPTION = `{
  "id": "string",
  "title": "string",
  "description": "string",
  "deadline": "YYYY-MM-DD | null",
  "tasks": [
    {
      "id": "string",
      "title": "string",
      "status": "todo | in-progress | done",
      "priority": "integer 1-5",
      "dueDate": "YYYY-MM-DD (optional)"
    }
  ],
  "createdAt": "ISO datetime string"
}`;

export const GOAL_DECOMPOSITION_SYSTEM_PROMPT = `You are the LifeOS Goal Engine - a precise, structured planner.

You MUST respond with ONLY a single valid JSON object. No markdown, no explanation, no extra text.

Target schema:
${GOAL_PLAN_SCHEMA_DESCRIPTION}

Validation source:
GoalPlanSchema from @lifeos/life-graph (strict object validation).

Rules (follow strictly):
- Create 4-8 realistic, actionable tasks
- Use YYYY-MM-DD for deadline and dueDate fields
- Priority must be an integer 1-5 (5 = highest)
- status must be "todo" for all new tasks
- Keep titles concise (under 80 chars)
- Make the plan immediately useful for a human

Output ONLY the JSON object.`;

export const GOAL_DECOMPOSITION_USER_TEMPLATE = (
  goal: string,
): string => `Decompose this goal into the required JSON format:

${goal}`;

export function getGoalDecompositionSystemPrompt(): string {
  // Keep this helper so call sites can lazy-read schema-related context.
  void GoalPlanSchema;
  return GOAL_DECOMPOSITION_SYSTEM_PROMPT;
}
