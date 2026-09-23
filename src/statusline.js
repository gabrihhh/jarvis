import { readFileSync } from 'fs';
import { Chalk } from 'chalk';
import { readAllUsage, getCurrentSessionFile, readCurrentSessionUsage } from './reader.js';
import { aggregateStats, aggregateSession, getLastTurnTokens, formatTokens } from './calculator.js';
import { readTheme } from './theme.js';
import { readConfig } from './config.js';

const chalk = new Chalk({ level: 3 });

function bar(percent, width = 8) {
  const filled = Math.round((percent / 100) * width);
  const empty  = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function readTokenMode() {
  return readConfig().tokenDisplay || 'off';
}

/**
 * Claude Code pipes a JSON payload to the statusline command on stdin,
 * including the real per-session model (`model.id`, e.g.
 * "claude-opus-4-8[1m]"). Reading it is the reliable way to know whether the
 * current session is using the extended 1M window vs a smaller one.
 *
 * Guarded so a manual `jarvis --line` in a TTY never blocks waiting on stdin.
 */
function readStdinPayload() {
  try {
    if (process.stdin.isTTY) return null;
    const raw = readFileSync(0, 'utf8');
    if (!raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
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

export function renderLine() {
  const tokenMode = readTokenMode();
  const theme = readTheme();

  const payload = readStdinPayload();
  const sessionModel = payload?.model?.id || null;

  const sessionMeta = getCurrentSessionFile();
  const sessionId = sessionMeta?.sessionId || payload?.session_id;

  const allEntries = readAllUsage();

  const buildOutput = (contextBox, turnTokens) => {
    const toJoin = [contextBox];
    if (turnTokens) toJoin.push(buildBox(` ◈ ${formatTokens(turnTokens.total)} `, theme.tokens));

    let out = joinBoxes(...toJoin);

    if (tokenMode === 'complete' && turnTokens) {
      const col = (s) => chalk.hex(theme.tokens).bold(s);
      const parts = [
        `INPUT ${formatTokens(turnTokens.input)}`,
        `HISTORY ${formatTokens(turnTokens.history)}`,
        `CACHE ${formatTokens(turnTokens.cache)}`,
        `RESPONSE ${formatTokens(turnTokens.response)}`,
      ];
      out += '\n' + parts.map(col).join(col(' │ '));
    }

    return out;
  };

  if (!allEntries.length) {
    const contextBox = buildBox(` CONTEXT ${'░'.repeat(8)} 0% `, theme.context);
    process.stdout.write(buildOutput(contextBox, null));
    return;
  }

  const sessionEntries = sessionId ? readCurrentSessionUsage(sessionId) : [];
  const session = aggregateSession(sessionEntries, sessionModel);
  const turnTokens = tokenMode !== 'off' ? getLastTurnTokens(sessionEntries) : null;

  if (!session) {
    const contextBox = buildBox(` CONTEXT ${'░'.repeat(8)} 0% `, theme.context);
    process.stdout.write(buildOutput(contextBox, turnTokens));
    return;
  }

  const contextBox = buildBox(` CONTEXT ${bar(session.percent)} ${session.percent}% `, theme.context);
  process.stdout.write(buildOutput(contextBox, turnTokens));
}
