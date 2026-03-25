# habit-streak

A local-first reference implementation for contributors who want a simple LifeOS module with durable graph-backed behavior and no external dependencies.

This module tracks daily habits, keeps streak counts, and celebrates milestones through voice-friendly event flows.

## Events

| Direction | Topic                               | Purpose                                                   |
| --------- | ----------------------------------- | --------------------------------------------------------- |
| Subscribe | `lifeos.voice.intent.habit.create`  | Create a new habit from a structured payload or utterance |
| Subscribe | `lifeos.voice.intent.habit.checkin` | Record a daily habit completion                           |
| Subscribe | `lifeos.voice.intent.habit.status`  | Summarize current habit streaks                           |
| Subscribe | `lifeos.tick.overdue`               | Emit a reminder when active habits are still incomplete   |
| Publish   | `lifeos.habit.checkin.recorded`     | Announce a successful check-in                            |
| Publish   | `lifeos.habit.streak.milestone`     | Announce streak milestones                                |

## Development

Run tests from the workspace root:

```bash
pnpm exec tsx --test modules/habit-streak/src/index.test.ts
```

## Contributor Note

`habit-streak` is the recommended starting point for community contributors who want a small, self-contained module with pure graph-based logic and no LLM calls.
