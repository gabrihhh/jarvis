import { existsSync, writeFileSync, readFileSync, readdirSync, statSync, openSync, writeSync, closeSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { runQuery, closeDriver } from './neo4j-client.js';

const GREEN = '\x1b[38;2;74;222;128m\x1b[1m';
const RESET = '\x1b[0m';

async function flashLoaded(projectName, branch) {
  try {
    const inner = ` ⬡ ${projectName} [${branch}] loaded `;
    const top    = `╭${'─'.repeat(inner.length)}╮`;
    const bottom = `╰${'─'.repeat(inner.length)}╯`;

    const tty = openSync('/dev/tty', 'w');
    writeSync(tty, `${GREEN}${top}${RESET}\n${GREEN}│${inner}│${RESET}\n${GREEN}${bottom}${RESET}\n`);
    closeSync(tty);

    await new Promise(r => setTimeout(r, 1500));

    const tty2 = openSync('/dev/tty', 'w');
    writeSync(tty2, `\x1b[3A\x1b[2K\x1b[1B\x1b[2K\x1b[1B\x1b[2K\x1b[3A`);
    closeSync(tty2);
  } catch { /* ambiente sem TTY — silencioso */ }
}

const CONFIG_PATH = join(homedir(), '.claude-memory.json');

function loadConfig() {
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); } catch { return {}; }
}

function getCurrentSessionId() {
  const sessionsDir = join(homedir(), '.claude', 'sessions');
  if (!existsSync(sessionsDir)) return null;
  try {
    const files = readdirSync(sessionsDir)
      .map(f => ({ f, mtime: statSync(join(sessionsDir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (!files.length) return null;
    return JSON.parse(readFileSync(join(sessionsDir, files[0].f), 'utf8'))?.sessionId || null;
  } catch { return null; }
}

export async function queryByPath(cwd) {
  const config = loadConfig();
  const mode = config.trigger || 'session';

  if (mode === 'session') {
    const sessionId = getCurrentSessionId();
    if (sessionId) {
      const lockFile = join(tmpdir(), `jarvis-memory-${sessionId}.lock`);
      if (existsSync(lockFile)) return null;
      writeFileSync(lockFile, new Date().toISOString());
    }
  }

  const records = await runQuery(`
    MATCH (p:Project)
    WHERE $cwd STARTS WITH p.path
    OPTIONAL MATCH (p)-[:HAS_MODULE]->(m:Module)
    OPTIONAL MATCH (m)-[:HANDLES]->(c:Concept)
    OPTIONAL MATCH (m)-[:IMPLEMENTS]->(pat:Pattern)
    RETURN p, collect(DISTINCT m) AS modules,
           collect(DISTINCT c.name) AS concepts,
           collect(DISTINCT pat.name) AS patterns
    ORDER BY size(p.path) DESC
    LIMIT 1
  `, { cwd });

  await closeDriver();

  if (!records.length) return null;

  const r = records[0];
  const p = r.get('p').properties;
  const modules = r.get('modules').map(m => m.properties);
  const concepts = [...new Set(r.get('concepts'))].filter(Boolean);
  const patterns = [...new Set(r.get('patterns'))].filter(Boolean);

  if (mode === 'session') await flashLoaded(p.name, p.branch);

  return [
    `## Contexto do Repositório (jarvis-memory)`,
    `**Projeto:** ${p.name} [${p.branch}]${p.description ? ' — ' + p.description : ''}`,
    '',
    `**Módulos:** ${modules.map(m => `${m.name} (${m.domain})`).join(', ') || 'nenhum'}`,
    concepts.length ? `**Conceitos:** ${concepts.join(', ')}` : '',
    patterns.length ? `**Padrões:** ${patterns.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}
