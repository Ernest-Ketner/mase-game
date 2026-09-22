import { hashSeed, mulberry32 } from "./seed.js";

export const OBJECTIVES = [
  { id: "marks", label: "метки", hint: "собери нужное число меток" },
  { id: "all", label: "все метки", hint: "собери каждую метку на листе" },
  { id: "pass", label: "проход", hint: "выходы открыты, метки не обязательны" },
  { id: "boss", label: "босс", hint: "убей чемпиона" },
  { id: "survive", label: "выжить", hint: "продержись, пока не кончатся часы" },
  { id: "kills", label: "зачистка", hint: "убей нужное число врагов" },
];

export function objectiveById(id) {
  return OBJECTIVES.find((item) => item.id === id) || OBJECTIVES[0];
}

/** Лист 1 всегда «метки». Дальше цель зашита в сид. Босс — с 3-го листа. */
export function pickSheetObjective(levelNum, seed) {
  const n = Math.max(1, Math.floor(Number(levelNum)) || 1);
  if (n < 2) return objectiveById("marks");
  const rng = mulberry32(hashSeed(seed >>> 0, 44000 + n * 17));
  const pool = OBJECTIVES.filter((item) => n >= 3 || item.id !== "boss");
  return pool[Math.floor(rng() * pool.length)];
}

export function killQuota(levelNum) {
  const n = Math.max(1, Math.floor(Number(levelNum)) || 1);
  return Math.min(14, 8 + Math.floor(Math.max(0, n - 2) / 3));
}

/** Короче срока листа, если срок есть, чтобы цель успевала раньше урона по часам. */
export function surviveSeconds(timeLimit) {
  const base = 36;
  const limit = Number(timeLimit) || 0;
  if (limit > 0) return Math.max(18, Math.min(base, limit - 8));
  return base;
}
