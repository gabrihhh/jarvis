# jarvis

Terminal dashboard, status bar e grafo de memória semântica para o **Claude Code** — 100% local.

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
| `jarvis --usage` | Dashboard completo de uso (tokens, custo, contexto) |
| `jarvis --watch` | Dashboard com auto-refresh a cada 30s |
| `jarvis --setup` | Configura status bar, instala slash commands e define trigger padrão |
| `jarvis --graph` | Abre o Neo4j Browser em localhost:7474 |
| `jarvis --trigger` | Mostra o modo de trigger atual |
| `jarvis --trigger session` | Hook de memória roda uma vez por sessão *(padrão)* |
| `jarvis --trigger prompt` | Hook de memória roda a cada prompt |
| `jarvis --trigger off` | Desativa o carregamento automático de memória |
| `jarvis --line` | Saída de uma linha usada internamente pela status bar |
| `jarvis --help` | Lista todos os comandos |

**Slash commands** *(dentro do Claude Code)*:

| Comando | Descrição |
|---|---|
| `/setup-memory` | Sobe Neo4j via Docker e registra o MCP server |
| `/create-memory` | Indexa um repositório no grafo de memória (primeira vez) |
| `/update-memory` | Atualiza o grafo com as mudanças recentes do repositório |
| `/configure-memory` | Personaliza o schema, regras e fluxos da arquitetura de memória |

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
│   ⬡  Context Window  (current session)                       │
│                                                              │
│   ████████████░░░░░░░░░░░░  52%  103.6K / 200.0K             │
│   146 turns  ·  model: sonnet-4-6                            │
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
