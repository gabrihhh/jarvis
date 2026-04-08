import { readAllUsage, getCurrentSessionFile, readCurrentSessionUsage } from './reader.js';
import { aggregateStats, aggregateSession } from './calculator.js';
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

  // current session
  const sessionMeta = getCurrentSessionFile();
  const sessionId   = sessionMeta?.sessionId;
  const sessionEntries = sessionId ? readCurrentSessionUsage(sessionId) : [];
  const session = aggregateSession(sessionEntries);

  process.stdout.write('\r' + ' '.repeat(40) + '\r');
  console.log('\n' + render(stats, session) + '\n');
}
