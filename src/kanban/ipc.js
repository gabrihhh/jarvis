import { join } from 'path';
import { tmpdir } from 'os';
import { projectId } from './paths.js';

// Endpoint do socket local para o attach, por projeto. Cross-platform: named
// pipe no Windows, unix domain socket no resto. Deriva de projectId (mesma
// fonte única de identidade) — nunca recomputar o hash aqui, senão o socket e a
// chave do Map de workspaces podem divergir em silêncio para a mesma pasta.
export function ipcEndpoint(canonical) {
  const hash = projectId(canonical);
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
