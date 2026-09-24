import { existsSync, statSync, realpathSync } from 'fs';
import { resolve, sep, basename } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';

// Canonicalização + identidade de uma pasta/monorepo — a FONTE ÚNICA de verdade
// do multi-projeto. `projectId`, `ipcEndpoint`, o path do store e a entrada em
// tabs.json partem TODOS de `canonicalPath()`: se um usar cwd cru e outro o
// realpath, a mesma pasta viraria dois workspaces (bug silencioso).

// Expande `~`, resolve para absoluto e aplica realpath (resolve symlinks e `..`).
// realpath só funciona se o caminho existe; se não existir, fica no resolvido.
export function canonicalPath(p) {
  const expanded = expandHome(p);
  const abs = resolve(expanded);
  try { return realpathSync.native(abs); }
  catch { return abs; } // pasta ainda não existe → melhor esforço (resolve)
}

// Identidade estável do projeto: hash do caminho canônico. Chave do Map de
// workspaces e valor de JARVIS_KANBAN_PROJECT. Mesma base do ipcEndpoint.
export function projectId(canonical) {
  return createHash('sha1').update(canonical).digest('hex').slice(0, 12);
}

// Valida uma pasta escolhida (dialog ou texto): precisa existir e ser diretório.
// Retorna { ok:true, canonical } ou { ok:false, error } (mensagem amigável).
export function validateFolder(input) {
  const raw = (input || '').trim();
  if (!raw) return { ok: false, error: 'caminho vazio' };
  const abs = resolve(expandHome(raw));
  if (!existsSync(abs)) return { ok: false, error: `caminho não existe: ${abs}` };
  try {
    if (!statSync(abs).isDirectory()) return { ok: false, error: `não é uma pasta: ${abs}` };
  } catch {
    return { ok: false, error: `não foi possível acessar: ${abs}` };
  }
  return { ok: true, canonical: canonicalPath(abs) };
}

// Rótulos de aba: basename por padrão; basenames duplicados sobem segmentos do
// caminho (b/a, c/b/a…) até ficar único; colisão total → caminho completo.
// Pura e testável — não toca o disco.
export function computeTabLabels(paths) {
  const list = [...new Set(paths)];
  const labels = new Map();
  // segments[path] = ['home','patara','projetos','jarvis'] (fim = basename)
  const segs = new Map(list.map(p => [p, p.split(sep).filter(Boolean)]));

  for (const p of list) {
    const parts = segs.get(p);
    let depth = 1;
    let label = tail(parts, depth);
    // Sobe segmentos enquanto o rótulo colidir com o de outro caminho.
    while (depth < parts.length && list.some(q => q !== p && tail(segs.get(q), depth) === label)) {
      depth += 1;
      label = tail(parts, depth);
    }
    labels.set(p, label);
  }
  return labels;
}

// Helpers ---------------------------------------------------------------------

function expandHome(p) {
  if (p === '~') return homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return homedir() + p.slice(1);
  return p;
}

// Últimos `n` segmentos de um caminho, juntados com o separador do SO.
function tail(parts, n) {
  return parts.slice(Math.max(0, parts.length - n)).join(sep) || basename(parts.join(sep)) || parts.join(sep);
}
