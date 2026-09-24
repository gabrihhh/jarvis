import http from 'http';
import net from 'net';
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
import { readIndex, progress, deriveColumn } from './planIndex.js';
import { loadPty } from './pty.js';
import { canonicalPath, projectId, validateFolder, computeTabLabels } from './paths.js';
import { loadTabPaths, saveTabPaths, pruneTabPaths } from './tabs.js';
import { pickFolder } from './pickFolder.js';

const __dir = dirname(fileURLToPath(import.meta.url));

// Server local do kanban MULTI-PROJETO. Hospeda um Map<projectId, workspace>:
// cada workspace (uma pasta/monorepo, uma aba na UI) encapsula suas sessões
// (PTY), cards, watcher de plans, socket IPC e store — isolados e em paralelo.
// O server é o dono de tudo, fonte do tempo real (SSE multiplexado) e ponte do
// attach. 100% localhost.
export async function startKanban({ cwd = process.cwd(), open = true } = {}) {
  const board = readBoard();
  const pty = loadPty(); // lança KANBAN_PTY_MISSING se o node-pty não estiver instalado

  // Fases do fluxo (colunas phase:true), na ordem do board — usadas p/ progresso.
  const PHASE_IDS = board.columns.filter(c => c.phase).map(c => c.id);

  const workspaces = new Map(); // projectId → workspace (pode conter abas fechadas mas vivas)
  const openTabs = [];          // projectIds das abas ABERTAS, na ordem da barra
  const sseClients = new Set(); // conexões /events (global, multiplexado)
  let activeProject = null;     // dica de aba ativa para o 1º render dos clientes

  // --- HTTP (precisa da porta ANTES de criar workspaces: vai no env dos hooks) --
  const server = http.createServer((req, res) => handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;

  // Status em tempo real depende dos hooks (instalados por `jarvis --setup`).
  const hooksOk = hooksInstalled(join(homedir(), '.claude', 'settings.json'));

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of sseClients) { try { c.write(payload); } catch { /* cliente saiu */ } }
  }

  // === Workspace: o que antes era o closure de startKanban, agora por pasta ====
  function createWorkspace(cwd) {
    const id = projectId(cwd);
    const sessions = new SessionManager(pty);
    const cards = new Map();          // id → { id, name, column, plan, status }
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

    // Card enriquecido com o que o board LÊ do index.json (read-only): id do Jira,
    // título e progresso das fases. Todo card carrega `project` (a aba dona).
    const cardView = (card) => {
      const idx = readIndex(cwd, card.plan);
      if (!idx) return { ...card, project: id, jira: null, title: null, progress: progress(null, PHASE_IDS) };
      const name = idx.jira && idx.jiraSummary ? idx.jiraSummary : (idx.title || card.name);
      return { ...card, project: id, name, jira: idx.jira || null, title: idx.title || null, progress: progress(idx, PHASE_IDS) };
    };

    // Auto-descoberta: planos com index.json que ainda não são cards viram cards,
    // na coluna derivada das fases concluídas (board populado ao abrir a aba).
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

    // O hook precisa saber pra ONDE e QUAL projeto reportar → env de todo `claude`.
    // Injetado depois de obter o `port` e antes de qualquer sessions.run.
    sessions.setHookEnv({
      JARVIS_KANBAN_PORT: String(port),
      JARVIS_KANBAN_HOST: '127.0.0.1',
      JARVIS_KANBAN_PROJECT: id,
    });

    // --- IPC (attach) — socket próprio por workspace -------------------------
    const endpoint = ipcEndpoint(cwd);
    const ipc = startIpc(endpoint, sessions, (sid) => {
      const t = openingTimers.get(sid);
      if (t) { clearTimeout(t); openingTimers.delete(sid); }
      opening.delete(sid);
    });

    // --- tempo real: propaga eventos das sessões pro board via SSE (com project) --
    sessions.on('status', ({ id: sid, status }) => {
      const [cardId, column] = splitSession(sid);
      const card = cards.get(cardId);
      if (!card || card.column !== column) return;
      card.status = status;
      broadcast('status', { project: id, id: cardId, status });
      if (status === 'done') broadcast('card', cardView(card));
    });
    sessions.on('exit', ({ id: sid }) => {
      const [cardId, column] = splitSession(sid);
      const card = cards.get(cardId);
      if (!card || card.column !== column) return;
      card.status = 'idle';
      broadcast('exit', { project: id, id: cardId });
    });

    // Vínculo card ↔ plan-N: quando o /scope cria um novo plano, amarra ao card
    // mais antigo aguardando (FIFO cobre uso sequencial e degrada bem).
    const planWatcher = watchPlans(cwd, (plan) => {
      if (boundPlans.has(plan)) return;
      const cardId = pendingBind.shift();
      if (!cardId) return;
      const card = cards.get(cardId);
      if (!card) return;
      card.plan = plan;
      boundPlans.add(plan);
      persist();
      broadcast('card', cardView(card));
    });

    const close = () => {
      try { planWatcher.close(); } catch { /* */ }
      try { ipc.close(); } catch { /* */ }
      try { if (process.platform !== 'win32' && existsSync(endpoint)) unlinkSync(endpoint); } catch { /* */ }
    };
    const shutdown = () => { sessions.killAll(); close(); };

    return {
      id, cwd, sessions, cards, endpoint,
      opening, openingTimers, boundPlans, pendingBind,
      persist, cardView, sessionId, splitSession, close, shutdown,
    };
  }

  // Get-or-create ATÔMICO: checa o Map antes de instanciar. Evita dois startIpc
  // no mesmo endpoint (EADDRINUSE) e é o "foca a aba existente" do "+".
  function getOrCreateWorkspace(canonical) {
    const id = projectId(canonical);
    if (workspaces.has(id)) return { ws: workspaces.get(id), existed: true };
    const ws = createWorkspace(canonical);
    workspaces.set(id, ws);
    return { ws, existed: false };
  }

  // --- Boot eager: reabre as abas persistidas + garante a cwd ----------------
  {
    const cwdCanon = canonicalPath(cwd);
    const paths = pruneTabPaths(loadTabPaths()); // já vêm canônicos e existentes
    if (!paths.includes(cwdCanon)) paths.unshift(cwdCanon);
    saveTabPaths(paths); // regrava (podou inexistentes / garantiu a cwd)
    for (const p of paths) {
      const { ws } = getOrCreateWorkspace(p);
      if (!openTabs.includes(ws.id)) openTabs.push(ws.id);
    }
    activeProject = projectId(cwdCanon);
  }

  // --- serializadores (mesmo shape em /api/state e no SSE `state`) -----------
  const tabList = () => {
    const paths = openTabs.map(pid => workspaces.get(pid)?.cwd).filter(Boolean);
    const labels = computeTabLabels(paths);
    return openTabs
      .map(pid => workspaces.get(pid))
      .filter(Boolean)
      .map(ws => ({ project: ws.id, path: ws.cwd, label: labels.get(ws.cwd), active: ws.id === activeProject }));
  };
  const allCards = () => {
    const out = [];
    for (const pid of openTabs) {
      const ws = workspaces.get(pid);
      if (!ws) continue;
      for (const c of ws.cards.values()) out.push(ws.cardView(c));
    }
    return out;
  };
  const stateSnapshot = () => ({ tabs: tabList(), cards: allCards() });

  // --- resolução de workspace escopado --------------------------------------
  const resolveWorkspace = (key) => (key ? workspaces.get(key) || null : null);

  // --- rotas -----------------------------------------------------------------
  async function handle(req, res) {
    const u = new URL(req.url, url);
    const { pathname } = u;

    // Globais (GET)
    if (req.method === 'GET' && pathname === '/') return sendFile(res, join(__dir, 'ui.html'), 'text/html');
    if (req.method === 'GET' && pathname === '/api/board') return sendJson(res, board);
    if (req.method === 'GET' && pathname === '/api/state') return sendJson(res, stateSnapshot());
    if (req.method === 'GET' && pathname === '/api/tabs') return sendJson(res, { tabs: tabList() });
    if (req.method === 'GET' && pathname === '/events') return sse(req, res);

    // Globais (POST) — abas e seleção de pasta
    if (req.method === 'POST' && pathname === '/api/tabs')       return withBody(req, res, openTab);
    if (req.method === 'POST' && pathname === '/api/tabs/close') return withBody(req, res, closeTab);
    if (req.method === 'POST' && pathname === '/api/pick-folder') return pickFolderRoute(res);

    // Escopadas (project válido no body → workspace, senão 400)
    if (req.method === 'POST' && pathname === '/api/card')   return withBody(req, res, scoped(createCard));
    if (req.method === 'POST' && pathname === '/api/move')   return withBody(req, res, scoped(moveCard));
    if (req.method === 'POST' && pathname === '/api/open')   return withBody(req, res, scoped(openCard));
    if (req.method === 'POST' && pathname === '/api/delete') return withBody(req, res, scoped(deleteCard));
    if (req.method === 'POST' && pathname === '/hook')       return withBody(req, res, onHook);

    res.writeHead(404); res.end('not found');
  }

  // Envolve uma ação escopada: resolve o workspace do body.project ou 400.
  function scoped(fn) {
    return (body, res) => {
      const ws = resolveWorkspace(body.project);
      if (!ws) return sendJson(res, { error: 'projeto inválido' }, 400);
      fn(ws, body, res);
    };
  }

  function sse(req, res) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    // No connect e na reconexão: estado completo (todas as abas + todos os cards).
    res.write(`event: state\ndata: ${JSON.stringify(stateSnapshot())}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  }

  // --- ações de abas ---------------------------------------------------------
  function openTab(body, res) {
    const v = validateFolder(body.path);
    if (!v.ok) return sendJson(res, { error: v.error }, 400);
    const { ws, existed } = getOrCreateWorkspace(v.canonical);
    if (!openTabs.includes(ws.id)) openTabs.push(ws.id);
    activeProject = ws.id;
    saveTabPaths(openTabs.map(pid => workspaces.get(pid).cwd));
    broadcast('state', stateSnapshot()); // todos os clientes veem a aba + cards
    sendJson(res, { project: ws.id, existed });
  }

  // Fecha a aba: tira da persistência e da barra, MAS mantém o workspace vivo no
  // Map (sessões seguem rodando) → reabrir a mesma pasta reconecta. NUNCA shutdown.
  function closeTab(body, res) {
    const i = openTabs.indexOf(body.project);
    if (i >= 0) openTabs.splice(i, 1);
    if (activeProject === body.project) activeProject = openTabs[openTabs.length - 1] || null;
    saveTabPaths(openTabs.map(pid => workspaces.get(pid).cwd));
    broadcast('state', stateSnapshot());
    sendJson(res, { ok: true });
  }

  async function pickFolderRoute(res) {
    try {
      const r = await pickFolder();
      if (r.error === 'no-native-dialog') return sendJson(res, { error: r.error, fallback: 'prompt' });
      sendJson(res, r); // { path } | { canceled } | { error }
    } catch (e) {
      sendJson(res, { error: e.message || 'falha no seletor', fallback: 'prompt' });
    }
  }

  // --- ações escopadas (recebem o workspace resolvido) -----------------------
  function createCard(ws, body, res) {
    const name = (body.name || '').trim();
    if (!name) return sendJson(res, { error: 'nome vazio' }, 400);
    const id = slug(name, ws.cards);
    const card = { id, name, column: firstColumnId(board), plan: null, status: 'idle' };
    ws.cards.set(id, card);
    ws.persist();
    broadcast('card', ws.cardView(card));
    sendJson(res, ws.cardView(card));
  }

  function moveCard(ws, body, res) {
    const card = ws.cards.get(body.id);
    if (!card) return sendJson(res, { error: 'card não existe' }, 404);
    const col = getColumn(board, body.column);
    if (!col) return sendJson(res, { error: 'coluna não existe' }, 404);

    // Sem guard de ordem: qualquer card pode ser movido para qualquer coluna.
    card.column = col.id;

    const skill = skillForColumn(board, col.id);
    if (skill) {
      if (col.createsPlan && !card.plan && !ws.pendingBind.includes(card.id)) ws.pendingBind.push(card.id);
      const runEnv = card.plan ? { JARVIS_PLAN: card.plan } : undefined;
      ws.sessions.run(ws.sessionId(card.id, col.id), skill, ws.cwd, runEnv);
    } else {
      card.status = 'idle'; // parking: sem sessão ativa
    }
    ws.persist();
    broadcast('card', ws.cardView(card));
    sendJson(res, ws.cardView(card));
  }

  function openCard(ws, body, res) {
    const card = ws.cards.get(body.id);
    if (!card) return sendJson(res, { error: 'card não existe' }, 404);
    const sid = ws.sessionId(card.id, card.column);
    if (!ws.sessions.has(sid)) return sendJson(res, { error: 'esta coluna não tem sessão' }, 409);
    if (ws.opening.has(sid)) return sendJson(res, { ok: true, already: true });
    ws.opening.add(sid);
    ws.openingTimers.set(sid, setTimeout(() => { ws.opening.delete(sid); ws.openingTimers.delete(sid); }, 8000));
    try {
      openTerminal(sid, { endpoint: ws.endpoint, cwd: ws.cwd });
      sendJson(res, { ok: true });
    } catch (e) {
      ws.opening.delete(sid);
      const t = ws.openingTimers.get(sid); if (t) { clearTimeout(t); ws.openingTimers.delete(sid); }
      sendJson(res, { error: e.message }, 500);
    }
  }

  function deleteCard(ws, body, res) {
    const card = ws.cards.get(body.id);
    if (!card) return sendJson(res, { error: 'card não existe' }, 404);
    for (const s of ws.sessions.list()) {
      const [cid] = ws.splitSession(s.id);
      if (cid !== card.id) continue;
      ws.sessions.kill(s.id);
      ws.opening.delete(s.id);
      const t = ws.openingTimers.get(s.id);
      if (t) { clearTimeout(t); ws.openingTimers.delete(s.id); }
    }
    ws.cards.delete(card.id);
    const i = ws.pendingBind.indexOf(card.id);
    if (i >= 0) ws.pendingBind.splice(i, 1);
    ws.persist();
    broadcast('delete', { project: ws.id, id: card.id });
    sendJson(res, { ok: true });
  }

  // O hook exige project + card. Projeto desconhecido → no-op silencioso (200).
  function onHook(body, res) {
    if (body.project && body.card && body.status) {
      const ws = workspaces.get(body.project);
      if (!ws) { sendJson(res, { ok: true }); return; } // aba fechada/desconhecida → no-op
      let status = body.status;
      if (body.event === 'notification') {
        if (/waiting for your input/i.test(body.message || '')) { sendJson(res, { ok: true }); return; }
        status = 'blocked'; // fail-safe: mensagem real ou vazia ⇒ blocked
      }
      ws.sessions.setStatus(body.card, status);
    }
    sendJson(res, { ok: true });
  }

  // --- abre o browser --------------------------------------------------------
  if (open) { try { openBrowser(url); } catch { /* segue sem abrir */ } }

  const shutdown = () => {
    for (const ws of workspaces.values()) { try { ws.shutdown(); } catch { /* */ } }
    server.close();
  };
  process.on('SIGINT', () => { shutdown(); process.exit(0); });
  process.on('SIGTERM', () => { shutdown(); process.exit(0); });

  console.log(`\n  jarvis kanban  ·  ${url}\n  board config: ~/.claude/jarvis-kanban.json`);
  if (!hooksOk) console.log('  ⚠ status em tempo real inativo — rode `jarvis --kanban-setup` para instalar os hooks');
  console.log('  Ctrl+C para encerrar\n');
  return { url, port, workspaces, shutdown };
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
