import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export const CONFIG_PATH = join(homedir(), '.claude', 'jarvis.json');

export function readConfig() {
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return {}; }
}

export function writeConfig(cfg) {
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}
