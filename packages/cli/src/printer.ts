import boxen from 'boxen';
import chalk from 'chalk';
import Table from 'cli-table3';

import type { LifeGraphReviewInsights, LifeGraphSummary } from '@lifeos/life-graph';

export function printGraphSummary(summary: LifeGraphSummary): string {
  const lines: string[] = [];
  lines.push(
    boxen(chalk.bold.blue('LifeOS Status'), {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'blue',
    }),
  );
  lines.push(chalk.dim('Welcome back. Here is your current focus snapshot.'));

  const table = new Table({
    head: [
      chalk.cyan('Goal'),
      chalk.yellow('Tasks'),
      chalk.green('Done'),
      chalk.magenta('Focus'),
      chalk.gray('Deadline'),
    ],
    colWidths: [40, 8, 8, 10, 20],
    wordWrap: true,
  });

  if (summary.activeGoals.length === 0) {
    table.push(['No active goals yet', '0', '0', '-', '-']);
  } else {
    for (const goal of summary.activeGoals) {
      table.push([
        goal.title,
        String(goal.totalTasks),
        chalk.green(String(goal.completedTasks)),
        String(goal.priority),
        goal.deadline ? chalk.gray(goal.deadline) : '-',
      ]);
    }
  }

  lines.push(table.toString());
  lines.push(
    chalk.dim(
      `Updated: ${summary.updatedAt} | ${summary.totalGoals} total goals | ${summary.activeGoals.length} active`,
    ),
  );
  if (summary.activeGoals.length === 0) {
    lines.push(chalk.cyan('Tip: create your first plan with `lifeos goal "Plan my week"`.'));
  }
  return lines.join('\n');
}

export function printReviewInsights(insights: LifeGraphReviewInsights): string {
  const lines: string[] = [];
  lines.push(
    boxen(chalk.bold.green(`${insights.period.toUpperCase()} Review Insights`), {
      padding: 1,
      borderStyle: 'round',
      borderColor: 'green',
    }),
  );
  lines.push(chalk.bold('Key Wins:'));

  if (insights.wins.length === 0) {
    lines.push(chalk.gray('- none yet, but momentum can start with one small win today'));
  } else {
    for (const win of insights.wins) {
      lines.push(chalk.green(`- ${win}`));
    }
  }

  lines.push('');
  lines.push(chalk.bold('Next Actions:'));
  if (insights.nextActions.length === 0) {
    lines.push(chalk.gray('- none yet, try `lifeos next` after adding a goal'));
  } else {
    for (const action of insights.nextActions) {
      lines.push(chalk.yellow(`- ${action}`));
    }
  }
  lines.push(chalk.dim(`Generated: ${insights.generatedAt} (${insights.source})`));
  return lines.join('\n');
}
