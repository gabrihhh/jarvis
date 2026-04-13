# jarvis

Terminal dashboard, status bar e grafo de memória semântica para o **Claude Code** — 100% local, sem chamadas externas.

## O que é

**jarvis** tem duas partes:

1. **Dashboard de uso** — monitora tokens, custo e janela de contexto em tempo real
2. **Memory Graph** — indexa repositórios no Neo4j e permite ao Claude consultar o conhecimento estruturado sobre seus projetos durante sessões (via MCP server)

## Preview

**Dashboard completo** (`jarvis-usage`):
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

**Status bar acoplada ao Claude** (rodapé de cada sessão):
```
╭──────────────────────╮
│ CONTEXT ████░░░░ 52% │
╰──────────────────────╯
```

---

## Instalação

**Requisitos:** Node.js 18+, [Claude Code](https://claude.ai/code) e Docker (para o Memory Graph)

```bash
npm install -g @gabrihhh/jarvis
```

Para integrar a status bar ao Claude Code, rode uma vez após instalar:

```bash
jarvis-usage --setup
```

Depois **reinicie o Claude Code**.
```

Depois **reinicie o Claude Code** — a caixinha de contexto vai aparecer no rodapé de toda sessão.

---

## Comandos

### `jarvis-usage`
Abre o dashboard completo com métricas de uso mensal, semanal e diário.

```bash
jarvis-usage
```

---

### `jarvis-usage --watch`
Dashboard com **auto-refresh a cada 30 segundos**.

```bash
jarvis-usage --watch
```

---

### `jarvis-usage --setup`
Configura a **status bar** no Claude Code escrevendo `statusLine` em `~/.claude/settings.json`. Só precisa rodar uma vez.

```bash
jarvis-usage --setup
```

Após rodar, **reinicie o Claude Code**.

---

### `jarvis-usage graph`
Abre o **Neo4j Browser** em `http://localhost:7474` para visualizar o grafo de memória dos seus projetos. Requer Neo4j rodando (use `/setup-memory` para configurar).

```bash
jarvis-usage graph
```

---

### `jarvis-usage --line`
Gera a saída de uma linha usada internamente pela status bar. Chamado automaticamente pelo `--setup`, não é necessário rodar manualmente.

```bash
jarvis-usage --line
```

---

### `jarvis-usage --help`
Lista todos os comandos disponíveis.

```bash
jarvis-usage --help
```

---

## Memory Graph — Slash Commands

Os comandos abaixo estão disponíveis dentro do **Claude Code** após instalar o jarvis.

### `/setup-memory`
Configura o ambiente de memória semântica completo:
- Verifica e instala o Docker se necessário (pede permissão)
- Sobe o container Neo4j (`claude-memory`) via Docker
- Registra o MCP server `jarvis-memory` no `~/.claude/settings.json`

Após rodar, **reinicie o Claude Code** para ativar o MCP server.

---

### `/memory-index`
Analisa um repositório inteiro e indexa o entendimento no Neo4j:
- Pergunta se deve indexar `main` ou `qa` e faz checkout + pull do branch
- Lê todos os arquivos relevantes do projeto
- Pergunta ao usuário sempre que tiver qualquer dúvida (sem limite de perguntas)
- Apresenta o mapa completo do projeto para aprovação antes de salvar
- Grava módulos, arquivos, padrões, conceitos e dependências no grafo

---

## Memory Graph — MCP Tools

Após o setup, o Claude Code passa a ter acesso às seguintes tools durante as sessões:

| Tool | O que faz |
|------|-----------|
| `list-projects` | Lista todos os projetos e branches indexados |
| `query-project` | Retorna resumo completo de um projeto (módulos, padrões, conceitos) |
| `search-concept` | Busca módulos relacionados a um conceito de negócio |
| `get-module-detail` | Detalha um módulo específico (arquivos, padrões, dependências) |
| `save-project` | Grava o entendimento aprovado de um projeto no grafo |

O Claude chama essas tools **autonomamente** quando precisar de contexto — sem necessidade de instrução manual.

---

## Schema do Grafo

```
(Project)-[:HAS_MODULE]->(Module)
(Module)-[:CONTAINS]->(File)
(Module)-[:HANDLES]->(Concept)
(Module)-[:IMPLEMENTS]->(Pattern)
(Module)-[:DEPENDS_ON]->(Module)
(File)-[:IMPORTS]->(Dependency)
(Project)-[:USES_PATTERN]->(Pattern)
```

Projetos indexados em branches diferentes ficam separados no grafo:
```
(Project {name: "meu-projeto", branch: "main"})
(Project {name: "meu-projeto", branch: "qa"})
```

---

## Métricas do Dashboard

| Métrica | Descrição |
|---|---|
| **Monthly** | Total de tokens e custo estimado nos últimos 30 dias |
| **Weekly** | Total de tokens e custo estimado nos últimos 7 dias |
| **Today** | Total de tokens e custo estimado nas últimas 24 horas |
| **Context Window** | % da janela de contexto usada na **sessão atual** |
| **Monthly breakdown** | Divisão por tipo: input, output, cache read e cache write |

Custos estimados com base nas tarifas públicas da Anthropic:

| Modelo | Input | Output | Cache read | Cache write |
|---|---|---|---|---|
| Sonnet 4.6 | $3/M | $15/M | $0.30/M | $3.75/M |
| Opus 4.6 | $15/M | $75/M | $1.50/M | $18.75/M |
| Haiku 4.5 | $0.25/M | $1.25/M | $0.025/M | $0.30/M |

---

## Como funciona

O dashboard lê diretamente os arquivos `~/.claude/projects/**/*.jsonl` gerados pelo Claude Code — **sem nenhuma chamada de API**, sem autenticação e sem envio de dados para fora da sua máquina.

O Memory Graph usa Neo4j rodando localmente via Docker. Toda a memória fica na sua máquina.

---

## Desinstalar

```bash
npm uninstall -g @gabrihhh/jarvis
docker stop claude-memory && docker rm claude-memory
```

Para remover a status bar, abra `~/.claude/settings.json` e delete a linha `"statusLine"`.
Para remover o MCP server, delete a entrada `jarvis-memory` em `mcpServers` no mesmo arquivo.

---

## Compatibilidade

- Funciona **exclusivamente com Claude Code**
- Testado em **Linux e macOS**
- Requer **Node.js 18+**
- Memory Graph requer **Docker**
