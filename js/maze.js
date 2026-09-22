export const COLS = 33;
export const ROWS = 41;
/** 5 мм при масштабе 4 px/мм → поле 165×205 мм. */
export const CELL = 20;
export const MARGIN = 40;
export const TARGET_COUNT = 7;
export const TARGET_RADIUS = 8;
export const NEST_SIZE = 5;
export const BAY_COLS = 10;
export const BAY_ROWS = 13;
export const TARGET_MIN_SEP = 5;
export const FIELD_MM = { width: 165, height: 205, cell: 5 };

export function isFloor(grid, c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
  return grid[r][c] === "floor";
}

export function isWall(grid, c, r) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
  return grid[r][c] === "wall";
}

export function worldToCell(x, y) {
  return {
    c: Math.max(0, Math.min(COLS - 1, Math.floor((x - MARGIN) / CELL))),
    r: Math.max(0, Math.min(ROWS - 1, Math.floor((y - MARGIN) / CELL))),
  };
}

export function openNeighbors(grid, c, r) {
  const out = [];
  const dirs = [
    { c, r: r - 1 },
    { c: c + 1, r },
    { c, r: r + 1 },
    { c: c - 1, r },
  ];
  for (const n of dirs) {
    if (isFloor(grid, n.c, n.r)) out.push(n);
  }
  return out;
}

export function worldSize() {
  return {
    width: MARGIN * 2 + COLS * CELL,
    height: MARGIN * 2 + ROWS * CELL,
  };
}

export function cellCenter(c, r) {
  return {
    x: MARGIN + c * CELL + CELL / 2,
    y: MARGIN + r * CELL + CELL / 2,
  };
}

function shuffle(list, rng) {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function makeGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill("wall"));
}

function openBay(grid, bc, br) {
  const c0 = 1 + bc * 3;
  const r0 = 1 + br * 3;
  if (c0 + 1 >= COLS - 1 || r0 + 1 >= ROWS - 1) return;
  grid[r0][c0] = "floor";
  grid[r0][c0 + 1] = "floor";
  grid[r0 + 1][c0] = "floor";
  grid[r0 + 1][c0 + 1] = "floor";
}

function openLink(grid, a, b) {
  if (b.bc === a.bc + 1 && b.br === a.br) {
    const wallC = 3 * (a.bc + 1);
    const r0 = 1 + a.br * 3;
    if (wallC > 0 && wallC < COLS - 1) {
      grid[r0][wallC] = "floor";
      grid[r0 + 1][wallC] = "floor";
    }
    return;
  }
  if (b.br === a.br + 1 && b.bc === a.bc) {
    const wallR = 3 * (a.br + 1);
    const c0 = 1 + a.bc * 3;
    if (wallR > 0 && wallR < ROWS - 1) {
      grid[wallR][c0] = "floor";
      grid[wallR][c0 + 1] = "floor";
    }
    return;
  }
  openLink(grid, b, a);
}

function carveBays(grid, rng) {
  for (let br = 0; br < BAY_ROWS; br++) {
    for (let bc = 0; bc < BAY_COLS; bc++) openBay(grid, bc, br);
  }

  const visited = Array.from({ length: BAY_ROWS }, () => Array(BAY_COLS).fill(false));
  const stack = [{ bc: 0, br: 0 }];
  visited[0][0] = true;
  const dirs = [
    { dbc: -1, dbr: 0 },
    { dbc: 1, dbr: 0 },
    { dbc: 0, dbr: -1 },
    { dbc: 0, dbr: 1 },
  ];

  while (stack.length > 0) {
    const cur = stack[stack.length - 1];
    const neigh = [];
    for (const d of dirs) {
      const nbc = cur.bc + d.dbc;
      const nbr = cur.br + d.dbr;
      if (nbc < 0 || nbr < 0 || nbc >= BAY_COLS || nbr >= BAY_ROWS) continue;
      if (visited[nbr][nbc]) continue;
      neigh.push({ bc: nbc, br: nbr });
    }
    if (neigh.length === 0) {
      stack.pop();
      continue;
    }
    const next = neigh[Math.floor(rng() * neigh.length)];
    openLink(grid, cur, next);
    visited[next.br][next.bc] = true;
    stack.push(next);
  }
}

function bayNeighborList(bc, br) {
  return [
    { bc: bc - 1, br },
    { bc: bc + 1, br },
    { bc, br: br - 1 },
    { bc, br: br + 1 },
  ].filter((n) => n.bc >= 0 && n.br >= 0 && n.bc < BAY_COLS && n.br < BAY_ROWS);
}

function bayLinked(grid, a, b) {
  let lo = a;
  let hi = b;
  if (b.bc < a.bc || (b.bc === a.bc && b.br < a.br)) {
    lo = b;
    hi = a;
  }
  if (hi.bc === lo.bc + 1 && hi.br === lo.br) {
    const wallC = 3 * (lo.bc + 1);
    const r0 = 1 + lo.br * 3;
    return isFloor(grid, wallC, r0) || isFloor(grid, wallC, r0 + 1);
  }
  if (hi.br === lo.br + 1 && hi.bc === lo.bc) {
    const wallR = 3 * (lo.br + 1);
    const c0 = 1 + lo.bc * 3;
    return isFloor(grid, c0, wallR) || isFloor(grid, c0 + 1, wallR);
  }
  return false;
}

function bayDegree(grid, bc, br) {
  let d = 0;
  for (const n of bayNeighborList(bc, br)) {
    if (bayLinked(grid, { bc, br }, n)) d += 1;
  }
  return d;
}

/** Добавляет петли в bay-граф, чтобы у каждого bay степень ≥ 2. */
function addBayLoops(grid, rng, extraFrac = 0.12) {
  for (let pass = 0; pass < 6; pass++) {
    let fixed = 0;
    for (let br = 0; br < BAY_ROWS; br++) {
      for (let bc = 0; bc < BAY_COLS; bc++) {
        let guard = 0;
        while (bayDegree(grid, bc, br) < 2 && guard < 8) {
          guard += 1;
          const candidates = bayNeighborList(bc, br).filter(
            (n) => !bayLinked(grid, { bc, br }, n),
          );
          if (candidates.length === 0) break;
          const pick = candidates[Math.floor(rng() * candidates.length)];
          const before = bayDegree(grid, bc, br);
          openLink(grid, { bc, br }, pick);
          if (bayDegree(grid, bc, br) <= before) break;
          fixed += 1;
        }
      }
    }
    if (fixed === 0) break;
  }
  // Дополнительные петли для разнообразия.
  for (let i = 0; i < Math.floor(BAY_COLS * BAY_ROWS * extraFrac); i++) {
    const bc = Math.floor(rng() * BAY_COLS);
    const br = Math.floor(rng() * BAY_ROWS);
    const candidates = bayNeighborList(bc, br).filter(
      (n) => !bayLinked(grid, { bc, br }, n),
    );
    if (candidates.length === 0) continue;
    openLink(grid, { bc, br }, candidates[Math.floor(rng() * candidates.length)]);
  }
}

export function isRimGateCell(c, r) {
  return r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1;
}

function tryConnectLeaf(grid, cell, rng) {
  const neigh = openNeighbors(grid, cell.c, cell.r);
  if (neigh.length !== 1) return false;
  const parent = neigh[0];
  const dirs = shuffle(
    [
      { dc: 0, dr: -1 },
      { dc: 1, dr: 0 },
      { dc: 0, dr: 1 },
      { dc: -1, dr: 0 },
    ],
    rng,
  );
  for (const d of dirs) {
    if (cell.c + d.dc === parent.c && cell.r + d.dr === parent.r) continue;
    for (let step = 1; step <= 5; step++) {
      const nc = cell.c + d.dc * step;
      const nr = cell.r + d.dr * step;
      if (nc < 1 || nr < 1 || nc >= COLS - 1 || nr >= ROWS - 1) break;
      if (isFloor(grid, nc, nr)) {
        for (let s = 1; s < step; s++) {
          const cc = cell.c + d.dc * s;
          const cr = cell.r + d.dr * s;
          grid[cr][cc] = "floor";
          tryExpandToBlock(grid, cc, cr);
        }
        return true;
      }
    }
  }
  const bay = bayOfCell(cell.c, cell.r);
  if (bay) {
    const candidates = bayNeighborList(bay.bc, bay.br).filter(
      (n) => !bayLinked(grid, bay, n),
    );
    if (candidates.length > 0) {
      openLink(grid, bay, candidates[Math.floor(rng() * candidates.length)]);
      return true;
    }
    const any = bayNeighborList(bay.bc, bay.br);
    if (any.length > 0) {
      openLink(grid, bay, any[Math.floor(rng() * any.length)]);
      return true;
    }
  }
  return false;
}

/** Убирает floor-клетки с одним соседом (тупики), кроме внешнего шлюза. */
function removeDeadEnds(grid, rng) {
  for (let guard = 0; guard < 100; guard++) {
    const leaves = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (!isFloor(grid, c, r)) continue;
        if (isRimGateCell(c, r)) continue;
        if (openNeighbors(grid, c, r).length === 1) leaves.push({ c, r });
      }
    }
    if (leaves.length === 0) return;
    shuffle(leaves, rng);
    let progressed = false;
    for (const leaf of leaves) {
      if (!isFloor(grid, leaf.c, leaf.r)) continue;
      if (openNeighbors(grid, leaf.c, leaf.r).length !== 1) continue;
      if (tryConnectLeaf(grid, leaf, rng)) progressed = true;
    }
    if (!progressed) {
      // Последний resort: добить bay-петлями.
      addBayLoops(grid, rng);
      enforceMinFloorBlock(grid, { preferFill: true });
      if (guard > 10) return;
    }
  }
}

/** BFS: следующий шаг от from к goal, или null если недостижимо. */
export function bfsNextCell(grid, from, goal) {
  if (!from || !goal) return null;
  if (from.c === goal.c && from.r === goal.r) return null;
  if (!isFloor(grid, from.c, from.r) || !isFloor(grid, goal.c, goal.r)) return null;

  const key = (c, r) => `${c},${r}`;
  const prev = new Map();
  const queue = [{ c: from.c, r: from.r }];
  prev.set(key(from.c, from.r), null);

  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.c === goal.c && cur.r === goal.r) break;
    for (const n of openNeighbors(grid, cur.c, cur.r)) {
      const k = key(n.c, n.r);
      if (prev.has(k)) continue;
      prev.set(k, cur);
      queue.push(n);
    }
  }

  const goalKey = key(goal.c, goal.r);
  if (!prev.has(goalKey)) return null;

  let step = { c: goal.c, r: goal.r };
  while (true) {
    const p = prev.get(key(step.c, step.r));
    if (!p) return null;
    if (p.c === from.c && p.r === from.r) return { c: step.c, r: step.r };
    step = p;
  }
}

export function cellReachable(grid, from, goal) {
  if (!from || !goal) return false;
  if (from.c === goal.c && from.r === goal.r) return true;
  return bfsNextCell(grid, from, goal) !== null;
}

function mergeBays(grid, bc0, br0, bw, bh) {
  for (let br = br0; br < br0 + bh; br++) {
    for (let bc = bc0; bc < bc0 + bw; bc++) {
      if (bc < 0 || br < 0 || bc >= BAY_COLS || br >= BAY_ROWS) continue;
      openBay(grid, bc, br);
      if (bc > bc0) openLink(grid, { bc: bc - 1, br }, { bc, br });
      if (br > br0) openLink(grid, { bc, br: br - 1 }, { bc, br });
    }
  }
}

function rectsOverlap(a, b, pad) {
  return !(
    a.bc0 + a.bw + pad <= b.bc0 ||
    b.bc0 + b.bw + pad <= a.bc0 ||
    a.br0 + a.bh + pad <= b.br0 ||
    b.br0 + b.bh + pad <= a.br0
  );
}

function placeRooms(grid, rng, reserved, wantCount = null) {
  const rooms = [];
  const count = wantCount ?? 10 + Math.floor(rng() * 5);
  for (let attempt = 0; attempt < count * 8 && rooms.length < count; attempt++) {
    const bw = 2 + Math.floor(rng() * 3);
    const bh = 2 + Math.floor(rng() * 3);
    const bc0 = Math.floor(rng() * Math.max(1, BAY_COLS - bw + 1));
    const br0 = Math.floor(rng() * Math.max(1, BAY_ROWS - bh + 1));
    const rect = { bc0, br0, bw, bh };
    const hitsReserved = reserved.some((r) => rectsOverlap(rect, r, 0));
    if (hitsReserved) continue;
    const hitsRoom = rooms.some((r) => rectsOverlap(rect, r, 1));
    if (hitsRoom) continue;
    mergeBays(grid, bc0, br0, bw, bh);
    rooms.push(rect);
  }
  return rooms;
}

function bayRectToRoom(grid, rect) {
  const origin = bayOriginCell(rect.bc0, rect.br0);
  const w = rect.bw * 3 - 1;
  const h = rect.bh * 3 - 1;
  return {
    origin,
    w,
    h,
    cells: roomCells(grid, origin, w, h),
  };
}

function buildSpawnDens(grid, placedRooms, ...keepOut) {
  const blocked = new Set();
  for (const room of keepOut) {
    for (const p of room?.cells || []) blocked.add(`${p.c},${p.r}`);
  }
  const dens = [];
  for (const rect of placedRooms) {
    const room = bayRectToRoom(grid, rect);
    if (room.cells.length < 8) continue;
    const overlap = room.cells.filter((p) => blocked.has(`${p.c},${p.r}`)).length;
    if (overlap > room.cells.length * 0.4) continue;
    const portal = pickPortalCell(room);
    if (!portal) continue;
    const pos = cellCenter(portal.c, portal.r);
    dens.push({
      ...room,
      kind: "room",
      portal: { c: portal.c, r: portal.r, x: pos.x, y: pos.y },
    });
  }
  return dens;
}

function pickPortalCell(room) {
  if (!room.cells.length) return null;
  const cx = room.origin.c + (room.w - 1) / 2;
  const cy = room.origin.r + (room.h - 1) / 2;
  let best = room.cells[0];
  let bestD = Infinity;
  for (const cell of room.cells) {
    const d = Math.hypot(cell.c - cx, cell.r - cy);
    if (d < bestD) {
      bestD = d;
      best = cell;
    }
  }
  return best;
}

function bayOriginCell(bc, br) {
  return { c: 1 + bc * 3, r: 1 + br * 3 };
}

/** Вход сверху слева; оба выхода снизу. rng выбирает, какой угол жаркий. */
function pickSideBays(rng) {
  return {
    entry: { bc: 0, br: 0 },
    exitLeft: { bc: 0, br: BAY_ROWS - 2 },
    exitRight: { bc: BAY_COLS - 2, br: BAY_ROWS - 2 },
    heatOnRight: rng() < 0.5,
  };
}

function roomCells(grid, origin, w, h) {
  const list = [];
  for (let r = origin.r; r < origin.r + h; r++) {
    for (let c = origin.c; c < origin.c + w; c++) {
      if (isFloor(grid, c, r)) list.push({ c, r });
    }
  }
  return list;
}

function findDoor(grid, members, rng) {
  const inside = new Set(members.map((m) => `${m.c},${m.r}`));
  const doors = [];
  for (const m of members) {
    for (const n of openNeighbors(grid, m.c, m.r)) {
      if (!inside.has(`${n.c},${n.r}`)) doors.push(n);
    }
  }
  if (doors.length === 0) return null;
  return doors[Math.floor(rng() * doors.length)];
}

function punchInwardDoor(grid, origin, size) {
  const alongH = origin.c < COLS / 2;
  if (alongH) {
    const c = Math.max(1, Math.min(COLS - 2, origin.c + size));
    for (let i = 0; i < 2; i++) {
      const r = origin.r + 1 + i;
      if (r > 0 && r < ROWS - 1) grid[r][c] = "floor";
    }
    return { c, r: origin.r + 1 };
  }
  const r = Math.max(1, Math.min(ROWS - 2, origin.r + size));
  for (let i = 0; i < 2; i++) {
    const c = origin.c + 1 + i;
    if (c > 0 && c < COLS - 1) grid[r][c] = "floor";
  }
  return { c: origin.c + 1, r };
}

function roomFromBays(grid, corner, rng) {
  mergeBays(grid, corner.bc, corner.br, 2, 2);
  const origin = bayOriginCell(corner.bc, corner.br);
  const size = NEST_SIZE;
  const cells = roomCells(grid, origin, size, size);
  let door = findDoor(grid, cells, rng);
  if (!door) door = punchInwardDoor(grid, origin, size);
  return { origin, cells, door, w: size, h: size };
}

function pickCorners(rng) {
  const sides = pickSideBays(rng);
  return {
    entry: bayOriginCell(sides.entry.bc, sides.entry.br),
    exitLeft: bayOriginCell(sides.exitLeft.bc, sides.exitLeft.br),
    exitRight: bayOriginCell(sides.exitRight.bc, sides.exitRight.br),
    entryBay: sides.entry,
    exitLeftBay: sides.exitLeft,
    exitRightBay: sides.exitRight,
    heatOnRight: sides.heatOnRight,
  };
}

export function coveredByFloorBlock(grid, c, r) {
  const origins = [
    { c, r },
    { c: c - 1, r },
    { c, r: r - 1 },
    { c: c - 1, r: r - 1 },
  ];
  for (const o of origins) {
    if (
      isFloor(grid, o.c, o.r) &&
      isFloor(grid, o.c + 1, o.r) &&
      isFloor(grid, o.c, o.r + 1) &&
      isFloor(grid, o.c + 1, o.r + 1)
    ) {
      return true;
    }
  }
  return false;
}

function tryExpandToBlock(grid, c, r) {
  const candidates = [
    [
      [c, r],
      [c + 1, r],
      [c, r + 1],
      [c + 1, r + 1],
    ],
    [
      [c - 1, r],
      [c, r],
      [c - 1, r + 1],
      [c, r + 1],
    ],
    [
      [c, r - 1],
      [c + 1, r - 1],
      [c, r],
      [c + 1, r],
    ],
    [
      [c - 1, r - 1],
      [c, r - 1],
      [c - 1, r],
      [c, r],
    ],
  ];
  for (const block of candidates) {
    let ok = true;
    for (const [bc, br] of block) {
      if (bc < 1 || br < 1 || bc >= COLS - 1 || br >= ROWS - 1) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    for (const [bc, br] of block) grid[br][bc] = "floor";
    return true;
  }
  return false;
}

function enforceMinFloorBlock(grid, options = {}) {
  const preferFill = options.preferFill === true;
  let changed = true;
  let guard = 0;
  while (changed && guard < 8) {
    changed = false;
    guard += 1;
    const orphans = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (!isFloor(grid, c, r)) continue;
        if (!coveredByFloorBlock(grid, c, r)) orphans.push({ c, r });
      }
    }
    for (const cell of orphans) {
      if (!isFloor(grid, cell.c, cell.r)) continue;
      if (coveredByFloorBlock(grid, cell.c, cell.r)) continue;
      if (!preferFill && tryExpandToBlock(grid, cell.c, cell.r)) {
        changed = true;
      } else {
        grid[cell.r][cell.c] = "wall";
        changed = true;
      }
    }
  }
}

function floorNeighborCount(grid, c, r) {
  let n = 0;
  if (isFloor(grid, c, r - 1)) n += 1;
  if (isFloor(grid, c + 1, r)) n += 1;
  if (isFloor(grid, c, r + 1)) n += 1;
  if (isFloor(grid, c - 1, r)) n += 1;
  return n;
}

/** Убирает только столбы 1×1: стена со всех четырёх сторон окружена полом. */
function removeWallDebris(grid) {
  let changed = true;
  let guard = 0;
  while (changed && guard < 8) {
    changed = false;
    guard += 1;
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (!isWall(grid, c, r)) continue;
        if (floorNeighborCount(grid, c, r) === 4) {
          grid[r][c] = "floor";
          changed = true;
        }
      }
    }
  }
}

function pickSpawnInRoom(room, awayFrom, rng) {
  const ranked = room.cells.slice().sort((a, b) => {
    const da = Math.abs(a.c - awayFrom.c) + Math.abs(a.r - awayFrom.r);
    const db = Math.abs(b.c - awayFrom.c) + Math.abs(b.r - awayFrom.r);
    return db - da;
  });
  if (ranked.length === 0) return room.door;
  const top = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 3)));
  return top[Math.floor(rng() * top.length)];
}

function polishGrid(grid) {
  // Сначала закрываем сиротские floor стеной (не раздуваем в стены),
  // затем снимаем только настоящие столбы 1×1.
  enforceMinFloorBlock(grid, { preferFill: true });
  removeWallDebris(grid);
  enforceMinFloorBlock(grid, { preferFill: true });
  removeWallDebris(grid);
}

function floodFloor(grid, start) {
  const seen = new Set();
  const queue = [];
  if (!isFloor(grid, start.c, start.r)) return seen;
  queue.push(start);
  seen.add(`${start.c},${start.r}`);
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const n of openNeighbors(grid, cur.c, cur.r)) {
      const key = `${n.c},${n.r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(n);
    }
  }
  return seen;
}

function bayOfCell(c, r) {
  if ((c - 1) % 3 > 1 || (r - 1) % 3 > 1) return null;
  return { bc: Math.floor((c - 1) / 3), br: Math.floor((r - 1) / 3) };
}

function reconnectFloors(grid, start) {
  let guard = 0;
  while (guard < 40) {
    guard += 1;
    const reach = floodFloor(grid, start);
    const islands = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (!isFloor(grid, c, r)) continue;
        if (!reach.has(`${c},${r}`)) islands.push({ c, r });
      }
    }
    if (islands.length === 0) return;

    let linked = false;
    for (const cell of islands) {
      const bay = bayOfCell(cell.c, cell.r);
      if (!bay) continue;
      const neighBays = [
        { bc: bay.bc - 1, br: bay.br },
        { bc: bay.bc + 1, br: bay.br },
        { bc: bay.bc, br: bay.br - 1 },
        { bc: bay.bc, br: bay.br + 1 },
      ];
      for (const nb of neighBays) {
        if (nb.bc < 0 || nb.br < 0 || nb.bc >= BAY_COLS || nb.br >= BAY_ROWS) continue;
        const origin = bayOriginCell(nb.bc, nb.br);
        if (reach.has(`${origin.c},${origin.r}`)) {
          openLink(grid, bay, nb);
          linked = true;
          break;
        }
      }
      if (linked) break;
    }
    if (!linked) {
      for (const cell of islands) {
        grid[cell.r][cell.c] = "wall";
      }
      return;
    }
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function makeInk(x1, y1, x2, y2, rng, amp = 1.15) {
  const vertical = Math.abs(x2 - x1) < Math.abs(y2 - y1);
  const over = 0.7 + rng() * 1.1;
  let sx1 = x1;
  let sy1 = y1;
  let sx2 = x2;
  let sy2 = y2;
  if (vertical) {
    const dir = sy2 >= sy1 ? 1 : -1;
    sy1 -= over * 0.35 * dir;
    sy2 += over * 0.5 * dir;
  } else {
    const dir = sx2 >= sx1 ? 1 : -1;
    sx1 -= over * 0.35 * dir;
    sx2 += over * 0.5 * dir;
  }
  const steps = 5;
  const waves = 1.2 + rng() * 1.6;
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mid = i > 0 && i < steps;
    const wobble = Math.sin(t * Math.PI * waves) * amp * 0.35;
    const j = ((rng() - 0.5) * (mid ? amp : amp * 0.45) + wobble);
    points.push({
      x: lerp(sx1, sx2, t) + (vertical ? j : 0),
      y: lerp(sy1, sy2, t) + (vertical ? 0 : j),
    });
  }
  return points;
}

function addWall(walls, x1, y1, x2, y2, axis, rng, c, r) {
  walls.push({
    id: walls.length,
    c,
    r,
    x1,
    y1,
    x2,
    y2,
    axis,
    ink: makeInk(x1, y1, x2, y2, rng, 1.2),
    ghost: makeInk(x1, y1, x2, y2, rng, 0.7),
  });
}

function buildWalls(grid, rng) {
  const walls = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== "wall") continue;
      const x = MARGIN + c * CELL;
      const y = MARGIN + r * CELL;
      if (!isWall(grid, c, r - 1)) addWall(walls, x, y, x + CELL, y, "h", rng, c, r);
      if (!isWall(grid, c, r + 1)) addWall(walls, x, y + CELL, x + CELL, y + CELL, "h", rng, c, r);
      if (!isWall(grid, c - 1, r)) addWall(walls, x, y, x, y + CELL, "v", rng, c, r);
      if (!isWall(grid, c + 1, r)) addWall(walls, x + CELL, y, x + CELL, y + CELL, "v", rng, c, r);
    }
  }
  return walls;
}

function wallTiles(grid) {
  const tiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === "wall") tiles.push({ c, r });
    }
  }
  return tiles;
}

export function rebuildGeometry(level, rng = Math.random) {
  level.walls = buildWalls(level.grid, rng);
  level.tiles = wallTiles(level.grid);
}

const GATE_ANIM_TIME = 0.55;

function applyEntrySeal(level) {
  sealCells(level.grid, level.entryGate.cells);
  level.entryGate.sealed = true;
  level.entryGate.openAmount = 0;
  level.entryGate.anim = null;
  rebuildGeometry(level);
}

/** Запускает закрытие входа; стены появятся в конце анимации. */
export function sealEntryGate(level) {
  if (!level.entryGate || level.entryGate.sealed) return false;
  if (level.entryGate.anim === "close") return false;
  level.entryGate.anim = "close";
  if (level.entryGate.openAmount == null) level.entryGate.openAmount = 1;
  return true;
}

export function gateSpan(gate) {
  const cells = gate?.cells || [];
  if (!cells.length) return null;
  const minC = Math.min(...cells.map((c) => c.c));
  const maxC = Math.max(...cells.map((c) => c.c));
  return {
    minC,
    maxC,
    x0: MARGIN + minC * CELL,
    x1: MARGIN + (maxC + 1) * CELL,
  };
}

export function exitKindAtPoint(level, x, y) {
  if (!level?.exitOpen) return null;
  const bottom = MARGIN + ROWS * CELL;
  const list = level.exits?.length ? level.exits : null;
  if (!list) {
    if (!level.exit) return null;
    const pos = cellCenter(level.exit.c, level.exit.r);
    return Math.hypot(x - pos.x, y - pos.y) < CELL * 0.38 ? "calm" : null;
  }
  for (const ex of list) {
    const span = gateSpan(ex.gate);
    if (!span) continue;
    if (x < span.x0 - 4 || x > span.x1 + 4) continue;
    if (y > bottom - CELL * 0.9) return ex.kind;
  }
  return null;
}

function exitGatesOf(level) {
  if (level?.exits?.length) return level.exits.map((ex) => ex.gate).filter(Boolean);
  return level?.exitGate ? [level.exitGate] : [];
}

/** Открывает оба нижних шлюза сразу для коллизий и запускает створки. */
export function openExitGate(level) {
  if (level.exitOpen) return false;
  const gates = exitGatesOf(level);
  if (gates.length > 0) {
    for (const gate of gates) {
      if (!gate.cells?.length) continue;
      openCells(level.grid, gate.cells);
      for (const cell of gate.cells) {
        if (cell.r > 0) level.grid[cell.r - 1][cell.c] = "floor";
      }
      gate.sealed = false;
      gate.anim = "open";
      if (gate.openAmount == null) gate.openAmount = 0;
    }
  } else if (level.exit) {
    openCells(level.grid, [level.exit]);
  }
  level.exitOpen = true;
  rebuildGeometry(level);
  return true;
}

function tickGate(gate, dt, onClosed) {
  if (!gate || !gate.anim) return;
  const speed = 1 / GATE_ANIM_TIME;
  if (gate.anim === "close") {
    gate.openAmount = Math.max(0, (gate.openAmount ?? 1) - speed * dt);
    if (gate.openAmount <= 0) {
      gate.openAmount = 0;
      gate.anim = null;
      if (onClosed) onClosed();
    }
  } else if (gate.anim === "open") {
    gate.openAmount = Math.min(1, (gate.openAmount ?? 0) + speed * dt);
    if (gate.openAmount >= 1) {
      gate.openAmount = 1;
      gate.anim = null;
    }
  }
}

export function updateGates(level, dt) {
  if (!level) return;
  tickGate(level.entryGate, dt, () => applyEntrySeal(level));
  for (const gate of exitGatesOf(level)) tickGate(gate, dt, null);
}

/** Верхний шлюз входа (сверху слева). */
function openEntryGate(grid, entryRoom) {
  const cols = new Set();
  for (const cell of entryRoom.cells) {
    if (cell.r === entryRoom.origin.r) cols.add(cell.c);
  }
  const sorted = [...cols].sort((a, b) => a - b);
  const gateCols = sorted.slice(0, 2);
  if (gateCols.length < 2 && sorted.length > 0) {
    gateCols.push(sorted[0] + 1 < COLS - 1 ? sorted[0] + 1 : sorted[0] - 1);
  }
  const cells = [];
  for (const c of gateCols) {
    if (c < 1 || c >= COLS - 1) continue;
    grid[0][c] = "floor";
    if (isWall(grid, c, 1)) grid[1][c] = "floor";
    cells.push({ c, r: 0 });
  }
  return cells;
}

function pickExitGateCols(exitRoom) {
  const edgeR = Math.min(ROWS - 2, exitRoom.origin.r + exitRoom.h - 1);
  const cols = new Set();
  for (const cell of exitRoom.cells || []) {
    if (cell.r === edgeR) cols.add(cell.c);
  }
  const sorted = [...cols].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? exitRoom.origin.c + 1;
  let a = mid;
  let b = mid + 1;
  if (b >= COLS - 1) {
    b = mid;
    a = mid - 1;
  }
  a = Math.max(1, Math.min(COLS - 2, a));
  b = Math.max(1, Math.min(COLS - 2, b));
  if (a === b) b = Math.min(COLS - 2, a + 1);
  return a === b ? [a] : [a, b];
}

/** Нижний шлюз: коридор 2 клетки к кромке, створки на последнем ряду закрыты. */
function makeExitGate(grid, exitRoom) {
  const gateCols = pickExitGateCols(exitRoom);
  const fromR = Math.min(ROWS - 2, exitRoom.origin.r + exitRoom.h - 1);
  const cells = [];
  for (const c of gateCols) {
    for (let r = fromR; r < ROWS - 1; r++) grid[r][c] = "floor";
    tryExpandToBlock(grid, c, Math.max(1, fromR));
    grid[ROWS - 1][c] = "wall";
    cells.push({ c, r: ROWS - 1 });
  }
  return cells;
}

function makeExitDef(grid, room, kind, corner) {
  const cells = makeExitGate(grid, room);
  const approach = cells[0]
    ? { c: cells[0].c, r: ROWS - 2 }
    : { c: room.origin.c + 1, r: ROWS - 2 };
  if (isFloor(grid, approach.c, approach.r) === false) {
    grid[approach.r][approach.c] = "floor";
    tryExpandToBlock(grid, approach.c, approach.r);
  }
  return {
    kind,
    corner,
    approach,
    gate: {
      cells,
      sealed: true,
      side: "bottom",
      openAmount: 0,
      anim: null,
      kind,
    },
  };
}

function sealCells(grid, cells) {
  for (const cell of cells) {
    if (cell.c >= 0 && cell.r >= 0 && cell.c < COLS && cell.r < ROWS) {
      grid[cell.r][cell.c] = "wall";
    }
  }
}

function openCells(grid, cells) {
  for (const cell of cells) {
    if (cell.c >= 0 && cell.r >= 0 && cell.c < COLS && cell.r < ROWS) {
      grid[cell.r][cell.c] = "floor";
    }
  }
}

function placeTargets(grid, start, exit, extraForbidden, rng) {
  const forbidden = new Set([
    `${start.c},${start.r}`,
    `${exit.c},${exit.r}`,
    ...extraForbidden.map((p) => `${p.c},${p.r}`),
  ]);
  const dist = bfsDistances(grid, start);
  const candidates = [];
  let maxDist = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isFloor(grid, c, r)) continue;
      const key = `${c},${r}`;
      if (forbidden.has(key)) continue;
      const d = dist.get(key);
      if (d == null || d < 6) continue;
      candidates.push({ c, r, d });
      if (d > maxDist) maxDist = d;
    }
  }
  if (candidates.length === 0) {
    return [];
  }

  const picked = [];
  const bands = TARGET_COUNT;
  for (let b = 0; b < bands; b++) {
    const lo = maxDist * ((b + 0.35) / bands);
    const hi = maxDist * ((b + 1.15) / bands);
    const band = candidates.filter((cell) => cell.d >= lo && cell.d <= hi);
    const pool = band.length > 0 ? band : candidates;
    let best = null;
    let bestScore = -1;
    const shuffled = shuffle(pool, rng);
    for (const cell of shuffled.slice(0, Math.min(80, shuffled.length))) {
      const sep = picked.reduce(
        (m, p) => Math.min(m, Math.abs(p.c - cell.c) + Math.abs(p.r - cell.r)),
        Infinity,
      );
      if (sep < TARGET_MIN_SEP && picked.length > 0) continue;
      const exitSep = Math.abs(cell.c - exit.c) + Math.abs(cell.r - exit.r);
      const score = cell.d * 2 + sep * 3 + Math.min(exitSep, 12);
      if (score > bestScore) {
        bestScore = score;
        best = cell;
      }
    }
    if (best && !picked.some((p) => p.c === best.c && p.r === best.r)) {
      picked.push(best);
    }
  }

  if (picked.length < TARGET_COUNT) {
    const rest = shuffle(candidates, rng);
    for (const cell of rest) {
      if (picked.length >= TARGET_COUNT) break;
      if (picked.some((p) => p.c === cell.c && p.r === cell.r)) continue;
      const tooClose = picked.some(
        (p) => Math.abs(p.c - cell.c) + Math.abs(p.r - cell.r) < TARGET_MIN_SEP,
      );
      if (tooClose) continue;
      picked.push(cell);
    }
  }

  return picked.map((cell) => {
    const pos = cellCenter(cell.c, cell.r);
    return {
      c: cell.c,
      r: cell.r,
      x: pos.x,
      y: pos.y,
      radius: TARGET_RADIUS,
      hit: false,
    };
  });
}

export function gridLos(grid, c0, r0, c1, r1) {
  if (c0 === c1 && r0 === r1) return true;
  let x = c0;
  let y = r0;
  const dx = Math.abs(c1 - c0);
  const dy = Math.abs(r1 - r0);
  const sx = c0 < c1 ? 1 : -1;
  const sy = r0 < r1 ? 1 : -1;
  let err = dx - dy;
  while (x !== c1 || y !== r1) {
    const e2 = err * 2;
    let nx = x;
    let ny = y;
    if (e2 > -dy) {
      err -= dy;
      nx += sx;
    }
    if (e2 < dx) {
      err += dx;
      ny += sy;
    }
    if (nx !== x && ny !== y && isWall(grid, nx, y) && isWall(grid, x, ny)) {
      return false;
    }
    x = nx;
    y = ny;
    if (x === c1 && y === r1) return true;
    if (isWall(grid, x, y)) return false;
  }
  return true;
}

export function bfsDistances(grid, start, maxDist = Infinity) {
  const dist = new Map();
  if (!isFloor(grid, start.c, start.r)) return dist;
  const key0 = `${start.c},${start.r}`;
  dist.set(key0, 0);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    const d = dist.get(`${cur.c},${cur.r}`);
    if (d >= maxDist) continue;
    for (const n of openNeighbors(grid, cur.c, cur.r)) {
      const key = `${n.c},${n.r}`;
      if (dist.has(key)) continue;
      dist.set(key, d + 1);
      queue.push(n);
    }
  }
  return dist;
}

export function allTargetsHit(targets) {
  return Array.isArray(targets) && targets.length > 0 && targets.every((t) => t.hit);
}

function fillRect(grid, c0, r0, c1, r1) {
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (r <= 0 || c <= 0 || r >= ROWS - 1 || c >= COLS - 1) continue;
      grid[r][c] = "floor";
    }
  }
}

/** Площадь в центре, край листа остаётся коридорами. */
function applyArena(grid) {
  fillRect(grid, 8, 12, 23, 27);
}

/**
 * Зал 8×8 — площадь обычной клетки 2×2, умноженная на 16.
 * Сетка та же: крупнее шаг лабиринта, не размер листа.
 */
function applyA1(grid) {
  const span = 3;
  for (let sbr = 0; sbr + span <= BAY_ROWS; sbr += span) {
    for (let sbc = 0; sbc + span <= BAY_COLS; sbc += span) {
      for (let br = sbr; br < sbr + span; br++) {
        for (let bc = sbc; bc < sbc + span; bc++) {
          if (bc + 1 < sbc + span) openLink(grid, { bc, br }, { bc: bc + 1, br });
          if (br + 1 < sbr + span) openLink(grid, { bc, br }, { bc, br: br + 1 });
        }
      }
      if (sbc + span < BAY_COLS) {
        const br = sbr + 1;
        openLink(grid, { bc: sbc + span - 1, br }, { bc: sbc + span, br });
      }
      if (sbr + span < BAY_ROWS) {
        const bc = sbc + 1;
        openLink(grid, { bc, br: sbr + span - 1 }, { bc, br: sbr + span });
      }
    }
  }
}

/** Кольцо по краю листа — поля тетради. */
function applyMargin(grid) {
  for (let bc = 0; bc < BAY_COLS - 1; bc++) {
    openLink(grid, { bc, br: 0 }, { bc: bc + 1, br: 0 });
    openLink(grid, { bc, br: BAY_ROWS - 1 }, { bc: bc + 1, br: BAY_ROWS - 1 });
  }
  for (let br = 0; br < BAY_ROWS - 1; br++) {
    openLink(grid, { bc: 0, br }, { bc: 0, br: br + 1 });
    openLink(grid, { bc: BAY_COLS - 1, br }, { bc: BAY_COLS - 1, br: br + 1 });
  }
}

const FOLD_BC = 4;
const FOLD_COL = 3 * (FOLD_BC + 1);
const FOLD_GATES = [2, 9];

function foldGateRows() {
  const rows = new Set();
  for (const br of FOLD_GATES) {
    const r0 = 1 + br * 3;
    rows.add(r0);
    rows.add(r0 + 1);
  }
  return rows;
}

function sealFoldColumn(grid) {
  const gates = foldGateRows();
  for (let r = 1; r < ROWS - 1; r++) {
    if (FOLD_COL > 0 && FOLD_COL < COLS - 1) {
      grid[r][FOLD_COL] = gates.has(r) ? "floor" : "wall";
    }
  }
  for (const br of FOLD_GATES) {
    openLink(grid, { bc: FOLD_BC, br }, { bc: FOLD_BC + 1, br });
  }
}

function foldLinkAllowed(a, b) {
  const lo = a.bc <= b.bc ? a : b;
  const hi = a.bc <= b.bc ? b : a;
  if (hi.bc === lo.bc + 1 && hi.br === lo.br && lo.bc === FOLD_BC) {
    return FOLD_GATES.includes(lo.br);
  }
  return true;
}

function reconnectFold(grid, start) {
  let guard = 0;
  while (guard < 48) {
    guard += 1;
    const reach = floodFloor(grid, start);
    const islands = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        if (!isFloor(grid, c, r)) continue;
        if (!reach.has(`${c},${r}`)) islands.push({ c, r });
      }
    }
    if (islands.length === 0) return;

    let linked = false;
    for (const cell of islands) {
      const bay = bayOfCell(cell.c, cell.r);
      if (!bay) continue;
      const neighBays = [
        { bc: bay.bc - 1, br: bay.br },
        { bc: bay.bc + 1, br: bay.br },
        { bc: bay.bc, br: bay.br - 1 },
        { bc: bay.bc, br: bay.br + 1 },
      ];
      for (const nb of neighBays) {
        if (nb.bc < 0 || nb.br < 0 || nb.bc >= BAY_COLS || nb.br >= BAY_ROWS) continue;
        if (!foldLinkAllowed(bay, nb)) continue;
        const origin = bayOriginCell(nb.bc, nb.br);
        if (!reach.has(`${origin.c},${origin.r}`)) continue;
        openLink(grid, bay, nb);
        linked = true;
        break;
      }
      if (linked) break;
    }
    if (!linked) {
      for (const cell of islands) grid[cell.r][cell.c] = "wall";
      return;
    }
  }
}

function healFold(grid, rng, startCell) {
  sealFoldColumn(grid);
  reconnectFold(grid, startCell);
  polishGrid(grid);
  removeDeadEnds(grid, rng);
  sealFoldColumn(grid);
  reconnectFold(grid, startCell);
  polishGrid(grid);
  removeDeadEnds(grid, rng);
  sealFoldColumn(grid);
  reconnectFold(grid, startCell);
  polishGrid(grid);
}

function applySheetShape(grid, tagId, rng, startCell) {
  if (tagId === "arena") applyArena(grid);
  else if (tagId === "a1") applyA1(grid);
  else if (tagId === "margin") applyMargin(grid);
  else if (tagId === "fold") healFold(grid, rng, startCell);
  else return;

  if (tagId === "fold") return;
  polishGrid(grid);
  reconnectFloors(grid, startCell);
  polishGrid(grid);
  removeDeadEnds(grid, rng);
  polishGrid(grid);
}

export const SHEET_TAGS = [
  { id: "draft", label: "черновик", hint: "зрение короче на 2 клетки" },
  { id: "rooms", label: "клетка в клетке", hint: "больше комнат, лист нарезан плотнее" },
  { id: "narrow", label: "узкие коридоры", hint: "меньше петель, тесные проходы" },
  { id: "gate", label: "порталы у выхода", hint: "враги чаще выходят у нижнего края" },
  { id: "arena", label: "арена", hint: "открытая площадь в центре, коридоры по краям" },
  { id: "a1", label: "А1", hint: "залы 8×8: клетка лабиринта в 16 раз крупнее" },
  { id: "fold", label: "сгиб", hint: "лист пополам, переход только в двух местах" },
  { id: "margin", label: "поля", hint: "по краю листа кольцевой проход" },
];

export function pickSheetTag(levelNum, rng = Math.random) {
  if (levelNum < 3) return null;
  const chance = levelNum >= 21 ? 0.85 : 0.55;
  if (rng() > chance) return null;
  return SHEET_TAGS[Math.floor(rng() * SHEET_TAGS.length)];
}

export function generateLevel(rng = Math.random, options = {}) {
  const tag = options.tag || null;
  const tagId = tag?.id || tag || null;
  const extraFrac = tagId === "narrow" ? 0.02 : 0.12;
  const roomCount = tagId === "rooms" ? 16 + Math.floor(rng() * 3) : null;
  const grid = makeGrid();
  carveBays(grid, rng);
  addBayLoops(grid, rng, extraFrac);
  const corners = pickCorners(rng);
  const reserved = [
    { bc0: corners.entryBay.bc, br0: corners.entryBay.br, bw: 2, bh: 2 },
    { bc0: corners.exitLeftBay.bc, br0: corners.exitLeftBay.br, bw: 2, bh: 2 },
    { bc0: corners.exitRightBay.bc, br0: corners.exitRightBay.br, bw: 2, bh: 2 },
  ];
  const placedRooms = placeRooms(grid, rng, reserved, roomCount);
  const entryRoom = roomFromBays(grid, corners.entryBay, rng);
  const exitLeftRoom = roomFromBays(grid, corners.exitLeftBay, rng);
  const exitRightRoom = roomFromBays(grid, corners.exitRightBay, rng);
  const away = { c: Math.floor(COLS / 2), r: ROWS - 2 };
  let startCell = entryRoom.door || entryRoom.cells[0] || corners.entry;
  polishGrid(grid);
  reconnectFloors(grid, startCell);
  polishGrid(grid);
  removeDeadEnds(grid, rng);
  polishGrid(grid);
  entryRoom.cells = roomCells(grid, entryRoom.origin, entryRoom.w, entryRoom.h);
  exitLeftRoom.cells = roomCells(grid, exitLeftRoom.origin, exitLeftRoom.w, exitLeftRoom.h);
  exitRightRoom.cells = roomCells(grid, exitRightRoom.origin, exitRightRoom.w, exitRightRoom.h);
  entryRoom.door = findDoor(grid, entryRoom.cells, rng) || entryRoom.cells[0] || entryRoom.door;
  exitLeftRoom.door = findDoor(grid, exitLeftRoom.cells, rng) || exitLeftRoom.cells[0] || exitLeftRoom.door;
  exitRightRoom.door = findDoor(grid, exitRightRoom.cells, rng) || exitRightRoom.cells[0] || exitRightRoom.door;
  startCell = pickSpawnInRoom(entryRoom, away, rng);
  if (!isFloor(grid, startCell.c, startCell.r)) {
    startCell = entryRoom.door || away;
    grid[startCell.r][startCell.c] = "floor";
    tryExpandToBlock(grid, startCell.c, startCell.r);
  }
  reconnectFloors(grid, startCell);
  polishGrid(grid);
  removeDeadEnds(grid, rng);
  polishGrid(grid);
  applySheetShape(grid, tagId, rng, startCell);
  if (!isFloor(grid, startCell.c, startCell.r)) {
    grid[startCell.r][startCell.c] = "floor";
    tryExpandToBlock(grid, startCell.c, startCell.r);
    if (tagId === "fold") reconnectFold(grid, startCell);
    else reconnectFloors(grid, startCell);
  }
  entryRoom.cells = roomCells(grid, entryRoom.origin, entryRoom.w, entryRoom.h);
  exitLeftRoom.cells = roomCells(grid, exitLeftRoom.origin, exitLeftRoom.w, exitLeftRoom.h);
  exitRightRoom.cells = roomCells(grid, exitRightRoom.origin, exitRightRoom.w, exitRightRoom.h);
  const entryGateCells = openEntryGate(grid, entryRoom);
  const leftKind = corners.heatOnRight ? "calm" : "heat";
  const rightKind = corners.heatOnRight ? "heat" : "calm";
  const exitLeft = makeExitDef(grid, exitLeftRoom, leftKind, "bottom-left");
  const exitRight = makeExitDef(grid, exitRightRoom, rightKind, "bottom-right");
  const exits = [exitLeft, exitRight];
  const spawnDens = buildSpawnDens(grid, placedRooms, entryRoom, exitLeftRoom, exitRightRoom);
  for (const den of spawnDens) {
    den.portal.scale = 0.4;
    den.portal.charge = 0;
  }
  const gateCells = exits.flatMap((ex) => ex.gate.cells || []);
  const approaches = exits.map((ex) => ex.approach);
  const forbidden = [
    ...entryRoom.cells,
    ...exitLeftRoom.cells,
    ...exitRightRoom.cells,
    ...gateCells,
    ...approaches,
  ];
  const calm = exits.find((ex) => ex.kind === "calm") || exitLeft;
  const targets = placeTargets(grid, startCell, calm.approach, forbidden, rng);
  const gatePos =
    entryGateCells.length > 0
      ? cellCenter(entryGateCells[0].c, entryGateCells[0].r)
      : cellCenter(startCell.c, startCell.r);
  return {
    cells: grid,
    grid,
    walls: buildWalls(grid, rng),
    tiles: wallTiles(grid),
    start: startCell,
    spawnOutside: {
      x: gatePos.x,
      y: MARGIN - CELL * 0.75,
    },
    exit: calm.approach,
    exits,
    entryRoom,
    exitRoom: exitLeftRoom,
    exitRooms: [exitLeftRoom, exitRightRoom],
    nest: entryRoom,
    entryGate: {
      cells: entryGateCells,
      sealed: false,
      side: "top",
      openAmount: 1,
      anim: null,
    },
    exitGate: calm.gate,
    exitOpen: false,
    spawnDens,
    targets,
    tag: tagId,
    tagLabel: tag?.label || "",
    seed: options.seed ?? null,
  };
}
