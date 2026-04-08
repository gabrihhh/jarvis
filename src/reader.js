import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

const CLAUDE_DIR = join(homedir(), '.claude');
const PROJECTS_DIR = join(CLAUDE_DIR, 'projects');

function parseJsonlFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        try { return JSON.parse(line); }
        catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function getAllSessionFiles() {
  if (!existsSync(PROJECTS_DIR)) return [];

  const files = [];

  try {
    const projects = readdirSync(PROJECTS_DIR);
    for (const project of projects) {
      const projectPath = join(PROJECTS_DIR, project);
      if (!statSync(projectPath).isDirectory()) continue;

      const entries = readdirSync(projectPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          files.push(join(projectPath, entry.name));
        } else if (entry.isDirectory()) {
          // subagent dirs
          try {
            const subEntries = readdirSync(join(projectPath, entry.name), { withFileTypes: true });
            for (const sub of subEntries) {
              if (sub.isFile() && sub.name.endsWith('.jsonl')) {
                files.push(join(projectPath, entry.name, sub.name));
              }
            }
          } catch { /* skip */ }
        }
      }
    }
  } catch { /* skip */ }

  return files;
}

function extractUsageFromEntry(entry) {
  if (!entry || entry.type !== 'assistant') return null;

  const usage = entry.message?.usage;
  if (!usage) return null;

  return {
    timestamp: entry.timestamp ? new Date(entry.timestamp) : null,
    model: entry.message?.model || 'unknown',
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    cacheReadTokens: usage.cache_read_input_tokens || 0,
    cacheWriteTokens: usage.cache_creation_input_tokens || 0,
    sessionId: entry.sessionId || null,
    cwd: entry.cwd || null,
  };
}

export function readAllUsage() {
  const files = getAllSessionFiles();
  const entries = [];

  for (const file of files) {
    const lines = parseJsonlFile(file);
    for (const line of lines) {
      const usage = extractUsageFromEntry(line);
      if (usage && usage.timestamp) {
        entries.push(usage);
      }
    }
  }

  return entries.sort((a, b) => b.timestamp - a.timestamp);
}

export function getCurrentSessionFile() {
  const sessionsDir = join(CLAUDE_DIR, 'sessions');
  if (!existsSync(sessionsDir)) return null;

  try {
    // Try to match by parent PID chain: Claude spawns the status line command,
    // so process.ppid (or its parent) should match a session file named <pid>.json
    const pidsToCheck = new Set([process.ppid]);

    // also check grandparent in case the command runs through a shell
    try {
      const grandparent = parseInt(
        execSync(`ps -o ppid= -p ${process.ppid}`, { stdio: ['pipe','pipe','pipe'] }).toString().trim()
      );
      if (grandparent) pidsToCheck.add(grandparent);
    } catch { /* skip */ }

    for (const pid of pidsToCheck) {
      const candidate = join(sessionsDir, `${pid}.json`);
      if (existsSync(candidate)) {
        try { return JSON.parse(readFileSync(candidate, 'utf-8')); }
        catch { /* skip */ }
      }
    }

    // Fallback: find a session whose sessionId appears in JSONL files
    const sessionFiles = readdirSync(sessionsDir)
      .map(f => {
        try { return JSON.parse(readFileSync(join(sessionsDir, f), 'utf-8')); }
        catch { return null; }
      })
      .filter(Boolean);

    if (!sessionFiles.length) return null;

    const allFiles = getAllSessionFiles();
    const sessionIdSet = new Set();
    for (const file of allFiles) {
      try {
        const lines = readFileSync(file, 'utf-8').split('\n').filter(l => l.trim());
        for (const line of lines.slice(-5)) {
          try { const obj = JSON.parse(line); if (obj.sessionId) sessionIdSet.add(obj.sessionId); }
          catch { /* skip */ }
        }
      } catch { /* skip */ }
    }

    return sessionFiles.find(s => sessionIdSet.has(s.sessionId)) || sessionFiles[0];
  } catch {
    return null;
  }
}

export function readCurrentSessionUsage(sessionId) {
  if (!sessionId) return [];

  const files = getAllSessionFiles();
  const entries = [];

  for (const file of files) {
    const lines = parseJsonlFile(file);
    for (const line of lines) {
      if (line.sessionId === sessionId) {
        const usage = extractUsageFromEntry(line);
        if (usage) entries.push(usage);
      }
    }
  }

  return entries;
}
