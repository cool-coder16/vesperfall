// Deterministic xorshift32 PRNG. State is a single uint32 stored in GameState so that
// every client advancing the same state produces the same "random" outcomes.

export function rngNext(state: number): { value: number; state: number } {
  let x = state >>> 0;
  if (x === 0) x = 0x9e3779b9;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17; x >>>= 0;
  x ^= x << 5; x >>>= 0;
  return { value: x / 4294967296, state: x };
}

/** Returns an integer in [0, n) and the advanced state. */
export function rngInt(state: number, n: number): { value: number; state: number } {
  const r = rngNext(state);
  return { value: Math.floor(r.value * n), state: r.state };
}

/** Fisher–Yates shuffle driven by a seed; returns a new array and does not mutate the input. */
export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    const r = rngInt(s, i + 1);
    s = r.state;
    const j = r.value;
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** FNV-1a 32-bit hash of a string; used to derive seeds from secrets. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** SHA-256 hex digest (browser + node). Used for commit-reveal of shuffle secrets. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomSecret(): string {
  const arr = new Uint8Array(16);
  globalThis.crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
}
