# CLAUDE.md — jarvis

CLI npm (`@gabrihhh/jarvis`) que entrega dashboard de uso de tokens e status bar em tempo real para o **Claude Code** — 100% local, sem servidor externo.

---

## Comandos

```bash
node bin/jarvis.js           # executa direto (desenvolvimento)
npm link                     # instala globalmente a partir do source local
jarvis --usage               # dashboard de tokens/custo
jarvis --watch               # dashboard com auto-refresh 30s
jarvis --setup               # configura status bar e copia slash/ → ~/.claude/commands/
jarvis --line                # saída da status bar (boxes Unicode)
jarvis --theme               # gerencia cores dos boxes (context | tokens)
jarvis --token <mode>        # on | complete | off
```

Não há step de build — o projeto é ESM puro (`"type": "module"`), Node.js >= 18.

---

## Estrutura do projeto

```
bin/
  jarvis.js          # entry point CLI — roteamento de todos os --flags
src/
  index.js           # run() — orquestra jarvis --usage
  statusline.js      # renderLine() — status bar chamada pelo Claude Code a cada prompt
  reader.js          # leitura de JSONL de sessões + getCurrentSessionFile()
  calculator.js      # aggregateStats(), aggregateSession(), formatTokens(), formatCost()
  display.js         # render() — dashboard completo com boxes Unicode
  theme.js           # readTheme()/writeTheme() — cores dos boxes da status bar
  config.js          # readConfig()/writeConfig() — config de runtime (tokenDisplay)
slash/                        # todo .md aqui é copiado por --setup para ~/.claude/commands/
                              # (vem vazia por padrão — receber novos slash commands aqui)
docs/
  FEATURES.md        # roadmap de ideias, bugs conhecidos e features planejadas
```

---

## Arquivos de estado em runtime

| Arquivo | Propósito |
|---|---|
| `~/.claude/jarvis.json` | config persistente: modo de exibição de tokens (`tokenDisplay`) |
| `~/.claude/jarvis-theme.json` | cores customizadas dos boxes da status bar |
| `~/.claude/settings.json` | status bar gerenciada por `jarvis --setup` |
| `~/.claude/sessions/<pid>.json` | metadados de sessão criados pelo Claude Code (`sessionId`, `cwd`, `startedAt`) |
| `~/.claude/projects/**/*.jsonl` | histórico de uso de tokens por sessão (fonte primária do dashboard) |

---

## Regras de desenvolvimento

### Fluxo obrigatório após qualquer alteração

1. **`npm link`** — instalar localmente antes de considerar qualquer coisa pronto
2. **Validar** — aguardar confirmação do usuário de que o comportamento está correto
3. Só após validação completa:
   - Verificar se o que foi implementado estava listado em **`docs/FEATURES.md`** — se sim, **remover a entrada** correspondente
   - Atualizar `README.md` se o que foi feito altera comandos, outputs ou comportamento visível ao usuário
   - Bumpar versão em `package.json` (semver: patch para bugfix, minor para feature)
   - Commitar, taguear e publicar no npm

**Nunca subir no git ou publicar no npm sem validação explícita do usuário.**

### Status bar (`jarvis --line`)

- É chamada pelo Claude Code a cada prompt — deve ser rápida (< 200ms)
- Quando `--token off`: exibir **apenas** o context box
- Context window é sempre por sessão — usar `sessionId` do terminal atual via `getCurrentSessionFile()`

### Identificação de sessão (`reader.js`)

- `getCurrentSessionFile()` usa `getParentPid(pid)` cross-platform:
  - **Linux**: lê `/proc/<pid>/stat` (sem subprocess)
  - **macOS**: `ps -o ppid= -p <pid>`
  - **Windows**: `powershell Get-CimInstance Win32_Process`
- Sobe **até 5 níveis** na árvore de processos — nunca reduzir esse número
- O fallback por JSONL só é acionado se nenhum `.json` for encontrado na árvore de PIDs

### Versionamento

| Tipo de mudança | Bump |
|---|---|
| Bugfix | patch (2.5.0 → 2.5.1) |
| Feature nova / comportamento visível | minor (2.5.0 → 2.6.0) |
| Breaking change | major |

### `docs/FEATURES.md`

É o backlog vivo do projeto. Após implementar algo que estava listado lá:
- Remover a entrada correspondente do arquivo
- Commitar a remoção junto com o restante das mudanças
