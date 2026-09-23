import net from 'net';
import { ipcEndpoint, lineReader } from './ipc.js';

// Cliente leve de `jarvis --attach <card>`. Conecta no socket do server e
// espelha o PTY da sessão no terminal atual (raw mode, resize, detach).
// Detach sem matar a sessão: Ctrl-] (0x1d).
export function attach(card, { endpoint, cwd = process.cwd() } = {}) {
  endpoint = endpoint || process.env.JARVIS_KANBAN_ENDPOINT || ipcEndpoint(cwd);
  if (!card) { console.error('uso: jarvis --attach <card>'); process.exit(1); }

  const sock = net.connect(endpoint);
  let raw = false;

  const cleanup = (code = 0) => {
    if (raw && process.stdin.isTTY) { try { process.stdin.setRawMode(false); } catch { /* */ } }
    process.stdin.pause();
    try { sock.end(); } catch { /* */ }
    process.exit(code);
  };

  sock.on('connect', () => {
    const cols = process.stdout.columns || 80;
    const rows = process.stdout.rows || 30;
    sock.write(JSON.stringify({ t: 'hello', card, cols, rows }) + '\n');

    if (process.stdin.isTTY) { process.stdin.setRawMode(true); raw = true; }
    process.stdin.resume();

    process.stdin.on('data', (d) => {
      if (d.length === 1 && d[0] === 0x1d) { // Ctrl-] → detach
        process.stdout.write('\r\n[detached — a sessão continua viva]\r\n');
        return cleanup(0);
      }
      sock.write(JSON.stringify({ t: 'in', d: d.toString('base64') }) + '\n');
    });

    process.stdout.on('resize', () => {
      sock.write(JSON.stringify({ t: 'resize', cols: process.stdout.columns, rows: process.stdout.rows }) + '\n');
    });
  });

  sock.on('data', lineReader((msg) => {
    if (msg.t === 'out') process.stdout.write(Buffer.from(msg.d, 'base64'));
    else if (msg.t === 'end') { process.stdout.write('\r\n[sessão encerrada]\r\n'); cleanup(0); }
  }));

  sock.on('error', (e) => { console.error(`attach: ${e.message}`); cleanup(1); });
  sock.on('close', () => cleanup(0));
}
