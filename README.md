# claude-usage

Terminal dashboard e status bar para monitorar seu uso do **Claude Code** em tempo real — direto no terminal, sem chamadas externas, 100% local.

## Preview

**Dashboard completo** (`claude-usage`):
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

**Status bar acoplada ao Claude** (aparece no rodapé de cada sessão):
```
╭──────────────────────╮
│ CONTEXT ████░░░░ 52% │
╰──────────────────────╯
```

---

## Instalação

**Requisitos:** Node.js 18+ e [Claude Code](https://claude.ai/code)

```bash
npm install -g @gabrihhh/claude-usage
```

---

## Comandos

### `claude-usage`
Abre o dashboard completo com todas as métricas do seu uso mensal, semanal e diário.

```bash
claude-usage
```

### `claude-usage --watch`
Abre o dashboard com **auto-refresh a cada 30 segundos**. Útil para monitorar o uso em tempo real.

```bash
claude-usage --watch
```

### `claude-usage --setup`
Configura automaticamente a **status bar** no Claude Code. Escreve a entrada `statusLine` no arquivo `~/.claude/settings.json`. Só precisa rodar uma vez.

```bash
claude-usage --setup
```

Após rodar, **reinicie o Claude Code** e a caixinha de contexto vai aparecer no rodapé de toda sessão.

### `claude-usage --line`
Gera a saída de uma linha usada internamente pela status bar do Claude Code. Você não precisa rodar isso manualmente — é chamado automaticamente pelo `--setup`.

```bash
claude-usage --line
```

### `claude-usage --help`
Lista todos os comandos disponíveis.

```bash
claude-usage --help
```

---

## O que cada métrica significa

| Métrica | Descrição |
|---|---|
| **Monthly** | Total de tokens e custo estimado nos últimos 30 dias |
| **Weekly** | Total de tokens e custo estimado nos últimos 7 dias |
| **Today** | Total de tokens e custo estimado nas últimas 24 horas |
| **Context Window** | % da janela de contexto usada na **sessão atual** (por aba) |
| **Monthly breakdown** | Divisão dos tokens do mês por tipo: input, output, cache read e cache write |

A barra de progresso em **Monthly/Weekly/Today** é relativa ao total mensal.  
A barra de **Context Window** é relativa ao limite do modelo (200K para Sonnet/Opus).

Os custos são estimados com base nas tarifas públicas da Anthropic:

| Modelo | Input | Output | Cache read | Cache write |
|---|---|---|---|---|
| Sonnet 4.6 | $3/M | $15/M | $0.30/M | $3.75/M |
| Opus 4.6 | $15/M | $75/M | $1.50/M | $18.75/M |
| Haiku 4.5 | $0.25/M | $1.25/M | $0.025/M | $0.30/M |

---

## Como funciona

Lê diretamente os arquivos `~/.claude/projects/**/*.jsonl` gerados pelo Claude Code — **sem nenhuma chamada de API**, sem autenticação e sem envio de dados para fora da sua máquina.

A detecção da sessão atual usa o PID do processo pai para identificar exatamente qual aba do Claude Code está ativa, garantindo que o contexto exibido seja sempre o da sessão correta.

---

## Desinstalar

```bash
npm uninstall -g @gabrihhh/claude-usage
```

Para remover a status bar, abra `~/.claude/settings.json` e delete a linha `"statusLine"`.

---

## Compatibilidade

- Funciona **exclusivamente com Claude Code** — não é compatível com outros produtos da Anthropic
- Testado em **Linux e macOS**
- Requer **Node.js 18+**
