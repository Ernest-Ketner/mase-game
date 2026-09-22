const EPS = 1e-6;

export const MAX_BOUNCES = 3;
export const LASER_SPEED = 160;
export const PLAYER_LASER_SPEED = 240;
export const PLAYER_COOLDOWN = 0.9;
/** Полуразброс в радианах: стоя почти точно, на бегу заметно хуже. */
export const PLAYER_STAND_SPREAD = 0.02;
export const PLAYER_MOVE_SPREAD = 0.24;
export const ENEMY_STAND_SPREAD = 0.05;
export const ENEMY_MOVE_SPREAD = 0.3;

export function aimJitter(baseAngle, spread) {
  if (!(spread > 0)) return baseAngle;
  return baseAngle + (Math.random() * 2 - 1) * spread;
}

export function playerFireSpread(moving, moveAcc = 0) {
  if (!moving) return PLAYER_STAND_SPREAD;
  const acc = Math.max(0, Math.min(0.85, moveAcc));
  return PLAYER_MOVE_SPREAD * (1 - acc);
}

export function enemyFireSpread(moving, kind = "grunt") {
  const gunner = kind === "gunner";
  if (moving) return gunner ? 0.22 : ENEMY_MOVE_SPREAD;
  return gunner ? 0.028 : ENEMY_STAND_SPREAD;
}

function raySegmentHit(ox, oy, dx, dy, x1, y1, x2, y2) {
  const sx = x2 - x1;
  const sy = y2 - y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < EPS) return null;
  const qx = x1 - ox;
  const qy = y1 - oy;
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * dy - qy * dx) / denom;
  if (t > 0.04 && u >= -0.001 && u <= 1.001) {
    return { t, x: ox + dx * t, y: oy + dy * t };
  }
  return null;
}

export function closestPointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < EPS) return { x: x1, y: y1 };
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: x1 + dx * t, y: y1 + dy * t };
}

function nearestWall(x, y, dx, dy, walls, skipId) {
  let best = null;
  for (const wall of walls) {
    if (wall.id === skipId) continue;
    const hit = raySegmentHit(x, y, dx, dy, wall.x1, wall.y1, wall.x2, wall.y2);
    if (!hit) continue;
    if (!best || hit.t < best.t) best = { ...hit, wall };
  }
  return best;
}

export function traceLaser(origin, dir, walls, maxBounces = MAX_BOUNCES, maxLen = 2400) {
  let dx = dir.x;
  let dy = dir.y;
  const mag = Math.hypot(dx, dy) || 1;
  dx /= mag;
  dy /= mag;

  let x = origin.x;
  let y = origin.y;
  let remaining = maxLen;
  const points = [{ x, y }];
  let lastWallId = -1;

  for (let bounce = 0; bounce <= maxBounces && remaining > 0; bounce++) {
    const best = nearestWall(x, y, dx, dy, walls, lastWallId);
    if (!best) {
      points.push({ x: x + dx * remaining, y: y + dy * remaining });
      break;
    }
    if (best.t >= remaining) {
      points.push({ x: x + dx * remaining, y: y + dy * remaining });
      break;
    }
    remaining -= best.t;
    x = best.x;
    y = best.y;
    points.push({ x, y });
    if (bounce === maxBounces) break;
    if (best.wall.axis === "v") dx = -dx;
    else dy = -dy;
    lastWallId = best.wall.id;
    x += dx * 0.08;
    y += dy * 0.08;
  }

  return points;
}

export function beamHitsCircle(points, cx, cy, radius) {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const p = closestPointOnSegment(cx, cy, a.x, a.y, b.x, b.y);
    if (Math.hypot(p.x - cx, p.y - cy) <= radius) return true;
  }
  return false;
}

export function createWeapon() {
  return { cooldown: 0, heat: 0, overheated: false };
}

export function updateWeapon(weapon, dt) {
  if (weapon.cooldown > 0) weapon.cooldown = Math.max(0, weapon.cooldown - dt);
  const cool = weapon.overheated ? 0.42 : 0.2;
  if (weapon.heat > 0) weapon.heat = Math.max(0, weapon.heat - cool * dt);
  if (weapon.overheated && weapon.heat <= 0.18) weapon.overheated = false;
}

export function createShot(origin, dir, team, extras = {}) {
  let dx = dir.x;
  let dy = dir.y;
  const mag = Math.hypot(dx, dy) || 1;
  dx /= mag;
  dy /= mag;
  const base = team === "player" ? PLAYER_LASER_SPEED : LASER_SPEED;
  const speed = extras.speed ?? base * (extras.speedMult ?? 1);
  return {
    x: origin.x,
    y: origin.y,
    dx,
    dy,
    speed,
    bounces: 0,
    maxBounces: extras.maxBounces ?? MAX_BOUNCES,
    damage: extras.damage ?? 1,
    pierce: extras.pierce ?? 0,
    lastWallId: -1,
    team,
    trail: [{ x: origin.x, y: origin.y }],
    alive: true,
    radius: extras.radius ?? 5,
    seek: extras.seek === true,
    split: extras.split === true,
    fogCut: extras.fogCut === true,
    inkDrop: extras.inkDrop === true,
    child: extras.child === true,
    bounced: false,
    bouncePos: null,
  };
}

function makePlayerShot(origin, angle, run, wpn, extras = {}) {
  let maxBounces = wpn.bounces + run.mods.bounceBonus;
  if (run.mods.forceNoBounce || wpn.bounces === 0) maxBounces = 0;
  if (extras.child) maxBounces = 0;
  let damage = run.mods.damage;
  if (run.mods.lastClip && Number.isFinite(run.ammo) && run.ammoMax > 0 && run.ammo <= run.ammoMax * 0.25) {
    damage += 1;
  }
  return createShot(
    origin,
    { x: Math.cos(angle), y: Math.sin(angle) },
    "player",
    {
      speed: PLAYER_LASER_SPEED * wpn.speedMult * run.mods.laserSpeedMult,
      maxBounces,
      damage,
      pierce: extras.child ? 0 : (wpn.pierce || 0) + (run.mods.pierceBonus || 0),
      radius: 5 * (run.mods.shotRadiusMult || 1),
      seek: !!run.mods.bounceSeek && !extras.child,
      split: !!run.mods.bounceSplit && !extras.child,
      fogCut: !!run.mods.fogCut,
      inkDrop: !!run.mods.inkPool && run.weaponId === "wpn_shotgun",
      child: extras.child === true,
    },
  );
}

/**
 * Стрельба игрока с учётом оружия и апгрейдов.
 * @returns {object[]|null}
 */
export function tryFirePlayer(weapon, origin, dir, run, wpn, extras = {}) {
  if (weapon.cooldown > 0 || weapon.overheated) return null;
  const usesAmmo = run.weaponId === "wpn_smg" || run.weaponId === "wpn_shotgun";
  if (usesAmmo) {
    if (!Number.isFinite(run.ammo) || run.ammo <= 0) return null;
  }

  const burst = run.mods.smgBurst && run.weaponId === "wpn_smg";
  if (usesAmmo) {
    run.ammo -= burst && run.ammo >= 2 ? 2 : 1;
  }

  weapon.cooldown = wpn.cooldown * run.mods.cooldownMult;
  if (run.mods.lastStand && extras.lowHp) weapon.cooldown *= 0.8;
  if (run.weaponId === "wpn_laser") {
    weapon.heat = Math.min(1, (weapon.heat || 0) + 0.34);
    if (weapon.heat >= 1) {
      weapon.heat = 1;
      weapon.overheated = true;
    }
  }
  const baseAngle = aimJitter(
    Math.atan2(dir.y, dir.x),
    playerFireSpread(!!extras.moving, run.mods.moveAcc || 0),
  );
  const pellets = burst ? 3 : Math.max(1, wpn.pellets || 1);
  const spread = burst ? 0.09 : wpn.spread || 0;
  const shots = [];
  for (let i = 0; i < pellets; i++) {
    let angle = baseAngle;
    if (pellets > 1) {
      const t = (i / (pellets - 1)) * 2 - 1;
      angle = baseAngle + t * spread;
    }
    shots.push(makePlayerShot(origin, angle, run, wpn));
  }

  if (run.mods.doubleTap > 0 && Math.random() < run.mods.doubleTap) {
    if (!usesAmmo || run.ammo > 0) {
      if (usesAmmo) run.ammo -= 1;
      shots.push(makePlayerShot(origin, baseAngle + (Math.random() - 0.5) * 0.08, run, wpn));
    }
  }

  if (run.mods.firstShot && run.firstShotPending) {
    run.firstShotPending = false;
    weapon.cooldown = 0;
    for (const shot of shots) shot.damage = (shot.damage || 1) + 1;
  }

  return shots;
}

export function tryFire(weapon, origin, dir, team) {
  if (weapon.cooldown > 0) return null;
  weapon.cooldown = PLAYER_COOLDOWN;
  return createShot(origin, dir, team);
}

function pushTrail(shot) {
  shot.trail.push({ x: shot.x, y: shot.y });
  let length = 0;
  for (let i = shot.trail.length - 1; i > 0; i--) {
    length += Math.hypot(
      shot.trail[i].x - shot.trail[i - 1].x,
      shot.trail[i].y - shot.trail[i - 1].y,
    );
    if (length > 72) {
      shot.trail.splice(0, i);
      break;
    }
  }
}

export function steerShotToward(shot, x, y, amount = 0.42) {
  const mag = Math.hypot(x - shot.x, y - shot.y) || 1;
  const tx = (x - shot.x) / mag;
  const ty = (y - shot.y) / mag;
  shot.dx += (tx - shot.dx) * amount;
  shot.dy += (ty - shot.dy) * amount;
  const n = Math.hypot(shot.dx, shot.dy) || 1;
  shot.dx /= n;
  shot.dy /= n;
}

export function splitShot(shot) {
  const ang = Math.atan2(shot.dy, shot.dx) + (Math.random() < 0.5 ? 0.35 : -0.35);
  return createShot(
    { x: shot.x, y: shot.y },
    { x: Math.cos(ang), y: Math.sin(ang) },
    shot.team,
    {
      speed: shot.speed * 0.85,
      maxBounces: 0,
      damage: shot.damage,
      pierce: 0,
      radius: shot.radius,
      child: true,
    },
  );
}

export function updateShot(shot, walls, bounds, dt) {
  if (!shot.alive) return;
  shot.bounced = false;
  shot.bouncePos = null;
  let remaining = shot.speed * dt;
  const maxBounces = shot.maxBounces ?? MAX_BOUNCES;
  while (remaining > 0 && shot.alive) {
    const hit = nearestWall(shot.x, shot.y, shot.dx, shot.dy, walls, shot.lastWallId);
    if (!hit || hit.t > remaining + 0.05) {
      shot.x += shot.dx * remaining;
      shot.y += shot.dy * remaining;
      remaining = 0;
      break;
    }
    shot.x = hit.x;
    shot.y = hit.y;
    remaining -= hit.t;
    if (shot.bounces >= maxBounces) {
      shot.alive = false;
      break;
    }
    if (hit.wall.axis === "v") shot.dx = -shot.dx;
    else shot.dy = -shot.dy;
    shot.bounces += 1;
    shot.bounced = true;
    shot.bouncePos = { x: shot.x, y: shot.y };
    shot.lastWallId = hit.wall.id;
    shot.x += shot.dx * 0.08;
    shot.y += shot.dy * 0.08;
  }

  pushTrail(shot);

  if (
    shot.x < bounds.left - 20 ||
    shot.x > bounds.right + 20 ||
    shot.y < bounds.top - 20 ||
    shot.y > bounds.bottom + 20
  ) {
    shot.alive = false;
  }
}

export function shotHitsCircle(shot, cx, cy, radius) {
  return Math.hypot(shot.x - cx, shot.y - cy) <= shot.radius + radius;
}

export function remainingPath(shot, walls) {
  return traceLaser(
    { x: shot.x, y: shot.y },
    { x: shot.dx, y: shot.dy },
    walls,
    (shot.maxBounces ?? MAX_BOUNCES) - shot.bounces,
  );
}
