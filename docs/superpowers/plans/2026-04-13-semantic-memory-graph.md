# Semantic Memory Graph Implementation Plan

> **For agentic workers:** REQUIRED: Use subagent-driven-development (if subagents available) or executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um MCP server embutido no pacote que indexa repositórios no Neo4j e permite ao Claude consultar conhecimento estruturado sobre projetos durante sessões.

**Architecture:** O pacote ganha um módulo `src/memory/` com cliente Neo4j, definição de schema e MCP server. Dois slash commands (`.claude/commands/`) orquestram o setup do ambiente e a indexação de repositórios. O Claude Code registra o MCP server no `~/.claude/settings.json` e chama suas tools autonomamente.

**Tech Stack:** Node.js ESM, `neo4j-driver@6.0.1`, `@modelcontextprotocol/sdk@1.29.0`, Docker (Neo4j container), Claude Code custom commands.

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `package.json` | Modificar | Adicionar dependências + bin `claude-memory` |
| `bin/claude-memory.js` | Criar | Entry point do MCP server |
| `src/memory/neo4j-client.js` | Criar | Conexão com Neo4j, leitura de config, queries Cypher |
| `src/memory/schema.js` | Criar | Constraints e indexes do Neo4j, definição canônica dos nós/relações |
| `src/memory/mcp-server.js` | Criar | MCP server com as 5 tools expostas ao Claude |
| `.claude/commands/setup-memory.md` | Criar | Slash command `/setup-memory` |
| `.claude/commands/memory-index.md` | Criar | Slash command `/memory-index` |

---

## Chunk 1: Foundation — Dependências, Config e Neo4j Client

### Task 1: Instalar dependências e criar bin entry point

**Files:**
- Modify: `package.json`
- Create: `bin/claude-memory.js`

- [ ] **Step 1: Instalar dependências**

```bash
cd /home/patara/Desktop/claude-status-bar
npm install neo4j-driver @modelcontextprotocol/sdk
```

Expected: ambos aparecem em `node_modules/` e `package.json` atualizado.

- [ ] **Step 2: Adicionar bin `claude-memory` no package.json**

Em `package.json`, dentro do objeto `"bin"`, adicionar:
```json
"bin": {
  "claude-usage": "bin/claude-usage.js",
  "claude-memory": "bin/claude-memory.js"
}
```

E adicionar `"bin/"` em `"files"` (já está lá).

- [ ] **Step 3: Criar `bin/claude-memory.js`**

```js
#!/usr/bin/env node
import { startServer } from '../src/memory/mcp-server.js';
startServer();
```

- [ ] **Step 4: Verificar que o entry point é executável**

```bash
chmod +x bin/claude-memory.js
node bin/claude-memory.js --help 2>&1 || true
```

Expected: o processo inicia (vai falhar pois mcp-server.js ainda não existe, mas sem erro de sintaxe no bin).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json bin/claude-memory.js
git commit -m "feat: add neo4j-driver, mcp sdk deps and claude-memory bin"
```

---

### Task 2: Criar neo4j-client.js

**Files:**
- Create: `src/memory/neo4j-client.js`

- [ ] **Step 1: Criar o arquivo**

```js
// src/memory/neo4j-client.js
import neo4j from 'neo4j-driver';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CONFIG_PATH = join(homedir(), '.claude-memory.json');

const DEFAULT_CONFIG = {
  neo4j: {
    uri: 'bolt://localhost:7687',
    user: 'neo4j',
    password: 'claudememory',
  },
};

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return DEFAULT_CONFIG;
  }
}

let _driver = null;

export function getDriver() {
  if (_driver) return _driver;
  const config = loadConfig();
  const { uri, user, password } = config.neo4j;
  _driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  return _driver;
}

export async function closeDriver() {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

export async function runQuery(cypher, params = {}) {
  const driver = getDriver();
  const session = driver.session();
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}

export async function runWriteQuery(cypher, params = {}) {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}

export async function testConnection() {
  try {
    await runQuery('RETURN 1 AS ok');
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Verificar sintaxe**

```bash
node --input-type=module <<'EOF'
import './src/memory/neo4j-client.js';
console.log('ok');
EOF
```

Expected: `ok` (sem erro de sintaxe; a conexão com Neo4j vai falhar pois o container não está rodando — isso é esperado).

- [ ] **Step 3: Commit**

```bash
git add src/memory/neo4j-client.js
git commit -m "feat: add neo4j client with config loader and query helpers"
```

---

### Task 3: Criar schema.js

**Files:**
- Create: `src/memory/schema.js`

- [ ] **Step 1: Criar o arquivo**

```js
// src/memory/schema.js
import { runWriteQuery } from './neo4j-client.js';

// Constraints e indexes para garantir unicidade e performance
const CONSTRAINTS = [
  'CREATE CONSTRAINT project_unique IF NOT EXISTS FOR (p:Project) REQUIRE (p.name, p.branch) IS UNIQUE',
  'CREATE CONSTRAINT module_unique IF NOT EXISTS FOR (m:Module) REQUIRE (m.path, m.projectName, m.branch) IS UNIQUE',
  'CREATE CONSTRAINT file_unique IF NOT EXISTS FOR (f:File) REQUIRE (f.path, m.projectName, m.branch) IS UNIQUE',
  'CREATE CONSTRAINT pattern_unique IF NOT EXISTS FOR (pat:Pattern) REQUIRE pat.name IS UNIQUE',
  'CREATE CONSTRAINT concept_unique IF NOT EXISTS FOR (c:Concept) REQUIRE (c.name, c.projectName) IS UNIQUE',
];

export async function applySchema() {
  for (const cypher of CONSTRAINTS) {
    try {
      await runWriteQuery(cypher);
    } catch (err) {
      // Ignora erros de constraint já existente
      if (!err.message?.includes('already exists')) throw err;
    }
  }
}

// Estrutura canônica de um projeto para save/query
export const PROJECT_SHAPE = {
  // project: { name, path, description, language, branch, createdAt }
  // modules: [{ name, path, domain, files: [...], patterns: [...], concepts: [...], dependsOn: [...] }]
  // dependencies: [{ name, version, type }]
  // patterns: [{ name, description }]
};
```

- [ ] **Step 2: Verificar sintaxe**

```bash
node --input-type=module <<'EOF'
import './src/memory/schema.js';
console.log('ok');
EOF
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add src/memory/schema.js
git commit -m "feat: add neo4j schema constraints and project shape definition"
```

---

## Chunk 2: MCP Server com as 5 Tools

### Task 4: Criar mcp-server.js

**Files:**
- Create: `src/memory/mcp-server.js`

- [ ] **Step 1: Criar o arquivo**

```js
// src/memory/mcp-server.js
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { runQuery, runWriteQuery, testConnection, closeDriver } from './neo4j-client.js';
import { applySchema } from './schema.js';

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list-projects',
    description: 'Lista todos os projetos e branches indexados no grafo de memória.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'query-project',
    description: 'Retorna resumo completo de um projeto: módulos, padrões, conceitos e dependências.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome do projeto' },
        branch: { type: 'string', description: 'Branch (main ou qa)', enum: ['main', 'qa'] },
      },
      required: ['name', 'branch'],
    },
  },
  {
    name: 'search-concept',
    description: 'Busca módulos e arquivos relacionados a um conceito de negócio.',
    inputSchema: {
      type: 'object',
      properties: {
        concept: { type: 'string', description: 'Conceito a buscar (ex: "pedido", "autenticação")' },
        projectName: { type: 'string', description: 'Nome do projeto (opcional)' },
      },
      required: ['concept'],
    },
  },
  {
    name: 'get-module-detail',
    description: 'Retorna detalhes completos de um módulo específico: arquivos, padrões, conceitos, dependências.',
    inputSchema: {
      type: 'object',
      properties: {
        moduleName: { type: 'string', description: 'Nome do módulo' },
        projectName: { type: 'string', description: 'Nome do projeto' },
        branch: { type: 'string', description: 'Branch (main ou qa)', enum: ['main', 'qa'] },
      },
      required: ['moduleName', 'projectName', 'branch'],
    },
  },
  {
    name: 'save-project',
    description: 'Salva ou atualiza o entendimento completo de um projeto no grafo. Use após aprovação do usuário no /memory-index.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'object',
          description: 'Dados do projeto',
          properties: {
            name: { type: 'string' },
            path: { type: 'string' },
            description: { type: 'string' },
            language: { type: 'string' },
            branch: { type: 'string' },
          },
          required: ['name', 'path', 'language', 'branch'],
        },
        modules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              path: { type: 'string' },
              domain: { type: 'string' },
              files: { type: 'array', items: { type: 'object' } },
              patterns: { type: 'array', items: { type: 'string' } },
              concepts: { type: 'array', items: { type: 'string' } },
              dependsOn: { type: 'array', items: { type: 'string' } },
            },
            required: ['name', 'path', 'domain'],
          },
        },
        dependencies: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
              type: { type: 'string', enum: ['external', 'internal'] },
            },
          },
        },
        patterns: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
      required: ['project'],
    },
  },
];

// ── Tool handlers ─────────────────────────────────────────────────────────────

async function handleListProjects() {
  const records = await runQuery(`
    MATCH (p:Project)
    RETURN p.name AS name, p.branch AS branch, p.description AS description, p.language AS language
    ORDER BY p.name, p.branch
  `);
  const projects = records.map(r => ({
    name: r.get('name'),
    branch: r.get('branch'),
    description: r.get('description'),
    language: r.get('language'),
  }));
  return projects.length
    ? `Projetos indexados:\n${projects.map(p => `• ${p.name} [${p.branch}] — ${p.language}${p.description ? ': ' + p.description : ''}`).join('\n')}`
    : 'Nenhum projeto indexado ainda. Use /memory-index para indexar um repositório.';
}

async function handleQueryProject({ name, branch }) {
  const records = await runQuery(`
    MATCH (p:Project {name: $name, branch: $branch})
    OPTIONAL MATCH (p)-[:HAS_MODULE]->(m:Module)
    OPTIONAL MATCH (m)-[:HANDLES]->(c:Concept)
    OPTIONAL MATCH (m)-[:IMPLEMENTS]->(pat:Pattern)
    RETURN p, collect(DISTINCT m) AS modules, collect(DISTINCT c.name) AS concepts, collect(DISTINCT pat.name) AS patterns
  `, { name, branch });

  if (!records.length) {
    return `Projeto "${name}" [${branch}] não encontrado. Use list-projects para ver os projetos disponíveis.`;
  }

  const r = records[0];
  const p = r.get('p').properties;
  const modules = r.get('modules').map(m => m.properties);
  const concepts = [...new Set(r.get('concepts'))].filter(Boolean);
  const patterns = [...new Set(r.get('patterns'))].filter(Boolean);

  return [
    `# ${p.name} [${p.branch}]`,
    p.description ? `**Descrição:** ${p.description}` : '',
    `**Linguagem:** ${p.language}`,
    `**Path:** ${p.path}`,
    '',
    `## Módulos (${modules.length})`,
    modules.map(m => `• **${m.name}** — ${m.domain} (${m.path})`).join('\n') || 'Nenhum',
    '',
    `## Conceitos de Negócio`,
    concepts.length ? concepts.map(c => `• ${c}`).join('\n') : 'Nenhum',
    '',
    `## Padrões`,
    patterns.length ? patterns.map(p => `• ${p}`).join('\n') : 'Nenhum',
  ].filter(l => l !== undefined).join('\n');
}

async function handleSearchConcept({ concept, projectName }) {
  const cypher = projectName
    ? `MATCH (c:Concept)-[:RELATED_TO|<-[:HANDLES]-(m:Module)-[:CONTAINS]->(f:File)
       WHERE toLower(c.name) CONTAINS toLower($concept)
       MATCH (p:Project {name: $projectName})-[:HAS_MODULE]->(m)
       RETURN m.name AS module, m.domain AS domain, m.path AS modulePath, collect(f.path) AS files`
    : `MATCH (c:Concept)
       WHERE toLower(c.name) CONTAINS toLower($concept)
       MATCH (m:Module)-[:HANDLES]->(c)
       MATCH (p:Project)-[:HAS_MODULE]->(m)
       OPTIONAL MATCH (m)-[:CONTAINS]->(f:File)
       RETURN p.name AS project, p.branch AS branch, m.name AS module, m.domain AS domain, m.path AS modulePath, collect(f.path) AS files`;

  const records = await runQuery(cypher, { concept, projectName: projectName || '' });

  if (!records.length) {
    return `Nenhum módulo encontrado para o conceito "${concept}".`;
  }

  return records.map(r => {
    const prefix = projectName ? '' : `[${r.get('project')} / ${r.get('branch')}] `;
    return `${prefix}**${r.get('module')}** (${r.get('domain')}) — ${r.get('modulePath')}`;
  }).join('\n');
}

async function handleGetModuleDetail({ moduleName, projectName, branch }) {
  const records = await runQuery(`
    MATCH (p:Project {name: $projectName, branch: $branch})-[:HAS_MODULE]->(m:Module {name: $moduleName})
    OPTIONAL MATCH (m)-[:CONTAINS]->(f:File)
    OPTIONAL MATCH (m)-[:HANDLES]->(c:Concept)
    OPTIONAL MATCH (m)-[:IMPLEMENTS]->(pat:Pattern)
    OPTIONAL MATCH (m)-[:DEPENDS_ON]->(dep:Module)
    RETURN m, collect(DISTINCT f) AS files, collect(DISTINCT c.name) AS concepts,
           collect(DISTINCT pat.name) AS patterns, collect(DISTINCT dep.name) AS deps
  `, { moduleName, projectName, branch });

  if (!records.length) {
    return `Módulo "${moduleName}" não encontrado em ${projectName} [${branch}].`;
  }

  const r = records[0];
  const m = r.get('m').properties;
  const files = r.get('files').map(f => f.properties);
  const concepts = r.get('concepts').filter(Boolean);
  const patterns = r.get('patterns').filter(Boolean);
  const deps = r.get('deps').filter(Boolean);

  return [
    `# Módulo: ${m.name}`,
    `**Domínio:** ${m.domain}`,
    `**Path:** ${m.path}`,
    '',
    `## Arquivos (${files.length})`,
    files.map(f => `• ${f.path}${f.purpose ? ' — ' + f.purpose : ''}`).join('\n') || 'Nenhum',
    '',
    `## Conceitos`,
    concepts.length ? concepts.map(c => `• ${c}`).join('\n') : 'Nenhum',
    '',
    `## Padrões`,
    patterns.length ? patterns.map(p => `• ${p}`).join('\n') : 'Nenhum',
    '',
    `## Depende de`,
    deps.length ? deps.map(d => `• ${d}`).join('\n') : 'Nenhum',
  ].join('\n');
}

async function handleSaveProject({ project, modules = [], dependencies = [], patterns = [] }) {
  const createdAt = new Date().toISOString();

  // Upsert Project
  await runWriteQuery(`
    MERGE (p:Project {name: $name, branch: $branch})
    SET p.path = $path, p.description = $description, p.language = $language, p.createdAt = $createdAt
  `, { ...project, description: project.description || '', createdAt });

  // Upsert Patterns globais
  for (const pat of patterns) {
    await runWriteQuery(`
      MERGE (pat:Pattern {name: $name})
      SET pat.description = $description
      WITH pat
      MATCH (p:Project {name: $projectName, branch: $branch})
      MERGE (p)-[:USES_PATTERN]->(pat)
    `, { name: pat.name, description: pat.description || '', projectName: project.name, branch: project.branch });
  }

  // Upsert Dependencies
  for (const dep of dependencies) {
    await runWriteQuery(`
      MERGE (d:Dependency {name: $name, projectName: $projectName, branch: $branch})
      SET d.version = $version, d.type = $type
    `, { name: dep.name, version: dep.version || '', type: dep.type || 'external', projectName: project.name, branch: project.branch });
  }

  // Upsert Modules, Files, Concepts, Patterns, dependsOn
  for (const mod of modules) {
    await runWriteQuery(`
      MATCH (p:Project {name: $projectName, branch: $branch})
      MERGE (m:Module {path: $path, projectName: $projectName, branch: $branch})
      SET m.name = $name, m.domain = $domain
      MERGE (p)-[:HAS_MODULE]->(m)
    `, { projectName: project.name, branch: project.branch, name: mod.name, path: mod.path, domain: mod.domain });

    for (const file of (mod.files || [])) {
      await runWriteQuery(`
        MATCH (m:Module {path: $modulePath, projectName: $projectName, branch: $branch})
        MERGE (f:File {path: $filePath, projectName: $projectName, branch: $branch})
        SET f.name = $fileName, f.extension = $ext, f.purpose = $purpose
        MERGE (m)-[:CONTAINS]->(f)
      `, {
        modulePath: mod.path, projectName: project.name, branch: project.branch,
        filePath: file.path, fileName: file.name || file.path.split('/').pop(),
        ext: file.extension || file.path.split('.').pop(),
        purpose: file.purpose || '',
      });
    }

    for (const conceptName of (mod.concepts || [])) {
      await runWriteQuery(`
        MATCH (m:Module {path: $modulePath, projectName: $projectName, branch: $branch})
        MERGE (c:Concept {name: $name, projectName: $projectName})
        MERGE (m)-[:HANDLES]->(c)
      `, { modulePath: mod.path, projectName: project.name, branch: project.branch, name: conceptName });
    }

    for (const patternName of (mod.patterns || [])) {
      await runWriteQuery(`
        MATCH (m:Module {path: $modulePath, projectName: $projectName, branch: $branch})
        MERGE (pat:Pattern {name: $name})
        MERGE (m)-[:IMPLEMENTS]->(pat)
      `, { modulePath: mod.path, projectName: project.name, branch: project.branch, name: patternName });
    }
  }

  // Relações dependsOn (após todos os módulos existirem)
  for (const mod of modules) {
    for (const depName of (mod.dependsOn || [])) {
      await runWriteQuery(`
        MATCH (a:Module {name: $fromName, projectName: $projectName, branch: $branch})
        MATCH (b:Module {name: $toName, projectName: $projectName, branch: $branch})
        MERGE (a)-[:DEPENDS_ON]->(b)
      `, { fromName: mod.name, toName: depName, projectName: project.name, branch: project.branch });
    }
  }

  return `Projeto "${project.name}" [${project.branch}] indexado com sucesso. ${modules.length} módulos gravados.`;
}

// ── Server setup ──────────────────────────────────────────────────────────────

export async function startServer() {
  const server = new Server(
    { name: 'claude-memory', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      let text;
      switch (name) {
        case 'list-projects':      text = await handleListProjects(); break;
        case 'query-project':      text = await handleQueryProject(args); break;
        case 'search-concept':     text = await handleSearchConcept(args); break;
        case 'get-module-detail':  text = await handleGetModuleDetail(args); break;
        case 'save-project':       text = await handleSaveProject(args); break;
        default: throw new Error(`Tool desconhecida: ${name}`);
      }
      return { content: [{ type: 'text', text }] };
    } catch (err) {
      return { content: [{ type: 'text', text: `Erro: ${err.message}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGINT', async () => { await closeDriver(); process.exit(0); });
  process.on('SIGTERM', async () => { await closeDriver(); process.exit(0); });
}
```

- [ ] **Step 2: Verificar sintaxe**

```bash
node --input-type=module <<'EOF'
import './src/memory/mcp-server.js';
console.log('ok');
EOF
```

Expected: `ok` (sem erro de sintaxe; não vai conectar ao Neo4j pois container não está rodando).

- [ ] **Step 3: Verificar que o bin inicia sem crash de sintaxe**

```bash
timeout 2 node bin/claude-memory.js 2>&1 || true
```

Expected: processo inicia e aguarda stdin (comportamento normal de MCP server via stdio). Sem stack traces de sintaxe.

- [ ] **Step 4: Commit**

```bash
git add src/memory/mcp-server.js
git commit -m "feat: add MCP server with 5 tools (save, query, search, detail, list)"
```

---

## Chunk 3: Slash Commands

### Task 5: Criar `/setup-memory`

**Files:**
- Create: `.claude/commands/setup-memory.md`

- [ ] **Step 1: Criar o arquivo**

```markdown
# Setup Memory — Preparar ambiente Neo4j e MCP Server

Você vai configurar o ambiente de memória semântica para o Claude Code. Siga este fluxo exato, passo a passo.

## REGRA GLOBAL
Se travar em qualquer etapa — erro inesperado, permissão negada, output estranho — **pare e pergunte ao usuário o que deve ser feito** antes de continuar.

---

## Passo 1 — Verificar Docker

Execute:
```bash
docker --version
```

**Se não instalado:**
- Pergunte: "Docker não encontrado. Posso tentar instalar agora? (requer sudo)"
- Se aprovado, detecte o OS (`uname -a` ou `cat /etc/os-release`) e instale:
  - Ubuntu/Debian: `sudo apt-get update && sudo apt-get install -y docker.io`
  - Fedora/RHEL: `sudo dnf install -y docker`
  - macOS: instrua a instalar Docker Desktop manualmente e aguarde confirmação
  - Se a instalação falhar: informe o erro, instrua instalação manual via https://docs.docker.com/get-docker/ e aguarde o usuário confirmar que instalou antes de continuar

Execute:
```bash
docker info
```

**Se daemon não rodando:**
- Pergunte: "Docker está instalado mas não está rodando. Posso iniciar? (requer sudo)"
- Se aprovado: `sudo systemctl start docker` (Linux) ou instrua a abrir Docker Desktop (macOS)
- Se falhar: pergunte ao usuário o que fazer

---

## Passo 2 — Verificar container Neo4j

Execute:
```bash
docker ps -a --filter name=claude-memory --format "{{.Status}}"
```

- Se retornar `Up ...`: container já está rodando → **pule para o Passo 4**
- Se retornar `Exited ...`: execute `docker start claude-memory` e aguarde 10s
- Se não retornar nada: siga para o Passo 3

---

## Passo 3 — Subir Neo4j (primeira vez)

Execute:
```bash
docker run -d \
  --name claude-memory \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/claudememory \
  --restart unless-stopped \
  neo4j:latest
```

Aguarde Neo4j estar pronto fazendo polling (até 60s):
```bash
for i in $(seq 1 12); do
  docker exec claude-memory cypher-shell -u neo4j -p claudememory "RETURN 1" 2>/dev/null && break
  echo "Aguardando Neo4j... ($i/12)"
  sleep 5
done
```

Se não ficar pronto em 60s: pergunte ao usuário o que fazer.

---

## Passo 4 — Registrar MCP Server

Descubra o caminho absoluto do `claude-memory` bin:
```bash
which claude-memory || node -e "console.log(require.resolve('@gabrihhh/claude-usage/bin/claude-memory.js'))" 2>/dev/null || echo "not-found"
```

Se não encontrar, use o caminho local do projeto atual:
```bash
realpath bin/claude-memory.js
```

Leia o arquivo `~/.claude/settings.json`. Se não existir, use `{}`.

Adicione ou atualize a chave `mcpServers.claude-memory`:
```json
{
  "mcpServers": {
    "claude-memory": {
      "command": "node",
      "args": ["<CAMINHO_ABSOLUTO_DO_BIN>"]
    }
  }
}
```

Preserve todas as outras chaves existentes no arquivo. Salve o arquivo.

---

## Passo 5 — Confirmação

Informe ao usuário:
- "Neo4j rodando em http://localhost:7474 (interface web) e bolt://localhost:7687"
- "MCP server `claude-memory` registrado em ~/.claude/settings.json"
- "**Reinicie o Claude Code** para que o MCP server seja ativado"
- "Após reiniciar, use `/memory-index` para indexar seu primeiro repositório"
```

- [ ] **Step 2: Verificar que o arquivo existe e está legível**

```bash
cat .claude/commands/setup-memory.md | head -5
```

Expected: primeiras linhas do arquivo.

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/setup-memory.md
git commit -m "feat: add /setup-memory slash command"
```

---

### Task 6: Criar `/memory-index`

**Files:**
- Create: `.claude/commands/memory-index.md`

- [ ] **Step 1: Criar o arquivo**

```markdown
# Memory Index — Indexar Repositório no Grafo de Memória

Você vai analisar o repositório atual de forma exaustiva e indexar seu entendimento no Neo4j. **Não grave nada sem aprovação explícita do usuário.**

## REGRA GLOBAL
- Se travar em qualquer ponto (dúvida técnica, conceitual, arquivo ilegível, ambiguidade) → **pare e pergunte ao usuário** → continue após a resposta
- Não há limite de perguntas. Prefira perguntar a gravar algo errado.
- Só chame a tool `save-project` após o usuário dizer explicitamente "pode salvar" ou equivalente.

---

## Passo 0 — Seleção de Branch

Pergunte: **"Deseja indexar o branch `main` ou `qa`?"**

Após a resposta, execute:
```bash
git checkout <branch>
git pull origin <branch>
```

Se algum comando falhar (ex: branch não existe, conflitos), pergunte ao usuário o que fazer antes de continuar.

Confirme: `git branch --show-current` deve mostrar o branch escolhido.

---

## Passo 1 — Descoberta Inicial

Execute os seguintes comandos para entender a estrutura geral:

```bash
# Estrutura de diretórios (excluindo node_modules, .git, dist)
find . -type f \( -name "*.json" -o -name "*.toml" -o -name "*.yaml" -o -name "*.yml" \) \
  ! -path "*/node_modules/*" ! -path "*/.git/*" ! -path "*/dist/*" | head -30

# Diretórios de primeiro nível
ls -la

# Manifesto principal
cat package.json 2>/dev/null || cat composer.json 2>/dev/null || cat pyproject.toml 2>/dev/null || echo "Nenhum manifesto padrão encontrado"
```

Com base no output:
- Identifique a linguagem principal e framework
- Mapeie os diretórios de primeiro nível como candidatos a módulos
- Liste as dependências principais

Se a linguagem ou framework não for óbvio, pergunte ao usuário.

---

## Passo 2 — Análise Profunda

Para cada diretório candidato a módulo identificado no Passo 1:

1. Liste os arquivos:
```bash
find <diretório> -type f ! -path "*/node_modules/*" ! -path "*/.git/*"
```

2. Leia os arquivos mais relevantes (entry points, services, controllers, models, routers):
   - Priorize arquivos `.js`, `.ts`, `.py`, `.php`, `.go` etc.
   - Ignore arquivos binários, lock files, arquivos gerados

3. Para cada arquivo lido, identifique:
   - **Responsabilidade:** o que ele faz?
   - **Imports/Exports:** quais módulos ele usa ou expõe?
   - **Padrões:** Repository, Service Layer, MVC, Factory, etc.?
   - **Domínio de negócio:** a qual área de negócio pertence?

**A qualquer momento que não tiver certeza absoluta sobre qualquer uma dessas perguntas → pergunte ao usuário.**

Exemplos de perguntas válidas:
- "A pasta `src/oms/` é o módulo de gestão de pedidos?"
- "O arquivo `auth.service.js` implementa o padrão Service Layer ou é um simples utilitário?"
- "Qual é o domínio de negócio de `src/billing/`? Financeiro ou faturamento?"
- "Este arquivo `src/shared/` contém utilitários compartilhados entre módulos?"

---

## Passo 3 — Montagem do Mapa

Ao finalizar a análise, monte mentalmente (não grave ainda) a estrutura completa:

```
Projeto: <nome> [<branch>]
Linguagem: <linguagem>
Descrição: <descrição curta>

Módulos:
  - <nome> | Domínio: <domínio> | Path: <path>
    Arquivos: [lista]
    Padrões: [lista]
    Conceitos: [lista]
    Depende de: [outros módulos]

Padrões globais: [lista]
Dependências externas relevantes: [lista]
```

---

## Passo 4 — Apresentação para Aprovação

Apresente o mapa completo ao usuário de forma clara e legível.

Diga: **"Este é meu entendimento do projeto. Revise, corrija o que estiver errado, e quando estiver tudo certo me diga 'pode salvar'."**

Aguarde a resposta. Se o usuário corrigir algo:
- Atualize o mapa mentalmente
- Confirme as correções: "Entendido. Atualizei X para Y. Mais alguma correção?"
- Repita até o usuário aprovar

---

## Passo 5 — Gravação

Após aprovação explícita, chame a MCP tool `save-project` com o objeto completo:

```json
{
  "project": {
    "name": "<nome>",
    "path": "<path absoluto>",
    "description": "<descrição>",
    "language": "<linguagem>",
    "branch": "<branch>"
  },
  "modules": [
    {
      "name": "<nome>",
      "path": "<path>",
      "domain": "<domínio>",
      "files": [
        { "path": "<path>", "purpose": "<responsabilidade>" }
      ],
      "patterns": ["<padrão>"],
      "concepts": ["<conceito>"],
      "dependsOn": ["<nome de outro módulo>"]
    }
  ],
  "dependencies": [
    { "name": "<nome>", "version": "<versão>", "type": "external" }
  ],
  "patterns": [
    { "name": "<nome>", "description": "<descrição>" }
  ]
}
```

Após a tool retornar sucesso, informe:
**"Projeto `<nome>` [<branch>] indexado com sucesso no grafo de memória."**
```

- [ ] **Step 2: Verificar que o arquivo existe**

```bash
cat .claude/commands/memory-index.md | head -5
```

Expected: primeiras linhas do arquivo.

- [ ] **Step 3: Commit**

```bash
git add .claude/commands/memory-index.md
git commit -m "feat: add /memory-index slash command"
```

---

## Chunk 4: Atualizar package.json e publicar

### Task 7: Atualizar package.json e verificar tudo

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Adicionar bin claude-memory e garantir que files inclui os novos diretórios**

Verificar se `package.json` está correto após as mudanças anteriores:
```bash
cat package.json
```

O arquivo deve ter:
```json
{
  "bin": {
    "claude-usage": "bin/claude-usage.js",
    "claude-memory": "bin/claude-memory.js"
  },
  "files": [
    "bin/",
    "src/"
  ]
}
```

Se `files` não incluir `.claude/commands/`, isso é intencional — os slash commands são do projeto local, não distribuídos via npm.

- [ ] **Step 2: Smoke test do MCP server**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | timeout 3 node bin/claude-memory.js 2>/dev/null || true
```

Expected: JSON com as 5 tools listadas (ou timeout limpo sem crash — o Neo4j não precisa estar rodando para listar tools).

- [ ] **Step 3: Commit final**

```bash
git add package.json
git commit -m "feat: complete semantic memory graph implementation"
```

---

## Verificação End-to-End (manual, requer Docker)

Após implementar tudo, para verificar o sistema completo:

1. Abra uma nova sessão do Claude Code neste repositório
2. Execute `/setup-memory` — Neo4j deve subir e MCP registrado
3. Reinicie o Claude Code
4. Execute `/memory-index` — Claude deve analisar este próprio repositório, fazer perguntas, apresentar mapa e gravar
5. Em uma nova sessão, pergunte ao Claude algo sobre o projeto — ele deve chamar `query-project` autonomamente
