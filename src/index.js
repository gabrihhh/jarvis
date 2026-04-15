import { readAllUsage } from './reader.js';
import { aggregateStats } from './calculator.js';
import { render, renderError, renderLoading } from './display.js';

export async function run() {
  renderLoading();

  const allEntries = readAllUsage();

  if (!allEntries.length) {
    process.stdout.write('\r' + ' '.repeat(40) + '\r');
    renderError('No Claude Code usage data found. Have you used Claude Code yet?');
    process.exit(1);
  }

  const stats = aggregateStats(allEntries);

  process.stdout.write('\r' + ' '.repeat(40) + '\r');
  console.log('\n' + render(stats) + '\n');
}
