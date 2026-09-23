import { createRequire } from 'module';
import { join } from 'path';
import { homedir } from 'os';

// node-pty NÃO é dependência do jarvis (mantém o install base leve). O
// `jarvis --kanban-setup` instala ele neste runtime dedicado; aqui a gente
// carrega sob demanda, tentando: (1) resolução normal (dev/npm link, onde o
// node-pty está no node_modules do repo) e (2) o runtime do kanban-setup.
export const RUNTIME_DIR = join(homedir(), '.claude', 'jarvis-kanban-runtime');

const require = createRequire(import.meta.url);

export function loadPty() {
  try { return require('node-pty'); } catch { /* não é dep do jarvis */ }
  try { return require(join(RUNTIME_DIR, 'node_modules', 'node-pty')); } catch { /* runtime ausente */ }
  const err = new Error('KANBAN_PTY_MISSING');
  err.code = 'KANBAN_PTY_MISSING';
  throw err;
}

export function ptyAvailable() {
  try { loadPty(); return true; } catch { return false; }
}
