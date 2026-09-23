import { readFileSync } from 'fs';
import { join } from 'path';

// Leitura do index.json de um plano — a fonte de verdade ESTRUTURADA do fluxo,
// escrita pelos skills (Claude). O board lê isto read-only: nunca interpreta
// prosa, nunca chama o Claude. Um dono por arquivo (skills escrevem, board lê).
//
// Schema esperado (campos ausentes são tolerados):
// {
//   "title": "Otimização da esteira",
//   "type": "fix",                       // fix | feat
//   "base": "qa",                        // qa | main
//   "jira": "VENA-223",
//   "stack": { "test": "vitest", "scenarios": ["..."] },
//   "workspace": { "worktrees": ["api-vena-core", "front-vena"] },
//   "phases": {
//     "scope":       { "done": true,  "startedAt": "...", "finishedAt": "..." },
//     "blueprint":   { "done": false }, ...
//   },
//   "reviewRounds": [{ "round": 1, "at": "..." }]
// }
export function indexPath(cwd, plan) {
  return join(cwd, 'plans', plan, 'index.json');
}

export function readIndex(cwd, plan) {
  if (!plan) return null;
  try { return JSON.parse(readFileSync(indexPath(cwd, plan), 'utf8')); }
  catch { return null; }
}

export function phaseDone(index, key) {
  return !!(index && index.phases && index.phases[key] && index.phases[key].done);
}

// Progresso do card: fases concluídas / fases conhecidas (as colunas phase:true).
export function progress(index, phaseIds) {
  const done = phaseIds.filter((k) => phaseDone(index, k)).length;
  return { done, total: phaseIds.length };
}

// Coluna derivada do estado do plano: a fase concluída mais avançada (o card
// fica na coluna da última fase feita). Todas as fases feitas → a coluna logo
// após a última fase (ex.: code-review). Encerrado → 'done'. Nada feito → fallback.
export function deriveColumn(board, index, fallback) {
  if (!index) return fallback;
  if (index.status === 'done') return 'done';

  const phaseCols = board.columns.filter((c) => c.phase);
  if (phaseCols.length && phaseCols.every((c) => phaseDone(index, c.id))) {
    const lastPhaseIdx = board.columns.findLastIndex((c) => c.phase);
    const next = board.columns[lastPhaseIdx + 1];
    return next ? next.id : phaseCols[phaseCols.length - 1].id;
  }

  let last = fallback;
  for (const col of board.columns) {
    if (col.phase && phaseDone(index, col.id)) last = col.id;
  }
  return last;
}
