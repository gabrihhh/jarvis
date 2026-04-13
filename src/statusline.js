import { Chalk } from 'chalk';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { readAllUsage, getCurrentSessionFile, readCurrentSessionUsage } from './reader.js';
import { aggregateStats, aggregateSession } from './calculator.js';

const chalk = new Chalk({ level: 3 });

const PINK = '#f472b6';
const CYAN = '#22d3ee';

function bar(percent, width = 8) {
  const filled = Math.round((percent / 100) * width);
  const empty  = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function readTriggerMode() {
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.claude-memory.json'), 'utf8'));
    return cfg.trigger || 'session';
  } catch { return 'off'; }
}

function buildBox(inner, color) {
  return [
    chalk.hex(color).bold(`╭${'─'.repeat(inner.length)}╮`),
    chalk.hex(color).bold(`│${inner}│`),
    chalk.hex(color).bold(`╰${'─'.repeat(inner.length)}╯`),
  ];
}

function joinBoxes(left, right) {
  return left[0] + right[0] + '\n' +
         left[1] + right[1] + '\n' +
         left[2] + right[2];
}

export function renderLine() {
  const mode = readTriggerMode();
  const triggerInner = ` TRIGGER ${mode.toUpperCase()} `;
  const rightBox = buildBox(triggerInner, PINK);

  const allEntries = readAllUsage();

  if (!allEntries.length) {
    const leftBox = buildBox(` CONTEXT ${'░'.repeat(8)} 0% `, CYAN);
    process.stdout.write(joinBoxes(leftBox, rightBox));
    return;
  }

  const stats = aggregateStats(allEntries);
  const sessionMeta = getCurrentSessionFile();
  const sessionId = sessionMeta?.sessionId;
  const sessionEntries = sessionId ? readCurrentSessionUsage(sessionId) : [];
  const session = aggregateSession(sessionEntries);

  if (!session) {
    const leftBox = buildBox(` CONTEXT ${'░'.repeat(8)} 0% `, CYAN);
    process.stdout.write(joinBoxes(leftBox, rightBox));
    return;
  }

  const leftBox = buildBox(` CONTEXT ${bar(session.percent)} ${session.percent}% `, CYAN);
  process.stdout.write(joinBoxes(leftBox, rightBox));
}
