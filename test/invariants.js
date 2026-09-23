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
} from "../js/maze.js";
import { mulberry32 } from "../js/seed.js";
import { createSpawner, beginSheetSpawns, tickSpawner, sheetEnemyCap } from "../js/spawn.js";
import { killQuota } from "../js/objectives.js";

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

function checkLevel(seed, tagId = null) {
  const rng = mulberry32(seed);
  const level = generateLevel(rng, { seed, tag: tagId });
  const label = tagId ? `${seed}/${tagId}` : `${seed}`;
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
    assert(solidRect(level.grid, 10, 14, 21, 25), `seed ${label}: arena plaza missing`);
  }
  if (tagId === "a1") {
    assert(level.cols === 132 && level.rows === 164, `seed ${label}: A1 size ${level.cols}×${level.rows}`);
    assert(level.grid.length === 164 && level.grid[0].length === 132, `seed ${label}: A1 grid mismatch`);
    assert(isFloor(level.grid, 66, 84), `seed ${label}: A1 plaza missing`);
    assert((level.spawnDens?.length || 0) >= 12, `seed ${label}: A1 dens ${level.spawnDens?.length || 0}`);
    assert(
      level.spawnDens.some((den) => den.kind === "camp"),
      `seed ${label}: A1 camps missing`,
    );
  }
  if (tagId === "margin") {
    assert(isFloor(level.grid, 3, 1), `seed ${label}: margin ring missing`);
    assert(isFloor(level.grid, 1, 3), `seed ${label}: margin ring missing`);
  }
  if (tagId === "fold") {
    let walls = 0;
    let sampled = 0;
    for (let r = 1; r < ROWS - 1; r++) {
      sampled += 1;
      if (!isFloor(level.grid, 15, r)) walls += 1;
    }
    assert(walls / sampled >= 0.7, `seed ${label}: fold too open ${walls}/${sampled}`);
    assert(isFloor(level.grid, 15, 7) && isFloor(level.grid, 15, 28), `seed ${label}: fold gates closed`);
  }
  return { seed: label, floors, blocks, dens: level.spawnDens?.length || 0 };
}

const TAGS = ["arena", "a1", "fold", "margin", "draft", "rooms", "narrow", "gate"];

/** Прогон спавнера на листе: всех сразу «убиваем», чтобы упираться только в лимит листа. */
function simulateSpawns(levelNum, objective, tagId = null) {
  const level = generateLevel(mulberry32(levelNum * 131 + 5), { tag: tagId, seed: levelNum });
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
  const a1 = simulateSpawns(5, "marks", "a1");
  assert(a1.spawned <= a1.cap, `a1: spawned ${a1.spawned} > cap ${a1.cap}`);
  lines.push(`a1 sheet 5: cap ${a1.cap} spawned ${a1.spawned}`);
  return lines;
}

export function runInvariants() {
  const results = [];
  for (const seed of SEEDS) results.push(checkLevel(seed));
  for (const tagId of TAGS) {
    for (const seed of SEEDS) results.push(checkLevel(seed + tagId.length * 17, tagId));
  }
  return results;
}

function main() {
  const results = runInvariants();
  for (const r of results) {
    console.log(`ok seed ${r.seed} floors ${r.floors} dens ${r.dens}`);
  }
  console.log(`passed ${results.length} seeds`);
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
