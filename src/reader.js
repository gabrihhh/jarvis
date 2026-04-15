import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';

function getParentPid(pid) {
  // Linux — leitura direta do /proc, sem subprocess
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const match = stat.match(/^\d+ \(.*?\) \S+ (\d+)/);
    if (match) return parseInt(match[1]);
  } catch { /* não é Linux ou /proc indisponível */ }

  // macOS / Linux fallback
  if (process.platform !== 'win32') {
    try {
      const out = execSync(`ps -o ppid= -p ${pid}`, { stdio: 'pipe' }).toString().trim();
      const n = parseInt(out);
      return isNaN(n) ? null : n;
    } catch { return null; }
  }

  // Windows — PowerShell com Get-CimInstance (não deprecated, Windows 7+)
  try {
    const out = execSync(
      `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').ParentProcessId"`,
      { stdio: 'pipe' }
    ).toString().trim();
    const n = parseInt(out);
    return isNaN(n) ? null : n;
  } catch { return null; }
}

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
    // Sobe a árvore de processos até 5 níveis para encontrar o .json da sessão Claude
    let pid = process.ppid;
    for (let i = 0; i < 5; i++) {
      if (!pid || pid <= 1) break;
      const candidate = join(sessionsDir, `${pid}.json`);
      if (existsSync(candidate)) {
        try { return JSON.parse(readFileSync(candidate, 'utf-8')); }
        catch { break; }
      }
      pid = getParentPid(pid);
    }

    return null;
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
