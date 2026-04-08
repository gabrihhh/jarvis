#!/usr/bin/env node
import { run } from '../src/index.js';
import { renderLine } from '../src/statusline.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  claude-usage  —  Claude Code terminal dashboard

  Usage:
    claude-usage            Show full dashboard
    claude-usage --line     Single-line status (for Claude Code status bar)
    claude-usage --setup    Install status bar into ~/.claude/settings.json
    claude-usage --watch    Refresh every 30s
    claude-usage --help     Show this help

  Data source: ~/.claude/projects/
`);
  process.exit(0);
}

if (args.includes('--setup')) {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf-8')); } catch { /* keep empty */ }
  }
  settings.statusLine = 'claude-usage --line';
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
