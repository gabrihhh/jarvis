import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { runQuery, runWriteQuery, closeDriver } from './neo4j-client.js';
import { queryByPath } from './query-by-path.js';

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
    name: 'query-by-path',
    description: 'Retorna o projeto indexado cujo path corresponde ao diretório informado. Use no início de cada sessão passando o cwd.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path absoluto do diretório atual (cwd)' },
      },
      required: ['path'],
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
    description: 'Retorna detalhes completos de um módulo: arquivos, padrões, conceitos, dependências.',
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
    description: 'Salva o entendimento completo de um projeto no grafo. Use após aprovação do usuário no /memory-index.',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'object',
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
  if (!projects.length) {
    return 'Nenhum projeto indexado ainda. Use /memory-index para indexar um repositório.';
  }
  return `Projetos indexados:\n${projects.map(p =>
    `• ${p.name} [${p.branch}] — ${p.language}${p.description ? ': ' + p.description : ''}`
  ).join('\n')}`;
}

async function handleQueryProject({ name, branch }) {
  const records = await runQuery(`
    MATCH (p:Project {name: $name, branch: $branch})
    OPTIONAL MATCH (p)-[:HAS_MODULE]->(m:Module)
    OPTIONAL MATCH (m)-[:HANDLES]->(c:Concept)
    OPTIONAL MATCH (m)-[:IMPLEMENTS]->(pat:Pattern)
    RETURN p, collect(DISTINCT m) AS modules,
           collect(DISTINCT c.name) AS concepts,
           collect(DISTINCT pat.name) AS patterns
  `, { name, branch });

  if (!records.length) {
    return `Projeto "${name}" [${branch}] não encontrado. Use list-projects para ver os disponíveis.`;
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
  let cypher, params;

  if (projectName) {
    cypher = `
      MATCH (p:Project {name: $projectName})-[:HAS_MODULE]->(m:Module)-[:HANDLES]->(c:Concept)
      WHERE toLower(c.name) CONTAINS toLower($concept)
      OPTIONAL MATCH (m)-[:CONTAINS]->(f:File)
      RETURN p.name AS project, p.branch AS branch,
             m.name AS module, m.domain AS domain, m.path AS modulePath,
             collect(f.path) AS files
    `;
    params = { concept, projectName };
  } else {
    cypher = `
      MATCH (m:Module)-[:HANDLES]->(c:Concept)
      WHERE toLower(c.name) CONTAINS toLower($concept)
      MATCH (p:Project)-[:HAS_MODULE]->(m)
      OPTIONAL MATCH (m)-[:CONTAINS]->(f:File)
      RETURN p.name AS project, p.branch AS branch,
             m.name AS module, m.domain AS domain, m.path AS modulePath,
             collect(f.path) AS files
    `;
    params = { concept };
  }

  const records = await runQuery(cypher, params);

  if (!records.length) {
    return `Nenhum módulo encontrado para o conceito "${concept}".`;
  }

  return records.map(r =>
    `[${r.get('project')} / ${r.get('branch')}] **${r.get('module')}** (${r.get('domain')}) — ${r.get('modulePath')}`
  ).join('\n');
}

async function handleGetModuleDetail({ moduleName, projectName, branch }) {
  const records = await runQuery(`
    MATCH (p:Project {name: $projectName, branch: $branch})-[:HAS_MODULE]->(m:Module {name: $moduleName})
    OPTIONAL MATCH (m)-[:CONTAINS]->(f:File)
    OPTIONAL MATCH (m)-[:HANDLES]->(c:Concept)
    OPTIONAL MATCH (m)-[:IMPLEMENTS]->(pat:Pattern)
    OPTIONAL MATCH (m)-[:DEPENDS_ON]->(dep:Module)
    RETURN m,
           collect(DISTINCT f) AS files,
           collect(DISTINCT c.name) AS concepts,
           collect(DISTINCT pat.name) AS patterns,
           collect(DISTINCT dep.name) AS deps
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
    SET p.path = $path, p.description = $description,
        p.language = $language, p.createdAt = $createdAt
  `, { ...project, description: project.description || '', createdAt });

  // Upsert global Patterns e relação com Project
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

  // Upsert Modules, Files, Concepts, Patterns
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
        modulePath: mod.path,
        projectName: project.name,
        branch: project.branch,
        filePath: file.path,
        fileName: file.name || file.path.split('/').pop(),
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

  // Relações dependsOn (após todos os módulos existirem no grafo)
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

// ── Server bootstrap ──────────────────────────────────────────────────────────

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
        case 'list-projects':     text = await handleListProjects(); break;
        case 'query-project':     text = await handleQueryProject(args); break;
        case 'query-by-path':     { const r = await queryByPath(args.path); text = r ?? `Nenhum projeto indexado encontrado para: ${args.path}`; break; }
        case 'search-concept':    text = await handleSearchConcept(args); break;
        case 'get-module-detail': text = await handleGetModuleDetail(args); break;
        case 'save-project':      text = await handleSaveProject(args); break;
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
