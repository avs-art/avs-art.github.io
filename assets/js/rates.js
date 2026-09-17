// RUB → USD rate for the English version. Live rate from a public API,
// cached for a day; callers always have the db fallback to render with.

const CACHE_KEY = 'rubUsdRate';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const SOURCES = [
  {
    url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/rub.json',
    read: (body) => body?.rub?.usd,
  },
  {
    url: 'https://open.er-api.com/v6/latest/RUB',
    read: (body) => body?.rates?.USD,
  },
];

const plausible = (rate) => typeof rate === 'number' && rate > 0.001 && rate < 0.1;

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    if (cached && plausible(cached.rate) && Date.now() - cached.at < MAX_AGE_MS) return cached.rate;
  } catch {}
  return null;
}

let live = readCache();
let pending;

export const currentRate = (fallback) => live ?? (plausible(fallback) ? fallback : null);

// Resolves to true when a fresher rate than the one already in use arrived.
export function refreshRate() {
  if (live) return Promise.resolve(false);
  pending ??= (async () => {
    for (const source of SOURCES) {
      try {
        const res = await fetch(source.url);
        if (!res.ok) continue;
        const rate = source.read(await res.json());
        if (!plausible(rate)) continue;
        live = rate;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, at: Date.now() })); } catch {}
        return true;
      } catch {}
    }
    return false;
  })();
  return pending;
}

// Nearest $100, never below $100.
export function rubToUsd(rub, rate) {
  return Math.max(100, Math.round((rub * rate) / 100) * 100);
}
