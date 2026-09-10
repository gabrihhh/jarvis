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
| `jarvis --line` | Saída de uma linha usada internamente pela status bar |
| `jarvis --help` | Lista todos os comandos |

**Slash commands** *(dentro do Claude Code)*:

`jarvis --setup` copia todo arquivo `.md` da pasta `slash/` deste pacote para `~/.claude/commands/`, registrando-os como slash commands globais. Você pode adicionar seus próprios `.md` e rodar `jarvis --setup` novamente.

O jarvis já inclui um **fluxo de desenvolvimento de software com IA** — do setup à PR pronta para review. São 6 fases lineares (cada uma checa se a anterior foi concluída) + 1 fase avulsa. Um `index.md` por plano (em `plans/plan-N/`) funciona como painel de progresso que costura todos os comandos.

| Comando | Fase | O que faz |
|---|---|---|
| `/setup` | 1 | Verifica MCP do Jira e GitHub CLI, identifica o monorepo e classifica as pastas em API/front — salva em `.claude/estrutura.md` |
| `/scope` | 2 | Sincroniza a branch (main/qa) com o remote, mapeia o fluxo front→API, tira todas as dúvidas, cria e revisa a especificação (com cenários de teste) e salva em `plans/plan-N/` |
| `/blueprint` | 3 | Gera o planejamento técnico de implementação (incluindo os testes a criar) a partir da spec |
| `/card` | 4 | Cria o card no Jira via MCP — título padronizado, descrição do plano, status, assignee e comentário do tempo de escopo |
| `/execute` | 5 | Cria a branch em cada repo, implementa código **e** testes, roda `/code-review`, abre a PR (linguagem leiga) e acompanha o CI até passar |
| `/create-test` | 6 | Cria um guia de teste leigo (pt-BR) explicando como validar a alteração e posta como comentário no card |
| `/resolve-reviewer` | avulso | Resolve o feedback deixado por um reviewer na PR, garante o CI verde e devolve a PR para review |

> O desenho completo do fluxo está em [`docs/fluxo-desenvolvimento-ia.drawio`](docs/fluxo-desenvolvimento-ia.drawio) e o template do painel em [`docs/index-template.md`](docs/index-template.md).

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
