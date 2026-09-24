import { spawn, spawnSync } from 'child_process';
import { validateFolder } from './paths.js';

// Seletor de pasta NATIVO do SO, cross-platform. Retorna sempre uma das formas:
//   { path }            → pasta escolhida e validada (caminho canônico)
//   { canceled: true }  → usuário cancelou o diálogo (não é erro)
//   { error }           → falha; se error === 'no-native-dialog', a UI cai no
//                         fallback de prompt de texto.
//
// Os diálogos são SERIALIZADOS (uma cadeia de Promise): abrir dois seletores
// nativos ao mesmo tempo confunde o usuário e alguns backends nem suportam.
let queue = Promise.resolve();

export function pickFolder() {
  const run = () => runDialog();
  const p = queue.then(run, run); // segue a fila mesmo se o anterior rejeitou
  queue = p.catch(() => { /* isola a fila de rejeições */ });
  return p;
}

function runDialog() {
  if (process.platform === 'darwin') return pickMac();
  if (process.platform === 'win32') return pickWindows();
  return pickLinux();
}

// --- Linux: zenity ou kdialog ------------------------------------------------
function pickLinux() {
  if (which('zenity')) {
    return exec('zenity', ['--file-selection', '--directory', '--title=Escolha a pasta do projeto']);
  }
  if (which('kdialog')) {
    return exec('kdialog', ['--getexistingdirectory', process.env.HOME || '.']);
  }
  return Promise.resolve({ error: 'no-native-dialog' });
}

// --- macOS: osascript "choose folder" ---------------------------------------
function pickMac() {
  const script = 'POSIX path of (choose folder with prompt "Escolha a pasta do projeto")';
  return exec('osascript', ['-e', script]);
}

// --- Windows: FolderBrowserDialog via PowerShell -----------------------------
function pickWindows() {
  const ps = [
    'Add-Type -AssemblyName System.Windows.Forms;',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog;',
    'if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }',
  ].join(' ');
  return exec('powershell', ['-NoProfile', '-Command', ps]);
}

// Roda o binário do diálogo, captura stdout e classifica o resultado.
// exit code ≠ 0 ⇒ cancelamento (padrão de zenity/kdialog/osascript).
function exec(cmd, args) {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return resolve({ error: 'no-native-dialog' });
    }
    child.stdout.on('data', (c) => { out += c; });
    child.on('error', () => resolve({ error: 'no-native-dialog' }));
    child.on('close', (code) => {
      const picked = out.trim();
      if (code !== 0 || !picked) return resolve({ canceled: true });
      const v = validateFolder(picked);
      if (!v.ok) return resolve({ error: v.error });
      resolve({ path: v.canonical });
    });
  });
}

function which(bin) {
  return spawnSync('which', [bin], { stdio: 'ignore' }).status === 0;
}
