# jarvis

Terminal dashboard e status bar de uso de tokens para o **Claude Code** — 100% local.

---

## Instalação

```bash
npm install -g @gabrihhh/jarvis
jarvis --setup
```

Reinicie o Claude Code após o setup.

---

## Comandos

**CLI:**

| Comando | Descrição |
|---|---|
| `jarvis` | Mostra a versão |
| `jarvis --usage` | Dashboard completo de uso (tokens e custo) |
| `jarvis --watch` | Dashboard com auto-refresh a cada 30s |
| `jarvis --setup` | Configura status bar e instala os slash commands |
| `jarvis --theme` | Mostra o tema atual da status bar |
| `jarvis --theme <name>:<#hex>` | Define a cor de um box (`context`, `tokens`) |
| `jarvis --theme <name>:reset` | Reseta a cor de um box para o padrão |
| `jarvis --theme reset` | Reseta todas as cores para o padrão |
| `jarvis --token` | Mostra o modo de exibição de tokens atual |
| `jarvis --token on` | Ativa box com total de tokens do último turno (`◈`) |
| `jarvis --token complete` | Ativa box `◈` + linha de breakdown abaixo da status bar |
| `jarvis --token off` | Desativa exibição de tokens |
| `jarvis --kanban` | Abre o board kanban (localhost) que orquestra o fluxo de desenvolvimento |
| `jarvis --kanban-setup` | Provisiona o kanban (instala o `node-pty` num runtime dedicado + os hooks de status) |
| `jarvis --attach <plan-N>` | Anexa o terminal à sessão de um card (usado pelo board ao abrir um card) |
| `jarvis --line` | Saída de uma linha usada internamente pela status bar |
| `jarvis --help` | Lista todos os comandos |

**Slash commands** *(dentro do Claude Code)*:

`jarvis --setup` copia todo arquivo `.md` da pasta `slash/` deste pacote para `~/.claude/commands/`, registrando-os como slash commands globais. Você pode adicionar seus próprios `.md` e rodar `jarvis --setup` novamente.

O jarvis já inclui um **fluxo de desenvolvimento de software com IA** — do setup à PR pronta para review. São 6 fases lineares (cada uma checa se a anterior foi concluída) + 1 fase avulsa + 1 utilitário. Um `index.json` por plano (em `plans/plan-N/`) é o **estado estruturado** que costura todos os comandos — cada fase faz read-modify-write dele, e o board do kanban o lê para saber o progresso.

**Isolamento por `git worktree`:** o fluxo usa worktrees para permitir **vários planos em paralelo** no mesmo monorepo sem colisão. O `/scope` lê de um worktree-base do alvo (`.worktrees/base/<qa|main>`, sempre alinhado ao remote, sem tocar a cópia primária) e o `/execute` trabalha num workspace isolado por plano (`.worktrees/plan-N`, um worktree por repo, com deps instaladas).

| Comando | Fase | O que faz |
|---|---|---|
| `/setup` | 1 | Verifica MCP do Jira e GitHub CLI, identifica o monorepo e classifica as pastas em API/front — salva em `.claude/estrutura.md` |
| `/scope` | 2 | Atualiza o worktree-base do alvo (main/qa) a partir do remote, mapeia o fluxo front→API, tira todas as dúvidas, cria e revisa a especificação (com cenários de teste) e salva em `plans/plan-N/` |
| `/blueprint` | 3 | Gera o planejamento técnico de implementação (incluindo os testes a criar) a partir da spec |
| `/card` | 4 | Cria o card no Jira via MCP — título padronizado, descrição do plano, status, assignee e comentário do tempo de escopo |
| `/execute` | 5 | Cria o workspace do plano (worktree + deps por repo), implementa código **e** testes, roda `/code-review` (se existir), abre a PR (linguagem leiga) e acompanha o CI até passar |
| `/create-test` | 6 | Cria um guia de teste leigo (pt-BR) explicando como validar a alteração e posta como comentário no card |
| `/done` | final | Encerra o plano — marca `status:done`/`closedAt` no `index.json` e (opcional) move o card do Jira para o status final |
| `/code-review` | interno | Revisa uma PR (agentes em paralelo) e comenta o resultado — usado por `/execute` e `/resolve-reviewer` |
| `/resolve-reviewer` | avulso | Resolve o feedback deixado por um reviewer na PR (no worktree do plano), garante o CI verde e devolve a PR para review |
| `/worktree` | utilitário | Lista os workspaces ativos por plano e remove com segurança o workspace de um plano concluído (`/worktree clean plan-N`) |

> O desenho completo do fluxo está em [`docs/fluxo-desenvolvimento-ia.drawio`](docs/fluxo-desenvolvimento-ia.drawio).

---

## Kanban (`jarvis --kanban`)

Board local que orquestra o fluxo: **cada coluna é uma fase/skill, cada card é um `plan-N`**. Roda em `localhost`, 100% local — o board é Node puro (não usa o Claude); só as **sessões dos cards** rodam o Claude.

> **Antes de usar:** rode `jarvis --kanban-setup` uma vez. O install base do jarvis é leve; o kanban precisa do `node-pty` (módulo nativo), que o `--kanban-setup` instala num runtime dedicado, junto com os hooks de status.

- **Arrastar** um card para uma coluna dispara a skill daquela fase numa sessão própria (contexto novo por coluna).
- **Clicar** no card abre o terminal nativo já anexado àquela sessão (`jarvis --attach`).
- **Badges** em tempo real: 🟠 `processing` (o Claude está pensando ou rodando ferramenta) · 🔴 `blocked` (o Claude te perguntou algo/pediu permissão) · 🟢 `done` — via hooks do Claude Code instalados pelo `jarvis --kanban-setup`. Ao responder um `blocked`, o card **volta sozinho** para `processing` assim que o Claude retoma o trabalho; ociosidade (~60s) não altera o status.
- **Alerta sonoro**: o board toca um tom (sintetizado via Web Audio, sem arquivo/CDN) a cada transição para `blocked` (atenção) ou `done` (conclusão). O áudio é destravado no primeiro clique/tecla no board.

  > Instalações anteriores à v3.3 precisam **re-rodar `jarvis --kanban-setup`** para instalar os hooks `PreToolUse`/`PostToolUse` — sem eles o card não volta para `processing`.
- **Guards**: só deixa avançar se a fase anterior está concluída no `index.json`.
- **Descoberta automática**: ao abrir numa pasta com `plans/`, cada `index.json` vira um card na coluna certa.
- As colunas ↔ skills são configuráveis em `~/.claude/jarvis-kanban.json`.

Backend: uma sessão PTY por card via `node-pty` (cross-platform — ConPTY no Windows), com ponte de attach por socket local.

---

## Exemplos

**Dashboard completo** (`jarvis --usage`):
```
╭──────────────────────────────────────────────────────────────╮
│  ◈  Claude Code  ·  Usage Dashboard                          │
│   08 de abr. de 2026, 17:14                                  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ◷  Token Usage                                             │
│                                                              │
│   Period    Activity          Tokens    Cost       Requests  │
│   Monthly   ████████████████  245.33M   $124.99    4810 req  │
│   Weekly    ██████░░░░░░░░░░  93.19M    $55.50     2050 req  │
│   Today     ███░░░░░░░░░░░░░  42.78M    $21.60     767 req   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   Monthly breakdown                                          │
│   Input: 62.5K   Output: 1.53M                               │
│   Cache read: 232.48M   Cache write: 11.25M                  │
│                                                              │
╰──────────────────────────────────────────────────────────────╯
```

**Status bar** (rodapé de cada sessão no Claude Code):
```
╭──────────────────────╮
│ CONTEXT ████░░░░ 52% │
╰──────────────────────╯
```

**Status bar com `--token on`** (box com total de tokens do último turno):
```
╭──────────────────────╮╭──────────╮
│ CONTEXT ████░░░░ 52% ││ ◈ 50.0K  │
╰──────────────────────╯╰──────────╯
```

**Status bar com `--token complete`** (box + breakdown detalhado):
```
╭──────────────────────╮╭──────────╮
│ CONTEXT ████░░░░ 52% ││ ◈ 50.0K  │
╰──────────────────────╯╰──────────╯
INPUT 800 │ HISTORY 45.0K │ CACHE 1.2K │ RESPONSE 3.2K
```
