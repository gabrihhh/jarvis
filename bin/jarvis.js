#!/usr/bin/env node
import { run } from '../src/index.js';
import { renderLine } from '../src/statusline.js';
import { readTheme, writeTheme, isValidHex, DEFAULT_COLORS, VALID_NAMES, THEME_PATH } from '../src/theme.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { exec, execSync } from 'child_process';
import { fileURLToPath } from 'url';

const MEMORY_CONFIG_PATH = join(homedir(), '.claude-memory.json');

function checkSetupDone() {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  if (!existsSync(settingsPath)) return false;
  try {
    const s = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    return !!(s?.statusLine);
  } catch { return false; }
}

function checkMcpRegistered() {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  if (!existsSync(settingsPath)) return false;
  try {
    const s = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    return !!(s?.mcpServers?.['jarvis-memory']);
  } catch { return false; }
}

function checkNeo4jRunning() {
  try {
    const out = execSync('docker ps --filter name=claude-memory --filter status=running --format "{{.Names}}"', { stdio: 'pipe' }).toString().trim();
    return out.includes('claude-memory');
  } catch { return false; }
}

function loadMemoryConfig() {
  try { return JSON.parse(readFileSync(MEMORY_CONFIG_PATH, 'utf-8')); }
  catch { return { neo4j: { uri: 'bolt://localhost:7687', user: 'neo4j', password: 'claudememory' } }; }
}

function saveMemoryConfig(cfg) {
  writeFileSync(MEMORY_CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function setHook(settings, enabled) {
  if (!settings.hooks) settings.hooks = {};
  if (enabled) {
    settings.hooks.UserPromptSubmit = [{ matcher: '', hooks: [{ type: 'command', command: 'jarvis --query' }] }];
  } else {
    delete settings.hooks.UserPromptSubmit;
    if (!Object.keys(settings.hooks).length) delete settings.hooks;
  }
}

const args = process.argv.slice(2);

if (args.length === 0) {
  const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf-8'));
  console.log(`\n  jarvis v${pkg.version}\n`);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  jarvis  —  Claude Code terminal dashboard + semantic memory graph

  Usage:
    jarvis                       Show version
    jarvis --usage               Show full usage dashboard
    jarvis --watch               Refresh dashboard every 30s
    jarvis --setup               Install status bar, skills and default trigger (session)
    jarvis --graph               Open Neo4j browser at http://localhost:7474
    jarvis --line                Single-line status (for Claude Code status bar)
    jarvis --trigger             Show current trigger mode
    jarvis --trigger session     Hook runs once per session (default)
    jarvis --trigger prompt      Hook runs on every prompt
    jarvis --trigger off         Disable automatic memory loading
    jarvis --theme               Show current statusline theme
    jarvis --theme <name>:<hex>  Set a box color (context, trigger, memory)
    jarvis --theme <name>:reset  Reset a single box to default color
    jarvis --theme reset         Reset all colors to default
    jarvis --help                Show this help

  Slash commands (inside Claude Code):
    /setup-memory                Setup Docker + Neo4j + register MCP server
    /create-memory               Index a repository into the memory graph (first time)
    /update-memory               Update an existing memory graph with recent changes
    /configure-memory            Customize the memory graph architecture (schema, rules, flows)

  Data source: ~/.claude/projects/
`);
  process.exit(0);
}

if (args.includes('--graph')) {
  if (!checkNeo4jRunning()) {
    console.error('\n  ✗ Neo4j não está rodando.');
    console.error('  Execute /setup-memory dentro do Claude Code para iniciar o container.\n');
    process.exit(1);
  }
  const url = 'http://localhost:7474';
  const opener =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32'  ? 'start' :
    'xdg-open';
  console.log(`  Opening Neo4j Browser at ${url} ...\n`);
  exec(`${opener} ${url}`, (err) => {
    if (err) console.error(`  Could not open browser automatically. Visit ${url} manually.\n`);
  });
} else if (args.includes('--setup')) {
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

  // Slash commands → ~/.claude/skills/<name>/SKILL.md
  const skillsDir = join(homedir(), '.claude', 'skills');
  const srcSkills = join(__dir, '../.claude/skills');
  for (const skill of ['setup-memory', 'create-memory', 'update-memory', 'configure-memory']) {
    const destDir = join(skillsDir, skill);
    mkdirSync(destDir, { recursive: true });
    copyFileSync(join(srcSkills, skill, 'SKILL.md'), join(destDir, 'SKILL.md'));
    console.log(`  ✓ Slash command /${skill} installed`);
  }

  // Arquitetura de memória (referenciada pelas skills)
  copyFileSync(join(srcSkills, 'MEMORY_ARCHITECTURE.md'), join(skillsDir, 'MEMORY_ARCHITECTURE.md'));
  console.log('  ✓ MEMORY_ARCHITECTURE.md installed');

  // Trigger padrão: session
  const memoryCfg = loadMemoryConfig();
  if (!memoryCfg.trigger) {
    memoryCfg.trigger = 'session';
    saveMemoryConfig(memoryCfg);
    setHook(settings, true);
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('  ✓ Memory trigger set to: session');
  }

  console.log('\n  Restart Claude Code to activate.\n');
} else if (args.includes('--trigger')) {
  const mode = args[args.indexOf('--trigger') + 1];
  const validModes = ['session', 'prompt', 'off'];

  if (!mode || !validModes.includes(mode)) {
    const cfg = loadMemoryConfig();
    const current = cfg.trigger || 'session';
    console.log(`\n  Trigger mode: ${current}\n`);
    console.log(`  Usage: jarvis --trigger <session|prompt|off>\n`);
    process.exit(0);
  }

  if (mode !== 'off') {
    if (!checkSetupDone()) {
      console.error('\n  ✗ jarvis --setup não foi executado.');
      console.error('  Execute primeiro: jarvis --setup\n');
      process.exit(1);
    }
    if (!checkMcpRegistered()) {
      console.error('\n  ✗ MCP server jarvis-memory não está registrado.');
      console.error('  Execute /setup-memory dentro do Claude Code e reinicie antes de ativar o trigger.\n');
      process.exit(1);
    }
    if (!checkNeo4jRunning()) {
      console.error('\n  ✗ Neo4j não está rodando.');
      console.error('  Execute /setup-memory dentro do Claude Code para iniciar o container.\n');
      process.exit(1);
    }
  }

  const cfg = loadMemoryConfig();
  cfg.trigger = mode;
  saveMemoryConfig(cfg);

  const settingsPath = join(homedir(), '.claude', 'settings.json');
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch { /* keep empty */ }
  }
  setHook(settings, mode !== 'off');
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  const icons = { session: '⬡', prompt: '⬡⬡', off: '○' };
  console.log(`\n  ${icons[mode]} Trigger mode set to: ${mode}`);
  if (mode !== 'off') console.log(`  Hook configured in ~/.claude/settings.json`);
  else console.log(`  Hook removed from ~/.claude/settings.json`);
  console.log(`\n  Restart Claude Code to activate.\n`);
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
    console.error(`\n  ✗ Invalid format. Use: jarvis --theme <context|trigger|memory>:<#hexcolor|reset>\n`);
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
} else if (args.includes('--query')) {
  try {
    const { queryByPath } = await import('../src/memory/query-by-path.js');
    const result = await queryByPath(process.cwd());
    if (result) process.stdout.write(result + '\n');
  } catch { /* silencioso — hook nunca deve quebrar a sessão */ }
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
