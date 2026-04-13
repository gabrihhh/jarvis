# Semantic Memory Graph — Design Spec
**Date:** 2026-04-13  
**Project:** @gabrihhh/claude-usage (futuro rename)  
**Status:** Approved

---

## Overview

Adicionar um sistema de memória semântica baseado em grafo ao pacote, permitindo que o Claude Code indexe repositórios inteiros e consulte esse conhecimento autonomamente durante sessões via MCP server.

O objetivo é que o Claude tenha entendimento profundo e estruturado de projetos (arquitetura, módulos, domínios de negócio, padrões de código, dependências) sem precisar reanalisar o código a cada sessão.

---

## Arquitetura Geral

```
@gabrihhh/claude-usage
├── bin/
│   └── claude-usage.js               # entry point atual (stats)
├── src/
│   ├── [arquivos atuais de stats]
│   └── memory/
│       ├── mcp-server.js             # MCP server — expõe tools ao Claude
│       ├── neo4j-client.js           # conexão e queries Neo4j
│       ├── indexer.js                # lógica de análise de repositório
│       └── schema.js                 # definição de nós e relações do grafo
├── skills/
│   ├── setup-memory.md               # slash command /setup-memory
│   └── memory-index.md               # slash command /memory-index
└── package.json
```

**Novas dependências:**
- `neo4j-driver` — driver oficial Neo4j para Node.js
- `@modelcontextprotocol/sdk` — SDK para criar o MCP server

**Configuração de conexão** armazenada em `~/.claude-memory.json`:
```json
{
  "neo4j": {
    "uri": "bolt://localhost:7687",
    "user": "neo4j",
    "password": "claudememory"
  }
}
```

---

## Schema do Grafo (Neo4j)

### Nós

| Label | Propriedades |
|-------|-------------|
| `Project` | `name`, `path`, `description`, `language`, `branch`, `createdAt` |
| `Module` | `name`, `path`, `domain` |
| `File` | `path`, `name`, `extension`, `purpose` |
| `Pattern` | `name`, `description` |
| `Concept` | `name`, `description` |
| `Dependency` | `name`, `version`, `type` (internal/external) |

### Relações

```
(Project)-[:HAS_MODULE]->(Module)
(Module)-[:CONTAINS]->(File)
(File)-[:IMPORTS]->(Dependency)
(File)-[:IMPLEMENTS]->(Pattern)
(Module)-[:HANDLES]->(Concept)
(Module)-[:DEPENDS_ON]->(Module)
(Project)-[:USES_PATTERN]->(Pattern)
(Concept)-[:RELATED_TO]->(Concept)
```

### Snapshots por branch

QA e main são armazenados como nós `Project` separados, diferenciados pelo atributo `branch`:

```
(Project {name: "ecommerce", branch: "main"})
(Project {name: "ecommerce", branch: "qa"})
```

---

## Parte 1 — `/setup-memory`

Slash command (prompt) que instrui o Claude a preparar o ambiente completo.

### Fluxo

```
1. VERIFICAR DOCKER
   ├── Executa: docker --version
   ├── Se não instalado:
   │   ├── Pede permissão ao usuário para instalar
   │   ├── Com aprovação: instala via apt/brew/script oficial (detecta OS)
   │   └── Se falhar: instrui instalação manual, aguarda confirmação do usuário
   ├── Executa: docker info
   └── Se daemon não rodando:
       ├── Pede permissão para iniciar
       ├── Com aprovação: systemctl start docker (ou equivalente)
       └── Se falhar: instrui usuário, aguarda confirmação

2. VERIFICAR NEO4J
   ├── Checa container "claude-memory"
   ├── Se rodando: pula para passo 4
   └── Se parado: docker start claude-memory

3. SUBIR NEO4J (primeira vez)
   ├── docker run -d \
   │     --name claude-memory \
   │     -p 7474:7474 -p 7687:7687 \
   │     -e NEO4J_AUTH=neo4j/claudememory \
   │     neo4j:latest
   └── Polling em bolt://localhost:7687 até estar healthy

4. REGISTRAR MCP SERVER
   ├── Lê ~/.claude/settings.json
   ├── Adiciona entrada em mcpServers:
   │   {
   │     "claude-memory": {
   │       "command": "node",
   │       "args": ["<path>/src/memory/mcp-server.js"]
   │     }
   │   }
   └── Salva settings.json

5. CONFIRMAÇÃO
   ├── "Neo4j rodando em localhost:7474"
   └── "MCP server registrado — reinicie o Claude Code para ativar"
```

**Regra:** se travar em qualquer etapa, pergunta ao usuário o que fazer e continua.

---

## Parte 2 — `/memory-index`

Slash command (prompt) que instrui o Claude a analisar um repositório completo e indexá-lo no Neo4j.

### Fluxo

```
0. BRANCH SELECTION
   ├── Pergunta: "Indexar QA ou main?"
   ├── Executa: git checkout <branch> && git pull origin <branch>
   └── Confirma branch correto antes de prosseguir

1. DESCOBERTA
   ├── Lê estrutura de arquivos (tree)
   ├── Lê package.json / composer.json / pyproject.toml / etc.
   ├── Identifica linguagem, framework, padrões óbvios
   └── Mapeia diretórios de alto nível como candidatos a módulos

2. ANÁLISE PROFUNDA (por módulo/domínio)
   ├── Lê cada arquivo relevante
   ├── Mapeia imports, exports, responsabilidades
   ├── Identifica padrões de código (Repository, Service, MVC, etc.)
   └── Associa arquivos a domínios de negócio

3. LOOP DE DÚVIDAS (sem limite de perguntas)
   ├── Para qualquer incerteza → pergunta ao usuário
   │   ex: "src/oms/ é o módulo de gestão de pedidos?"
   │   ex: "O padrão aqui é Repository ou Service Layer?"
   ├── Se travar tecnicamente (binário, permissão, etc.) → pergunta → continua
   └── Só avança quando tem 100% de certeza em tudo

4. APRESENTAÇÃO PARA APROVAÇÃO
   ├── Exibe mapa completo:
   │   - Projeto e branch
   │   - Módulos encontrados com domínios
   │   - Padrões identificados
   │   - Conceitos de negócio mapeados
   │   - Dependências relevantes
   └── Aguarda "pode salvar" do usuário antes de prosseguir

5. GRAVAÇÃO
   ├── Chama MCP tool `save-project` com dados aprovados
   └── "Projeto X (branch: Y) indexado com sucesso"
```

**Regra:** em qualquer travamento técnico ou dúvida conceitual, pergunta ao usuário o que deve ser feito e continua.

---

## Parte 3 — MCP Server

Processo Node.js registrado no `~/.claude/settings.json`. O Claude Code o mantém ativo e chama suas tools autonomamente durante as sessões.

### Tools

| Tool | Input | Descrição |
|------|-------|-----------|
| `save-project` | objeto completo do projeto | Grava nós e relações no Neo4j via transação |
| `query-project` | `{name, branch}` | Retorna resumo completo do projeto |
| `search-concept` | `{concept, projectName}` | Busca módulos/arquivos por conceito de negócio |
| `get-module-detail` | `{moduleName, projectName, branch}` | Detalha um módulo específico |
| `list-projects` | — | Lista todos os projetos e branches indexados |

### Comportamento durante sessões

O Claude decide autonomamente quando chamar as tools:

- Ao abrir um repo → `query-project` para ter contexto geral
- Ao mencionar um domínio ("módulo de login") → `search-concept`
- Ao implementar feature em área específica → `get-module-detail` antes de escrever código

Não há injeção automática de contexto — o Claude usa as tools quando julgar relevante, mantendo o contexto cirúrgico e sob demanda.

---

## Critérios de Sucesso

- [ ] `/setup-memory` sobe Neo4j via Docker e registra MCP server sem intervenção manual além de aprovações de permissão
- [ ] `/memory-index` analisa repositório completo, itera perguntas sem limite, e só grava após aprovação do usuário
- [ ] MCP server responde queries do Claude com dados estruturados do grafo
- [ ] QA e main são armazenados e consultados de forma independente
- [ ] O Claude utiliza o contexto do grafo durante sessões sem precisar ser instruído a fazê-lo
