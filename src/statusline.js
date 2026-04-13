import { Chalk } from 'chalk';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { readAllUsage, getCurrentSessionFile, readCurrentSessionUsage } from './reader.js';
import { aggregateStats, aggregateSession } from './calculator.js';

const chalk = new Chalk({ level: 3 });

const PINK = '#f472b6';
const CYAN = '#22d3ee';
const GREEN = '#4ade80';

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

function buildBox(inner, color, width = inner.length) {
  return [
    chalk.hex(color).bold(`╭${'─'.repeat(width)}╮`),
    chalk.hex(color).bold(`│${inner}│`),
    chalk.hex(color).bold(`╰${'─'.repeat(width)}╯`),
  ];
}

function joinBoxes(...boxes) {
  return boxes[0][0] + boxes.slice(1).map(b => b[0]).join('') + '\n' +
         boxes[0][1] + boxes.slice(1).map(b => b[1]).join('') + '\n' +
         boxes[0][2] + boxes.slice(1).map(b => b[2]).join('');
}

function isMemoryLoaded(sessionId) {
  if (!sessionId) return false;
  return existsSync(join(tmpdir(), `jarvis-memory-${sessionId}.lock`));
}

export function renderLine() {
  const mode = readTriggerMode();
  const triggerInner = ` TRIGGER ${mode.toUpperCase()} `;
  const triggerBox = buildBox(triggerInner, PINK);

  const sessionMeta = getCurrentSessionFile();
  const sessionId = sessionMeta?.sessionId;
  const loaded = isMemoryLoaded(sessionId);
  const loadedBox = loaded ? buildBox(' ⬡ ', GREEN, 4) : null;

  const allEntries = readAllUsage();

  const boxes = (contextBox) => loadedBox
    ? joinBoxes(contextBox, triggerBox, loadedBox)
    : joinBoxes(contextBox, triggerBox);

  if (!allEntries.length) {
    const contextBox = buildBox(` CONTEXT ${'░'.repeat(8)} 0% `, CYAN);
    process.stdout.write(boxes(contextBox));
    return;
  }

  const sessionEntries = sessionId ? readCurrentSessionUsage(sessionId) : [];
  const session = aggregateSession(sessionEntries);

  if (!session) {
    const contextBox = buildBox(` CONTEXT ${'░'.repeat(8)} 0% `, CYAN);
    process.stdout.write(boxes(contextBox));
    return;
  }

  const contextBox = buildBox(` CONTEXT ${bar(session.percent)} ${session.percent}% `, CYAN);
  process.stdout.write(boxes(contextBox));
}
