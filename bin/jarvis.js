#!/usr/bin/env node
import { run } from '../src/index.js';
import { renderLine } from '../src/statusline.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const MEMORY_CONFIG_PATH = join(homedir(), '.claude-memory.json');

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
    jarvis --help                Show this help

  Slash commands (inside Claude Code):
    /setup-memory                Setup Docker + Neo4j + register MCP server
    /memory-index                Index a repository into the memory graph

  Data source: ~/.claude/projects/
`);
  process.exit(0);
}

if (args.includes('--graph')) {
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
  for (const skill of ['setup-memory', 'memory-index']) {
    const destDir = join(skillsDir, skill);
    mkdirSync(destDir, { recursive: true });
    copyFileSync(join(srcSkills, skill, 'SKILL.md'), join(destDir, 'SKILL.md'));
    console.log(`  ✓ Slash command /${skill} installed`);
  }

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
