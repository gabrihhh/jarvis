#!/usr/bin/env node
import { run } from '../src/index.js';
import { renderLine } from '../src/statusline.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

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
    jarvis                 Show version
    jarvis --usage         Show full usage dashboard
    jarvis --watch         Refresh dashboard every 30s
    jarvis --setup         Install status bar into ~/.claude/settings.json
    jarvis --graph         Open Neo4j browser at http://localhost:7474
    jarvis --line          Single-line status (for Claude Code status bar)
    jarvis --help          Show this help

  Slash commands (inside Claude Code):
    /setup-memory          Setup Docker + Neo4j + register MCP server
    /memory-index          Index a repository into the memory graph

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

  // Slash commands → ~/.claude/commands/
  const commandsDir = join(homedir(), '.claude', 'commands');
  mkdirSync(commandsDir, { recursive: true });
  const srcCommands = join(__dir, '../.claude/commands');
  for (const file of ['setup-memory.md', 'memory-index.md']) {
    copyFileSync(join(srcCommands, file), join(commandsDir, file));
    console.log(`  ✓ Slash command /${file.replace('.md', '')} installed`);
  }

  console.log('\n  Restart Claude Code to activate.\n');
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
