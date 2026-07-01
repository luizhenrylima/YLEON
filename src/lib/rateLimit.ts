type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

type RateBucket = {
  hits: number[];
  blockedUntil?: number;
};

const PREFIX = "acervo-rate-limit";

const limits: Record<string, { max: number; windowMs: number; blockMs: number }> = {
  "auth:login": { max: 6, windowMs: 5 * 60_000, blockMs: 10 * 60_000 },
  "auth:register": { max: 3, windowMs: 10 * 60_000, blockMs: 20 * 60_000 },
  "project:create": { max: 12, windowMs: 10 * 60_000, blockMs: 10 * 60_000 },
  "project:update": { max: 50, windowMs: 5 * 60_000, blockMs: 10 * 60_000 },
  "crm:update-status": { max: 60, windowMs: 5 * 60_000, blockMs: 10 * 60_000 },
  "crm:agenda": { max: 30, windowMs: 10 * 60_000, blockMs: 10 * 60_000 },
  "upload:image": { max: 20, windowMs: 15 * 60_000, blockMs: 20 * 60_000 },
  "search:catalog": { max: 120, windowMs: 60_000, blockMs: 2 * 60_000 },
  "download:bulk": { max: 10, windowMs: 10 * 60_000, blockMs: 15 * 60_000 },
};

function keyFor(action: string, scope = "anonymous") {
  return `${PREFIX}:${action}:${scope}`;
}

function readBucket(key: string): RateBucket {
  try {
    return JSON.parse(localStorage.getItem(key) || "{\"hits\":[]}") as RateBucket;
  } catch {
    return { hits: [] };
  }
}

export function checkClientRateLimit(action: keyof typeof limits, scope?: string): RateLimitResult {
  const config = limits[action];
  const key = keyFor(action, scope);
  const now = Date.now();
  const bucket = readBucket(key);

  if (bucket.blockedUntil && bucket.blockedUntil > now) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.blockedUntil - now };
  }

  const hits = bucket.hits.filter(time => now - time <= config.windowMs);
  if (hits.length >= config.max) {
    const blockedUntil = now + config.blockMs;
    localStorage.setItem(key, JSON.stringify({ hits, blockedUntil }));
    return { allowed: false, remaining: 0, retryAfterMs: config.blockMs };
  }

  hits.push(now);
  localStorage.setItem(key, JSON.stringify({ hits }));
  return { allowed: true, remaining: Math.max(0, config.max - hits.length), retryAfterMs: 0 };
}

export function rateLimitMessage(result: RateLimitResult) {
  const minutes = Math.max(1, Math.ceil(result.retryAfterMs / 60_000));
  return `Muitas tentativas em pouco tempo. Aguarde cerca de ${minutes} minuto(s) e tente novamente.`;
}
