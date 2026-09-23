# Spec — `jarvis --kanban`

Board kanban local que orquestra o **fluxo de desenvolvimento com IA** (`docs/fluxo-desenvolvimento-ia.drawio`).
Cada coluna é uma fase/skill do fluxo; cada card é um plano de trabalho. Arrastar um card dispara a
skill daquela coluna numa sessão do Claude Code rodando por trás (num PTY próprio do jarvis), e clicar
no card abre o terminal daquela sessão.

> Status: **spec em revisão** — ainda não implementado.
> **Multiplataforma:** Linux, macOS e Windows nativo (sem depender de WSL/tmux).

---

## 1. Conceito central: card = `plan-N`

O fluxo já organiza todo trabalho como `plans/plan-N/` com um `index.md` que é o **painel de progresso**
(marca quais fases concluíram, com guards). O kanban é uma **camada visual sobre `plans/*/index.md`**:

- **Card** = um `plan-N`.
- **Coluna** = a fase da skill; a posição do card é persistida (ver §7) e as fases concluídas no
  `index.md` são o **guard** para permitir avançar.
- **Arrastar** para a próxima coluna = disparar a skill daquela fase na sessão do card.
- **Clicar** no card = abrir o terminal (attach) daquela sessão.

---

## 2. Colunas e transições

```
[ Backlog ] → [ Scope ] → [ Blueprint ] → [ Card ] → [ Execute ] → [ Create-test ] → [ Code-review ] ⇄ [ Resolve-reviewer ]
     +                                                                                        ↓
   (novo)                                                                                  [ Done ]
```

| Coluna | Ao soltar o card | Tipo | Skill |
|---|---|---|---|
| **Backlog** | botão `+` cria card só com **nome** (rascunho, sem `plan-N`) | parking | — |
| **Scope** | dispara `/scope` → **cria o `plan-N`** e vincula ao card | ação | `/scope` |
| **Blueprint** | dispara `/blueprint` | ação | `/blueprint` |
| **Card** | dispara `/card` | ação | `/card` |
| **Execute** | dispara `/execute` (abre PR, CI, move Jira p/ code-review) | ação | `/execute` |
| **Create-test** | dispara `/create-test` | ação | `/create-test` |
| **Code-review** | card espera review humano da PR | parking | — |
| **Resolve-reviewer** | dispara `/resolve-reviewer`; ao concluir **volta sozinho** p/ Code-review | ação | `/resolve-reviewer` |
| **Done** | dispara nova skill `/done` (marca o plano encerrado no `index.md`) | ação | `/done` (novo) |

**Loop de review:** o card fica parado em **Code-review**. Se o reviewer comentou, o usuário arrasta para
**Resolve-reviewer** (que ao terminar devolve o card para Code-review). Quando aprovado/mergeado, arrasta
para **Done**.

### Regras de transição (guard)
- Colunas de **ação** só aceitam o card se a fase anterior está concluída no `index.md`
  (mesma lógica dos guards do fluxo). A UI bloqueia o drop inválido.
- **Backlog** e **Code-review** são estados de parada (nenhuma skill dispara ao entrar).
- **Backlog → Scope** é o único drop que cria um `plan-N` novo.

---

## 3. Estado do card (badge, ortogonal à coluna)

Enquanto a skill da coluna atual roda, o card exibe um badge:

| Badge | Cor | Significado | Origem |
|---|---|---|---|
| `processing` | 🟠 laranja | skill rodando | sessão ativa, sem sinal de fim |
| `blocked` | 🔴 vermelho | Claude fez uma pergunta / espera o usuário | hook `Notification` |
| `done` | 🟢 verde | a fase concluiu; card liberado p/ avançar | hook `Stop` |

O badge reflete a **última/atual execução de skill** do card — não a coluna.

---

## 4. Arquitetura

Componentes de `jarvis --kanban`:

1. **Server local** (Node/ESM, `localhost`) — sobe ao rodar `jarvis --kanban`, abre o browser.
   Não há servidor externo; tudo em `localhost`. **É o dono de todas as sessões** dos cards.
2. **Board web** (browser) — colunas, drag-and-drop, badges de status. Recebe updates em tempo real
   (SSE/websocket). É a única superfície visual.
3. **Backend de sessões — `node-pty`** — o server abre 1 PTY por card, criado lazy no 1º disparo,
   rodando `claude` no worktree `.worktrees/plan-N/`. PTY cross-platform: **ConPTY no Windows**,
   pty nativo em Linux/macOS.
   - Disparar skill: o server escreve no PTY (`pty.write("/blueprint\r")`).
   - Abrir card (attach automático): o server spawna o emulador de terminal do SO rodando
     **`jarvis --attach plan-N`**, um cliente leve que se conecta ao server por **socket local**
     (unix socket no Unix, named pipe no Windows) e espelha o PTY (stdin/stdout em raw mode).
     Detach fecha só a janela; a sessão continua viva no server.
4. **Status do card** — duas fontes que se reforçam:
   - **Hooks do Claude Code** (`jarvis --setup` instala em `.claude/settings.json`): `Notification`
     → `blocked`; `Stop` → `done`. Como o server spawnou o processo, ele já sabe qual card é
     (sem precisar reconciliar `sessionId`).
   - **Stream do PTY** — o server lê a saída direto; serve de fallback/heurística p/ `processing`.
5. **Fonte de verdade** — `plans/*/index.md` (fases concluídas) + `plans/.kanban.json` (posição das
   colunas e rascunhos de Backlog).

### Fluxo de um disparo (ex.: arrastar card de Scope → Blueprint)
1. UI valida o guard (`/scope` concluído no `index.md`).
2. Server garante o PTY do card (cria se não existe, rodando `claude` em `.worktrees/plan-N/`).
3. `pty.write("/blueprint\r")` → badge vira 🟠 `processing`.
4. Se o Claude perguntar algo → hook `Notification` → badge 🔴 `blocked`.
5. Usuário clica no card → server abre o terminal nativo com `jarvis --attach plan-N` → responde → segue.
6. Skill termina → hook `Stop` → badge 🟢 `done`; `index.md` marca `/blueprint` concluído.
7. Card fica na coluna Blueprint até ser arrastado adiante.

---

## 5. Interações detalhadas

- **Criar card (Backlog `+`)**: abre um input de nome; grava um rascunho em `plans/.kanban.json`
  (`{ id, name, column: "backlog", plan: null }`). Ainda não existe `plan-N`.
- **Arrastar Backlog → Scope**: dispara `/scope`. Quando o `/scope` cria `plan-N`, o server vincula o
  rascunho (`plan: "plan-3"`) e o card passa a ser lastreado pelo `index.md`.
- **Clicar no card**: o server abre o emulador de terminal do SO rodando `jarvis --attach plan-N`
  (attach automático). Se o emulador não for detectado, fallback: a UI mostra o comando para copiar.
- **Card `blocked`**: destaque vermelho + (opcional) badge com trecho da pergunta. Clicar leva ao
  terminal para responder.
- **Concorrência**: **sem limite** — quantos cards o usuário quiser em `processing` ao mesmo tempo
  (cada um é um PTY independente; o isolamento já vem dos worktrees por plano).

---

## 6. Superfície de CLI e configuração

- `jarvis --kanban` — sobe o server e abre o board no browser.
- `jarvis --attach <plan-N>` — cliente leve que anexa o terminal atual à sessão do card (usado pelo
  server ao clicar num card; também pode ser rodado à mão). Conecta no socket local do server.
- `jarvis --setup` — **estendido** para instalar os hooks (`Notification`, `Stop`) no
  `.claude/settings.json` do projeto, além do que já faz.

### Emulador de terminal por SO (detecção com fallback)
| SO | Comando de abertura |
|---|---|
| **Linux** | detecta `gnome-terminal` / `konsole` / `xterm` (nesta ordem) → `<term> -- jarvis --attach plan-N` |
| **macOS** | `open -a Terminal` (ou AppleScript p/ iTerm) rodando `jarvis --attach plan-N` |
| **Windows** | `wt.exe` (Windows Terminal) → fallback `start cmd /k` → `jarvis --attach plan-N` |

Sobrescrevível por env `JARVIS_TERMINAL` (ex.: `JARVIS_TERMINAL="kitty -e"`).

### IPC (socket local) por SO
- **Unix (Linux/macOS)**: unix domain socket (ex.: `~/.claude/jarvis-kanban/<project>.sock`).
- **Windows**: named pipe (ex.: `\\.\pipe\jarvis-kanban-<project>`).
Abstraído por `net.Server`/`net.connect` do Node, que suportam ambos.

---

## 7. Estado persistido

| Arquivo | Propósito |
|---|---|
| `plans/.kanban.json` | posição de coluna de cada card + rascunhos de Backlog (sem `plan-N` ainda) |
| `plans/plan-N/index.md` | fonte de verdade das fases concluídas (guards) — já existe no fluxo |
| `~/.claude/jarvis-kanban/<sessionId>.json` | status por sessão escrito pelos hooks (processing/blocked/done) |
| `.claude/settings.json` | hooks instalados pelo `jarvis --setup` |

Regra: `plans/.kanban.json` guarda a **coluna**; `index.md` guarda a **conclusão das fases**. A UI cruza
os dois — a coluna nunca pode estar à frente de uma fase não concluída (exceto parking states).

---

## 8. Nova skill: `/done`

Mínima, no espírito do fluxo:
1. Lê o `index.md` do plano ativo.
2. Verifica que a fase anterior (`/create-test` ou o parking Code-review) está concluída.
3. Marca o plano como **encerrado** no `index.md` (status + timestamp final).
4. (Opcional) move o card do Jira para o status final e sugere `/worktree clean plan-N`.

Arquivo: `slash/done.md` (copiado por `jarvis --setup` para `~/.claude/commands/`).

---

## 9. Fora do escopo da v1

- Terminal **embutido** no browser (xterm.js) — nesta versão o attach é no terminal nativo (híbrido).
- `tmux` / WSL / Agent SDK — decidido usar **`node-pty`** (um caminho só, multiplataforma).
- Coluna de `/setup` — é configuração única de ambiente, não é "por card".
- **Persistência da sessão além do server**: se o server (`jarvis --kanban`) cair, os PTYs morrem.
  Aceitável na v1 (worktree + `index.md` permitem só re-rodar a skill). Persistência real fica p/ depois.

---

## 10. Pontos em aberto / riscos

- **Detecção robusta de `processing` vs `done`**: hooks (`Notification`/`Stop`) são o sinal primário;
  o stream do PTY é o fallback. Validar que o hook consegue identificar o card (o server já sabe qual
  processo spawnou, então o mapeamento é interno — não depende de reconciliar `sessionId`).
- **`node-pty` é módulo nativo**: precisa de prebuild/binários por SO+arch (Linux/macOS/Windows, x64/arm64)
  para `npm i -g @gabrihhh/jarvis` funcionar sem toolchain de compilação. Validar prebuilds no publish.
- **Attach fiel ao terminal nativo**: raw mode, resize (SIGWINCH ↔ `pty.resize`) e encerramento limpo
  precisam funcionar igual nos 3 SOs; o cliente `jarvis --attach` cuida disso via o socket local.
