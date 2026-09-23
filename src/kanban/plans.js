import { readdirSync, mkdirSync, watch } from 'fs';
import { join } from 'path';

// Detecção de planos (plan-N) criados pelo /scope, para vincular ao card.
export function listPlanDirs(cwd) {
  try {
    return readdirSync(join(cwd, 'plans'), { withFileTypes: true })
      .filter(d => d.isDirectory() && /^plan-\d+$/.test(d.name))
      .map(d => d.name);
  } catch {
    return [];
  }
}

// Chama onNew(planName) quando um novo diretório plan-N aparece em plans/.
// Usa fs.watch (reação imediata) + polling de 3s (fallback robusto/cross-platform).
export function watchPlans(cwd, onNew) {
  const dir = join(cwd, 'plans');
  try { mkdirSync(dir, { recursive: true }); } catch { /* */ }

  let known = new Set(listPlanDirs(cwd));
  const check = () => {
    for (const p of listPlanDirs(cwd)) {
      if (!known.has(p)) { known.add(p); onNew(p); }
    }
  };

  let watcher = null;
  try { watcher = watch(dir, check); } catch { /* fs.watch indisponível → só polling */ }
  const timer = setInterval(check, 3000);

  return {
    close() {
      try { watcher && watcher.close(); } catch { /* */ }
      clearInterval(timer);
    },
  };
}
