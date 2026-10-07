import {
  generateLevel,
  isFloor,
  cellReachable,
  coveredByFloorBlock,
  isRimGateCell,
  openNeighbors,
  COLS,
  ROWS,
  TARGET_COUNT,
  sheetDims,
  sheetScale,
} from "../js/maze.js";
import { mulberry32 } from "../js/seed.js";
import { createSpawner, beginSheetSpawns, tickSpawner, sheetEnemyCap } from "../js/spawn.js";
import { killQuota, pickSheetObjective } from "../js/objectives.js";

const SEEDS = [1, 7, 42, 99, 2026, 314159, 777, 12345];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function solidRect(grid, c0, r0, c1, r1) {
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (!isFloor(grid, c, r)) return false;
    }
  }
  return true;
}

const DOOR_STATS = { rooms: 0, tidy: 0 };

/** Двери комнаты — связные куски пола в кольце клеток вокруг неё. */
function doorsOf(grid, den) {
  const c0 = den.origin.c - 1;
  const r0 = den.origin.r - 1;
  const c1 = den.origin.c + den.w;
  const r1 = den.origin.r + den.h;
  const ring = [];
  for (let c = c0 + 1; c < c1; c++) ring.push([c, r0], [c, r1]);
  for (let r = r0 + 1; r < r1; r++) ring.push([c0, r], [c1, r]);
  const open = new Set(ring.filter(([c, r]) => isFloor(grid, c, r)).map(([c, r]) => `${c},${r}`));
  const seen = new Set();
  let doors = 0;
  for (const key of open) {
    if (seen.has(key)) continue;
    doors += 1;
    const stack = [key];
    seen.add(key);
    while (stack.length > 0) {
      const [c, r] = stack.pop().split(",").map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${c + dc},${r + dr}`;
        if (open.has(k) && !seen.has(k)) {
          seen.add(k);
          stack.push(k);
        }
      }
    }
  }
  return doors;
}

function checkLevel(seed, tagId = null, levelNum = 1) {
  const T0 = performance.now();
  const rng = mulberry32(seed);
  const level = generateLevel(rng, { seed, tag: tagId, levelNum });
  const label = `${seed}${tagId ? `/${tagId}` : ""}${levelNum > 1 ? `@${levelNum}` : ""}`;
  const dims = sheetDims(levelNum);
  assert(level.cols === dims.cols && level.rows === dims.rows, `seed ${label}: size ${level.cols}×${level.rows}`);
  assert(level.grid.length === ROWS && level.grid[0].length === COLS, `seed ${label}: grid mismatch`);
  assert(level.targets.length === TARGET_COUNT, `seed ${label}: targets ${level.targets.length}`);
  assert(level.start.r < 8 && level.start.c < 12, `seed ${label}: entry not top-left-ish`);
  const exits = level.exits?.length ? level.exits : [{ kind: "exit", approach: level.exit }];
  for (const ex of exits) {
    const cell = ex.approach || level.exit;
    assert(cell && cell.r >= ROWS - 8, `seed ${label}: ${ex.kind || "exit"} not bottom`);
    assert(
      cellReachable(level.grid, level.start, cell),
      `seed ${label}: ${ex.kind || "exit"} unreachable`,
    );
  }

  let floors = 0;
  let blocks = 0;
  let leaves = 0;
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      if (!isFloor(level.grid, c, r)) continue;
      floors += 1;
      if (coveredByFloorBlock(level.grid, c, r)) blocks += 1;
      if (!isRimGateCell(c, r) && openNeighbors(level.grid, c, r).length < 2) leaves += 1;
      if ((level.cols || COLS) <= 40) {
        assert(
          cellReachable(level.grid, level.start, { c, r }),
          `seed ${label}: unreachable ${c},${r}`,
        );
      }
    }
  }
  if ((level.cols || COLS) > 40) {
    const reach = new Set();
    const queue = [level.start];
    reach.add(`${level.start.c},${level.start.r}`);
    while (queue.length > 0) {
      const cur = queue.pop();
      for (const n of openNeighbors(level.grid, cur.c, cur.r)) {
        const key = `${n.c},${n.r}`;
        if (reach.has(key)) continue;
        reach.add(key);
        queue.push(n);
      }
    }
    let reached = 0;
    for (const key of reach) {
      const [c, r] = key.split(",").map(Number);
      if (r >= 1 && r < ROWS - 1 && c >= 1 && c < COLS - 1) reached += 1;
    }
    assert(reached === floors, `seed ${label}: unreachable floors ${floors - reached}`);
  }
  assert(floors > 80, `seed ${label}: too few floors ${floors}`);
  assert(blocks / floors >= 0.92, `seed ${label}: floor blocks ${blocks}/${floors}`);
  assert(leaves === 0, `seed ${label}: dead ends ${leaves}`);
  const blobs = level.blots || [];
  assert(blobs.length >= 2, `seed ${label}: blot count ${blobs.length}`);
  for (const blob of blobs) {
    assert(blob.length >= 8 && blob.length <= 16, `seed ${label}: blot size ${blob.length}`);
  }
  assert(isFloor(level.grid, level.start.c, level.start.r), `seed ${label}: start buried in ink`);
  if (tagId === "arena") {
    const cc = Math.floor(COLS / 2);
    const rc = Math.floor(ROWS / 2);
    assert(solidRect(level.grid, cc - 5, rc - 5, cc + 4, rc + 4), `seed ${label}: arena plaza missing`);
  }
  if (tagId === "margin") {
    assert(isFloor(level.grid, 3, 1), `seed ${label}: margin ring missing`);
    assert(isFloor(level.grid, 1, 3), `seed ${label}: margin ring missing`);
  }
  if (tagId === "fold") {
    const foldBc = Math.floor(Math.floor((COLS - 4) / 3 + 1) * 0.45);
    const foldCol = 3 * (foldBc + 1);
    const bayRows = Math.floor((ROWS - 4) / 3) + 1;
    const gateRows = [Math.floor(bayRows * 0.2), Math.floor(bayRows * 0.72)].map((br) => 1 + br * 3);
    let walls = 0;
    let sampled = 0;
    for (let r = 1; r < ROWS - 1; r++) {
      sampled += 1;
      if (!isFloor(level.grid, foldCol, r)) walls += 1;
    }
    assert(walls / sampled >= 0.7, `seed ${label}: fold too open ${walls}/${sampled}`);
    assert(
      gateRows.every((r) => isFloor(level.grid, foldCol, r)),
      `seed ${label}: fold gates closed`,
    );
  }
  const rooms = (level.spawnDens || []).filter((den) => den.kind === "room");
  if (!["arena", "margin", "fold"].includes(tagId) && rooms.length > 0) {
    const doors = rooms.map((den) => doorsOf(level.grid, den));
    const bad = rooms.find((den, i) => doors[i] < 1 || doors[i] > 4);
    assert(!bad, `seed ${label}: room at ${bad?.origin.c},${bad?.origin.r} ${bad?.w}×${bad?.h} doors ${doors.join(",")}`);
    DOOR_STATS.rooms += rooms.length;
    DOOR_STATS.tidy += doors.filter((d) => d <= 2).length;
  }
  if (levelNum >= 8) {
    const minDens = Math.round(8 * (COLS / 33));
    assert((level.spawnDens?.length || 0) >= minDens, `seed ${label}: dens ${level.spawnDens?.length || 0} < ${minDens}`);
  }
  return { seed: label, floors, blocks, dens: level.spawnDens?.length || 0, ms: Math.round(performance.now() - T0) };
}

const TAGS = ["arena", "fold", "margin", "draft", "rooms", "narrow", "gate"];
const GROWTH = [2, 5, 8, 12, 16, 20, 25];

/** Прогон спавнера на листе: всех сразу «убиваем», чтобы упираться только в лимит листа. */
function simulateSpawns(levelNum, objective, tagId = null) {
  const level = generateLevel(mulberry32(levelNum * 131 + 5), { tag: tagId, seed: levelNum, levelNum });
  level.objective = objective;
  const spawner = createSpawner();
  let spawned = 0;
  let champions = 0;
  const enemies = [];
  const world = {
    sheet: level,
    enemies,
    levelNum,
    heat: 0,
    run: { mods: { spawnWound: 0 }, heat: 0 },
    player: { x: level.start.c * 20, y: level.start.r * 20 },
    hitCount: () => 7,
    onSpawn(e) {
      spawned += 1;
      if (e.kind === "champion") champions += 1;
    },
  };
  beginSheetSpawns(spawner, world);
  for (let step = 0; step < 12000; step++) {
    tickSpawner(spawner, 0.25, world);
    for (const e of enemies) e.alive = false;
    enemies.length = 0;
  }
  return { spawned, champions, cap: sheetEnemyCap(levelNum) };
}

function checkSpawnCaps() {
  const lines = [];
  for (let n = 1; n <= 24; n++) {
    const cap = sheetEnemyCap(n);
    assert(cap === 10 + 5 * (n - 1), `sheet ${n}: cap ${cap}`);
    if (n >= 2) assert(killQuota(n) <= cap, `sheet ${n}: kill quota ${killQuota(n)} > cap ${cap}`);
    const plain = simulateSpawns(n, "marks");
    assert(plain.spawned <= cap, `sheet ${n}: spawned ${plain.spawned} > cap ${cap}`);
    assert(plain.spawned >= cap - 2, `sheet ${n}: spawner stalled at ${plain.spawned}/${cap}`);
    if (n >= 3) {
      const boss = simulateSpawns(n, "boss");
      assert(boss.champions >= 1, `sheet ${n}: boss champion missing`);
      assert(boss.spawned <= cap + 3, `sheet ${n}: boss sheet spawned ${boss.spawned} > cap ${cap}+3`);
    }
    lines.push(`sheet ${n}: cap ${cap} spawned ${plain.spawned}`);
  }
  return lines;
}

function checkGrowth() {
  let prev = 0;
  for (let n = 1; n <= 30; n++) {
    const { cols, rows } = sheetDims(n);
    assert(cols >= prev, `sheet ${n}: field shrank ${cols} < ${prev}`);
    assert(n < 20 || (cols === 132 && rows === 164), `sheet ${n}: not A1 ${cols}×${rows}`);
    prev = cols;
  }
  assert(sheetDims(1).cols === 33 && sheetDims(1).rows === 41, "sheet 1: not 33×41");
  let pass = 0;
  let bigSheets = 0;
  for (let seed = 1; seed <= 400; seed++) {
    for (let n = 2; n <= 30; n++) {
      const id = pickSheetObjective(n, seed).id;
      if (sheetScale(n) < 2) {
        assert(id !== "pass", `sheet ${n} seed ${seed}: pass on small sheet`);
        continue;
      }
      bigSheets += 1;
      if (id === "pass") pass += 1;
    }
  }
  const share = pass / bigSheets;
  assert(share > 0.02 && share < 0.09, `pass share ${share.toFixed(3)}`);
  return `growth ok, pass ${(share * 100).toFixed(1)}% on big sheets`;
}

export function runInvariants() {
  const results = [];
  for (const seed of SEEDS) results.push(checkLevel(seed));
  for (const tagId of TAGS) {
    for (const seed of SEEDS) results.push(checkLevel(seed + tagId.length * 17, tagId));
  }
  for (const n of GROWTH) {
    for (const seed of SEEDS.slice(0, 3)) results.push(checkLevel(seed + n * 7, null, n));
    for (const tagId of TAGS) results.push(checkLevel(n * 31 + tagId.length, tagId, n));
  }
  const share = DOOR_STATS.tidy / Math.max(1, DOOR_STATS.rooms);
  assert(share >= 0.95, `rooms with 1–2 doors ${(share * 100).toFixed(1)}%`);
  return results;
}

function main() {
  const results = runInvariants();
  for (const r of results) {
    console.log(`ok seed ${r.seed} floors ${r.floors} dens ${r.dens} ${r.ms}ms`);
  }
  console.log(`passed ${results.length} seeds`);
  console.log(`ok ${checkGrowth()}`);
  for (const line of checkSpawnCaps()) console.log(`ok ${line}`);
}

const isNode = typeof process !== "undefined" && process.versions?.node;
if (isNode) {
  try {
    main();
  } catch (err) {
    console.error(err.message || err);
    process.exitCode = 1;
  }
}
