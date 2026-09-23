import { readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// Pricing per million tokens (USD) — keyed by model family prefix so new
// point releases (opus-4-8, opus-4-9…) are priced correctly without edits.
const PRICING = {
  'claude-opus':   { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  'claude-sonnet': { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  'claude-haiku':  { input:  0.25, output:  1.25, cacheRead: 0.025, cacheWrite:  0.30 },
  'default':       { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
};

// Native context window sizes per model family (prefix match).
const CONTEXT_WINDOWS = {
  'claude-opus':   200000,
  'claude-sonnet': 200000,
  'claude-haiku':  200000,
  'default':       200000,
};

// Models that support extended context (1M tokens)
const EXTENDED_CONTEXT = 1_000_000;

function baseWindow(model) {
  for (const [key, size] of Object.entries(CONTEXT_WINDOWS)) {
    if (key !== 'default' && model.startsWith(key)) return size;
  }
  return CONTEXT_WINDOWS.default;
}

/**
 * Returns the effective context window for a model string.
 *
 * Detection order (most reliable first):
 *   1. The model string itself carries the `[1m]` marker
 *      (e.g. Claude Code's per-session model id "claude-opus-4-8[1m]").
 *   2. ~/.claude/settings.json global default configures `[1m]` AND the
 *      configured family matches the model being measured.
 *   3. Native window for the family (200k).
 *
 * Step 1 resolves the ambiguity where the JSONL logs the same bare string
 * ("claude-opus-4-8") for both 200k and 1M sessions — the global settings
 * default can't tell a per-session `/model` override apart.
 */
export function getContextWindow(model) {
  const m = model || '';

  // 1) explicit per-session marker — authoritative
  if (m.includes('[1m]')) return EXTENDED_CONTEXT;

  // 2) global default from settings.json (fallback when the session model
  //    string is bare and can't self-report the extended window)
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
    const configured = settings.model || '';
    if (configured.includes('[1m]')) {
      const shortName = configured.replace(/\[.*\]/, '').trim();
      if (shortName && m.includes(shortName)) return EXTENDED_CONTEXT;
    }
  } catch { /* settings unreadable — use native window */ }

  return baseWindow(m);
}

function getPrice(model) {
  for (const [key, price] of Object.entries(PRICING)) {
    if (key !== 'default' && model.startsWith(key)) return price;
  }
  return PRICING.default;
}

export function calcCost(entry) {
  const price = getPrice(entry.model);
  const M = 1_000_000;
  return (
    (entry.inputTokens  / M) * price.input      +
    (entry.outputTokens / M) * price.output     +
    (entry.cacheReadTokens  / M) * price.cacheRead  +
    (entry.cacheWriteTokens / M) * price.cacheWrite
  );
}

export function totalTokens(entry) {
  return entry.inputTokens + entry.outputTokens + entry.cacheReadTokens + entry.cacheWriteTokens;
}

function withinDays(entry, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return entry.timestamp >= cutoff;
}

export function aggregateStats(entries) {
  const now = new Date();

  const monthly = entries.filter(e => withinDays(e, 30));
  const weekly  = entries.filter(e => withinDays(e, 7));
  const daily   = entries.filter(e => withinDays(e, 1));

  function sum(arr) {
    return arr.reduce((acc, e) => ({
      inputTokens:      acc.inputTokens      + e.inputTokens,
      outputTokens:     acc.outputTokens     + e.outputTokens,
      cacheReadTokens:  acc.cacheReadTokens  + e.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + e.cacheWriteTokens,
      cost:             acc.cost             + calcCost(e),
      count:            acc.count            + 1,
    }), { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, cost: 0, count: 0 });
  }

  const monthlyStats = sum(monthly);
  const weeklyStats  = sum(weekly);
  const dailyStats   = sum(daily);

  // total tokens for display
  monthlyStats.total = monthlyStats.inputTokens + monthlyStats.outputTokens + monthlyStats.cacheReadTokens + monthlyStats.cacheWriteTokens;
  weeklyStats.total  = weeklyStats.inputTokens  + weeklyStats.outputTokens  + weeklyStats.cacheReadTokens  + weeklyStats.cacheWriteTokens;
  dailyStats.total   = dailyStats.inputTokens   + dailyStats.outputTokens   + dailyStats.cacheReadTokens   + dailyStats.cacheWriteTokens;

  // dominant model
  const modelCount = {};
  for (const e of entries.slice(0, 50)) {
    modelCount[e.model] = (modelCount[e.model] || 0) + 1;
  }
  const dominantModel = Object.entries(modelCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'claude-sonnet-4-6';

  return { monthly: monthlyStats, weekly: weeklyStats, daily: dailyStats, dominantModel };
}

export function aggregateSession(entries, modelOverride = null) {
  if (!entries.length) return null;

  const last = entries[entries.length - 1];
  // Prefer the real per-session model id (from Claude Code's statusline stdin
  // payload) — it can carry the `[1m]` marker that the JSONL strips off.
  const model = modelOverride || last?.model || 'claude-sonnet-4-6';
  const contextWindow = getContextWindow(model);

  // last assistant turn shows cumulative context usage via cache tokens
  // We use the most recent entry's tokens as current context position
  const latestEntry = entries[entries.length - 1];
  if (!latestEntry) return null;

  // total tokens in last exchange approximates context usage
  const contextUsed = latestEntry.inputTokens + latestEntry.cacheReadTokens + latestEntry.cacheWriteTokens;

  return {
    model,
    contextUsed,
    contextWindow,
    percent: Math.min(100, Math.round((contextUsed / contextWindow) * 100)),
    turns: entries.length,
  };
}

export function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

export function getLastTurnTokens(entries) {
  if (!entries.length) return null;
  const last = entries[entries.length - 1];
  return {
    input:    last.inputTokens,
    history:  last.cacheReadTokens,
    cache:    last.cacheWriteTokens,
    response: last.outputTokens,
    total:    last.inputTokens + last.outputTokens + last.cacheReadTokens + last.cacheWriteTokens,
  };
}

export function formatCost(n) {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}
