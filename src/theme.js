import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export const THEME_PATH = join(homedir(), '.claude', 'jarvis-theme.json');

export const DEFAULT_COLORS = {
  context: '#22d3ee',
  trigger: '#f472b6',
  memory:  '#4ade80',
};

export const VALID_NAMES = Object.keys(DEFAULT_COLORS);

export function readTheme() {
  try {
    const raw = JSON.parse(readFileSync(THEME_PATH, 'utf8'));
    return { ...DEFAULT_COLORS, ...raw };
  } catch {
    return { ...DEFAULT_COLORS };
  }
}

export function writeTheme(theme) {
  writeFileSync(THEME_PATH, JSON.stringify(theme, null, 2));
}

export function isValidHex(value) {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}
