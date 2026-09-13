/**
 * Deterministic pseudo-random number generator (mulberry32).
 *
 * Simulations must be reproducible: the same seed + inputs always produce the
 * same readings, which makes tests meaningful and demo data consistent.
 */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let state = seed >>> 0; // force uint32
  if (state === 0) state = 0x9e3779b9; // avoid the all-zero fixed point
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [min, max). */
export function uniform(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Uniform integer in [min, max]. */
export function uniformInt(rng: Rng, min: number, max: number): number {
  return Math.floor(uniform(rng, min, max + 1));
}

/** Centered uniform noise: uniform(-magnitude, +magnitude). */
export function noise(rng: Rng, magnitude: number): number {
  return uniform(rng, -magnitude, magnitude);
}

/** Clamps a value into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds to a fixed number of decimals (used to keep DB columns tidy). */
export function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
