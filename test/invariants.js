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
      assert(
        cellReachable(level.grid, level.start, { c, r }),
        `seed ${label}: unreachable ${c},${r}`,
      );
    }
  }
  assert(floors > 80, `seed ${label}: too few floors ${floors}`);
  assert(blocks / floors >= 0.92, `seed ${label}: floor blocks ${blocks}/${floors}`);
  assert(leaves === 0, `seed ${label}: dead ends ${leaves}`);
  if (tagId === "arena") {
    assert(solidRect(level.grid, 10, 14, 21, 25), `seed ${label}: arena plaza missing`);
  }
  if (tagId === "a1") {
    assert(solidRect(level.grid, 1, 1, 8, 8), `seed ${label}: A1 hall missing`);
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
