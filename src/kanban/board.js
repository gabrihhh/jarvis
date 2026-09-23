import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Config do board do kanban. Cada coluna aponta para a skill que dispara ao
// receber um card — trocar qual skill roda em qual coluna é só editar este JSON.
export const BOARD_PATH = join(homedir(), '.claude', 'jarvis-kanban.json');

// type:
//   'action'  → ao soltar o card aqui, dispara `skill` na sessão do card
//   'parking' → estado de parada, nenhuma skill dispara (skill: null)
// flags opcionais:
//   create      → coluna oferece o botão "+" para criar um card só com nome (Backlog)
//   createsPlan → a skill desta coluna cria o plan-N e vincula ao card (Scope)
//   returnsTo   → ao concluir a skill, o card volta sozinho para esta coluna
//   phase       → é uma fase do fluxo; conta no progresso (index.json.phases[id])
//   requires    → só permite soltar o card aqui se esta fase estiver 'done' no index.json (guard)
export const DEFAULT_BOARD = {
  columns: [
    { id: 'backlog',          title: 'Backlog',          type: 'parking', skill: null,               create: true },
    { id: 'scope',            title: 'Scope',            type: 'action',  skill: '/scope',            createsPlan: true, phase: true },
    { id: 'blueprint',        title: 'Blueprint',        type: 'action',  skill: '/blueprint',        phase: true, requires: 'scope' },
    { id: 'card',             title: 'Card',             type: 'action',  skill: '/card',             phase: true, requires: 'blueprint' },
    { id: 'execute',          title: 'Execute',          type: 'action',  skill: '/execute',          phase: true, requires: 'card' },
    { id: 'create-test',      title: 'Create-test',      type: 'action',  skill: '/create-test',      phase: true, requires: 'execute' },
    { id: 'code-review',      title: 'Code-review',      type: 'parking', skill: null },
    { id: 'resolve-reviewer', title: 'Resolve-reviewer', type: 'action',  skill: '/resolve-reviewer', returnsTo: 'code-review', requires: 'execute' },
    { id: 'done',             title: 'Done',             type: 'action',  skill: '/done',             requires: 'create-test' },
  ],
  // Cores dos badges de status do card (ortogonais à coluna).
  statuses: {
    idle:       { label: 'idle',       color: '#64748b' },
    processing: { label: 'processing', color: '#f59e0b' },
    blocked:    { label: 'blocked',    color: '#ef4444' },
    done:       { label: 'done',       color: '#22c55e' },
  },
};

// Lê o board do disco, semeando o arquivo com os defaults na primeira vez para
// o usuário ter algo editável. Colunas do usuário nunca são sobrescritas; só o
// que faltar em `statuses` é preenchido com o default.
export function readBoard() {
  ensureBoard();
  try {
    const raw = JSON.parse(readFileSync(BOARD_PATH, 'utf8'));
    return {
      columns: Array.isArray(raw.columns) && raw.columns.length ? raw.columns : DEFAULT_BOARD.columns,
      statuses: { ...DEFAULT_BOARD.statuses, ...(raw.statuses || {}) },
    };
  } catch {
    return structuredClone(DEFAULT_BOARD);
  }
}

export function writeBoard(board) {
  writeFileSync(BOARD_PATH, JSON.stringify(board, null, 2));
}

// Cria o arquivo de config com os defaults se ainda não existir.
export function ensureBoard() {
  if (!existsSync(BOARD_PATH)) writeBoard(DEFAULT_BOARD);
}

// Helpers de consulta ---------------------------------------------------------

export function getColumn(board, id) {
  return board.columns.find(c => c.id === id) || null;
}

// A skill que dispara ao soltar um card nesta coluna (null se for parking).
export function skillForColumn(board, id) {
  const col = getColumn(board, id);
  return col && col.type === 'action' ? col.skill : null;
}

// Valida a config: ids únicos, colunas 'action' têm skill, 'parking' não têm.
// Retorna array de erros (vazio = ok).
export function validateBoard(board) {
  const errors = [];
  if (!Array.isArray(board.columns) || !board.columns.length) {
    errors.push('columns: precisa ser um array não-vazio');
    return errors;
  }
  const seen = new Set();
  for (const col of board.columns) {
    if (!col.id) { errors.push('coluna sem "id"'); continue; }
    if (seen.has(col.id)) errors.push(`id duplicado: "${col.id}"`);
    seen.add(col.id);
    if (col.type !== 'action' && col.type !== 'parking') {
      errors.push(`"${col.id}": type deve ser "action" ou "parking"`);
    }
    if (col.type === 'action' && !col.skill) {
      errors.push(`"${col.id}": coluna de ação precisa de "skill" (ex: "/scope")`);
    }
    if (col.returnsTo && !board.columns.some(c => c.id === col.returnsTo)) {
      errors.push(`"${col.id}": returnsTo "${col.returnsTo}" não existe`);
    }
  }
  return errors;
}
