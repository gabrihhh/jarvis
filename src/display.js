import chalk from 'chalk';
import { formatTokens, formatCost } from './calculator.js';

const W      = 62;
const PURPLE = '#7c3aed';
const WHITE  = '#ffffff';
const DIM    = '#555555';

// ─── Box drawing ────────────────────────────────────────────
const TOP = chalk.hex(PURPLE)(`╭${'─'.repeat(W)}╮`);
const BOT = chalk.hex(PURPLE)(`╰${'─'.repeat(W)}╯`);
const DIV = chalk.hex(PURPLE)(`├${'─'.repeat(W)}┤`);

function stripAnsi(str) {
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

function pad(text, width) {
  return text + ' '.repeat(Math.max(0, width - stripAnsi(text).length));
}

const row = (text) => {
  const len = stripAnsi(text).length;
  const pipe = chalk.hex(PURPLE)('│');
  return `${pipe} ${text}${' '.repeat(Math.max(0, W - 1 - len))}${pipe}`;
};

// ─── Progress bar ────────────────────────────────────────────
function bar(percent, width = 16) {
  const filled = Math.round((percent / 100) * width);
  const empty  = width - filled;
  const color  = percent >= 85 ? chalk.red : percent >= 60 ? chalk.yellow : chalk.hex('#00e5ff');
  return color('█'.repeat(filled)) + chalk.hex('#2a2a2a')('░'.repeat(empty));
}

// ─── Title ───────────────────────────────────────────────────
function title() {
  const t = ' ◈  Claude Code  ·  Usage Dashboard';
  return chalk.bold.hex(WHITE)(t) + ' '.repeat(W - 1 - t.length);
}

function subtitle() {
  const now = new Date();
  const s = now.toLocaleString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  const t = `  ${s}`;
  return chalk.hex(DIM)(t) + ' '.repeat(Math.max(0, W - 1 - t.length));
}

// ─── Token row ───────────────────────────────────────────────
function tokenRow(label, stats, maxTokens) {
  const pct  = maxTokens > 0 ? Math.min(100, Math.round((stats.total / maxTokens) * 100)) : 0;
  const b    = bar(pct, 16);
  const tok  = pad(chalk.hex(WHITE)(formatTokens(stats.total)), 8);
  const cost = pad(chalk.hex('#a78bfa')(formatCost(stats.cost)), 9);
  const cnt  = chalk.hex(DIM)(pad(`${stats.count} req`, 9));
  const text = `  ${label}  ${b}  ${tok}  ${cost}  ${cnt}`;
  return row(text);
}

// ─── Context window row ──────────────────────────────────────
function contextRow(session) {
  if (!session) {
    return row(`  ${chalk.hex(DIM)('No active session detected')}`);
  }
  const { contextUsed, contextWindow, percent, model, turns } = session;
  const b    = bar(percent, 24);
  const pct  = chalk.bold.hex(WHITE)(`${percent}%`);
  const info = chalk.hex(WHITE)(`${formatTokens(contextUsed)} / ${formatTokens(contextWindow)}`);
  const meta = chalk.hex(DIM)(`${turns} turn${turns !== 1 ? 's' : ''}  ·  model: ${model.replace('claude-', '')}`);
  return [
    row(`  ${b}  ${pct}  ${info}`),
    row(`  ${meta}`),
  ].join('\n');
}

// ─── Section header ──────────────────────────────────────────
function sectionHeader(icon, label) {
  return row(`  ${chalk.hex(WHITE)(icon)}  ${chalk.bold.hex(WHITE)(label)}`);
}

// ─── Full render ─────────────────────────────────────────────
export function render(stats, session) {
  const { monthly, weekly, daily } = stats;
  const maxTokens = monthly.total || 1;

  const colHeader =
    `  ${chalk.hex(WHITE)(pad('Period', 10))}` +
    `${chalk.hex(WHITE)(pad('Activity', 18))}` +
    `${chalk.hex(WHITE)(pad('Tokens', 10))}` +
    `${chalk.hex(WHITE)(pad('Cost', 11))}` +
    `${chalk.hex(WHITE)('Requests')}`;

  const lines = [
    TOP,
    row(title()),
    row(subtitle()),
    DIV,
    row(''),
    sectionHeader('◷', 'Token Usage'),
    row(''),
    row(colHeader),
    tokenRow(chalk.hex('#c084fc').bold(pad('Monthly', 8)), monthly, maxTokens),
    tokenRow(chalk.hex('#60a5fa').bold(pad('Weekly ', 8)), weekly,  maxTokens),
    tokenRow(chalk.hex('#34d399').bold(pad('Today  ', 8)), daily,   maxTokens),
    row(''),
    DIV,
    row(''),
    sectionHeader('⬡', 'Context Window  (current session)'),
    row(''),
    contextRow(session),
    row(''),
    DIV,
    row(''),
    breakdown(monthly),
    row(''),
    BOT,
  ];

  return lines.join('\n');
}

function breakdown(monthly) {
  const items = [
    { label: 'Input',       val: formatTokens(monthly.inputTokens),      color: '#7dd3fc' },
    { label: 'Output',      val: formatTokens(monthly.outputTokens),     color: '#86efac' },
    { label: 'Cache read',  val: formatTokens(monthly.cacheReadTokens),  color: '#fde68a' },
    { label: 'Cache write', val: formatTokens(monthly.cacheWriteTokens), color: '#f9a8d4' },
  ];

  const cols = items.map(i =>
    `${chalk.hex(WHITE)(i.label + ':')} ${chalk.hex(i.color).bold(i.val)}`
  );

  return [
    row(`  ${chalk.bold.hex(WHITE)('Monthly breakdown')}`),
    row(`  ${cols[0]}   ${cols[1]}`),
    row(`  ${cols[2]}   ${cols[3]}`),
  ].join('\n');
}

export function renderError(msg) {
  console.error(chalk.red(`\n  Error: ${msg}\n`));
}

export function renderLoading() {
  process.stdout.write(chalk.hex(DIM)('  Loading usage data...'));
}
