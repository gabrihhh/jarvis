import { spawn, spawnSync } from 'child_process';

// Abre o terminal nativo do SO já anexado à sessão do card (via `jarvis --attach`).
// O endpoint do socket vai por env pra o cliente achar o server sem adivinhar.
export function openTerminal(card, { endpoint, cwd }) {
  const env = { ...process.env, JARVIS_KANBAN_ENDPOINT: endpoint };
  const attach = `jarvis --attach ${card}`;

  // Override manual: JARVIS_TERMINAL="kitty -e"
  if (process.env.JARVIS_TERMINAL) {
    const parts = process.env.JARVIS_TERMINAL.split(' ').filter(Boolean);
    return detached(parts[0], [...parts.slice(1), 'sh', '-c', attach], { env, cwd });
  }

  if (process.platform === 'darwin') {
    // Terminal.app via AppleScript (best-effort).
    const script = `tell application "Terminal" to do script "JARVIS_KANBAN_ENDPOINT='${endpoint}' ${attach}"`;
    return detached('osascript', ['-e', script], { env, cwd });
  }

  if (process.platform === 'win32') {
    // Windows Terminal → fallback cmd.
    const inner = `set JARVIS_KANBAN_ENDPOINT=${endpoint}&& ${attach}`;
    if (which('wt.exe')) return detached('wt.exe', ['cmd', '/k', inner], { env, cwd });
    return detached('cmd', ['/c', 'start', '', 'cmd', '/k', inner], { env, cwd });
  }

  // Linux: detecta o emulador disponível.
  const term = ['gnome-terminal', 'konsole', 'xterm'].find(which);
  if (!term) throw new Error('nenhum emulador de terminal encontrado (gnome-terminal/konsole/xterm) — use JARVIS_TERMINAL');
  const flag = term === 'konsole' ? '-e' : '--';
  return detached(term, [flag, 'sh', '-c', attach], { env, cwd });
}

export function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  detached(cmd, args, {});
}

function detached(cmd, args, { env, cwd }) {
  const child = spawn(cmd, args, { env: env || process.env, cwd, detached: true, stdio: 'ignore' });
  child.unref();
  return child;
}

function which(bin) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [bin], { stdio: 'ignore' }).status === 0;
}
