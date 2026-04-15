# Features

Ideias para próximas versões do jarvis.

---

## [BUG/OPT] Statusline: otimização e correção de bugs

A statusline atual apresenta travamentos ocasionais, bugs visuais no design dos boxes e falsos positivos no ícone de injeção de contexto (`⬡`).

**Bugs conhecidos:**

1. **Travamento** — `renderLine()` é chamado de forma síncrona pelo Claude Code a cada prompt. Se a leitura do JSONL de sessão ou do lock file for lenta (disco cheio, arquivo grande, race condition), bloqueia o processo e trava a renderização do status bar.

2. **Bug de design** — boxes adjacentes quebram o alinhamento em alguns terminais (especialmente com fontes que tratam caracteres unicode de borda `╭╰│` com largura diferente). O `joinBoxes()` atual concatena strings assumindo largura fixa, o que falha em terminais com DPI/escala diferentes.

3. **Falso positivo no ⬡** — o lock file de injeção de contexto (`jarvis-memory-<sessionId>.lock`) às vezes persiste de sessões anteriores ou é escrito antes da query Neo4j retornar dados reais, fazendo o ícone aparecer sem contexto ter sido efetivamente injetado.

**Otimizações propostas:**

- Tornar a leitura do JSONL de sessão **assíncrona com timeout** — se demorar mais de 200ms, renderiza com dados do cache anterior em vez de travar
- Reescrever `joinBoxes()` usando **largura de caractere real** (`string-width` ou medição manual) para garantir alinhamento correto em qualquer terminal
- Validar o lock file **verificando se o conteúdo foi gravado após a query Neo4j retornar** (timestamp + flag de sucesso) — elimina o falso positivo
- Adicionar cache em memória do estado da sessão para evitar releitura de arquivo a cada `--line`

---

## [FEATURE] Testes automatizados

Implementar cobertura de testes automatizados em todo o projeto — hoje o projeto não tem nenhum teste, o que torna difícil garantir que mudanças não quebram comportamentos existentes.

**Motivação:** com a statusline sendo chamada a cada prompt do Claude Code, qualquer regressão afeta diretamente a experiência do usuário. Com os guards de pré-requisito recém adicionados e a complexidade crescente do grafo Neo4j, testes se tornam essenciais para evoluir com segurança.

**Escopo proposto:**

*Unit tests (`src/`)* — Jest ou Node test runner nativo:
- `calculator.js` — aggregateStats, aggregateSession com fixtures de JSONL
- `reader.js` — parseamento de sessão, detecção de sessionId, fallback sem arquivo
- `statusline.js` — renderLine com estados: sem dados, com sessão, com trigger off/session/prompt, com lock file presente/ausente/stale
- `bin/jarvis.js` — checkSetupDone, checkMcpRegistered, checkNeo4jRunning com mocks de fs e execSync

*Integration tests (`src/memory/`)* — com Neo4j em Docker (test container):
- `neo4j-client.js` — runQuery, runWriteQuery, closeDriver
- `mcp-server.js` — handleSaveProject, handleQueryProject, handleListProjects, handleSearchConcept
- `query-by-path.js` — com lock file, sem lock file, modo session vs prompt, projeto não indexado

*E2E / smoke tests:*
- `jarvis --usage` retorna saída válida com dados mockados
- `jarvis --line` retorna exatamente 3 linhas (os 3 boxes)
- `jarvis --trigger off` sem Neo4j não lança erro
- `jarvis --trigger session` sem Neo4j lança erro com mensagem correta

**Stack sugerida:**
- Test runner: Node.js `--test` nativo (sem dependência extra) ou Jest
- Mocks de fs/child_process: `mock-fs` ou spies nativos do Node test runner
- Neo4j para integration tests: `testcontainers` (sobe container Docker isolado por suite)
- CI: GitHub Actions rodando `npm test` em cada push

---

## [IDEA] Status bar: tokens gastos por turno

Exibir na status bar a quantidade de tokens consumidos no último turno (da última pergunta até o fim da resposta).

**Motivação:** visibilidade em tempo real do custo de cada interação, sem precisar abrir o dashboard completo.

**Como pode funcionar:**
- O hook `PostToolUse` ou `Stop` captura o delta de tokens do turno via `CLAUDE_USAGE` ou leitura do JSONL de sessão
- A statusline exibe um box adicional com o valor: ex. `[ ↑ 1.2K → 4.8K ]` (input → output do turno)
- Pode ser toggle: `jarvis --turntokens on|off`

---

## [IDEA] Statusline themes

Paleta de cores configurável para os boxes da status bar.

**Motivação:** o visual atual é fixo; usuários com terminais claros ou preferências diferentes não conseguem customizar.

**Como pode funcionar:**
- `jarvis --theme <nome>` — aplica um tema salvo em `~/.claude/jarvis-theme.json`
- Temas built-in: `default` (atual), `minimal`, `nord`, `solarized`
- Configura cores de borda, fill da barra de progresso e ícones via JSON
- `jarvis --theme custom` abre um wizard interativo para criar o próprio tema

---

## [IDEA] update-memory baseado em commits do GitHub

Reformular o fluxo de `/create-memory` e `/update-memory` para usar o histórico de commits como âncora de atualização incremental do grafo.

**Motivação:** o `/update-memory` atual depende de `git diff` local, o que exige que o repositório esteja disponível e atualizado na máquina. Usando o MCP do GitHub é possível fazer atualizações precisas e rastreáveis a partir de qualquer estado.

**Fluxo proposto:**

`/create-memory`:
1. Indexa o repositório normalmente no grafo Neo4j
2. Ao final, grava o hash do commit mais recente da branch principal como metadado no grafo (nó `Repository { last_indexed_commit }`)

`/update-memory`:
1. Lê o `last_indexed_commit` gravado no grafo
2. Via MCP do GitHub, busca todos os commits e diffs entre esse hash e o HEAD atual
3. Atualiza apenas os nós/arestas afetados pelas mudanças detectadas (arquivos modificados, funções alteradas, conceitos novos)
4. Grava o novo HEAD como `last_indexed_commit` para servir de âncora na próxima execução

**Benefícios:**
- Atualizações incrementais e precisas — só o que mudou
- Funciona mesmo se o repo local não estiver na última versão
- Histórico de indexações rastreável dentro do próprio grafo

---

## [IDEA] Comando para configurar arquitetura de conversação entre agentes

Definir como o Claude se estrutura internamente (subagentes, orquestradores, paralelismo) para minimizar uso de tokens e pressão na janela de contexto.

**Motivação:** conversas longas e tarefas complexas consomem contexto rapidamente. Uma arquitetura pré-definida (ex: agent compacto + orquestrador leve) pode reduzir custo significativamente.

**Como pode funcionar:**
- Novo slash command `/configure-agents` ou flag `jarvis --agents`
- Wizard interativo para escolher estratégia: `single` / `orchestrator+subagents` / `parallel`
- Gera ou atualiza um bloco no `CLAUDE.md` do projeto com instruções de arquitetura
- Integra com `strategic-compact` e `session-wrap` skills existentes

---

## [IDEA] /configure-memory: onboarding por persona para gerar arquitetura ideal

Reformular o fluxo inicial do `/configure-memory` para começar com um questionário inteligente que identifica o perfil e o contexto do usuário antes de propor qualquer schema — em vez de fazer perguntas genéricas sobre o grafo, o wizard entende primeiro *quem é a pessoa* e *com o que ela trabalha*, e a partir disso gera a arquitetura mais adequada.

**Motivação:** o schema ideal varia radicalmente por perfil:
- Uma pessoa de **produto** precisa rastrear features, jornadas, personas, hipóteses e métricas — não imports, padrões de design ou dependências de módulos
- Um **engenheiro backend** precisa de módulos, serviços, endpoints, contratos de API, dependências e padrões arquiteturais
- Um **engenheiro frontend** precisa de componentes, rotas, estados, design tokens e integrações com APIs
- Um **data scientist** precisa de datasets, pipelines, modelos, experimentos e métricas de avaliação
- Um **tech lead** precisa de uma visão híbrida: domínios de negócio + times + decisões técnicas (ADRs)

**Como pode funcionar:**

Fase 1 — Identificação de perfil (3-5 perguntas objetivas):
```
1. Como você se descreveria? (produto / engenharia / dados / gestão / outro)
2. Com quantos repositórios/projetos você trabalha em paralelo?
3. O que você mais precisa lembrar entre sessões?
   a) Onde as coisas estão no código
   b) Decisões técnicas e por quê foram tomadas
   c) Estado de features e hipóteses
   d) Quem faz o quê e quando
4. Há vocabulário específico do seu domínio que o Claude erra frequentemente?
5. Prefere contexto mais compacto (menos nós, mais síntese) ou mais detalhado?
```

Fase 2 — Seleção de template base:
Com base nas respostas, seleciona um dos templates pré-definidos como ponto de partida:
- `engineering-backend` — Project → Module → File → Concept → Pattern → Dependency
- `engineering-frontend` — Project → Component → Route → State → API Integration
- `product` — Initiative → Feature → Persona → Hypothesis → Metric → Status
- `data` — Project → Pipeline → Dataset → Model → Experiment → Metric
- `tech-lead` — Domain → Team → Service → Decision (ADR) → Dependency
- `minimal` — Project → Module → Concept (apenas o essencial)

Fase 3 — Refinamento contextual:
Pergunta apenas o que é específico daquele contexto (vocabulário do domínio, exclusões, granularidade preferida).

**Referências de schema para implementação:**
- Grafos de conhecimento orientados a domínio (Domain-Driven Graph Design)
- Padrão "Context Graph" do Google Knowledge Graph para entidades e relações semânticas
- Modelo de grafo de projeto do Notion AI (entidades + propriedades + relações hierárquicas)
- Neo4j Graph Data Modeling guidelines — evitar supernós, preferir relações ricas a propriedades genéricas

**Resultado:** um `MEMORY_ARCHITECTURE.md` gerado sob medida, com schema, regras de indexação e critérios de qualidade alinhados com o que aquela persona realmente precisa lembrar — sem ruído técnico para quem não precisa, sem perda de detalhe para quem precisa.

---

## [IDEA] Grafo multi-camada: persona como categoria raiz

Evoluir o modelo do grafo para suportar **múltiplas categorias de persona ativas ao mesmo tempo**, onde cada categoria é uma camada independente de schema que coexiste no mesmo grafo — permitindo que um tech lead que também desenvolve faça perguntas de engenharia e de liderança a partir do mesmo contexto.

**Motivação:** profissionais com papéis híbridos (tech lead + dev, founder + engenheiro, PM técnico) hoje precisariam escolher uma arquitetura ou criar dois grafos separados. Com camadas, o mesmo grafo responde a `"onde está o código de autenticação?"` e `"qual foi a decisão de migrar para microserviços?"` sem conflito de schema.

**Modelo proposto — nó `PersonaLayer` como raiz:**

```
(user:User)-[:HAS_LAYER]->(layer:PersonaLayer {type: "engineering"})
(user:User)-[:HAS_LAYER]->(layer:PersonaLayer {type: "tech-lead"})

(layer:PersonaLayer {type: "engineering"})-[:HAS_PROJECT]->(project:Project)
  └─> Module → File → Concept → Pattern

(layer:PersonaLayer {type: "tech-lead"})-[:HAS_DOMAIN]->(domain:Domain)
  └─> Team → Decision (ADR) → Service → Dependency
```

Cada camada tem seu próprio schema, suas próprias regras de indexação e seus próprios critérios de qualidade — definidos pelo `MEMORY_ARCHITECTURE.md` de cada layer.

**Como funciona na prática:**
- No `/configure-memory`, o usuário seleciona **uma ou mais** categorias
- Cada categoria ativa gera um bloco de schema próprio no `MEMORY_ARCHITECTURE.md`
- O `/create-memory` e `/update-memory` indexam dentro da camada correta
- As queries do MCP recebem um parâmetro opcional `layer` — sem ele, buscam em todas as camadas
- O contexto injetado no `UserPromptSubmit` pode mencionar a camada relevante para o projeto atual

**Camadas disponíveis (expansível):**

| Layer | Nós principais | Casos de uso |
|---|---|---|
| `engineering` | Project, Module, File, Concept, Pattern | Onde está X no código, como Y funciona |
| `tech-lead` | Domain, Team, Decision, Service | Decisões arquiteturais, ownership, ADRs |
| `product` | Initiative, Feature, Persona, Hypothesis | Estado de features, contexto de produto |
| `data` | Pipeline, Dataset, Model, Experiment | Fluxo de dados, experimentos, métricas |
| `ops` | Service, Infra, Alert, Runbook | Incidentes, deploys, on-call |

**Benefício chave:** o grafo cresce com o usuário. Um dev que vira tech lead adiciona a camada `tech-lead` sem perder nada do que já estava indexado em `engineering`.
