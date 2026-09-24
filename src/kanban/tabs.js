import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { canonicalPath } from './paths.js';

// Persistência das abas abertas do kanban, GLOBAL (não por projeto), em
// ~/.claude/jarvis-kanban-tabs.json → { paths: [...caminhos canônicos] }.
// No próximo `jarvis --kanban`, reabre as mesmas abas.
export const TABS_PATH = join(homedir(), '.claude', 'jarvis-kanban-tabs.json');

// Tolerante a corrupção → [] (mesmo padrão do loadCards).
export function loadTabPaths() {
  try {
    const raw = JSON.parse(readFileSync(TABS_PATH, 'utf8'));
    return Array.isArray(raw.paths) ? raw.paths : [];
  } catch {
    return [];
  }
}

// Grava a lista (dedup preservando a ordem). Cria o diretório se preciso.
export function saveTabPaths(paths) {
  const seen = new Set();
  const uniq = [];
  for (const p of paths) { if (!seen.has(p)) { seen.add(p); uniq.push(p); } }
  mkdirSync(dirname(TABS_PATH), { recursive: true });
  writeFileSync(TABS_PATH, JSON.stringify({ paths: uniq }, null, 2));
}

// Filtra caminhos inexistentes / não-diretórios e deduplica por caminho canônico.
// Usado no boot para podar pastas apagadas do disco (o arquivo é regravado).
export function pruneTabPaths(paths) {
  const seen = new Set();
  const kept = [];
  for (const p of paths) {
    let ok = false;
    try { ok = existsSync(p) && statSync(p).isDirectory(); } catch { ok = false; }
    if (!ok) continue;
    const canon = canonicalPath(p);
    if (seen.has(canon)) continue;
    seen.add(canon);
    kept.push(canon);
  }
  return kept;
}
