import { runWriteQuery } from './neo4j-client.js';

const CONSTRAINTS = [
  'CREATE CONSTRAINT project_unique IF NOT EXISTS FOR (p:Project) REQUIRE (p.name, p.branch) IS UNIQUE',
  'CREATE CONSTRAINT module_unique IF NOT EXISTS FOR (m:Module) REQUIRE (m.path, m.projectName, m.branch) IS UNIQUE',
  'CREATE CONSTRAINT file_unique IF NOT EXISTS FOR (f:File) REQUIRE (f.path, f.projectName, f.branch) IS UNIQUE',
  'CREATE CONSTRAINT pattern_unique IF NOT EXISTS FOR (pat:Pattern) REQUIRE pat.name IS UNIQUE',
  'CREATE CONSTRAINT concept_unique IF NOT EXISTS FOR (c:Concept) REQUIRE (c.name, c.projectName) IS UNIQUE',
];

export async function applySchema() {
  for (const cypher of CONSTRAINTS) {
    try {
      await runWriteQuery(cypher);
    } catch (err) {
      if (!err.message?.includes('already exists')) throw err;
    }
  }
}

// Estrutura canônica esperada pelo save-project
// project: { name, path, description, language, branch, createdAt }
// modules: [{ name, path, domain, files: [{ path, purpose }], patterns: [string], concepts: [string], dependsOn: [string] }]
// dependencies: [{ name, version, type }]
// patterns: [{ name, description }]
export const PROJECT_SHAPE = {};
