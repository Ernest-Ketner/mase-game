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

function checkLevel(seed) {
  const rng = mulberry32(seed);
  const level = generateLevel(rng, { seed });
  assert(level.targets.length === TARGET_COUNT, `seed ${seed}: targets ${level.targets.length}`);
  assert(level.start.r < 8 && level.start.c < 12, `seed ${seed}: entry not top-left-ish`);
  const exits = level.exits?.length ? level.exits : [{ kind: "exit", approach: level.exit }];
  for (const ex of exits) {
    const cell = ex.approach || level.exit;
    assert(cell && cell.r >= ROWS - 8, `seed ${seed}: ${ex.kind || "exit"} not bottom`);
    assert(
      cellReachable(level.grid, level.start, cell),
      `seed ${seed}: ${ex.kind || "exit"} unreachable`,
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
        `seed ${seed}: unreachable ${c},${r}`,
      );
    }
  }
  assert(floors > 80, `seed ${seed}: too few floors ${floors}`);
  assert(blocks / floors >= 0.92, `seed ${seed}: floor blocks ${blocks}/${floors}`);
  assert(leaves === 0, `seed ${seed}: dead ends ${leaves}`);
  return { seed, floors, blocks, dens: level.spawnDens?.length || 0 };
}

export function runInvariants() {
  const results = [];
  for (const seed of SEEDS) results.push(checkLevel(seed));
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
