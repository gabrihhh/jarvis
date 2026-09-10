# Features

Ideias para próximas versões do jarvis.

---

## [BUG/OPT] Statusline: otimização e correção de bugs

A statusline atual apresenta travamentos ocasionais e bugs visuais no design dos boxes.

**Bugs conhecidos:**

1. **Travamento** — `renderLine()` é chamado de forma síncrona pelo Claude Code a cada prompt. Se a leitura do JSONL de sessão for lenta (disco cheio, arquivo grande, race condition), bloqueia o processo e trava a renderização do status bar.

2. **Bug de design** — boxes adjacentes quebram o alinhamento em alguns terminais (especialmente com fontes que tratam caracteres unicode de borda `╭╰│` com largura diferente). O `joinBoxes()` atual concatena strings assumindo largura fixa, o que falha em terminais com DPI/escala diferentes.

**Otimizações propostas:**

- Tornar a leitura do JSONL de sessão **assíncrona com timeout** — se demorar mais de 200ms, renderiza com dados do cache anterior em vez de travar
- Reescrever `joinBoxes()` usando **largura de caractere real** (`string-width` ou medição manual) para garantir alinhamento correto em qualquer terminal
- Adicionar cache em memória do estado da sessão para evitar releitura de arquivo a cada `--line`

---

## [FEATURE] Testes automatizados

Implementar cobertura de testes automatizados em todo o projeto — hoje o projeto não tem nenhum teste, o que torna difícil garantir que mudanças não quebram comportamentos existentes.

**Motivação:** com a statusline sendo chamada a cada prompt do Claude Code, qualquer regressão afeta diretamente a experiência do usuário. Testes se tornam essenciais para evoluir com segurança.

**Escopo proposto:**

*Unit tests (`src/`)* — Jest ou Node test runner nativo:
- `calculator.js` — aggregateStats, aggregateSession com fixtures de JSONL
- `reader.js` — parseamento de sessão, detecção de sessionId, fallback sem arquivo
- `statusline.js` — renderLine com estados: sem dados, com sessão, com token off/on/complete
- `theme.js` / `config.js` — leitura/escrita com arquivo presente, ausente e corrompido

*E2E / smoke tests:*
- `jarvis --usage` retorna saída válida com dados mockados
- `jarvis --line` retorna a status bar esperada (context box, com/sem token box)
- `jarvis --token complete` adiciona a linha de breakdown
- `jarvis --theme <name>:<hex>` persiste a cor corretamente

**Stack sugerida:**
- Test runner: Node.js `--test` nativo (sem dependência extra) ou Jest
- Mocks de fs/child_process: `mock-fs` ou spies nativos do Node test runner
- CI: GitHub Actions rodando `npm test` em cada push

---

## [IDEA] Comando para configurar arquitetura de conversação entre agentes

Definir como o Claude se estrutura internamente (subagentes, orquestradores, paralelismo) para minimizar uso de tokens e pressão na janela de contexto.

**Motivação:** conversas longas e tarefas complexas consomem contexto rapidamente. Uma arquitetura pré-definida (ex: agent compacto + orquestrador leve) pode reduzir custo significativamente.

**Como pode funcionar:**
- Novo slash command `/configure-agents` ou flag `jarvis --agents`
- Wizard interativo para escolher estratégia: `single` / `orchestrator+subagents` / `parallel`
- Gera ou atualiza um bloco no `CLAUDE.md` do projeto com instruções de arquitetura
- Integra com `strategic-compact` e `session-wrap` skills existentes
