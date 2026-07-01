/**
 * Lightweight in-memory + localStorage cache for catalog data.
 * Reduces redundant Supabase calls and makes navigation feel instant.
 */

const CACHE_VERSION = 'v4';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  ts: number;
  version: string;
}

// In-memory cache (per session, faster than localStorage)
const memCache = new Map<string, CacheEntry<unknown>>();

function isExpired(entry: CacheEntry<unknown>): boolean {
  return Date.now() - entry.ts > CACHE_TTL_MS || entry.version !== CACHE_VERSION;
}

export function cacheGet<T>(key: string): T | null {
  // Check memory first
  const mem = memCache.get(key) as CacheEntry<T> | undefined;
  if (mem && !isExpired(mem)) return mem.data;

  // Fallback to localStorage
  try {
    const raw = localStorage.getItem(`cache_${key}`);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (isExpired(entry)) {
      localStorage.removeItem(`cache_${key}`);
      return null;
    }
    // Promote to memory
    memCache.set(key, entry);
    return entry.data;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, ts: Date.now(), version: CACHE_VERSION };
  memCache.set(key, entry);
  try {
    localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
  } catch {
    // Quota exceeded — skip localStorage, memory still works
  }
}

export function cacheInvalidate(key: string): void {
  memCache.delete(key);
  try { localStorage.removeItem(`cache_${key}`); } catch { /* noop */ }
}

export function cacheInvalidateAll(): void {
  memCache.clear();
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('cache_'));
    keys.forEach(k => localStorage.removeItem(k));
  } catch { /* noop */ }
}
