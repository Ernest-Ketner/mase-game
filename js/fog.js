import {
  COLS,
  ROWS,
  gridLos,
  worldToCell,
} from "./maze.js";

const VISION_CELLS = 10;
const MEMORY = 2.5;
/** Круг слуха в клетках, сквозь стены. */
const HEAR_CELLS = 5;

function idx(fog, c, r) {
  return r * fog.cols + c;
}

function cellDist(c0, r0, c1, r1) {
  const dc = c1 - c0;
  const dr = r1 - r0;
  return Math.hypot(dc, dr);
}

export function createFog() {
  const until = new Float64Array(COLS * ROWS);
  until.fill(-1);
  const explored = new Uint8Array(COLS * ROWS);
  const fog = {
    now: 0,
    cols: COLS,
    rows: ROWS,
    until,
    explored,
    losX: -1e9,
    losY: -1e9,
    hearC: -1,
    hearR: -1,
    visionCells: VISION_CELLS,
    hearBonus: 0,
    hearCells: HEAR_CELLS,
    worldVisible(x, y) {
      const cell = worldToCell(x, y);
      return cellVisible(fog, cell.c, cell.r);
    },
    cover(c, r) {
      return fogCover(fog, c, r);
    },
  };
  return fog;
}

export function resizeFog(fog, cols = COLS, rows = ROWS) {
  const n = cols * rows;
  fog.cols = cols;
  fog.rows = rows;
  if (!fog.until || fog.until.length !== n) {
    fog.until = new Float64Array(n);
    fog.explored = new Uint8Array(n);
    fog.until.fill(-1);
  }
}

export function resetFog(fog) {
  fog.until.fill(-1);
  if (fog.explored) fog.explored.fill(0);
  fog.now = 0;
  fog.losX = -1e9;
  fog.losY = -1e9;
  fog.hearC = -1;
  fog.hearR = -1;
  fog.visionCells = VISION_CELLS;
  fog.hearBonus = 0;
  fog.hearCells = HEAR_CELLS;
}

export function cellVisible(fog, c, r) {
  if (c < 0 || r < 0 || c >= fog.cols || r >= fog.rows) return false;
  return fog.until[idx(fog, c, r)] > fog.now;
}

export function cellExplored(fog, c, r) {
  if (!fog?.explored) return true;
  if (c < 0 || r < 0 || c >= fog.cols || r >= fog.rows) return false;
  return fog.explored[idx(fog, c, r)] === 1;
}

function markExplored(fog, c, r) {
  if (c < 0 || r < 0 || c >= fog.cols || r >= fog.rows) return;
  fog.explored[idx(fog, c, r)] = 1;
}

export function worldVisible(fog, x, y) {
  const cell = worldToCell(x, y);
  return cellVisible(fog, cell.c, cell.r);
}

export function fogCover(fog, c, r) {
  if (cellVisible(fog, c, r)) return 0;
  const until = fog.until[idx(fog, c, r)];
  if (until < 0) return 1;
  const ago = fog.now - until;
  if (ago >= 0.2) return 1;
  return 1;
}

function refreshLos(fog, grid, player) {
  const here = worldToCell(player.x, player.y);
  const reach = fog.visionCells;
  const r2 = reach * reach;
  const remember = fog.now + MEMORY;

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const c = here.c + dc;
      const r = here.r + dr;
      if (c < 0 || r < 0 || c >= fog.cols || r >= fog.rows) continue;
      fog.until[idx(fog, c, r)] = remember;
      markExplored(fog, c, r);
    }
  }

  for (let r = here.r - reach; r <= here.r + reach; r++) {
    if (r < 0 || r >= fog.rows) continue;
    for (let c = here.c - reach; c <= here.c + reach; c++) {
      if (c < 0 || c >= fog.cols) continue;
      const dc = c - here.c;
      const dr = r - here.r;
      if (dc * dc + dr * dr > r2) continue;
      if (gridLos(grid, here.c, here.r, c, r)) {
        fog.until[idx(fog, c, r)] = remember;
        markExplored(fog, c, r);
      }
    }
  }
}

function refreshHear(fog, player) {
  const here = worldToCell(player.x, player.y);
  fog.hearC = here.c;
  fog.hearR = here.r;
}

export function revealWorld(fog, x, y, seconds = 1.5, radius = 1) {
  const cell = worldToCell(x, y);
  const until = fog.now + seconds;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const c = cell.c + dc;
      const r = cell.r + dr;
      if (c < 0 || r < 0 || c >= fog.cols || r >= fog.rows) continue;
      const i = idx(fog, c, r);
      fog.until[i] = Math.max(fog.until[i], until);
      fog.explored[i] = 1;
    }
  }
}

export function updateFog(fog, grid, player, dt, opts = {}) {
  fog.now += dt;
  const visionCells = Math.max(4, VISION_CELLS + (opts.visionBonus || 0) + (opts.visionNerf || 0));
  const hearBonus = opts.hearBonus || 0;
  fog.visionCells = visionCells;
  fog.hearBonus = hearBonus;
  fog.hearCells = HEAR_CELLS + hearBonus;
  refreshLos(fog, grid, player);
  refreshHear(fog, player);
}

export function hearDist(fog, x, y) {
  const cell = worldToCell(x, y);
  if (fog.hearC < 0) return Infinity;
  return cellDist(fog.hearC, fog.hearR, cell.c, cell.r);
}

export function canHearEnemy(fog, enemy) {
  return hearDist(fog, enemy.x, enemy.y) <= (fog.hearCells ?? HEAR_CELLS);
}

export function canHearPoint(fog, x, y) {
  return hearDist(fog, x, y) <= (fog.hearCells ?? HEAR_CELLS);
}
