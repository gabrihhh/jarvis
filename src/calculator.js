// Pricing per million tokens (USD) - April 2026
const PRICING = {
  'claude-opus-4-6':    { input: 15.00, output: 75.00, cacheRead: 1.50,  cacheWrite: 18.75 },
  'claude-sonnet-4-6':  { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
  'claude-haiku-4-5':   { input:  0.25, output:  1.25, cacheRead: 0.025, cacheWrite:  0.30 },
  'default':            { input:  3.00, output: 15.00, cacheRead: 0.30,  cacheWrite:  3.75 },
};

// Context window sizes per model
export const CONTEXT_WINDOWS = {
  'claude-opus-4-6':   200000,
  'claude-sonnet-4-6': 200000,
  'claude-haiku-4-5':  200000,
  'default':           200000,
};

function getPrice(model) {
  for (const [key, price] of Object.entries(PRICING)) {
    if (model.startsWith(key)) return price;
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

export function aggregateSession(entries) {
  if (!entries.length) return null;

  const last = entries[entries.length - 1];
  const model = last?.model || 'claude-sonnet-4-6';
  const contextWindow = CONTEXT_WINDOWS[model] || CONTEXT_WINDOWS.default;

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

export function formatCost(n) {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}
