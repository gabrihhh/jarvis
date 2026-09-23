import { EventEmitter } from 'events';

// Gerência das sessões PTY dos cards. Cada card tem 1 processo `claude` vivo,
// dono do jarvis (server). É a fonte do tempo real: emite 'status' e 'data'.
//
// Eventos:
//   'status' → { id, status, prev }   sempre que o status do card muda
//   'data'   → { id, chunk }          cada pedaço de saída do PTY (para attach)
//   'exit'   → { id, code, signal }   quando o processo `claude` encerra
//
// Status possíveis: 'idle' | 'processing' | 'blocked' | 'done'.

const CLAUDE_BIN = process.env.JARVIS_CLAUDE_BIN
  || (process.platform === 'win32' ? 'claude.cmd' : 'claude');

const SCROLLBACK_MAX = 256 * 1024; // bytes de histórico guardados p/ replay no attach

export class SessionManager extends EventEmitter {
  constructor(pty) {
    super();
    this._pty = pty; // módulo node-pty injetado (carregado sob demanda pelo server)
    /** @type {Map<string, object>} */
    this.sessions = new Map();
    // Env extra injetado em todo `claude` spawnado, pra que os hooks consigam
    // reportar de volta ao server (porta HTTP + pipe do IPC). O server chama
    // setHookEnv() antes de subir.
    this.hookEnv = {};
  }

  setHookEnv(env) {
    this.hookEnv = { ...this.hookEnv, ...env };
  }

  has(id) {
    return this.sessions.has(id);
  }

  get(id) {
    return this.sessions.get(id) || null;
  }

  // Garante que existe uma sessão para o card, criando (spawn `claude`) se preciso.
  // `env` extra é injetado no processo (ex.: JARVIS_PLAN para os skills saberem o plano).
  ensure(id, cwd, env = {}) {
    let s = this.sessions.get(id);
    if (s) return s;

    const proc = this._pty.spawn(CLAUDE_BIN, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: cwd || process.cwd(),
      env: {
        ...process.env,
        ...this.hookEnv,
        ...env,
        JARVIS_CARD: id, // hooks leem isto pra saber qual card sinalizar
      },
    });

    s = {
      id,
      cwd: cwd || process.cwd(),
      pty: proc,
      status: 'idle',
      lastSkill: null,
      cols: 80,
      rows: 30,
      scrollback: Buffer.alloc(0),
      startedAt: Date.now(),
      justCreated: true,       // 1ª skill precisa esperar o claude bootar
      settleWaiters: new Set(), // temporizadores que reiniciam a cada saída do PTY
    };
    this.sessions.set(id, s);

    proc.onData((chunk) => {
      const buf = Buffer.from(chunk, 'utf8');
      s.scrollback = Buffer.concat([s.scrollback, buf]);
      if (s.scrollback.length > SCROLLBACK_MAX) {
        s.scrollback = s.scrollback.subarray(s.scrollback.length - SCROLLBACK_MAX);
      }
      // Saiu output → o terminal está "ocupado"; reinicia quem espera silêncio.
      for (const w of s.settleWaiters) w.reset();
      this.emit('data', { id, chunk });
    });

    proc.onExit(({ exitCode, signal }) => {
      this.sessions.delete(id);
      this.emit('exit', { id, code: exitCode, signal });
    });

    return s;
  }

  // Dispara uma skill (ou comando) na sessão do card. Cria a sessão se preciso.
  // O claude é uma TUI: digitar "/scope" abre um autocomplete e o Enter só
  // submete se vier DEPOIS do render. Por isso digitamos o texto, esperamos a
  // saída assentar (autocomplete pronto) e só então mandamos o \r separado — e,
  // numa sessão recém-criada, esperamos primeiro o boot do claude assentar.
  run(id, skill, cwd, env) {
    const s = this.ensure(id, cwd, env);
    const wasNew = s.justCreated;
    s.justCreated = false;
    s.lastSkill = skill.replace(/[\r\n]+$/, '');
    this.setStatus(id, 'processing');

    const type = () => {
      s.pty.write(s.lastSkill);
      this._afterQuiet(s, 500, 4000, () => s.pty.write('\r'));
    };
    if (wasNew) this._afterQuiet(s, 900, 8000, type); // espera o claude bootar
    else type();
    return s;
  }

  // Executa `cb` quando o PTY ficar quieto por `quietMs` (saída assentou), ou no
  // máximo após `maxMs`. Cada chunk de saída reinicia a contagem de silêncio.
  _afterQuiet(s, quietMs, maxMs, cb) {
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      s.settleWaiters.delete(w);
      clearTimeout(quietTimer);
      clearTimeout(maxTimer);
      cb();
    };
    let quietTimer = setTimeout(fire, quietMs);
    const maxTimer = setTimeout(fire, maxMs);
    const w = { reset() { clearTimeout(quietTimer); quietTimer = setTimeout(fire, quietMs); } };
    s.settleWaiters.add(w);
  }

  // Escrita crua vinda de um cliente attach (teclado do usuário). NÃO altera
  // status — só hooks reais do Claude mudam o badge (queries de terminal e
  // respostas de capacidade também chegam aqui e não podem virar 'processing').
  write(id, data) {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.pty.write(data);
    return true;
  }

  resize(id, cols, rows) {
    const s = this.sessions.get(id);
    if (!s) return false;
    s.cols = cols; s.rows = rows;
    try { s.pty.resize(cols, rows); } catch { /* janela fechando */ }
    return true;
  }

  // Atualiza o status do card e emite se mudou (chamado pelos hooks via server).
  setStatus(id, status) {
    const s = this.sessions.get(id);
    if (!s || s.status === status) return;
    const prev = s.status;
    s.status = status;
    this.emit('status', { id, status, prev });
  }

  // Snapshot do histórico recente para replay no momento do attach.
  snapshot(id) {
    const s = this.sessions.get(id);
    return s ? s.scrollback : Buffer.alloc(0);
  }

  // Resumo serializável de todas as sessões (para o board / SSE inicial).
  list() {
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      cwd: s.cwd,
      status: s.status,
      lastSkill: s.lastSkill,
      cols: s.cols,
      rows: s.rows,
      startedAt: s.startedAt,
    }));
  }

  kill(id) {
    const s = this.sessions.get(id);
    if (!s) return false;
    try { s.pty.kill(); } catch { /* já morto */ }
    this.sessions.delete(id);
    return true;
  }

  killAll() {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }
}
