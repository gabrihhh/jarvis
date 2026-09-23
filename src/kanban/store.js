import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// Persistência dos cards do board, por projeto, em plans/.kanban.json.
// Guarda só o essencial ({id, name, column, plan}); o status é runtime (vem da
// sessão) e é reidratado como 'idle' quando o server sobe.
export function storePath(cwd) {
  return join(cwd, 'plans', '.kanban.json');
}

export function loadCards(cwd) {
  try {
    const raw = JSON.parse(readFileSync(storePath(cwd), 'utf8'));
    return Array.isArray(raw.cards) ? raw.cards : [];
  } catch {
    return [];
  }
}

export function saveCards(cwd, cardsIterable) {
  const cards = [...cardsIterable].map(({ id, name, column, plan }) => ({ id, name, column, plan: plan || null }));
  mkdirSync(join(cwd, 'plans'), { recursive: true });
  writeFileSync(storePath(cwd), JSON.stringify({ cards }, null, 2));
}
