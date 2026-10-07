import { NOTEBOOK_GOAL } from "./run.js";

const TIMED_CHANCE = 0.3;
const TIME_BEFORE = 90;
const TIME_AFTER_NOTEBOOK = 60;
const TIME_STEP = 4;
const TIME_FLOOR = 15;
export const TARGET_TIME_BONUS = 3;

/** До конца тетради срок растёт вместе с листом (`sizeScale` — во сколько раз сторона больше обычной). */
export function sheetTimeLimit(levelNum, rng = Math.random, sizeScale = 1) {
  const n = Math.max(1, Math.floor(Number(levelNum)) || 1);
  if (n <= 1) return 0;
  if (n > NOTEBOOK_GOAL) {
    return Math.max(TIME_FLOOR, TIME_AFTER_NOTEBOOK - TIME_STEP * (n - NOTEBOOK_GOAL - 1));
  }
  return rng() < TIMED_CHANCE ? TIME_BEFORE * Math.max(1, sizeScale) : 0;
}

export function overtimeInterval(rng = Math.random) {
  return 5 + rng() * 5;
}

export function formatClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
