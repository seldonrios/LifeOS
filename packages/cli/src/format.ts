import type { GoalPlan } from '@lifeos/life-graph';

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

export function formatGoalPlan(plan: GoalPlan): string {
  const lines: string[] = [];
  lines.push(`Title: ${plan.title}`);
  lines.push(`Deadline: ${plan.deadline ?? 'none'}`);
  lines.push(`Tasks: ${plan.tasks.length}`);
  lines.push('');
  lines.push('Description:');
  lines.push(plan.description);
  lines.push('');

  if (plan.tasks.length === 0) {
    lines.push('Tasks: none');
    return lines.join('\n');
  }

  lines.push('Tasks:');
  const table = createTable(
    ['#', 'Title', 'Status', 'Priority', 'Due Date'],
    plan.tasks.map((task, index) => [
      String(index + 1),
      task.title,
      task.status,
      String(task.priority),
      task.dueDate ?? '-',
    ]),
  );
  lines.push(table);
  return lines.join('\n');
}
