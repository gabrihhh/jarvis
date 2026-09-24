import http from 'http';
import net from 'net';
import { spawn } from 'child_process';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { SessionManager } from './session.js';
import { homedir } from 'os';
import { readBoard, getColumn, skillForColumn } from './board.js';
import { hooksInstalled } from './hooks.js';
import { ipcEndpoint, lineReader } from './ipc.js';
import { openTerminal, openBrowser } from './launch.js';
import { loadCards, saveCards } from './store.js';
import { watchPlans, listPlanDirs } from './plans.js';
import { readIndex, phaseDone, progress, deriveColumn } from './planIndex.js';
import { loadPty } from './pty.js';

const __dir = dirname(fileURLToPath(import.meta.url));

// Server local do kanban. Dono das sessões (PTY), fonte do tempo real (SSE) e
// ponte do attach (socket IPC). 100% localhost.
export async function startKanban({ cwd = process.cwd(), open = true } = {}) {
  const board = readBoard();
  const pty = loadPty(); // lança KANBAN_PTY_MISSING se o node-pty não estiver instalado
  const sessions = new SessionManager(pty);
  const cards = new Map();          // id → { id, name, column, plan, status }
  const sseClients = new Set();
  const opening = new Set();        // sessões com terminal abrindo (trava anti-duplo-clique)
  const openingTimers = new Map();  // sessão → timer de fallback da trava

  // Cada coluna do card tem sua PRÓPRIA sessão (contexto novo por fase).
  const sessionId = (cardId, column) => `${cardId}::${column}`;
  const splitSession = (sid) => { const i = sid.indexOf('::'); return [sid.slice(0, i), sid.slice(i + 2)]; };

  // Reidrata cards persistidos (status é runtime → volta como 'idle').
  for (const c of loadCards(cwd)) {
    cards.set(c.id, { id: c.id, name: c.name, column: c.column, plan: c.plan || null, status: 'idle' });
  }
  const boundPlans = new Set([...cards.values()].map(c => c.plan).filter(Boolean));
  const pendingBind = []; // ids de cards que rodaram /scope e aguardam o plan-N nascer
  const persist = () => { try { saveCards(cwd, cards.values()); } catch { /* */ } };

  // Fases do fluxo (colunas phase:true), na ordem do board — usadas p/ progresso.
  const PHASE_IDS = board.columns.filter(c => c.phase).map(c => c.id);

  // Card enriquecido com o que o board LÊ do index.json (read-only): id do Jira,
  // título e progresso das fases. Sem isso persistido — derivado na hora.
  const cardView = (card) => {
    const idx = readIndex(cwd, card.plan);
    if (!idx) return { ...card, jira: null, title: null, progress: progress(null, PHASE_IDS) };
    // Nome exibido: se há card no Jira, usa o nome do Jira (jiraSummary); senão o
    // título do plano (ex.: quando o /card foi pulado por falta de Jira).
    const name = idx.jira && idx.jiraSummary ? idx.jiraSummary : (idx.title || card.name);
    return { ...card, name, jira: idx.jira || null, title: idx.title || null, progress: progress(idx, PHASE_IDS) };
  };

  // Auto-descoberta: planos com index.json que ainda não são cards viram cards,
  // na coluna derivada das fases concluídas. Deixa o board populado ao abrir numa
  // pasta que já tem plans/.
  for (const plan of listPlanDirs(cwd)) {
    if (boundPlans.has(plan) || cards.has(plan)) continue;
    const idx = readIndex(cwd, plan);
    if (!idx) continue;
    cards.set(plan, {
      id: plan,
      name: idx.title || plan,
      column: deriveColumn(board, idx, firstColumnId(board)),
      plan,
      status: 'idle',
    });
    boundPlans.add(plan);
  }
  persist();

  // --- HTTP -----------------------------------------------------------------
  const server = http.createServer((req, res) => handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;

  // O hook precisa saber pra onde reportar → injeta no env de todo `claude`.
  sessions.setHookEnv({ JARVIS_KANBAN_PORT: String(port), JARVIS_KANBAN_HOST: '127.0.0.1' });

  // Status em tempo real depende dos hooks (instalados por `jarvis --setup`).
  const hooksOk = hooksInstalled(join(homedir(), '.claude', 'settings.json'));

  // --- IPC (attach) ---------------------------------------------------------
  const endpoint = ipcEndpoint(cwd);
  // onAttach: quando um terminal conecta na sessão, libera a trava de abertura.
  const ipc = startIpc(endpoint, sessions, (sid) => {
    const t = openingTimers.get(sid);
    if (t) { clearTimeout(t); openingTimers.delete(sid); }
    opening.delete(sid);
  });

  // --- tempo real: propaga eventos das sessões pro board via SSE ------------
  // O status de uma sessão só reflete no card se for a sessão da coluna ATUAL
  // (sessões de colunas anteriores não mexem no badge).
  sessions.on('status', ({ id, status }) => {
    const [cardId, column] = splitSession(id);
    const card = cards.get(cardId);
    if (!card || card.column !== column) return;
    card.status = status;
    broadcast('status', { id: cardId, status });
    // uma fase pode ter concluído → reenvia o card com progresso/jira atualizados
    if (status === 'done') broadcast('card', cardView(card));
  });
  sessions.on('exit', ({ id }) => {
    const [cardId, column] = splitSession(id);
    const card = cards.get(cardId);
    if (!card || card.column !== column) return;
    card.status = 'idle';
    broadcast('exit', { id: cardId });
  });

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of sseClients) { try { c.write(payload); } catch { /* cliente saiu */ } }
  }

  // Vínculo card ↔ plan-N: quando o /scope cria um novo plano, amarra ao card
  // mais antigo que está aguardando (fila FIFO cobre uso sequencial e degrada bem).
  const planWatcher = watchPlans(cwd, (plan) => {
    if (boundPlans.has(plan)) return;
    const cardId = pendingBind.shift();
    if (!cardId) return; // nenhum card aguardando vínculo
    const card = cards.get(cardId);
    if (!card) return;
    card.plan = plan;
    boundPlans.add(plan);
    persist();
    broadcast('card', cardView(card));
  });

  // --- rotas ----------------------------------------------------------------
  async function handle(req, res) {
    const { pathname } = new URL(req.url, url);

    if (req.method === 'GET' && pathname === '/') return sendFile(res, join(__dir, 'ui.html'), 'text/html');
    if (req.method === 'GET' && pathname === '/api/board') return sendJson(res, board);
    if (req.method === 'GET' && pathname === '/api/state') return sendJson(res, { cards: [...cards.values()].map(cardView) });
    if (req.method === 'GET' && pathname === '/events') return sse(req, res);

    if (req.method === 'POST' && pathname === '/api/card')   return withBody(req, res, createCard);
    if (req.method === 'POST' && pathname === '/api/move')   return withBody(req, res, moveCard);
    if (req.method === 'POST' && pathname === '/api/open')   return withBody(req, res, openCard);
    if (req.method === 'POST' && pathname === '/api/delete') return withBody(req, res, deleteCard);
    if (req.method === 'POST' && pathname === '/hook')       return withBody(req, res, onHook);

    res.writeHead(404); res.end('not found');
  }

  function sse(req, res) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(`event: state\ndata: ${JSON.stringify({ cards: [...cards.values()].map(cardView) })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  }

  // --- ações ----------------------------------------------------------------
  function createCard(body, res) {
    const name = (body.name || '').trim();
    if (!name) return sendJson(res, { error: 'nome vazio' }, 400);
    const id = slug(name, cards);
    const card = { id, name, column: firstColumnId(board), plan: null, status: 'idle' };
    cards.set(id, card);
    persist();
    broadcast('card', cardView(card));
    sendJson(res, cardView(card));
  }

  function moveCard(body, res) {
    const card = cards.get(body.id);
    if (!card) return sendJson(res, { error: 'card não existe' }, 404);
    const col = getColumn(board, body.column);
    if (!col) return sendJson(res, { error: 'coluna não existe' }, 404);

    // Guard: a coluna que exige uma fase anterior só aceita o card se ela estiver
    // 'done' no index.json (fonte de verdade estruturada, escrita pelos skills).
    if (col.requires && !phaseDone(readIndex(cwd, card.plan), col.requires)) {
      return sendJson(res, { error: `conclua "${col.requires}" antes de mover para "${col.title}"` }, 409);
    }

    card.column = col.id;

    // Coluna de ação → dispara a skill na sessão DESTA coluna (contexto novo).
    const skill = skillForColumn(board, col.id);
    if (skill) {
      // Coluna que cria o plano (/scope): enfileira o card para vincular o plan-N.
      if (col.createsPlan && !card.plan && !pendingBind.includes(card.id)) pendingBind.push(card.id);
      // A sessão roda na RAIZ do monorepo (os skills usam plans/, .claude/, $MONOREPO
      // e gerenciam os worktrees internamente). JARVIS_PLAN diz qual plano é.
      const runEnv = card.plan ? { JARVIS_PLAN: card.plan } : undefined;
      sessions.run(sessionId(card.id, col.id), skill, cwd, runEnv);
      // card.status é atualizado pelo evento 'status' (processing), síncrono no run.
    } else {
      card.status = 'idle'; // parking: sem sessão ativa
    }
    persist();
    broadcast('card', cardView(card));
    sendJson(res, cardView(card));
  }

  function openCard(body, res) {
    const card = cards.get(body.id);
    if (!card) return sendJson(res, { error: 'card não existe' }, 404);
    const sid = sessionId(card.id, card.column);
    if (!sessions.has(sid)) return sendJson(res, { error: 'esta coluna não tem sessão' }, 409);
    if (opening.has(sid)) return sendJson(res, { ok: true, already: true }); // já abrindo → ignora
    opening.add(sid);
    openingTimers.set(sid, setTimeout(() => { opening.delete(sid); openingTimers.delete(sid); }, 8000));
    try {
      openTerminal(sid, { endpoint, cwd });
      sendJson(res, { ok: true });
    } catch (e) {
      opening.delete(sid);
      const t = openingTimers.get(sid); if (t) { clearTimeout(t); openingTimers.delete(sid); }
      sendJson(res, { error: e.message }, 500);
    }
  }

  function deleteCard(body, res) {
    const card = cards.get(body.id);
    if (!card) return sendJson(res, { error: 'card não existe' }, 404);
    // encerra todas as sessões do card (todas as colunas por onde passou)
    for (const s of sessions.list()) {
      const [cid] = splitSession(s.id);
      if (cid !== card.id) continue;
      sessions.kill(s.id);
      opening.delete(s.id);
      const t = openingTimers.get(s.id);
      if (t) { clearTimeout(t); openingTimers.delete(s.id); }
    }
    cards.delete(card.id);
    const i = pendingBind.indexOf(card.id);
    if (i >= 0) pendingBind.splice(i, 1);
    persist();
    broadcast('delete', { id: card.id });
    sendJson(res, { ok: true });
  }

  function onHook(body, res) {
    if (body.card && body.status) {
      let status = body.status;
      // `notification` dispara tanto para permissão/pergunta quanto para ociosidade.
      // Reclassifica pelo texto (server-side only — body.message nunca vai ao DOM).
      if (body.event === 'notification') {
        // Ociosidade (~60s) → ignora: o card fica como está (um `done` continua `done`).
        if (/waiting for your input/i.test(body.message || '')) { sendJson(res, { ok: true }); return; }
        status = 'blocked'; // fail-safe: mensagem real ou vazia ⇒ blocked
      }
      sessions.setStatus(body.card, status);
    }
    sendJson(res, { ok: true });
  }

  // --- abre o browser -------------------------------------------------------
  if (open) { try { openBrowser(url); } catch { /* segue sem abrir */ } }

  const shutdown = () => {
    sessions.killAll();
    try { planWatcher.close(); } catch { /* */ }
    try { ipc.close(); } catch { /* */ }
    try { if (process.platform !== 'win32' && existsSync(endpoint)) unlinkSync(endpoint); } catch { /* */ }
    server.close();
  };
  process.on('SIGINT', () => { shutdown(); process.exit(0); });
  process.on('SIGTERM', () => { shutdown(); process.exit(0); });

  console.log(`\n  jarvis kanban  ·  ${url}\n  board config: ~/.claude/jarvis-kanban.json`);
  if (!hooksOk) console.log('  ⚠ status em tempo real inativo — rode `jarvis --kanban-setup` para instalar os hooks');
  console.log('  Ctrl+C para encerrar\n');
  return { url, port, sessions, cards, endpoint, shutdown };
}

// Server IPC do attach: cada conexão faz handshake com o card, recebe o
// scrollback e passa a espelhar o PTY em tempo real (ambos os sentidos).
function startIpc(endpoint, sessions, onAttach) {
  try { if (process.platform !== 'win32' && existsSync(endpoint)) unlinkSync(endpoint); } catch { /* */ }
  const server = net.createServer((sock) => {
    let card = null;
    let onData = null;
    const send = (obj) => { try { sock.write(JSON.stringify(obj) + '\n'); } catch { /* */ } };

    const read = lineReader((msg) => {
      if (msg.t === 'hello') {
        card = msg.card;
        if (!sessions.has(card)) { send({ t: 'end' }); sock.end(); return; }
        if (onAttach) onAttach(card); // terminal conectou → libera a trava de abertura
        if (msg.cols && msg.rows) sessions.resize(card, msg.cols, msg.rows);
        send({ t: 'out', d: sessions.snapshot(card).toString('base64') }); // replay
        onData = (e) => { if (e.id === card) send({ t: 'out', d: Buffer.from(e.chunk, 'utf8').toString('base64') }); };
        sessions.on('data', onData);
      } else if (msg.t === 'in' && card) {
        sessions.write(card, Buffer.from(msg.d, 'base64'));
      } else if (msg.t === 'resize' && card) {
        sessions.resize(card, msg.cols, msg.rows);
      }
    });

    sock.on('data', read);
    const cleanup = () => { if (onData) sessions.off('data', onData); };
    sock.on('close', cleanup);
    sock.on('error', cleanup);
  });
  server.listen(endpoint);
  return server;
}

// --- helpers -----------------------------------------------------------------

function firstColumnId(board) {
  const c = board.columns.find(x => x.create) || board.columns[0];
  return c.id;
}

function slug(name, existing) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'card';
  let id = base, n = 2;
  while (existing.has(id)) id = `${base}-${n++}`;
  return id;
}

function withBody(req, res, fn) {
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
  req.on('end', () => {
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return sendJson(res, { error: 'json inválido' }, 400); }
    fn(body, res);
  });
}

function sendJson(res, obj, code = 200) {
  const s = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(s);
}

function sendFile(res, path, type) {
  try {
    res.writeHead(200, { 'content-type': type });
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404); res.end('not found');
  }
}
