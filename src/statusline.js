import { Chalk } from 'chalk';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { readAllUsage, getCurrentSessionFile, readCurrentSessionUsage } from './reader.js';
import { aggregateStats, aggregateSession } from './calculator.js';
import { readTheme } from './theme.js';

const chalk = new Chalk({ level: 3 });

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

const MEMORY_LOCK_STALE_MS = 5 * 60 * 1000; // 5 min — ignora locks de sessões mortas

function isMemoryLoaded(sessionId) {
  if (!sessionId) return false;
  const lockPath = join(tmpdir(), `jarvis-memory-${sessionId}.lock`);
  if (!existsSync(lockPath)) return false;
  try {
    const ts = new Date(readFileSync(lockPath, 'utf8').trim()).getTime();
    if (Date.now() - ts > MEMORY_LOCK_STALE_MS) {
      try { unlinkSync(lockPath); } catch { /* ignore */ }
      return false;
    }
    unlinkSync(lockPath); // consome o lock: ícone aparece só uma vez
    return true;
  } catch { return false; }
}

export function renderLine() {
  const mode = readTriggerMode();
  const theme = readTheme();

  const sessionMeta = getCurrentSessionFile();
  const sessionId = sessionMeta?.sessionId;
  const loaded = isMemoryLoaded(sessionId);
  const loadedBox = loaded ? buildBox(' ⬡  ', theme.memory, 4) : null;

  const allEntries = readAllUsage();

  const boxes = (contextBox) => {
    const toJoin = [contextBox];
    if (mode !== 'off') toJoin.push(buildBox(` TRIGGER ${mode.toUpperCase()} `, theme.trigger));
    if (loadedBox) toJoin.push(loadedBox);
    return joinBoxes(...toJoin);
  };

  if (!allEntries.length) {
    const contextBox = buildBox(` CONTEXT ${'░'.repeat(8)} 0% `, theme.context);
    process.stdout.write(boxes(contextBox));
    return;
  }

  const sessionEntries = sessionId ? readCurrentSessionUsage(sessionId) : [];
  const session = aggregateSession(sessionEntries);

  if (!session) {
    const contextBox = buildBox(` CONTEXT ${'░'.repeat(8)} 0% `, theme.context);
    process.stdout.write(boxes(contextBox));
    return;
  }

  const contextBox = buildBox(` CONTEXT ${bar(session.percent)} ${session.percent}% `, theme.context);
  process.stdout.write(boxes(contextBox));
}
