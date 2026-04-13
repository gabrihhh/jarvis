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
