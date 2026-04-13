#!/usr/bin/env node
import { run } from '../src/index.js';
import { renderLine } from '../src/statusline.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { exec } from 'child_process';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  jarvis-usage  —  Claude Code terminal dashboard + semantic memory graph

  Usage:
    jarvis-usage               Show full usage dashboard
    jarvis-usage --line        Single-line status (for Claude Code status bar)
    jarvis-usage --setup       Install status bar into ~/.claude/settings.json
    jarvis-usage --watch       Refresh dashboard every 30s
    jarvis-usage graph         Open Neo4j browser at http://localhost:7474
    jarvis-usage --help        Show this help

  Slash commands (inside Claude Code):
    /setup-memory        Setup Docker + Neo4j + register MCP server
    /memory-index        Index a repository into the memory graph

  Data source: ~/.claude/projects/
`);
  process.exit(0);
}

if (args[0] === 'graph') {
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
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch { /* keep empty */ }
  }
  settings.statusLine = { type: 'command', command: 'jarvis-usage --line' };
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  console.log('  Status bar configured. Restart Claude to activate.\n');
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
} else {
  await run();
}
