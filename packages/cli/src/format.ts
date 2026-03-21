import type { GoalInterpretationPlan } from '@lifeos/goal-engine';

function pad(value: string, width: number): string {
  if (value.length >= width) {
    return value;
  }
  return `${value}${' '.repeat(width - value.length)}`;
}

function createTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) => {
    const rowWidths = rows.map((row) => row[index]?.length ?? 0);
    return Math.max(header.length, ...rowWidths);
  });

  const divider = `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
  const renderRow = (cells: string[]): string =>
    `| ${cells.map((cell, index) => pad(cell, widths[index] ?? 0)).join(' | ')} |`;

  const lines = [divider, renderRow(headers), divider, ...rows.map(renderRow), divider];
  return lines.join('\n');
}

export function formatGoalPlan(plan: GoalInterpretationPlan): string {
  const lines: string[] = [];
  lines.push(`Title: ${plan.title}`);
  lines.push(`Priority: ${plan.priority}`);
  lines.push(`Deadline: ${plan.deadline ?? 'none'}`);
  lines.push(`Related Areas: ${plan.relatedAreas.join(', ') || 'none'}`);
  lines.push('');
  lines.push('Description:');
  lines.push(plan.description);
  lines.push('');
  lines.push(`Needed Resources: ${plan.neededResources.join(', ') || 'none'}`);
  lines.push('');

  if (plan.subtasks.length === 0) {
    lines.push('Subtasks: none');
    return lines.join('\n');
  }

  lines.push('Subtasks:');
  const table = createTable(
    ['#', 'Description', 'Depends On', 'Est Hours'],
    plan.subtasks.map((subtask, index) => [
      String(index + 1),
      subtask.description,
      subtask.dependsOn.join(', ') || '-',
      String(subtask.estimatedHours),
    ]),
  );
  lines.push(table);
  return lines.join('\n');
}
