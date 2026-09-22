import { CELL, COLS, MARGIN, ROWS, worldToCell, gateSpan } from "./maze.js";

const EPS = 1e-6;
const SKIN = 0.08;
const RESOLVE_ITERS = 8;
const NEAR_PAD = 2;

function closestPointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return { x: x1, y: y1 };
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: x1 + dx * t, y: y1 + dy * t };
}

function tileRect(c, r) {
  return {
    x: MARGIN + c * CELL,
    y: MARGIN + r * CELL,
    w: CELL,
    h: CELL,
  };
}

function pushFromTile(x, y, radius, c, r) {
  const rect = tileRect(c, r);
  const inside =
    x > rect.x + EPS &&
    x < rect.x + rect.w - EPS &&
    y > rect.y + EPS &&
    y < rect.y + rect.h - EPS;
  if (inside) {
    const left = x - rect.x;
    const right = rect.x + rect.w - x;
    const top = y - rect.y;
    const bottom = rect.y + rect.h - y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { pen: left + radius, nx: -1, ny: 0 };
    if (m === right) return { pen: right + radius, nx: 1, ny: 0 };
    if (m === top) return { pen: top + radius, nx: 0, ny: -1 };
    return { pen: bottom + radius, nx: 0, ny: 1 };
  }
  const qx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const qy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  let nx = x - qx;
  let ny = y - qy;
  const dist = Math.hypot(nx, ny);
  if (dist < EPS) return { pen: 0, nx: 0, ny: 0 };
  const pen = radius - dist;
  if (pen <= 0) return { pen: 0, nx: 0, ny: 0 };
  return { pen, nx: nx / dist, ny: ny / dist };
}

export function circleHitsWalls(x, y, radius, walls) {
  const lim = radius;
  for (const wall of walls) {
    const p = closestPointOnSegment(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
    if (Math.hypot(p.x - x, p.y - y) < lim) return true;
  }
  return false;
}

export function circleHitsGrid(x, y, radius, grid) {
  if (!grid) return false;
  const here = worldToCell(x, y);
  for (let r = here.r - NEAR_PAD; r <= here.r + NEAR_PAD; r++) {
    if (r < 0 || r >= ROWS) continue;
    for (let c = here.c - NEAR_PAD; c <= here.c + NEAR_PAD; c++) {
      if (c < 0 || c >= COLS) continue;
      if (grid[r][c] !== "wall" && grid[r][c] !== "blot") continue;
      if (pushFromTile(x, y, radius, c, r).pen > 0) return true;
    }
  }
  return false;
}

function depenetrateGrid(x, y, radius, grid) {
  const lim = radius + SKIN;
  for (let iter = 0; iter < RESOLVE_ITERS; iter++) {
    let maxPen = 0;
    let px = 0;
    let py = 0;
    const here = worldToCell(x, y);
    for (let r = here.r - NEAR_PAD; r <= here.r + NEAR_PAD; r++) {
      if (r < 0 || r >= ROWS) continue;
      for (let c = here.c - NEAR_PAD; c <= here.c + NEAR_PAD; c++) {
        if (c < 0 || c >= COLS) continue;
        if (grid[r][c] !== "wall" && grid[r][c] !== "blot") continue;
        const hit = pushFromTile(x, y, lim, c, r);
        if (hit.pen > maxPen) {
          maxPen = hit.pen;
          px = hit.nx * hit.pen;
          py = hit.ny * hit.pen;
        }
      }
    }
    if (maxPen <= 0) break;
    x += px;
    y += py;
  }
  return { x, y };
}

function depenetrateWalls(x, y, radius, walls) {
  const lim = radius + SKIN;
  for (let iter = 0; iter < RESOLVE_ITERS; iter++) {
    let maxPen = 0;
    let px = 0;
    let py = 0;
    for (const wall of walls) {
      const p = closestPointOnSegment(x, y, wall.x1, wall.y1, wall.x2, wall.y2);
      let nx = x - p.x;
      let ny = y - p.y;
      const dist = Math.hypot(nx, ny);
      if (dist < EPS) {
        if (wall.axis === "h") {
          nx = 0;
          ny = y >= p.y ? 1 : -1;
        } else {
          nx = x >= p.x ? 1 : -1;
          ny = 0;
        }
        const pen = lim;
        if (pen > maxPen) {
          maxPen = pen;
          px = nx * pen;
          py = ny * pen;
        }
        continue;
      }
      const pen = lim - dist;
      if (pen > maxPen) {
        maxPen = pen;
        px = (nx / dist) * pen;
        py = (ny / dist) * pen;
      }
    }
    if (maxPen <= 0) break;
    x += px;
    y += py;
  }
  return { x, y };
}

function overlapsSolid(x, y, radius, walls, grid) {
  if (grid) return circleHitsGrid(x, y, radius, grid);
  return circleHitsWalls(x, y, radius, walls);
}

function unstick(player, walls, grid) {
  if (!overlapsSolid(player.x, player.y, player.radius, walls, grid)) return;
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  for (let dist = 1; dist <= 16; dist += 1) {
    for (const [dx, dy] of dirs) {
      const nx = player.x + dx * dist;
      const ny = player.y + dy * dist;
      if (!overlapsSolid(nx, ny, player.radius, walls, grid)) {
        player.x = nx;
        player.y = ny;
        return;
      }
    }
  }
}

export const PLAYER_MAX_HP = 3;
export const PLAYER_BASE_SPEED = 168;
/** Совпадает с торсом солдата сверху. */
export const PLAYER_BASE_RADIUS = 6.4;

export function createPlayer(startPos, opts = {}) {
  return {
    x: startPos.x,
    y: startPos.y,
    radius: opts.radius ?? PLAYER_BASE_RADIUS,
    speed: opts.speed ?? PLAYER_BASE_SPEED,
    angle: 0,
    moving: false,
    walkTime: 0,
    hp: opts.hp ?? PLAYER_MAX_HP,
    maxHp: opts.maxHp ?? PLAYER_MAX_HP,
    invuln: 0,
    shieldCharges: opts.shieldCharges ?? 0,
  };
}

function clampToField(player, field) {
  const r = player.radius;
  const left = MARGIN + r;
  const right = MARGIN + COLS * CELL - r;
  const top = MARGIN + r;
  const bottom = MARGIN + ROWS * CELL - r;
  player.x = Math.max(left, Math.min(right, player.x));

  const entry = field?.entryGate;
  const entryOpen = entry && !entry.sealed && entry.anim !== "close" && entry.cells?.length;
  if (entryOpen && player.y < top) {
    const span = gateSpan(entry);
    if (span && player.x >= span.x0 - r * 0.4 && player.x <= span.x1 + r * 0.4) {
      player.x = Math.max(span.x0 + r, Math.min(span.x1 - r, player.x));
      player.y = Math.max(MARGIN - CELL * 1.15 + r, player.y);
      return;
    }
  }

  const exitGates = field?.exits?.length
    ? field.exits.map((ex) => ex.gate)
    : field?.exitGate
      ? [field.exitGate]
      : [];
  if (field?.exitOpen) {
    for (const gate of exitGates) {
      const span = gateSpan(gate);
      if (!span) continue;
      if (player.x < span.x0 - r * 0.4 || player.x > span.x1 + r * 0.4) continue;
      if (player.y <= bottom - CELL * 0.45) continue;
      player.x = Math.max(span.x0 + r, Math.min(span.x1 - r, player.x));
      player.y = Math.min(MARGIN + ROWS * CELL + CELL * 1.15 - r, player.y);
      player.y = Math.max(top, player.y);
      return;
    }
  }

  player.y = Math.max(top, Math.min(bottom, player.y));
}

export function updatePlayer(player, input, walls, dt, locked, grid = null, field = null) {
  if (!locked && player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
  if (locked) {
    player.moving = false;
    return;
  }

  const mx = input.mouse.wx ?? input.mouse.x;
  const my = input.mouse.wy ?? input.mouse.y;
  const aimX = mx - player.x;
  const aimY = my - player.y;
  if (aimX !== 0 || aimY !== 0) {
    player.angle = Math.atan2(aimY, aimX);
  }

  const move = input.axis();
  player.moving = move.x !== 0 || move.y !== 0;
  if (player.moving) player.walkTime += dt;
  else player.walkTime = 0;

  const dx = move.x * player.speed * dt;
  const dy = move.y * player.speed * dt;
  player.x += dx;
  player.y += dy;

  const resolved = grid
    ? depenetrateGrid(player.x, player.y, player.radius, grid)
    : depenetrateWalls(player.x, player.y, player.radius, walls);
  player.x = resolved.x;
  player.y = resolved.y;
  clampToField(player, field);
  unstick(player, walls, grid);
  clampToField(player, field);
}

export function hurtPlayer(player, run = null) {
  if (!player || player.hp <= 0) return "dead";
  if (player.invuln > 0) return "block";
  const invulnTime = Math.max(0.85, Number(run?.mods?.invulnTime) || 1);
  if ((player.shieldCharges ?? 0) > 0) {
    player.shieldCharges -= 1;
    if (run) run.mods.shieldCharges = player.shieldCharges;
    player.invuln = invulnTime;
    return "shield";
  }
  player.hp -= 1;
  player.invuln = invulnTime;
  return "hurt";
}

export function grantInvuln(player, seconds) {
  if (!player) return;
  player.invuln = Math.max(player.invuln || 0, seconds);
}

export function healPlayer(player, amount = 1) {
  if (player.hp <= 0 || player.hp >= player.maxHp) return false;
  player.hp = Math.min(player.maxHp, player.hp + amount);
  return true;
}

export function muzzlePoint(player) {
  const dist = 13;
  return {
    x: player.x + Math.cos(player.angle) * dist,
    y: player.y + Math.sin(player.angle) * dist,
  };
}
