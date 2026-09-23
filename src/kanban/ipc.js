import { join } from 'path';
import { tmpdir } from 'os';
import { createHash } from 'crypto';

// Endpoint do socket local para o attach, por projeto (cwd). Cross-platform:
// named pipe no Windows, unix domain socket no resto.
export function ipcEndpoint(key) {
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 12);
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\jarvis-kanban-${hash}`
    : join(tmpdir(), `jarvis-kanban-${hash}.sock`);
}

// Protocolo: mensagens JSON delimitadas por \n. Dados do terminal viajam em
// base64 dentro do campo `d`, o que evita dor de cabeça com framing binário.
//   client → server: {t:'hello',card,cols,rows} | {t:'in',d} | {t:'resize',cols,rows}
//   server → client: {t:'out',d} | {t:'end'}
export function lineReader(onMsg) {
  let buf = '';
  return (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.trim()) {
        try { onMsg(JSON.parse(line)); } catch { /* linha parcial/inválida */ }
      }
    }
  };
}
