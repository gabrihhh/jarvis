import { Chalk } from 'chalk';
import { readAllUsage, getCurrentSessionFile, readCurrentSessionUsage } from './reader.js';
import { aggregateStats, aggregateSession, formatCost } from './calculator.js';

const chalk = new Chalk({ level: 3 });

const PINK   = '#f472b6';
const BLUE   = '#60a5fa';
const CYAN   = '#22d3ee';
const DIM    = '#444444';

function bar(percent, width = 8) {
  const filled = Math.round((percent / 100) * width);
  const empty  = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export function renderLine() {
  const allEntries = readAllUsage();
  if (!allEntries.length) {
    process.stdout.write('claude: no data');
    return;
  }

  const stats = aggregateStats(allEntries);
  const sessionMeta = getCurrentSessionFile();
  const sessionId = sessionMeta?.sessionId;
  const sessionEntries = sessionId ? readCurrentSessionUsage(sessionId) : [];
  const session = aggregateSession(sessionEntries);

  const { monthly, weekly, daily } = stats;

  const weeklyPct = monthly.total > 0 ? Math.round((weekly.total / monthly.total) * 100) : 0;
  const todayPct  = monthly.total > 0 ? Math.round((daily.total  / monthly.total) * 100) : 0;

  if (!session) {
    const inner = ` CONTEXT ${'░'.repeat(8)} 0% `;
    const top    = `╭${'─'.repeat(inner.length)}╮`;
    const bottom = `╰${'─'.repeat(inner.length)}╯`;
    process.stdout.write(
      chalk.hex(CYAN).bold(top)         + '\n' +
      chalk.hex(CYAN).bold(`│${inner}│`) + '\n' +
      chalk.hex(CYAN).bold(bottom)
    );
    return;
  }

  const inner = ` CONTEXT ${bar(session.percent)} ${session.percent}% `;
  const top    = `╭${'─'.repeat(inner.length)}╮`;
  const bottom = `╰${'─'.repeat(inner.length)}╯`;

  process.stdout.write(
    chalk.hex(CYAN).bold(top)    + '\n' +
    chalk.hex(CYAN).bold(`│${inner}│`) + '\n' +
    chalk.hex(CYAN).bold(bottom)
  );
}
