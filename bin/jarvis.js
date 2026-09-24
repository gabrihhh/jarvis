#!/usr/bin/env node
import { run } from '../src/index.js';
import { renderLine } from '../src/statusline.js';
import { readTheme, writeTheme, isValidHex, DEFAULT_COLORS, VALID_NAMES, THEME_PATH } from '../src/theme.js';
import { readConfig, writeConfig } from '../src/config.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const args = process.argv.slice(2);

if (args.length === 0) {
  const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8'));
  console.log(`\n  jarvis v${pkg.version}\n`);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  jarvis  —  Claude Code terminal dashboard + status bar

  Usage:
    jarvis                       Show version
    jarvis --usage               Show full usage dashboard
    jarvis --watch               Refresh dashboard every 30s
    jarvis --setup               Install status bar and slash commands
    jarvis --line                Single-line status (for Claude Code status bar)
    jarvis --theme               Show current statusline theme
    jarvis --theme <name>:<hex>  Set a box color (context, tokens)
    jarvis --theme <name>:reset  Reset a single box to default color
    jarvis --theme reset         Reset all colors to default
    jarvis --token               Show current token display mode
    jarvis --token on            Show total tokens box (◈)
    jarvis --token complete      Show token box + INPUT/HISTORY/CACHE/RESPONSE breakdown
    jarvis --token off           Disable token display
    jarvis --kanban              Open the multi-project dev-flow kanban (localhost, one tab per folder)
    jarvis --kanban-setup        Provision the kanban (node-pty runtime + status hooks)
    jarvis --attach <plan-N>     Attach the terminal to a card's session
    jarvis --help                Show this help

  Slash commands: --setup instala no ~/.claude/commands/ todo .md
  presente na pasta slash/ deste pacote.

  Data source: ~/.claude/projects/
`);
  process.exit(0);
}

if (args.includes('--setup')) {
  const __dir = dirname(fileURLToPath(import.meta.url));

  // Status bar
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch { /* keep empty */ }
  }
  settings.statusLine = { type: 'command', command: 'jarvis --line' };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log('  ✓ Status bar configured');

  // Slash commands → ~/.claude/commands/<name>.md — copia todo .md em slash/
  const commandsDir = join(homedir(), '.claude', 'commands');
  const srcSlash = join(__dir, '../slash');
  const slashFiles = existsSync(srcSlash)
    ? readdirSync(srcSlash).filter(f => f.endsWith('.md'))
    : [];
  if (slashFiles.length) {
    mkdirSync(commandsDir, { recursive: true });
    for (const file of slashFiles) {
      copyFileSync(join(srcSlash, file), join(commandsDir, file));
      const name = file.replace('.md', '');
      console.log(`  ✓ Slash command /${name} installed`);
    }
  } else {
    console.log('  · No slash commands to install');
  }

  console.log('\n  Restart Claude Code to activate.');
  console.log('  Para o kanban, rode também: jarvis --kanban-setup\n');
} else if (args.includes('--theme')) {
  const { Chalk } = await import('chalk');
  const chalk = new Chalk({ level: 3 });
  const value = args[args.indexOf('--theme') + 1];

  // jarvis --theme  →  mostra tema atual
  if (!value || value.startsWith('--')) {
    const theme = readTheme();
    console.log('\n  Current theme:\n');
    for (const name of VALID_NAMES) {
      const hex = theme[name];
      const isDefault = hex === DEFAULT_COLORS[name];
      const tag = isDefault ? chalk.dim('  (default)') : '';
      console.log(`    ${chalk.bold(name.padEnd(8))}  ${chalk.hex(hex).bold('██')}  ${hex}${tag}`);
    }
    console.log(`\n  Config: ${THEME_PATH}\n`);
    process.exit(0);
  }

  // jarvis --theme reset  →  reseta tudo
  if (value === 'reset') {
    writeTheme({ ...DEFAULT_COLORS });
    console.log('\n  ✓ Theme reset to defaults\n');
    process.exit(0);
  }

  // jarvis --theme name:value
  const sep = value.indexOf(':');
  if (sep === -1) {
    console.error(`\n  ✗ Invalid format. Use: jarvis --theme <${VALID_NAMES.join('|')}>:<#hexcolor|reset>\n`);
    process.exit(1);
  }

  const name = value.slice(0, sep);
  const color = value.slice(sep + 1);

  if (!VALID_NAMES.includes(name)) {
    console.error(`\n  ✗ Unknown name "${name}". Valid names: ${VALID_NAMES.join(', ')}\n`);
    process.exit(1);
  }

  const theme = readTheme();

  if (color === 'reset') {
    theme[name] = DEFAULT_COLORS[name];
    writeTheme(theme);
    console.log(`\n  ✓ ${name} reset to default (${DEFAULT_COLORS[name]})\n`);
    process.exit(0);
  }

  if (!isValidHex(color)) {
    console.error(`\n  ✗ Invalid hex color "${color}". Use format: #rgb or #rrggbb\n`);
    process.exit(1);
  }

  theme[name] = color;
  writeTheme(theme);
  console.log(`\n  ✓ ${name} set to ${chalk.hex(color).bold(color)}\n`);
  process.exit(0);
} else if (args.includes('--token')) {
  const value = args[args.indexOf('--token') + 1];
  const validValues = ['on', 'off', 'complete'];

  if (!value || !validValues.includes(value)) {
    const cfg = readConfig();
    const current = cfg.tokenDisplay || 'off';
    console.log(`\n  Token display: ${current}\n`);
    console.log(`  Usage: jarvis --token <on|complete|off>\n`);
    process.exit(0);
  }

  const cfg = readConfig();
  cfg.tokenDisplay = value === 'on' ? 'simple' : value;
  writeConfig(cfg);

  const labels = { simple: 'on (◈ total tokens)', off: 'off', complete: 'complete (breakdown)' };
  console.log(`\n  ✓ Token display set to: ${labels[cfg.tokenDisplay]}\n`);
  process.exit(0);
} else if (args.includes('--kanban-setup')) {
  const { setupKanban } = await import('../src/kanban/setup.js');
  setupKanban();
} else if (args.includes('--kanban')) {
  // Gate: valida se o kanban foi configurado (node-pty + hooks). Se não, orienta.
  const { kanbanConfigured } = await import('../src/kanban/setup.js');
  const cfg = kanbanConfigured();
  if (!cfg.ok) {
    console.error(`\n  ⚠ O kanban ainda não está configurado (faltando: ${cfg.missing.join(', ')}).`);
    console.error('  Para usar, rode antes:  jarvis --kanban-setup\n');
    process.exit(1);
  }
  const { startKanban } = await import('../src/kanban/server.js');
  await startKanban({ cwd: process.cwd() });
  // server fica vivo; não chamar process.exit
} else if (args.includes('--attach')) {
  const card = args[args.indexOf('--attach') + 1];
  const { attach } = await import('../src/kanban/attach.js');
  attach(card, { cwd: process.cwd() });
  // cliente fica vivo até detach/encerrar
} else if (args.includes('--hook')) {
  // Chamado pelo Claude Code (Notification/Stop). Reporta o status do card ao
  // server do kanban. Silencioso e rápido — nunca deve travar a sessão.
  const event = args[args.indexOf('--hook') + 1];
  const { reportHook } = await import('../src/kanban/hooks.js');
  await reportHook(event);
  process.exit(0);
} else if (args.includes('--line') || args.includes('-l')) {
  renderLine();
} else if (args.includes('--watch') || args.includes('-w')) {
  async function loop() {
    console.clear();
    await run();
    console.log('  Auto-refresh in 30s  ·  Ctrl+C to exit\n');
  }
  await loop();
  setInterval(loop, 30_000);
} else if (args.includes('--usage')) {
  await run();
}
