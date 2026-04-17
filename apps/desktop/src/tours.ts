export const todayTourSteps = [
  {
    targetId: 'today-greeting',
    text: 'This is Today. Your next actions, reminders, and triage signals in one calm place.',
  },
  {
    targetId: 'today-capture',
    text: "Use Quick Capture anytime - press Cmd+K or click + Capture. You don't need to decide what something is first.",
  },
  {
    targetId: 'today-review-link',
    text: "When you're done for the day, head to Review to close loops and carry forward what matters.",
  },
] as const;

export const inboxTourSteps = [
  {
    targetId: 'inbox-header',
    text: 'Inbox is for decisions, not storage. Each item needs one action: task, plan, reminder, note, defer, or delete.',
  },
  {
    targetId: 'inbox-type-badge',
    text: 'LifeOS suggests a type for each item. You can accept or override it.',
  },
  {
    targetId: 'inbox-batch-bar',
    text: 'Batch triage lets you move through 5 items at a time - useful when the inbox builds up.',
  },
] as const;

export const plansTourSteps = [
  {
    targetId: 'plans-list-pane',
    text: 'Plans break larger goals into smaller next actions. Select a plan to see its steps.',
  },
  {
    targetId: 'plans-generate-btn',
    text: 'Use Generate steps to let LifeOS suggest a step-by-step breakdown for any goal.',
  },
  {
    targetId: 'plans-blocked-btn',
    text: 'Blocked? Mark a plan as blocked so it surfaces in your Review.',
  },
] as const;

export const reviewTourSteps = [
  {
    targetId: 'review-header',
    text: 'Review helps you close loops: what finished, what\'s still open, and what should matter tomorrow.',
  },
  {
    targetId: 'review-tomorrow-note',
    text: 'Write a tomorrow note to carry your intention forward - it shows up on Today tomorrow morning.',
  },
  {
    targetId: 'review-close-day',
    text: 'Close day when you\'re done. Open items can be moved to tomorrow or archived.',
  },
] as const;