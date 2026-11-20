// Solmar City — seeded random numbers (mulberry32).
// The same seed always produces the same sequence, so the city and the
// screenshot scenes are fully deterministic.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRandom(seed) {
  const next = mulberry32(seed);
  return {
    next,
    // Float in [min, max).
    range(min, max) {
      return min + next() * (max - min);
    },
    // Integer in [min, max] inclusive.
    int(min, max) {
      return Math.floor(min + next() * (max - min + 1));
    },
    // One element of an array, uniformly.
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    // True with probability p (0..1).
    chance(p) {
      return next() < p;
    },
  };
}
