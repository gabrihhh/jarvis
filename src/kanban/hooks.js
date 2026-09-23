import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import http from 'http';

// Elo de status em tempo real. O Claude Code dispara hooks como processos que
// herdam o env da sessão (incluindo JARVIS_CARD e a porta do server). O comando
// `jarvis --hook <event>` lê esse env + o stdin do hook e faz POST pro server,
// que chama session.setStatus() → o badge do card muda na hora.

// Evento do Claude Code → status do card.
export const HOOK_EVENTS = {
  userpromptsubmit: 'processing', // usuário (ou o kanban) submeteu um prompt → trabalhando
  notification:     'blocked',    // Claude precisa do usuário (pergunta/permissão/idle)
  stop:             'done',       // Claude terminou o turno
};

// Comandos instalados no settings.json (nome do evento no Claude Code → comando).
export const HOOK_COMMANDS = {
  UserPromptSubmit: 'jarvis --hook userpromptsubmit',
  Notification:     'jarvis --hook notification',
  Stop:             'jarvis --hook stop',
};

// Instala (idempotente) os hooks no settings.json informado. Não duplica se já
// existir e preserva quaisquer outros hooks do usuário.
export function installHooks(settingsPath) {
  let settings = {};
  if (existsSync(settingsPath)) {
    try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { settings = {}; }
  }
  settings.hooks = settings.hooks || {};
  for (const [event, command] of Object.entries(HOOK_COMMANDS)) {
    const groups = settings.hooks[event] = settings.hooks[event] || [];
    const exists = groups.some(g => (g.hooks || []).some(h => h.command === command));
    if (!exists) groups.push({ hooks: [{ type: 'command', command }] });
  }
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return settingsPath;
}

// Remove os hooks do jarvis do settings.json, deixando o resto intacto.
export function uninstallHooks(settingsPath) {
  if (!existsSync(settingsPath)) return;
  let settings;
  try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { return; }
  if (!settings.hooks) return;
  const ours = new Set(Object.values(HOOK_COMMANDS));
  for (const event of Object.keys(HOOK_COMMANDS)) {
    const groups = settings.hooks[event];
    if (!Array.isArray(groups)) continue;
    settings.hooks[event] = groups
      .map(g => ({ ...g, hooks: (g.hooks || []).filter(h => !ours.has(h.command)) }))
      .filter(g => (g.hooks || []).length);
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

// Checa se os hooks do jarvis já estão instalados no settings.json informado.
export function hooksInstalled(settingsPath) {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const ours = new Set(Object.values(HOOK_COMMANDS));
    return Object.keys(HOOK_COMMANDS).every((event) =>
      (settings.hooks?.[event] || []).some((g) => (g.hooks || []).some((h) => ours.has(h.command))));
  } catch {
    return false;
  }
}

// Runtime de `jarvis --hook <event>`. Precisa ser rápido e NUNCA travar o Claude
// Code — sempre resolve silenciosamente, mesmo em erro.
export async function reportHook(event) {
  const card = process.env.JARVIS_CARD;
  const port = process.env.JARVIS_KANBAN_PORT;
  const status = HOOK_EVENTS[event];
  // Sem env do kanban (sessão normal do Claude) ou evento desconhecido → no-op.
  if (!card || !port || !status) return;

  const host = process.env.JARVIS_KANBAN_HOST || '127.0.0.1';
  let message;
  try {
    const raw = await readStdin(200);
    if (raw) message = JSON.parse(raw).message;
  } catch { /* stdin ausente/inválido — segue sem message */ }

  await post(host, port, '/hook', { card, event, status, message });
}

// Helpers ---------------------------------------------------------------------

function readStdin(timeoutMs) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(data); } };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', c => { data += c; });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    setTimeout(finish, timeoutMs);
  });
}

function post(host, port, path, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        host, port, path, method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
        timeout: 500,
      },
      (res) => { res.resume(); res.on('end', resolve); },
    );
    req.on('error', resolve);
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(payload);
    req.end();
  });
}
