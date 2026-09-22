export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(seed, salt) {
  return (Math.imul(seed >>> 0, 2654435761) + (salt >>> 0) * 1597334677) >>> 0;
}

export function randomSeed() {
  return (Math.floor(Math.random() * 0xffffffff) || 1) >>> 0;
}

export function parseSeedFromUrl(search = "") {
  const raw = String(search || (typeof location !== "undefined" ? location.search : "") || "");
  const match = /(?:\?|&)seed=([^&]+)/i.exec(raw);
  if (!match) return null;
  const value = decodeURIComponent(match[1]).trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function sheetRng(runSeed, levelNum) {
  return mulberry32(hashSeed(runSeed >>> 0, levelNum));
}
