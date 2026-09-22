import { CELL } from "./maze.js";
import { spawnEnemy, enemyHp, pickSpawnKind, isStrongKind, escortCount } from "./enemy.js";

export const MAX_ALIVE = 10;
const PORTAL_CHARGE_TIME = 0.85;
const PORTAL_IDLE_SCALE = 0.4;
const PORTAL_READY_SCALE = 1;

export function createSpawner() {
  return {
    pending: [],
    timer: 8,
    wardenDone: false,
    championDone: 0,
    championEvent: 0,
  };
}

export function resetSpawner(spawner) {
  spawner.pending = [];
  spawner.timer = 8;
  spawner.wardenDone = false;
  spawner.championDone = 0;
  spawner.championEvent = 0;
}

export function wavePhase(hits) {
  if (hits >= 6) return "hunt";
  if (hits >= 3) return "pressure";
  return "scout";
}

function aliveCount(enemies) {
  return enemies.filter((e) => e.alive).length;
}

function hasKind(enemies, pending, kind) {
  return (
    enemies.some((e) => e.alive && e.kind === kind) || pending.some((p) => p.kind === kind)
  );
}

function heatLevel(world) {
  const h = world?.heat ?? world?.run?.heat ?? 0;
  if (h === true) return 1;
  return Math.max(0, Math.floor(Number(h)) || 0);
}

function championCap(levelNum, heat = 0) {
  const h = heat === true ? 1 : Math.max(0, Math.floor(Number(heat)) || 0);
  return levelNum >= 8 || h >= 1 ? 2 : 1;
}

function heatPace(heat) {
  const h = Math.max(0, Math.floor(Number(heat)) || 0);
  if (h <= 0) return 1;
  return Math.max(0.36, 0.72 ** h);
}

function championQueued(enemies, pending) {
  return (
    enemies.filter((e) => e.alive && e.kind === "champion").length +
    pending.filter((p) => p.kind === "champion").length
  );
}

function densForPick(sheet, pending, enemies) {
  const dens = (sheet.spawnDens || []).filter((d) => d.portal);
  if (dens.length === 0) return [];
  const free = dens.filter((den) => {
    if (pending.some((p) => p.den === den)) return false;
    const portal = den.portal;
    return !enemies.some(
      (e) => e.alive && Math.hypot(e.x - portal.x, e.y - portal.y) < CELL * 1.1,
    );
  });
  const pool = free.length > 0 ? free : dens;
  if (sheet.tag === "gate" && pool.length > 1) {
    const pts = sheet.exits?.length
      ? sheet.exits.map((ex) => ex.approach || sheet.exit)
      : sheet.exit
        ? [sheet.exit]
        : [];
    if (pts.length === 0) return pool;
    const ranked = pool.slice().sort((a, b) => {
      const da = Math.min(
        ...pts.map((p) => Math.hypot(a.portal.c - p.c, a.portal.r - p.r)),
      );
      const db = Math.min(
        ...pts.map((p) => Math.hypot(b.portal.c - p.c, b.portal.r - p.r)),
      );
      return da - db;
    });
    return ranked.slice(0, Math.max(1, Math.ceil(ranked.length * 0.55)));
  }
  return pool;
}

export function pickSpawnDen(sheet, pending, enemies, rng = Math.random) {
  const pool = densForPick(sheet, pending, enemies);
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

export function queueSpawn(spawner, world, kind = "grunt", den = null, force = false) {
  const { enemies, sheet } = world;
  if (!force && aliveCount(enemies) + spawner.pending.length >= MAX_ALIVE) return false;
  if (kind === "warden" && hasKind(enemies, spawner.pending, "warden")) return false;
  if (kind === "champion" && championQueued(enemies, spawner.pending) >= championCap(world.levelNum, heatLevel(world))) {
    return false;
  }
  const nest = den || pickSpawnDen(sheet, spawner.pending, enemies);
  if (!nest) return false;
  const job = {
    den: nest,
    kind,
    charge: kind === "champion" ? -0.35 : 0,
    event: kind === "champion",
  };
  spawner.pending.push(job);
  return true;
}

export function queuePack(spawner, world, kind = "grunt") {
  const escorts = escortCount(kind);
  const used = aliveCount(world.enemies) + spawner.pending.length;
  if (used >= MAX_ALIVE && !isStrongKind(kind)) return false;
  if (isStrongKind(kind) && used + 1 + Math.min(1, escorts) > MAX_ALIVE + 2) return false;
  const den = pickSpawnDen(world.sheet, spawner.pending, world.enemies);
  if (!queueSpawn(spawner, world, kind, den)) return false;
  const job = spawner.pending[spawner.pending.length - 1];
  const nest = job?.den || den;
  for (let i = 0; i < escorts; i++) {
    if (!queueSpawn(spawner, world, "grunt", nest, true)) break;
    spawner.pending[spawner.pending.length - 1].charge = -0.22 * (i + 1);
  }
  return true;
}

export function beginSheetSpawns(spawner, world) {
  resetSpawner(spawner);
  queuePack(spawner, world, "grunt");
  const pace = heatPace(heatLevel(world));
  if (world.levelNum === 1) {
    spawner.timer = 14 * pace;
    return;
  }
  if (world.levelNum >= 6) queuePack(spawner, world, pickSpawnKind(world.levelNum));
  spawner.timer = 9 * pace;
}

export function updatePortalCharges(spawner, world, dt) {
  const { sheet, enemies, run, levelNum } = world;
  const still = [];
  for (const job of spawner.pending) {
    const dur = job.kind === "champion" ? PORTAL_CHARGE_TIME * 1.45 : PORTAL_CHARGE_TIME;
    job.charge += dt / dur;
    if (job.charge < 1) {
      const t = Math.max(0, job.charge);
      const ready = job.kind === "champion" ? 1.25 : PORTAL_READY_SCALE;
      job.den.portal.scale = PORTAL_IDLE_SCALE + (ready - PORTAL_IDLE_SCALE) * t;
      job.den.portal.charge = t;
      still.push(job);
      continue;
    }
    const portal = job.den.portal;
    const heat = heatLevel(world);
    const maxHp = enemyHp(levelNum, heat);
    const zoneId = Math.max(0, (sheet.spawnDens || []).indexOf(job.den));
    const spawned = spawnEnemy(
      { c: portal.c, r: portal.r, x: portal.x, y: portal.y },
      maxHp,
      job.kind,
      zoneId,
      { levelNum, heat },
    );
    if (job.kind !== "champion") {
      spawned.hp = Math.max(1, spawned.hp - (run.mods.spawnWound || 0));
    }
    const packmates = enemies.filter(
      (e) => e.alive && Math.hypot(e.x - portal.x, e.y - portal.y) < CELL,
    ).length;
    spawned.x += (packmates % 2 === 0 ? -1 : 1) * 6;
    spawned.y += (packmates % 3 - 1) * 4;
    enemies.push(spawned);
    job.den.portal.scale = PORTAL_IDLE_SCALE;
    job.den.portal.charge = 0;
    if (job.event) world.onChampionSpawn?.(spawned);
    world.onSpawn?.(spawned);
  }
  spawner.pending = still;

  for (const den of sheet.spawnDens || []) {
    if (!den.portal) continue;
    if (spawner.pending.some((p) => p.den === den)) continue;
    den.portal.scale += (PORTAL_IDLE_SCALE - den.portal.scale) * Math.min(1, dt * 4);
    den.portal.charge = 0;
  }
}

export function tickSpawner(spawner, dt, world) {
  if (spawner.championEvent > 0) {
    spawner.championEvent = Math.max(0, spawner.championEvent - dt);
  }
  updatePortalCharges(spawner, world, dt);
  const hits = world.hitCount();
  const phase = wavePhase(hits);
  const levelNum = world.levelNum;

  const heat = heatLevel(world);
  const champMin = heat >= 1 && levelNum >= 2 ? 2 : 3;
  const capChamp = championCap(levelNum, heat);

  if (world.sheet?.objective === "boss" && spawner.championDone < 1 && levelNum >= 3) {
    if (queuePack(spawner, world, "champion")) {
      spawner.championDone += 1;
      spawner.championEvent = 0.85;
      world.onChampionEvent?.();
    }
  }

  if (phase !== "scout") {
    if (levelNum >= 2 && !spawner.wardenDone) {
      if (queuePack(spawner, world, "warden")) spawner.wardenDone = true;
    }
    const needHits = spawner.championDone === 0 ? 3 : 5;
    if (levelNum >= champMin && spawner.championDone < capChamp && hits >= needHits) {
      if (queuePack(spawner, world, "champion")) {
        spawner.championDone += 1;
        spawner.championEvent = 0.85;
        world.onChampionEvent?.();
      }
    }
  }

  spawner.timer -= dt;
  if (spawner.timer > 0) return phase;

  const used = aliveCount(world.enemies) + spawner.pending.length;
  const cap = (phase === "scout" ? 4 : phase === "pressure" ? 7 : MAX_ALIVE) + 2 * heat;
  if (used >= cap) {
    spawner.timer = 2.2;
    return phase;
  }

  const pace = heatPace(heat);
  if (phase === "scout") {
    if (levelNum === 1) queueSpawn(spawner, world, "grunt");
    else queuePack(spawner, world, "grunt");
    spawner.timer = (levelNum === 1 ? 16 : 11) * pace;
    return phase;
  }

  const kind = pickSpawnKind(levelNum);
  queuePack(spawner, world, kind);
  spawner.timer = (phase === "hunt" ? 9 : 6.5) * pace;
  return phase;
}

export function spawnMenuGrunt(sheet, enemies) {
  const den = (sheet.spawnDens || []).find((d) => d.portal);
  if (!den) return null;
  const portal = den.portal;
  const enemy = spawnEnemy(
    { c: portal.c, r: portal.r, x: portal.x, y: portal.y },
    1,
    "grunt",
    0,
    { levelNum: 1 },
  );
  enemy.emergeTimer = 0;
  enemies.push(enemy);
  return enemy;
}
