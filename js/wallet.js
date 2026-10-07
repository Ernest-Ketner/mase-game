const GOLD_KEY = "mase-gold";

let cached = null;

function readStored() {
  try {
    const n = Math.floor(Number(localStorage.getItem(GOLD_KEY)));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeStored(n) {
  try {
    localStorage.setItem(GOLD_KEY, String(n));
  } catch {
    /* приватный режим или file:// — золото живёт до закрытия вкладки */
  }
}

export function getGold() {
  if (cached == null) cached = readStored();
  return cached;
}

export function addGold(amount) {
  const n = Math.max(0, Math.floor(amount) || 0);
  if (n === 0) return getGold();
  cached = getGold() + n;
  writeStored(cached);
  return cached;
}

export function spendGold(amount) {
  const n = Math.max(0, Math.floor(amount) || 0);
  if (getGold() < n) return false;
  cached = getGold() - n;
  writeStored(cached);
  return true;
}

export function resetGold() {
  cached = 0;
  writeStored(0);
}
