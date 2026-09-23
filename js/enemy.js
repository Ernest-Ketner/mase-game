import {
  CELL,
  cellCenter,
  openNeighbors8,
  worldToCell,
  bfsNextCell,
  cellReachable,
  bfsDistances,
  gridLos,
  isFloor,
  clearShotOrigin,
} from "./maze.js";
import { remainingPath, aimJitter, enemyFireSpread } from "./laser.js";

/** Скорости уже −35% от прежних. */
const PATROL_SPEED = 47;
const CHASE_SPEED = 65;
const TRAVEL_SPEED = 52;
const ENEMY_FIRE_MIN = 1.4;
const ENEMY_FIRE_MAX = 2.2;
const DANGER_DIST = 12;
const LOOKAHEAD = CELL * 4;
const MISS_CHANCE = 0.38;

const VISION_RANGE = CELL * 9;
const VISION_HUNT_MULT = 1.15;
const TRAVEL_CHANCE = 0.22;
const ABORT_CHASE_CHANCE = 0.08;
const ABORT_CHECK_EVERY = 1.4;
const LOSE_SIGHT_TIME = 2.2;
const AIM_HOLD = 1;

const SHIELD_DURATION = 3;
const TIRED_DURATION = 10;
const SHIELD_NEAR = 36;

export const EMERGE_DURATION = 0.65;
const PLATE_FLASH = 0.45;

export function enemyHp(levelNum, heat = 0) {
  const n = Math.max(1, Math.floor(Number(levelNum)) || 1);
  const h = Math.max(0, Math.floor(Number(heat)) || 0);
  return Math.min(5 + h, n + h);
}

export function isStrongKind(kind) {
  return kind === "runner" || kind === "gunner" || kind === "armored" || kind === "warden" || kind === "champion";
}

export function kindHint(kind) {
  switch (kind) {
    case "warden":
      return "Страж: щит от луча";
    case "champion":
      return "Чемпион: несколько способностей";
    case "runner":
      return "Бегун: быстрый, видит ближе";
    case "gunner":
      return "Стрелок: чаще бьёт, дальше видит";
    case "armored":
      return "Броня: пластина вместо жизней";
    default:
      return null;
  }
}

export function kindMark(kind) {
  switch (kind) {
    case "warden":
      return "arc";
    case "champion":
      return "C";
    case "runner":
      return "dash";
    case "gunner":
      return "dots";
    case "armored":
      return "box";
    default:
      return null;
  }
}

export function escortCount(kind) {
  if (kind === "champion" || kind === "warden") return 2;
  if (isStrongKind(kind)) return 1;
  return 0;
}

export function kindStats(kind) {
  switch (kind) {
    case "runner":
      return { speedMult: 1.45, visionMult: 0.75, fireMult: 1, abortMult: 1, plates: 0 };
    case "gunner":
      return { speedMult: 1, visionMult: 1.35, fireMult: 0.55, abortMult: 0.35, plates: 0 };
    case "armored":
      return { speedMult: 0.92, visionMult: 1, fireMult: 1, abortMult: 1, plates: 1 };
    case "champion":
      return { speedMult: 1.08, visionMult: 1.28, fireMult: 0.62, abortMult: 0.15, plates: 1 };
    default:
      return { speedMult: 1, visionMult: 1, fireMult: 1, abortMult: 1, plates: 0 };
  }
}

export function championLoadout(levelNum, heat = 0) {
  const n = Math.max(1, Math.floor(Number(levelNum)) || 1);
  const h = Math.max(0, Math.floor(Number(heat)) || 0);
  const hp = Math.min(8 + h, 2 + n + h);
  const plates = n + h >= 6 ? 2 : 1;
  const pool = ["burst", "shield", "call", "dash", "zigzag"];
  let abilities;
  if (n === 1) abilities = ["burst", "zigzag"];
  else if (n === 2) abilities = ["burst", "shield"];
  else if (n === 3) abilities = ["call", "zigzag", "burst"];
  else {
    const count = n >= 5 ? 3 : 2;
    const start = (n - 1) % pool.length;
    abilities = [];
    for (let i = 0; i < count; i++) abilities.push(pool[(start + i) % pool.length]);
  }
  return { hp, plates, abilities };
}

export function pickSpawnKind(levelNum, rng = Math.random) {
  const n = Math.max(1, Math.floor(Number(levelNum)) || 1);
  let runner = 0;
  let gunner = 0;
  let armored = 0;
  if (n >= 8) {
    runner = 0.2;
    gunner = 0.2;
    armored = 0.2;
  } else if (n >= 7) {
    runner = 0.2;
    gunner = 0.2;
  } else if (n >= 6) {
    runner = 0.25;
  }
  const roll = rng();
  if (roll < armored) return "armored";
  if (roll < armored + gunner) return "gunner";
  if (roll < armored + gunner + runner) return "runner";
  return "grunt";
}

function clipPath(points, maxLen) {
  if (!points || points.length < 2) return points;
  const out = [points[0]];
  let used = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = out[out.length - 1];
    const next = points[i];
    const seg = Math.hypot(next.x - prev.x, next.y - prev.y);
    if (used + seg >= maxLen) {
      const t = Math.max(0, (maxLen - used) / (seg || 1));
      out.push({
        x: prev.x + (next.x - prev.x) * t,
        y: prev.y + (next.y - prev.y) * t,
      });
      break;
    }
    out.push(next);
    used += seg;
  }
  return out;
}

function distToPath(points, x, y) {
  if (!points || points.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 1e-6) t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    best = Math.min(best, Math.hypot(px - x, py - y));
  }
  return best;
}

function nearestPlayerLaser(shots, walls, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const shot of shots) {
    if (!shot.alive || shot.team !== "player") continue;
    const path = clipPath(remainingPath(shot, walls), LOOKAHEAD);
    const d = distToPath(path, x, y);
    if (d < bestDist) {
      bestDist = d;
      best = path;
    }
  }
  return best;
}

function playerShotNearby(shots, x, y, radius) {
  for (const shot of shots) {
    if (!shot.alive || shot.team !== "player") continue;
    if (Math.hypot(shot.x - x, shot.y - y) <= radius) return true;
  }
  return false;
}

function hasLineOfSight(grid, x1, y1, x2, y2) {
  const a = worldToCell(x1, y1);
  const b = worldToCell(x2, y2);
  return gridLos(grid, a.c, a.r, b.c, b.r);
}

function canSeePlayer(enemy, player, grid, visionRange = VISION_RANGE) {
  const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
  if (dist > visionRange) return false;
  return hasLineOfSight(grid, enemy.x, enemy.y, player.x, player.y);
}

function shotLineClear(grid, x1, y1, x2, y2) {
  const dist = Math.hypot(x2 - x1, y2 - y1);
  if (dist < 1) return true;
  const step = CELL * 0.35;
  const n = Math.max(1, Math.ceil(dist / step));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const cell = worldToCell(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
    if (!isFloor(grid, cell.c, cell.r)) return false;
  }
  return true;
}

function holdsAim(enemy, player, grid, dt, visionRange) {
  const sees =
    canSeePlayer(enemy, player, grid, visionRange) &&
    shotLineClear(grid, enemy.x, enemy.y, player.x, player.y);
  if (sees) enemy.aimTime = Math.min(AIM_HOLD, (enemy.aimTime || 0) + dt);
  else enemy.aimTime = 0;
  enemy.aimReady = sees && enemy.aimTime >= AIM_HOLD;
  return enemy.aimReady;
}

function visionOf(enemy, opts) {
  const kind = kindStats(enemy.kind);
  return (
    VISION_RANGE *
    (opts.visionMult ?? 1) *
    kind.visionMult *
    (opts.huntMode ? VISION_HUNT_MULT : 1)
  );
}

function zoneIndexAt(zones, c, r) {
  if (!zones) return -1;
  for (let i = 0; i < zones.length; i++) {
    const cells = zones[i].cells;
    if (!cells) continue;
    for (const cell of cells) {
      if (cell.c === c && cell.r === r) return i;
    }
  }
  return -1;
}

function randomZoneCell(zone, avoid = null) {
  if (!zone || !zone.cells || zone.cells.length === 0) return null;
  let pool = zone.cells;
  if (avoid) {
    const filtered = zone.cells.filter((c) => c.c !== avoid.c || c.r !== avoid.r);
    if (filtered.length > 0) pool = filtered;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickPatrolTarget(enemy, zones) {
  const home = zones[enemy.homeZone];
  if (!home) return null;
  const here = { c: enemy.lastCell?.c, r: enemy.lastCell?.r };

  if (zones.length > 1 && Math.random() < TRAVEL_CHANCE) {
    const others = [];
    for (let i = 0; i < zones.length; i++) {
      if (i !== enemy.homeZone && zones[i].cells && zones[i].cells.length > 0) {
        others.push(i);
      }
    }
    if (others.length > 0) {
      const destZone = others[Math.floor(Math.random() * others.length)];
      const cell = randomZoneCell(zones[destZone], here);
      if (cell) {
        enemy.mode = "travel";
        enemy.travelZone = destZone;
        return cell;
      }
    }
  }

  enemy.mode = "patrol";
  enemy.travelZone = -1;
  return randomZoneCell(home, here);
}

function nearestAlly(enemy, pack) {
  let best = null;
  let bestD = Infinity;
  for (const other of pack) {
    if (!other.alive || other === enemy || other.emergeTimer > 0) continue;
    const d = Math.hypot(other.x - enemy.x, other.y - enemy.y);
    if (d < bestD) {
      best = other;
      bestD = d;
    }
  }
  return best;
}

function hasNearbyAlly(enemy, pack, range = CELL * 6) {
  const ally = nearestAlly(enemy, pack);
  return !!(ally && Math.hypot(ally.x - enemy.x, ally.y - enemy.y) <= range);
}

function nearestStrongAlly(enemy, pack) {
  let best = null;
  let bestD = Infinity;
  for (const other of pack) {
    if (!other.alive || other === enemy || other.emergeTimer > 0) continue;
    if (!isStrongKind(other.kind)) continue;
    const d = Math.hypot(other.x - enemy.x, other.y - enemy.y);
    if (d < bestD) {
      best = other;
      bestD = d;
    }
  }
  return best;
}

function rollTactic(enemy, pack) {
  const alone = isStrongKind(enemy.kind) && !hasNearbyAlly(enemy, pack);
  if (alone && nearestAlly(enemy, pack)) {
    enemy.tactic = "regroup";
    enemy.tacticTimer = 1.2 + Math.random() * 0.6;
    enemy.thinkTimer = Math.max(enemy.thinkTimer, 0.35 + Math.random() * 0.25);
    return;
  }
  const roll = Math.random();
  if (roll < 0.2) {
    enemy.tactic = "think";
    enemy.thinkTimer = 0.4 + Math.random() * 0.28;
    enemy.tacticTimer = 0.85 + Math.random() * 0.3;
  } else if (roll < 0.5) {
    enemy.tactic = "zigzag";
    enemy.zigSign = Math.random() < 0.5 ? 1 : -1;
    enemy.tacticTimer = 1.15 + Math.random() * 1.05;
  } else if (roll < 0.7) {
    enemy.tactic = "flank";
    enemy.flankSign = Math.random() < 0.5 ? 1 : -1;
    enemy.tacticTimer = 1.35 + Math.random() * 0.9;
  } else if (roll < 0.82) {
    enemy.tactic = "hold";
    enemy.thinkTimer = 0.28 + Math.random() * 0.18;
    enemy.tacticTimer = 0.7;
  } else {
    enemy.tactic = "rush";
    enemy.tacticTimer = 0.75 + Math.random() * 0.55;
  }
}

function nextStepToward(grid, enemy, goal) {
  const here = worldToCell(enemy.x, enemy.y);
  return bfsNextCell(grid, here, goal, openNeighbors8);
}

function pickZigzagStep(grid, enemy, player) {
  const here = worldToCell(enemy.x, enemy.y);
  const goal = worldToCell(player.x, player.y);
  const options = openNeighbors8(grid, here.c, here.r);
  if (options.length === 0) return null;
  const vx = Math.sign(goal.c - here.c);
  const vy = Math.sign(goal.r - here.r);
  const sign = enemy.zigSign || 1;
  const px = -vy * sign;
  const py = vx * sign;
  const last = enemy.lastCell;
  const notBack = (cell) => !last || cell.c !== last.c || cell.r !== last.r;
  const side = options.find((o) => o.c === here.c + px && o.r === here.r + py && notBack(o));
  const forward = options.find((o) => o.c === here.c + vx && o.r === here.r + vy && notBack(o));
  if (Math.random() < 0.28) enemy.zigSign = -(enemy.zigSign || 1);
  if (side && Math.random() < 0.62) return side;
  if (forward) return forward;
  if (side) return side;
  return nextStepToward(grid, enemy, goal);
}

function flankCell(grid, enemy, player) {
  const here = worldToCell(player.x, player.y);
  const sign = enemy.flankSign || 1;
  const dist = 3 + Math.floor(Math.random() * 3);
  const offsets = [
    { c: dist * sign, r: 0 },
    { c: 0, r: dist * sign },
    { c: dist * sign, r: dist },
    { c: -dist * sign, r: dist },
  ];
  for (const off of offsets) {
    const c = here.c + off.c;
    const r = here.r + off.r;
    if (isFloor(grid, c, r)) return { c, r };
    const near = openNeighbors8(grid, Math.max(0, c), Math.max(0, r));
    if (near.length > 0) return near[0];
  }
  return here;
}

function chooseChaseStep(grid, enemy, player, pack) {
  const tactic = enemy.tactic || "rush";
  if (tactic === "hold") return null;
  if (tactic === "regroup") {
    const ally = nearestAlly(enemy, pack);
    if (ally) return nextStepToward(grid, enemy, worldToCell(ally.x, ally.y));
  }
  if (tactic === "zigzag") return pickZigzagStep(grid, enemy, player);
  if (tactic === "flank") {
    const goal = flankCell(grid, enemy, player);
    const here = worldToCell(enemy.x, enemy.y);
    if (here.c === goal.c && here.r === goal.r) return pickZigzagStep(grid, enemy, player);
    return nextStepToward(grid, enemy, goal);
  }
  if (enemy.kind === "grunt") {
    const boss = nearestStrongAlly(enemy, pack);
    if (boss && Math.hypot(boss.x - enemy.x, boss.y - enemy.y) > CELL * 7 && Math.random() < 0.45) {
      return nextStepToward(grid, enemy, worldToCell(boss.x, boss.y));
    }
  }
  return nextStepToward(grid, enemy, worldToCell(player.x, player.y));
}

function sidestepCell(grid, enemy, path) {
  const here = worldToCell(enemy.x, enemy.y);
  const options = openNeighbors8(grid, here.c, here.r);
  if (options.length === 0) return null;
  const safe = options.filter((cell) => {
    const pos = cellCenter(cell.c, cell.r);
    return distToPath(path, pos.x, pos.y) > DANGER_DIST;
  });
  if (safe.length === 0) return null;
  return safe[Math.floor(Math.random() * safe.length)];
}

function beginStep(enemy, toCell) {
  if (!toCell) return false;
  const here = worldToCell(enemy.x, enemy.y);
  if (here.c === toCell.c && here.r === toCell.r) return false;
  const from = cellCenter(here.c, here.r);
  enemy.x = from.x;
  enemy.y = from.y;
  enemy.stepFrom = { c: here.c, r: here.r };
  enemy.stepTo = { c: toCell.c, r: toCell.r };
  enemy.stepT = 0;
  enemy.lastCell = { c: here.c, r: here.r };
  enemy.angle = Math.atan2(toCell.r - here.r, toCell.c - here.c);
  enemy.moving = true;
  return true;
}

function advanceStep(enemy, speed, dt) {
  if (!enemy.stepTo) {
    enemy.moving = false;
    return "idle";
  }
  const from = cellCenter(enemy.stepFrom.c, enemy.stepFrom.r);
  const to = cellCenter(enemy.stepTo.c, enemy.stepTo.r);
  const len = Math.hypot(to.x - from.x, to.y - from.y) || CELL;
  enemy.stepT += (speed * dt) / len;
  if (enemy.stepT >= 1) {
    enemy.x = to.x;
    enemy.y = to.y;
    enemy.stepFrom = { c: enemy.stepTo.c, r: enemy.stepTo.r };
    enemy.stepTo = null;
    enemy.stepT = 0;
    enemy.moving = false;
    return "arrived";
  }
  enemy.x = from.x + (to.x - from.x) * enemy.stepT;
  enemy.y = from.y + (to.y - from.y) * enemy.stepT;
  enemy.moving = true;
  enemy.walkTime += dt;
  return "moving";
}

function clearStep(enemy) {
  enemy.stepTo = null;
  enemy.stepT = 0;
}

function standoffRange(enemy) {
  if (enemy.kind === "gunner") return { min: CELL * 1.7, max: CELL * 3.3 };
  if (enemy.kind === "runner") return { min: CELL * 1.15, max: CELL * 1.9 };
  return { min: CELL * 1.35, max: CELL * 2.35 };
}

function stepAwayFrom(grid, enemy, player) {
  const here = worldToCell(enemy.x, enemy.y);
  const options = openNeighbors8(grid, here.c, here.r);
  if (options.length === 0) return null;
  const pc = worldToCell(player.x, player.y);
  const hereD = Math.abs(here.c - pc.c) + Math.abs(here.r - pc.r);
  let best = null;
  let bestD = hereD;
  for (const cell of options) {
    const d = Math.abs(cell.c - pc.c) + Math.abs(cell.r - pc.r);
    if (d > bestD) {
      bestD = d;
      best = cell;
    }
  }
  return best;
}

function facePlayer(enemy, player) {
  enemy.moving = false;
  enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
}

function muzzleOf(enemy, reach, grid) {
  const rawX = enemy.x + Math.cos(enemy.angle) * reach;
  const rawY = enemy.y + Math.sin(enemy.angle) * reach;
  return clearShotOrigin(enemy.x, enemy.y, rawX, rawY, grid);
}

function fireAt(enemy, player, grid) {
  const aimX = player.x - enemy.x;
  const aimY = player.y - enemy.y;
  const dist = Math.hypot(aimX, aimY);
  if (dist < 6) return null;
  enemy.angle = Math.atan2(aimY, aimX);
  const shotAngle = aimJitter(enemy.angle, enemyFireSpread(!!enemy.moving, enemy.kind));
  const reach = Math.min(12, Math.max(4, dist * 0.42));
  const origin = muzzleOf(enemy, reach, grid);
  return {
    x: origin.x,
    y: origin.y,
    dx: Math.cos(shotAngle),
    dy: Math.sin(shotAngle),
  };
}

function tryDodge(enemy, grid, walls, shots, dodgeFail = 0) {
  if (enemy.stepTo) return false;
  const path = nearestPlayerLaser(shots, walls, enemy.x, enemy.y);
  if (!path || Math.random() < MISS_CHANCE + dodgeFail) return false;
  if (distToPath(path, enemy.x, enemy.y) >= DANGER_DIST + 2) return false;
  const cell = sidestepCell(grid, enemy, path);
  if (!cell) return false;
  return beginStep(enemy, cell);
}

function pickEscapeCell(grid, enemy) {
  const here = worldToCell(enemy.x, enemy.y);
  const options = openNeighbors8(grid, here.c, here.r);
  if (options.length === 0) return null;
  let pool = options;
  if (enemy.lastCell && options.length > 1) {
    const filtered = options.filter(
      (o) => o.c !== enemy.lastCell.c || o.r !== enemy.lastCell.r,
    );
    if (filtered.length > 0) pool = filtered;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function ensureGoal(enemy, grid, zones) {
  if (enemy.goalCell) {
    const here = worldToCell(enemy.x, enemy.y);
    if (enemy.goalCell.c === here.c && enemy.goalCell.r === here.r) {
      enemy.goalCell = null;
    } else if (!cellReachable(grid, here, enemy.goalCell)) {
      enemy.goalCell = null;
    } else {
      return;
    }
  }

  const here = worldToCell(enemy.x, enemy.y);
  const prevMode = enemy.mode;
  const prevTravel = enemy.travelZone;
  for (let attempt = 0; attempt < 8; attempt++) {
    enemy.mode = "patrol";
    enemy.travelZone = -1;
    const cell = pickPatrolTarget(enemy, zones);
    if (!cell || (cell.c === here.c && cell.r === here.r)) continue;
    if (!cellReachable(grid, here, cell)) continue;
    enemy.goalCell = { c: cell.c, r: cell.r };
    return;
  }

  enemy.mode = prevMode === "chase" ? "patrol" : prevMode;
  enemy.travelZone = prevTravel;
  const escape = pickEscapeCell(grid, enemy);
  if (escape) {
    enemy.goalCell = { c: escape.c, r: escape.r };
    enemy.mode = "patrol";
    enemy.travelZone = -1;
  } else {
    enemy.goalCell = null;
    enemy.mode = "patrol";
    enemy.travelZone = -1;
  }
}

function returnToPatrol(enemy, grid, zones) {
  enemy.alert = false;
  enemy.mode = "patrol";
  enemy.loseSight = 0;
  enemy.aimTime = 0;
  enemy.aimReady = false;
  enemy.abortTimer = ABORT_CHECK_EVERY;
  enemy.goalCell = null;
  clearStep(enemy);
  enemy.travelZone = -1;
  const here = worldToCell(enemy.x, enemy.y);
  const pos = cellCenter(here.c, here.r);
  enemy.x = pos.x;
  enemy.y = pos.y;
  ensureGoal(enemy, grid, zones);
}

function startChase(enemy, player) {
  enemy.alert = true;
  enemy.mode = "chase";
  enemy.loseSight = 0;
  enemy.abortTimer = ABORT_CHECK_EVERY;
  enemy.goalCell = null;
  clearStep(enemy);
  enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
  enemy.tacticTimer = 0;
}

function shoutToNeighbors(enemies, grid, source, player) {
  const from = worldToCell(source.x, source.y);
  const dist = bfsDistances(grid, from, 7);
  for (const other of enemies) {
    if (!other.alive || other === source || other.emergeTimer > 0) continue;
    const here = worldToCell(other.x, other.y);
    const d = dist.get(`${here.c},${here.r}`);
    if (d == null || d > 7) continue;
    if (!other.alert || other.mode !== "chase") startChase(other, player);
    const split = Math.random();
    if (split < 0.4) {
      other.tactic = "flank";
      other.flankSign = Math.random() < 0.5 ? 1 : -1;
    } else if (split < 0.75) {
      other.tactic = "zigzag";
      other.zigSign = Math.random() < 0.5 ? 1 : -1;
    } else {
      other.tactic = "rush";
    }
    other.tacticTimer = 1 + Math.random();
  }
}

function planNextStep(enemy, grid, player, pack = []) {
  if (enemy.alert && enemy.mode === "chase") {
    const dist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    const sees = canSeePlayer(enemy, player, grid);
    const range = standoffRange(enemy);
    if (sees && dist < range.min) {
      const away = stepAwayFrom(grid, enemy, player);
      if (away) beginStep(enemy, away);
      else facePlayer(enemy, player);
      return;
    }
    if (sees && dist <= range.max && enemy.tactic !== "regroup") {
      facePlayer(enemy, player);
      return;
    }
    const targetCell = worldToCell(player.x, player.y);
    const here = worldToCell(enemy.x, enemy.y);
    if (here.c === targetCell.c && here.r === targetCell.r) {
      const away = stepAwayFrom(grid, enemy, player);
      if (away) beginStep(enemy, away);
      else facePlayer(enemy, player);
      return;
    }
    const step = chooseChaseStep(grid, enemy, player, pack);
    if (step) beginStep(enemy, step);
    else enemy.moving = false;
    return;
  }

  if (isStrongKind(enemy.kind) && !hasNearbyAlly(enemy, pack) && nearestAlly(enemy, pack)) {
    const ally = nearestAlly(enemy, pack);
    const step = nextStepToward(grid, enemy, worldToCell(ally.x, ally.y));
    if (step) {
      beginStep(enemy, step);
      return;
    }
  }

  ensureGoal(enemy, grid, enemy._zones || []);
  if (!enemy.goalCell) {
    enemy.moving = false;
    return;
  }

  const here = worldToCell(enemy.x, enemy.y);
  if (here.c === enemy.goalCell.c && here.r === enemy.goalCell.r) {
    if (enemy.mode === "travel" && enemy.travelZone >= 0) {
      enemy.homeZone = enemy.travelZone;
      enemy.travelZone = -1;
    }
    enemy.mode = "patrol";
    enemy.goalCell = null;
    ensureGoal(enemy, grid, enemy._zones || []);
  }

  if (!enemy.goalCell) {
    enemy.moving = false;
    return;
  }

  const step = nextStepToward(grid, enemy, enemy.goalCell);
  if (step) beginStep(enemy, step);
  else {
    enemy.goalCell = null;
    enemy.moving = false;
  }
}

function updateMovement(enemy, grid, walls, player, shots, zones, dt, opts = {}) {
  const huntMode = opts.huntMode === true;
  const kind = kindStats(enemy.kind);
  const pack = opts.pack || [];
  const visionMult = (opts.visionMult ?? 1) * kind.visionMult * (huntMode ? VISION_HUNT_MULT : 1);
  const vision = VISION_RANGE * visionMult;
  enemy._zones = zones;
  enemy._pack = pack;

  if (huntMode) {
    if (!enemy.alert || enemy.mode !== "chase") startChase(enemy, player);
    enemy.loseSight = 0;
  } else {
    const sees = canSeePlayer(enemy, player, grid, vision);
    if (sees) {
      const wasAlert = enemy.alert;
      if (!enemy.alert) startChase(enemy, player);
      else enemy.loseSight = 0;
      if (!wasAlert) enemy.wantsShout = true;
    } else if (enemy.alert) {
      enemy.loseSight += dt;
      if (enemy.loseSight >= LOSE_SIGHT_TIME) returnToPatrol(enemy, grid, zones);
    }

    if (enemy.alert) {
      enemy.abortTimer -= dt;
      if (enemy.abortTimer <= 0) {
        enemy.abortTimer = ABORT_CHECK_EVERY;
        if (Math.random() < ABORT_CHASE_CHANCE * kind.abortMult) returnToPatrol(enemy, grid, zones);
      }
    }
  }

  if (enemy.dashTimer > 0) enemy.dashTimer = Math.max(0, enemy.dashTimer - dt);
  if (enemy.alert && enemy.mode === "chase") {
    enemy.tacticTimer = (enemy.tacticTimer ?? 0) - dt;
    if (enemy.tacticTimer <= 0) rollTactic(enemy, pack);
  }

  if (enemy.thinkTimer > 0) {
    enemy.thinkTimer = Math.max(0, enemy.thinkTimer - dt);
    enemy.moving = false;
    enemy.walkTime += dt * 0.45;
    if (enemy.stepTo) clearStep(enemy);
    enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    tryDodge(enemy, grid, walls, shots, opts.dodgeFail ?? 0);
    return;
  }

  tryDodge(enemy, grid, walls, shots, opts.dodgeFail ?? 0);

  const huntBoost = huntMode && !opts.huntCalm ? 1.12 : 1;
  const speedMult = (opts.enemySpeedMult ?? 1) * kind.speedMult;
  let speed =
    (enemy.alert
      ? CHASE_SPEED * huntBoost
      : enemy.mode === "travel"
        ? TRAVEL_SPEED
        : PATROL_SPEED) * speedMult;
  if (enemy.dashTimer > 0) speed *= 1.65;
  const pools = opts.inkPools || [];
  for (const pool of pools) {
    if (pool.life > 0 && Math.hypot(enemy.x - pool.x, enemy.y - pool.y) < pool.radius) {
      speed *= 0.45;
      break;
    }
  }

  if (enemy.stepTo) {
    const status = advanceStep(enemy, speed, dt);
    if (status !== "arrived") return;
  }

  planNextStep(enemy, grid, player, pack);
}

function fireVolley(enemy, player, fired, count, grid) {
  const aimX = player.x - enemy.x;
  const aimY = player.y - enemy.y;
  const dist = Math.hypot(aimX, aimY);
  if (dist < 6) return;
  enemy.angle = Math.atan2(aimY, aimX);
  const reach = Math.min(12, Math.max(4, dist * 0.42));
  const muzzle = muzzleOf(enemy, reach, grid);
  const spread = 0.16;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    const a = aimJitter(enemy.angle + t * spread, 0.04);
    fired.push({
      x: muzzle.x,
      y: muzzle.y,
      dx: Math.cos(a),
      dy: Math.sin(a),
    });
  }
  enemy.noiseTimer = 0.45;
}

function useChampionAbility(enemy, player, fired, dt, grid) {
  const list = enemy.abilities || [];
  if (list.length === 0) return;
  enemy.abilityTimer = (enemy.abilityTimer ?? 1.2) - dt;
  if (enemy.abilityTimer > 0) return;
  const ab = list[enemy.abilityIndex % list.length];
  enemy.abilityIndex = (enemy.abilityIndex + 1) % list.length;
  enemy.abilityTimer = 2.2 + Math.random() * 1.1;
  if (ab === "burst") {
    if (!enemy.aimReady || !shotLineClear(grid, enemy.x, enemy.y, player.x, player.y)) {
      enemy.abilityIndex = (enemy.abilityIndex - 1 + list.length) % list.length;
      enemy.abilityTimer = 0.2;
      return;
    }
    fireVolley(enemy, player, fired, 3, grid);
    enemy.shootCooldown = Math.max(enemy.shootCooldown, 0.9);
  } else if (ab === "shield") {
    enemy.shieldTimer = Math.max(enemy.shieldTimer || 0, 1.7);
    enemy.guarding = true;
    clearStep(enemy);
    enemy.moving = false;
  } else if (ab === "call") {
    enemy.wantsShout = true;
    enemy.wantsBackup = true;
    enemy.thinkTimer = Math.max(enemy.thinkTimer, 0.35);
  } else if (ab === "dash") {
    enemy.dashTimer = 0.7;
    enemy.tactic = "zigzag";
    enemy.tacticTimer = 0.8;
    enemy.zigSign = Math.random() < 0.5 ? 1 : -1;
  } else if (ab === "zigzag") {
    enemy.tactic = "zigzag";
    enemy.tacticTimer = 1.8;
    enemy.thinkTimer = 0.45;
  }
}

function tryShootIfAlert(enemy, player, grid, dt, fired, opts = {}) {
  enemy.shootCooldown = Math.max(0, enemy.shootCooldown - dt);
  if (!enemy.alert || enemy.shootCooldown > 0 || !enemy.aimReady) return;
  if (!shotLineClear(grid, enemy.x, enemy.y, player.x, player.y)) return;
  const huntMode = opts.huntMode === true;
  const kind = kindStats(enemy.kind);
  const vision =
    VISION_RANGE *
    (opts.visionMult ?? 1) *
    kind.visionMult *
    (huntMode ? VISION_HUNT_MULT : 1);
  if (!canSeePlayer(enemy, player, grid, vision)) return;
  const shot = fireAt(enemy, player, grid);
  if (!shot) return;
  enemy.noiseTimer = 0.45;
  const huntCd = huntMode && !opts.huntCalm ? 0.85 : 1;
  const cdMult = huntCd * (opts.enemyFireMult ?? 1) * kind.fireMult;
  enemy.shootCooldown =
    (ENEMY_FIRE_MIN + Math.random() * (ENEMY_FIRE_MAX - ENEMY_FIRE_MIN)) * cdMult;
  fired.push(shot);
}

export function spawnEnemy(spawn, maxHp, kind = "grunt", homeZone = 0, extras = {}) {
  const stats = kindStats(kind);
  const enemy = {
    kind,
    x: spawn.x,
    y: spawn.y,
    radius: kind === "champion" ? 12.6 : 11,
    angle: 0,
    moving: false,
    walkTime: 0,
    stepFrom: null,
    stepTo: null,
    stepT: 0,
    goalCell: null,
    lastCell: { c: spawn.c, r: spawn.r },
    homeZone: Math.max(0, homeZone),
    travelZone: -1,
    mode: "patrol",
    alert: false,
    loseSight: 0,
    abortTimer: ABORT_CHECK_EVERY,
    shootCooldown: ENEMY_FIRE_MIN + Math.random() * (ENEMY_FIRE_MAX - ENEMY_FIRE_MIN),
    aimTime: 0,
    aimReady: false,
    hp: maxHp,
    maxHp,
    plates: stats.plates,
    alive: true,
    shieldTimer: 0,
    tiredTimer: 0,
    pendingCounter: false,
    emergeTimer: EMERGE_DURATION,
    emergeMax: EMERGE_DURATION,
    scale: 1,
    noiseTimer: 0,
    stunTimer: 0,
    wantsShout: false,
    wantsBackup: false,
    thinkTimer: Math.random() * 0.2,
    tactic: "rush",
    tacticTimer: 0.3 + Math.random() * 0.5,
    zigSign: Math.random() < 0.5 ? 1 : -1,
    flankSign: Math.random() < 0.5 ? 1 : -1,
    dashTimer: 0,
    abilities: [],
    abilityIndex: 0,
    abilityTimer: 1.1 + Math.random() * 0.6,
    guarding: false,
  };
  if (kind === "champion") {
    const load = extras.loadout || championLoadout(extras.levelNum || 1, extras.heat);
    enemy.hp = load.hp;
    enemy.maxHp = load.hp;
    enemy.plates = load.plates;
    enemy.abilities = load.abilities.slice();
  }
  return enemy;
}

export function stunEnemy(enemy, seconds) {
  if (!enemy?.alive || seconds <= 0) return;
  enemy.stunTimer = Math.max(enemy.stunTimer || 0, seconds);
}

export function hurtEnemy(enemy) {
  if (enemy.emergeTimer > 0) return false;
  if (enemy.kind === "warden" && enemy.shieldTimer > 0) return false;
  if (enemy.kind === "champion" && enemy.guarding && enemy.shieldTimer > 0) return false;
  if ((enemy.plates ?? 0) > 0) {
    enemy.plates -= 1;
    enemy.shieldTimer = Math.max(enemy.shieldTimer || 0, PLATE_FLASH);
    enemy.alert = true;
    enemy.mode = "chase";
    enemy.loseSight = 0;
    enemy.noiseTimer = Math.max(enemy.noiseTimer || 0, 0.45);
    return false;
  }
  enemy.hp -= 1;
  if (enemy.hp <= 0) enemy.alive = false;
  if (enemy.alive) {
    enemy.alert = true;
    enemy.mode = "chase";
    enemy.loseSight = 0;
  }
  return true;
}

function updateWarden(enemy, grid, walls, player, shots, zones, dt, fired, opts) {
  holdsAim(enemy, player, grid, dt, visionOf(enemy, opts));
  if (enemy.tiredTimer > 0) {
    enemy.tiredTimer = Math.max(0, enemy.tiredTimer - dt);
    enemy.moving = false;
    enemy.walkTime += dt * 0.35;
    return;
  }

  if (enemy.shieldTimer > 0) {
    enemy.shieldTimer = Math.max(0, enemy.shieldTimer - dt);
    if (enemy.shieldTimer === 0) enemy.pendingCounter = true;
    enemy.moving = false;
    enemy.walkTime += dt;
    return;
  }

  if (enemy.pendingCounter) {
    if (!enemy.aimReady || !shotLineClear(grid, enemy.x, enemy.y, player.x, player.y)) {
      updateMovement(enemy, grid, walls, player, shots, zones, dt, opts);
      return;
    }
    enemy.pendingCounter = false;
    const shot = fireAt(enemy, player, grid);
    if (shot) {
      enemy.noiseTimer = 0.45;
      fired.push(shot);
    }
    enemy.tiredTimer = TIRED_DURATION;
    enemy.shootCooldown = TIRED_DURATION;
    enemy.moving = false;
    return;
  }

  if (playerShotNearby(shots, enemy.x, enemy.y, SHIELD_NEAR)) {
    enemy.shieldTimer = SHIELD_DURATION * (opts.wardenShieldMult ?? 1);
    clearStep(enemy);
    enemy.moving = false;
    enemy.alert = true;
    enemy.noiseTimer = Math.max(enemy.noiseTimer || 0, 0.45);
    return;
  }

  updateMovement(enemy, grid, walls, player, shots, zones, dt, opts);
  tryShootIfAlert(enemy, player, grid, dt, fired, opts);
}

function updateChampion(enemy, grid, walls, player, shots, zones, dt, fired, opts) {
  holdsAim(enemy, player, grid, dt, visionOf(enemy, opts));
  if (enemy.guarding && enemy.shieldTimer > 0) {
    enemy.shieldTimer = Math.max(0, enemy.shieldTimer - dt);
    if (enemy.shieldTimer === 0) enemy.guarding = false;
    enemy.moving = false;
    enemy.walkTime += dt;
    enemy.angle = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    return;
  }
  if (enemy.alert) useChampionAbility(enemy, player, fired, dt, grid);
  if (enemy.guarding) {
    enemy.moving = false;
    return;
  }
  updateMovement(enemy, grid, walls, player, shots, zones, dt, opts);
  tryShootIfAlert(enemy, player, grid, dt, fired, opts);
}

function updateGrunt(enemy, grid, walls, player, shots, zones, dt, fired, opts) {
  holdsAim(enemy, player, grid, dt, visionOf(enemy, opts));
  updateMovement(enemy, grid, walls, player, shots, zones, dt, opts);
  tryShootIfAlert(enemy, player, grid, dt, fired, opts);
}

export function updateEnemies(
  enemies,
  grid,
  walls,
  player,
  shots,
  dt,
  locked,
  zones = [],
  opts = {},
) {
  const fired = [];
  if (locked) {
    for (const enemy of enemies) enemy.moving = false;
    return fired;
  }

  const areaList = zones && zones.length > 0 ? zones : [];
  const aiOpts = {
    huntMode: opts.huntMode === true,
    visionMult: opts.visionMult ?? 1,
    enemySpeedMult: opts.enemySpeedMult ?? 1,
    dodgeFail: opts.dodgeFail ?? 0,
    enemyFireMult: opts.enemyFireMult ?? 1,
    wardenShieldMult: opts.wardenShieldMult ?? 1,
    huntCalm: opts.huntCalm === true,
    pack: enemies,
    inkPools: opts.inkPools || [],
  };

  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    if (enemy.noiseTimer > 0) enemy.noiseTimer = Math.max(0, enemy.noiseTimer - dt);
    if (enemy.emergeTimer > 0) {
      enemy.emergeTimer = Math.max(0, enemy.emergeTimer - dt);
      enemy.moving = false;
      continue;
    }

    if (enemy.stunTimer > 0) {
      enemy.stunTimer = Math.max(0, enemy.stunTimer - dt);
      enemy.moving = false;
      continue;
    }

    if (areaList.length > 0 && (enemy.homeZone < 0 || enemy.homeZone >= areaList.length)) {
      const here = worldToCell(enemy.x, enemy.y);
      const idx = zoneIndexAt(areaList, here.c, here.r);
      enemy.homeZone = idx >= 0 ? idx : 0;
    }

    if (enemy.kind !== "warden" && enemy.kind !== "champion" && enemy.shieldTimer > 0) {
      enemy.shieldTimer = Math.max(0, enemy.shieldTimer - dt);
    }

    if (enemy.kind === "warden") {
      updateWarden(enemy, grid, walls, player, shots, areaList, dt, fired, aiOpts);
    } else if (enemy.kind === "champion") {
      updateChampion(enemy, grid, walls, player, shots, areaList, dt, fired, aiOpts);
    } else {
      updateGrunt(enemy, grid, walls, player, shots, areaList, dt, fired, aiOpts);
    }
  }

  for (const enemy of enemies) {
    if (!enemy.alive || !enemy.wantsShout) continue;
    enemy.wantsShout = false;
    shoutToNeighbors(enemies, grid, enemy, player);
  }

  return fired;
}
