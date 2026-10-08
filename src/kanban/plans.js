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

// Dispara onChange() sempre que algo em plans/ pode ter mudado — novo/removido
// plan-N (via fs.watch, reação imediata) OU periodicamente a cada 3s (fallback
// robusto/cross-platform, que também cobre EDIÇÃO de index.json dentro das
// subpastas — fs.watch não-recursivo não pega escrita em arquivo de subdir).
// O caller re-varre todos os plans/*/index.json (o index.json é a fonte da verdade).
export function watchPlans(cwd, onChange) {
  const dir = join(cwd, 'plans');
  try { mkdirSync(dir, { recursive: true }); } catch { /* */ }

  let watcher = null;
  try { watcher = watch(dir, () => onChange()); } catch { /* fs.watch indisponível → só polling */ }
  const timer = setInterval(() => onChange(), 3000);

  return {
    close() {
      try { watcher && watcher.close(); } catch { /* */ }
      clearInterval(timer);
    },
  };
}
