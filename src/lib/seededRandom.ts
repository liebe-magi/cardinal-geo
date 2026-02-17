/**
 * Seeded pseudo-random number generator using mulberry32 algorithm.
 * Produces deterministic sequences from a 32-bit integer seed.
 */

/** DJB2 hash — converts a string to a 32-bit integer */
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0; // ensure unsigned
}

/** Mulberry32 PRNG — returns a function that yields [0, 1) on each call */
export function createSeededRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Get UTC date string in YYYY-MM-DD format */
export function getUTCDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** Create a seed from a date string */
export function getDateSeed(dateStr: string): number {
  return hashString(`cardinal-daily-${dateStr}`);
}

/** Get today's seed (UTC) */
export function getTodaysSeed(): number {
  return getDateSeed(getUTCDateString());
}
