import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { RUNTIME_DIR, ptyAvailable } from './pty.js';
import { installHooks, hooksInstalled, HOOK_COMMANDS } from './hooks.js';

const PTY_VERSION = '^1.1.0';

// Estado de configuração do kanban: precisa do node-pty + dos hooks de status.
export function kanbanConfigured() {
  const missing = [];
  if (!ptyAvailable()) missing.push('node-pty');
  if (!hooksInstalled(join(homedir(), '.claude', 'settings.json'))) missing.push('hooks de status');
  return { ok: missing.length === 0, missing };
}

// `jarvis --kanban-setup`: provisiona o que o kanban precisa além do install base.
// 1) instala o node-pty num runtime dedicado (~/.claude/jarvis-kanban-runtime)
// 2) instala os hooks de status no settings.json global
export function setupKanban() {
  console.log('\n  Configurando o kanban...\n');

  // 1. node-pty no runtime dedicado
  mkdirSync(RUNTIME_DIR, { recursive: true });
  writeFileSync(join(RUNTIME_DIR, 'package.json'), JSON.stringify({
    name: 'jarvis-kanban-runtime',
    private: true,
    version: '1.0.0',
    dependencies: { 'node-pty': PTY_VERSION },
  }, null, 2));

  console.log('  Instalando node-pty (pode compilar — até ~1 min)...');
  const r = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], {
    cwd: RUNTIME_DIR,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error('\n  ✗ Falha ao instalar o node-pty. Verifique o npm e a toolchain de build do seu SO.\n');
    process.exit(1);
  }
  console.log('  ✓ node-pty instalado');

  // 2. hooks de status em tempo real
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  installHooks(settingsPath);
  for (const event of Object.keys(HOOK_COMMANDS)) console.log(`  ✓ Hook ${event} instalado`);

  console.log('\n  ✓ Kanban pronto. Reinicie o Claude Code e rode:  jarvis --kanban\n');
}
