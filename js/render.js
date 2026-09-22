import { CELL, COLS, MARGIN, ROWS, cellCenter, worldSize } from "./maze.js";
import { cellExplored } from "./fog.js";
import { applyCamera, viewRect } from "./camera.js";
import { kindMark } from "./enemy.js";
import { drawFx } from "./fx.js";

const PAPER = "#f4ecd6";
const GRID = "rgba(120, 168, 196, 0.45)";
const PEN = "#1b3358";
const ENEMY_PEN = "#7a2d1a";
const RUNNER_PEN = "#4d5c24";
const GUNNER_PEN = "#9a3412";
const ARMORED_PEN = "#3d342c";
const WARDEN_PEN = "#1a3d6e";
const WARDEN_ACCENT = "#c4a035";
const CHAMPION_PEN = "#5a1840";
const CHAMPION_ACCENT = "#a13d2a";
const SHIELD_INK = "#2a6f9e";
const SHIELD_GLOW = "rgba(60, 140, 190, 0.35)";
const PORTAL_INK = "#5b2d7a";
const PORTAL_GLOW = "rgba(110, 60, 160, 0.28)";
const MARGIN_LINE = "rgba(196, 84, 92, 0.45)";
const WALL_FILL = "#c3daf4";
const WALL_HATCH = "rgba(22, 62, 122, 0.28)";
const WALL_INK = "#1e5aab";
const WALL_INK_DARK = "#163e7a";
const LASER = "#d31f1f";
const LASER_GLOW = "rgba(255, 70, 60, 0.45)";
const ENEMY_LASER = "#d4651f";
const ENEMY_LASER_GLOW = "rgba(255, 140, 50, 0.4)";

export function setupCanvas(canvas, width, height) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = "100%";
  canvas.style.height = "auto";
  canvas.style.aspectRatio = `${width} / ${height}`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function hash01(c, r, k = 0) {
  const n = Math.sin(c * 12.9898 + r * 78.233 + k * 0.173) * 43758.5453;
  return n - Math.floor(n);
}

function drawPaper(ctx, width, height) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = GRID;
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";
  const right = MARGIN + COLS * CELL;
  const bottom = MARGIN + ROWS * CELL;
  ctx.beginPath();
  for (let c = 0; c <= COLS; c++) {
    const x = MARGIN + c * CELL + 0.5;
    ctx.moveTo(x, MARGIN);
    ctx.lineTo(x, bottom);
  }
  for (let r = 0; r <= ROWS; r++) {
    const y = MARGIN + r * CELL + 0.5;
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();

  ctx.strokeStyle = MARGIN_LINE;
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  const marginX = MARGIN - 10;
  ctx.moveTo(marginX, 18);
  ctx.lineTo(marginX, height - 18);
  ctx.stroke();
}

function drawInkPath(ctx, points) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

function drawWallTiles(ctx, tiles, vis = null, fog = null) {
  for (const tile of tiles) {
    if (fog && !cellExplored(fog, tile.c, tile.r)) continue;
    const x = MARGIN + tile.c * CELL;
    const y = MARGIN + tile.r * CELL;
    if (vis && (x > vis.right || y > vis.bottom || x + CELL < vis.left || y + CELL < vis.top)) {
      continue;
    }
    ctx.fillStyle = WALL_FILL;
    ctx.fillRect(x, y, CELL, CELL);

    ctx.strokeStyle = WALL_HATCH;
    ctx.lineCap = "round";
    const n = 5 + Math.floor(hash01(tile.c, tile.r, 1) * 3);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.2 + hash01(tile.c, tile.r, i + 2) * 0.55) / n;
      const yy = y + 2.2 + t * (CELL - 4.4);
      const x0 = x + 1.1 + hash01(tile.r, tile.c, i + 8) * 3.2;
      const x1 = x + CELL - 1.1 - hash01(tile.c, tile.r, i + 16) * 3.4;
      if (x1 - x0 < 6) continue;
      ctx.lineWidth = 0.85 + hash01(tile.c, i, 4) * 0.7;
      ctx.beginPath();
      const steps = 4;
      const phase = hash01(tile.r, i, 7) * 6.2;
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const px = x0 + (x1 - x0) * u;
        const py =
          yy +
          Math.sin(u * Math.PI * 2 + phase) * 0.7 +
          (hash01(tile.c, tile.r, i * 11 + s) - 0.5) * 0.55;
        if (s === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  }
}

function wallKnown(fog, wall) {
  if (!fog) return true;
  return cellExplored(fog, wall.c, wall.r);
}

function drawWallInk(ctx, walls, vis = null, fog = null) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(30, 90, 171, 0.26)";
  ctx.lineWidth = 3.6;
  for (const wall of walls) {
    if (!wallKnown(fog, wall)) continue;
    if (vis && !segInView(wall, vis)) continue;
    drawInkPath(ctx, wall.ghost || wall.ink);
  }
  ctx.strokeStyle = WALL_INK;
  ctx.lineWidth = 2.2;
  for (const wall of walls) {
    if (!wallKnown(fog, wall)) continue;
    if (vis && !segInView(wall, vis)) continue;
    drawInkPath(ctx, wall.ink);
  }
  ctx.strokeStyle = WALL_INK_DARK;
  ctx.lineWidth = 1;
  for (const wall of walls) {
    if (!wallKnown(fog, wall)) continue;
    if (vis && !segInView(wall, vis)) continue;
    drawInkPath(ctx, wall.ink);
  }
}

function segInView(wall, vis) {
  const left = Math.min(wall.x1, wall.x2);
  const right = Math.max(wall.x1, wall.x2);
  const top = Math.min(wall.y1, wall.y2);
  const bottom = Math.max(wall.y1, wall.y2);
  return right >= vis.left && left <= vis.right && bottom >= vis.top && top <= vis.bottom;
}

function drawTarget(ctx, target, pulse = false) {
  ctx.save();
  ctx.translate(target.x, target.y);
  const strong = pulse && !target.hit;
  const glow = strong ? 1 + Math.sin(performance.now() / 180) * 0.16 : 1;
  ctx.scale(glow, glow);
  ctx.strokeStyle = target.hit ? "rgba(27, 51, 88, 0.35)" : PEN;
  ctx.lineWidth = strong ? 3.1 : 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, 0, target.radius, 0.08, Math.PI * 2 - 0.12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-6, -6);
  ctx.lineTo(6.4, 5.6);
  ctx.moveTo(6, -6.2);
  ctx.lineTo(-5.8, 6);
  ctx.stroke();
  if (strong) {
    ctx.globalAlpha = 0.35 + 0.25 * Math.sin(performance.now() / 160);
    ctx.beginPath();
    ctx.arc(0, 0, target.radius + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (target.hit) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#9a2b2b";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-15, -13);
    ctx.lineTo(14, 15);
    ctx.moveTo(14, -14);
    ctx.lineTo(-14, 13);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPortal(ctx, portal, pulse = 0, flash = 0) {
  if (!portal) return;
  const scale = (portal.scale ?? 0.4) * (1 + flash * 1.35);
  const x = portal.x;
  const y = portal.y;
  const r = (CELL * 0.42 + Math.sin(pulse) * 0.6) * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = 0.45 + 0.55 * scale;
  ctx.strokeStyle = PORTAL_GLOW;
  ctx.lineWidth = 3 + 2 * scale;
  ctx.beginPath();
  ctx.arc(0, 0, r + 2 * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = PORTAL_INK;
  ctx.lineWidth = 1.4 + scale;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * (r * 0.55);
    const py = Math.sin(a) * (r * 0.55);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-2.5 * scale, 0);
  ctx.lineTo(2.5 * scale, 0);
  ctx.moveTo(0, -2.5 * scale);
  ctx.lineTo(0, 2.5 * scale);
  ctx.stroke();
  ctx.restore();
}

function drawPreview(ctx, preview) {
  const points = Array.isArray(preview) ? preview : preview?.points;
  if (!points || points.length < 2) return;
  const bright = !Array.isArray(preview) && preview?.bright;
  ctx.save();
  ctx.strokeStyle = bright ? "rgba(211, 31, 31, 0.95)" : "rgba(211, 31, 31, 0.75)";
  ctx.lineWidth = bright ? 2.4 : 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(bright ? [9, 4] : [7, 5]);
  drawInkPath(ctx, points);
  ctx.restore();
}

function drawExitStamp(ctx, exitDef, open, heatLevel = 0) {
  const span = exitDef?.gate?.cells?.length
    ? {
        minC: Math.min(...exitDef.gate.cells.map((c) => c.c)),
        maxC: Math.max(...exitDef.gate.cells.map((c) => c.c)),
      }
    : null;
  if (!span) return;
  const heat = exitDef.kind === "heat";
  const ink = heat ? "#9a2b2b" : "#1a6b3a";
  const faded = heat ? "rgba(154, 43, 43, 0.55)" : "rgba(26, 107, 58, 0.5)";
  const x0 = MARGIN + span.minC * CELL;
  const x1 = MARGIN + (span.maxC + 1) * CELL;
  const mid = (x0 + x1) / 2;
  const y = MARGIN + ROWS * CELL + 4;
  ctx.save();
  ctx.strokeStyle = open ? ink : faded;
  ctx.fillStyle = open ? (heat ? "rgba(154, 43, 43, 0.12)" : "rgba(46, 140, 72, 0.12)") : "rgba(90, 96, 108, 0.06)";
  ctx.lineWidth = 2.1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.rect(x0 + 2, y, x1 - x0 - 4, 28);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = open ? ink : faded;
  ctx.font = "700 12px Caveat, 'Segoe Print', 'Comic Sans MS', cursive";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const next = Math.max(1, (Number(heatLevel) || 0) + 1);
  ctx.fillText(heat ? (next > 1 ? `жар ${next}` : "жар") : "тихо", mid, y + 2);
  ctx.beginPath();
  ctx.moveTo(mid, y + 14);
  ctx.lineTo(mid, y + 24);
  ctx.moveTo(mid - 5, y + 19);
  ctx.lineTo(mid, y + 25);
  ctx.lineTo(mid + 5, y + 19);
  ctx.stroke();
  if (!open) {
    ctx.beginPath();
    ctx.moveTo(x0 + 8, y + 8);
    ctx.lineTo(x1 - 8, y + 22);
    ctx.stroke();
  }
  ctx.restore();
}

function drawExitStamps(ctx, level, heatLevel = 0) {
  const open = !!level?.exitOpen;
  if (level?.exits?.length) {
    for (const ex of level.exits) drawExitStamp(ctx, ex, open, heatLevel);
    return;
  }
  if (level?.exitGate) {
    drawExitStamp(ctx, { kind: "calm", gate: level.exitGate }, open, heatLevel);
  }
}

/** Створки шлюза: openAmount 0 = закрыто, 1 = открыто. */
function drawGate(ctx, gate, fog = null) {
  if (!gate || !gate.cells || gate.cells.length === 0) return;
  const open = gate.openAmount ?? (gate.sealed ? 0 : 1);
  const cover = 1 - open;
  if (cover <= 0.02) return;

  const ease = cover * cover * (3 - 2 * cover);
  ctx.save();
  if (gate.kind === "heat") {
    ctx.strokeStyle = "#8b3a3a";
    ctx.fillStyle = "#e4cfc4";
  } else if (gate.kind === "calm") {
    ctx.strokeStyle = "#2a6b4a";
    ctx.fillStyle = "#c9d8c8";
  } else {
    ctx.strokeStyle = WALL_INK;
    ctx.fillStyle = WALL_FILL;
  }
  ctx.lineWidth = 1.8;
  ctx.lineJoin = "round";

  for (const cell of gate.cells) {
    if (fog && !cellExplored(fog, cell.c, cell.r)) continue;
    const x = MARGIN + cell.c * CELL;
    const y = MARGIN + cell.r * CELL;
    const leaf = CELL * 0.5 * ease;
    const inset = 1.5;

    // Левая / верхняя створка.
    ctx.beginPath();
    if (gate.side === "top" || gate.side === "bottom") {
      ctx.rect(x + inset, y + inset, Math.max(0, leaf - inset), CELL - inset * 2);
    } else {
      ctx.rect(x + inset, y + inset, CELL - inset * 2, Math.max(0, leaf - inset));
    }
    ctx.fill();
    ctx.stroke();

    // Правая / нижняя створка.
    ctx.beginPath();
    if (gate.side === "top" || gate.side === "bottom") {
      ctx.rect(x + CELL - leaf, y + inset, Math.max(0, leaf - inset), CELL - inset * 2);
    } else {
      ctx.rect(x + inset, y + CELL - leaf, CELL - inset * 2, Math.max(0, leaf - inset));
    }
    ctx.fill();
    ctx.stroke();

    // Штриховка ручкой.
    ctx.strokeStyle = WALL_HATCH;
    ctx.lineCap = "round";
    ctx.beginPath();
    if (gate.side === "top" || gate.side === "bottom") {
      const leftW = Math.max(0, leaf - inset);
      const rightX = x + CELL - leaf;
      for (let i = 4; i < CELL - 3 && i < leftW - 1; i += 4) {
        const yy = y + i + (hash01(cell.c, cell.r, i) - 0.5) * 0.8;
        ctx.moveTo(x + inset + 1, yy);
        ctx.lineTo(x + inset + leftW - 1, yy + (hash01(cell.r, i, 2) - 0.5) * 0.7);
      }
      for (let i = 4; i < CELL - 3; i += 4) {
        const yy = y + i + (hash01(cell.c, i, 5) - 0.5) * 0.8;
        ctx.moveTo(rightX + 1, yy);
        ctx.lineTo(x + CELL - inset - 1, yy + (hash01(i, cell.r, 3) - 0.5) * 0.7);
      }
    } else {
      for (let i = 4; i < CELL - 3; i += 4) {
        const xx = x + i + (hash01(cell.c, i, 1) - 0.5) * 0.7;
        ctx.moveTo(xx, y + inset + 1);
        ctx.lineTo(xx + (hash01(cell.r, i, 4) - 0.5) * 0.6, y + inset + Math.max(0, leaf - inset) - 1);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = gate.kind === "heat" ? "#8b3a3a" : gate.kind === "calm" ? "#2a6b4a" : WALL_INK;
    ctx.lineWidth = 1.8;
  }
  ctx.restore();
}

function drawGates(ctx, level, fog = null) {
  if (!level) return;
  drawGate(ctx, level.entryGate, fog);
  if (level.exits?.length) {
    for (const ex of level.exits) drawGate(ctx, ex.gate, fog);
  } else {
    drawGate(ctx, level.exitGate, fog);
  }
}

function enemyPen(kind) {
  if (kind === "warden") return WARDEN_PEN;
  if (kind === "champion") return CHAMPION_PEN;
  if (kind === "runner") return RUNNER_PEN;
  if (kind === "gunner") return GUNNER_PEN;
  if (kind === "armored") return ARMORED_PEN;
  return ENEMY_PEN;
}

function strokeRound(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function roundBody(ctx, x, y, hx, hy, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x - hx, y - hy, hx * 2, hy * 2, r);
  } else {
    ctx.ellipse(x, y, hx, hy, 0, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
}

function drawSoldier(ctx, figure, pen, pose = "idle", kind = "grunt") {
  ctx.save();
  ctx.translate(figure.x, figure.y);
  ctx.rotate(figure.angle);
  ctx.strokeStyle = pen;
  ctx.fillStyle = PAPER;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const tired = pose === "tired";
  const runner = kind === "runner";
  const gunner = kind === "gunner";
  const armored = kind === "armored";
  const warden = kind === "warden";
  const champion = kind === "champion";
  const isPlayer = kind === "player";
  const heavy = armored || warden || champion;
  ctx.lineWidth = heavy ? 2.15 : 1.9;

  const swing = tired
    ? Math.sin(figure.walkTime * 3) * 0.22
    : figure.moving
      ? Math.sin(figure.walkTime * 10) * (runner ? 1.2 : 0.85)
      : 0.1;

  const shoulder = champion || warden ? 6.55 : armored ? 6.25 : runner ? 5.2 : 5.9;
  const torsoX = runner ? -2.55 : -2.2;
  const torsoLen = champion || armored ? 4.85 : 4.45;

  const bootX = runner ? -6.15 : -5.7;
  for (const side of [-1, 1]) {
    const y = side * (2.05 + (side < 0 ? swing : -swing) * 0.2);
    roundBody(ctx, bootX, y, 2.7, 1.65, 1.35);
  }

  roundBody(ctx, torsoX, 0, torsoLen, shoulder, 3.5);
  roundBody(ctx, torsoX - torsoLen - 0.15, 0, 1.55, 2.25, 1.0);

  ctx.beginPath();
  ctx.ellipse(torsoX + 0.55, -shoulder + 0.5, 2.4, 2.0, 0, 0, Math.PI * 2);
  ctx.ellipse(torsoX + 0.55, shoulder - 0.5, 2.4, 2.0, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(torsoX - 1.5, -1.3);
  ctx.lineTo(torsoX + 2.15, -0.95);
  ctx.moveTo(torsoX - 1.5, 1.3);
  ctx.lineTo(torsoX + 2.15, 0.95);
  ctx.stroke();

  if (armored) {
    strokeRound(ctx, torsoX - 2.35, -3.45, 5.5, 6.9, 1.25);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(torsoX + 0.35, -3.05);
    ctx.lineTo(torsoX + 0.35, 3.05);
    ctx.stroke();
  }

  if (isPlayer) {
    ctx.fillStyle = pen;
    ctx.globalAlpha = 0.18;
    strokeRound(ctx, torsoX - 1.7, -2.25, 3.9, 4.5, 1.1);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = PAPER;
  }

  const hx = 1.05;
  const hr = warden || champion ? 4.4 : 4.15;
  ctx.beginPath();
  ctx.arc(hx, 0, hr, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(hx + 0.2, 0, hr * 0.58, -0.7, 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(hx, 0, hr * 0.9, -0.52, 0.52);
  ctx.stroke();
  ctx.lineWidth = heavy ? 2.15 : 1.9;

  if (warden) {
    ctx.strokeStyle = WARDEN_ACCENT;
    ctx.lineWidth = 2.05;
    ctx.beginPath();
    ctx.arc(hx, 0, hr + 1.3, -0.82, 0.82);
    ctx.stroke();
    ctx.strokeStyle = pen;
    ctx.lineWidth = 2.15;
  }
  if (champion) {
    ctx.strokeStyle = CHAMPION_ACCENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hx - 1.55, -hr * 0.12);
    ctx.lineTo(hx + 0.35, -hr * 0.52);
    ctx.lineTo(hx + 2.15, -hr * 0.04);
    ctx.stroke();
    ctx.strokeStyle = pen;
    ctx.lineWidth = 2.15;
  }

  const gunY = tired ? 2.95 : 2.4;
  const muzzle = gunner ? 12.1 : tired ? 9.4 : 11.85;
  ctx.lineWidth = 2.35;
  ctx.beginPath();
  ctx.moveTo(torsoX + 1.1, shoulder * 0.52);
  ctx.lineTo(hx + 1.55, gunY * 0.28);
  ctx.stroke();

  ctx.lineWidth = 2.55;
  ctx.beginPath();
  ctx.moveTo(-0.6, gunY);
  ctx.lineTo(hx + 0.9, gunY * 0.4);
  ctx.stroke();

  roundBody(ctx, hx + 2.55, 0.22, 2.35, 1.15, 0.85);

  ctx.lineWidth = gunner ? 2.35 : 2.05;
  ctx.beginPath();
  ctx.moveTo(hx + 4.6, 0.12);
  ctx.lineTo(muzzle, 0.1);
  ctx.stroke();
  ctx.lineWidth = 2.8;
  ctx.beginPath();
  ctx.moveTo(muzzle - 1.55, 0.1);
  ctx.lineTo(muzzle, 0.1);
  ctx.stroke();

  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(hx + 2.05, gunY * 0.22, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (gunner) {
    roundBody(ctx, hx + 4.85, 1.45, 0.85, 1.55, 0.45);
  }

  if (figure.dashTimer > 0) {
    ctx.strokeStyle = "rgba(161, 61, 42, 0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-12.2, -3.2);
    ctx.lineTo(-6.8, -1.05);
    ctx.moveTo(-12.2, 3.2);
    ctx.lineTo(-6.8, 1.05);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPlayer(ctx, player) {
  if (player.invuln > 0 && Math.floor(player.invuln * 12) % 2 === 0) return;
  drawSoldier(ctx, player, PEN, "idle", "player");
}

function drawEnemySilhouette(ctx, enemy) {
  if (!enemy.alive) return;
  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.translate(enemy.x, enemy.y);
  ctx.rotate(enemy.angle);
  ctx.strokeStyle = "rgba(70, 62, 52, 0.95)";
  ctx.lineWidth = 2.15;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.ellipse(-2.3, 0, 4.8, 6.15, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1.05, 0, 4.05, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawFogOverlay(ctx, fog, vis = null) {
  if (!fog) return;
  const until = fog.until;
  const now = fog.now;
  let r0 = 0;
  let r1 = ROWS;
  let c0 = 0;
  let c1 = COLS;
  if (vis) {
    c0 = Math.max(0, Math.floor((vis.left - MARGIN) / CELL) - 1);
    c1 = Math.min(COLS, Math.ceil((vis.right - MARGIN) / CELL) + 1);
    r0 = Math.max(0, Math.floor((vis.top - MARGIN) / CELL) - 1);
    r1 = Math.min(ROWS, Math.ceil((vis.bottom - MARGIN) / CELL) + 1);
  }
  ctx.save();
  ctx.fillStyle = "rgba(92, 86, 74, 0.56)";
  for (let r = r0; r < r1; r++) {
    let c = c0;
    const y = MARGIN + r * CELL;
    const row = r * COLS;
    while (c < c1) {
      if (until[row + c] > now) {
        c += 1;
        continue;
      }
      const start = c;
      c += 1;
      while (c < c1 && until[row + c] <= now) c += 1;
      ctx.fillRect(MARGIN + start * CELL, y, (c - start) * CELL, CELL);
    }
  }
  ctx.restore();
}

function drawMuzzleFlash(ctx, player, amount) {
  if (!player || amount <= 0) return;
  const t = Math.min(1, amount / 0.08);
  const x = player.x + Math.cos(player.angle) * 13;
  const y = player.y + Math.sin(player.angle) * 13;
  ctx.save();
  ctx.globalAlpha = 0.35 + 0.55 * t;
  ctx.fillStyle = "#d31f1f";
  ctx.beginPath();
  ctx.arc(x, y, 3.4 * t + 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEnemy(ctx, enemy, mode = "full") {
  if (!enemy.alive) return;
  if (mode === "heard") {
    drawEnemySilhouette(ctx, enemy);
    return;
  }
  const pen = enemyPen(enemy.kind);
  const pose = enemy.tiredTimer > 0 ? "tired" : "idle";
  const emerge = enemy.emergeTimer > 0 ? 1 - enemy.emergeTimer / (enemy.emergeMax || 1) : 1;
  const scale = 0.25 + 0.75 * emerge;

  ctx.save();
  ctx.globalAlpha = 0.35 + 0.65 * emerge;
  ctx.translate(enemy.x, enemy.y);
  ctx.scale(scale * (enemy.kind === "champion" ? 1.1 : 1), scale * (enemy.kind === "champion" ? 1.1 : 1));
  ctx.translate(-enemy.x, -enemy.y);
  drawSoldier(ctx, enemy, pen, pose, enemy.kind);
  drawKindMark(ctx, enemy);

  if (enemy.shieldTimer > 0 || (enemy.plates ?? 0) > 0) {
    const idlePlate = enemy.shieldTimer <= 0 && (enemy.plates ?? 0) > 0;
    const pulse = idlePlate ? 0.2 : 0.55 + 0.45 * Math.sin(performance.now() / 120);
    ctx.save();
    if (idlePlate) ctx.globalAlpha = 0.4;
    ctx.strokeStyle = SHIELD_GLOW;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, 15 + pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = SHIELD_INK;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, 15 + pulse * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (enemy.stunTimer > 0) {
    ctx.save();
    ctx.strokeStyle = pen;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y - 16, 4.2, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
  }

  if (enemy.tiredTimer > 0) {
    ctx.save();
    ctx.fillStyle = pen;
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(enemy.walkTime * 4);
    ctx.font = "10px Segoe UI, sans-serif";
    const bob = Math.sin(enemy.walkTime * 5) * 2;
    ctx.fillText("z", enemy.x + 10, enemy.y - 18 + bob);
    ctx.fillText("z", enemy.x + 16, enemy.y - 24 + bob * 0.6);
    ctx.restore();
  }

  const ticks = enemy.maxHp;
  const width = ticks > 6 ? 4.2 : 6;
  const gap = ticks > 6 ? 1.4 : 2;
  const total = ticks * width + (ticks - 1) * gap;
  let x = enemy.x - total / 2;
  const y = enemy.y - 20;
  for (let i = 0; i < ticks; i++) {
    ctx.fillStyle = i < enemy.hp ? pen : "rgba(122, 45, 26, 0.25)";
    ctx.fillRect(x, y, width, 4);
    x += width + gap;
  }
  ctx.restore();
}

function drawSpawnDens(ctx, dens, time = 0, fog = null, huntFlash = 0) {
  if (!dens) return;
  for (const den of dens) {
    if (!den.portal) continue;
    if (fog && !fog.worldVisible(den.portal.x, den.portal.y)) continue;
    drawPortal(ctx, den.portal, time * 3 + den.portal.c + den.portal.r, huntFlash);
  }
}

function drawLifePickup(ctx, pickup) {
  const bob = Math.sin(pickup.bob) * 2.5;
  const x = pickup.x;
  const y = pickup.y + bob;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "#9b1c2e";
  ctx.fillStyle = "rgba(196, 48, 64, 0.85)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, 4);
  ctx.bezierCurveTo(-8, -2, -7, -9, -2.5, -7);
  ctx.bezierCurveTo(0, -9, 0, -5, 0, -3);
  ctx.bezierCurveTo(0, -5, 0, -9, 2.5, -7);
  ctx.bezierCurveTo(7, -9, 8, -2, 0, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawAmmoPickup(ctx, pickup) {
  const bob = Math.sin(pickup.bob) * 2.5;
  ctx.save();
  ctx.translate(pickup.x, pickup.y + bob);
  ctx.strokeStyle = "#1b3358";
  ctx.fillStyle = "rgba(27, 51, 88, 0.12)";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.rect(-5, -8, 10, 16);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-3, -4);
  ctx.lineTo(3, -4);
  ctx.moveTo(-3, 0);
  ctx.lineTo(3, 0);
  ctx.moveTo(-3, 4);
  ctx.lineTo(3, 4);
  ctx.stroke();
  ctx.restore();
}

function drawKindMark(ctx, enemy) {
  const mark = kindMark(enemy.kind);
  if (!mark) return;
  const x = enemy.x;
  const y = enemy.y - 26;
  ctx.save();
  ctx.strokeStyle = enemyPen(enemy.kind);
  ctx.fillStyle = enemyPen(enemy.kind);
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  if (mark === "arc") {
    ctx.beginPath();
    ctx.arc(x, y + 4, 5, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  } else if (mark === "C") {
    ctx.font = "700 11px Caveat, 'Segoe Print', 'Comic Sans MS', cursive";
    ctx.textAlign = "center";
    ctx.fillText("C", x, y + 6);
  } else if (mark === "dash") {
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 3);
    ctx.lineTo(x + 5, y + 1);
    ctx.stroke();
  } else if (mark === "dots") {
    ctx.beginPath();
    ctx.arc(x - 3, y + 3, 1.4, 0, Math.PI * 2);
    ctx.arc(x + 3, y + 3, 1.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (mark === "box") {
    ctx.strokeRect(x - 4, y, 8, 6);
  }
  ctx.restore();
}

function drawInkPools(ctx, pools, vis) {
  if (!pools) return;
  ctx.save();
  ctx.fillStyle = "rgba(27, 51, 88, 0.16)";
  ctx.strokeStyle = "rgba(27, 51, 88, 0.45)";
  ctx.lineWidth = 1.2;
  for (const pool of pools) {
    if (pool.life <= 0) continue;
    if (vis && (pool.x < vis.left || pool.x > vis.right || pool.y < vis.top || pool.y > vis.bottom)) {
      continue;
    }
    const t = Math.min(1, pool.life / 2);
    ctx.globalAlpha = 0.35 + 0.4 * t;
    ctx.beginPath();
    ctx.ellipse(pool.x, pool.y, pool.radius, pool.radius * 0.62, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawHud(ctx, view, hud) {
  if (!hud) return;
  const font = "700 16px Caveat, 'Segoe Print', 'Comic Sans MS', cursive";
  const small = "600 13px Caveat, 'Segoe Print', 'Comic Sans MS', cursive";
  ctx.save();
  ctx.textBaseline = "top";
  ctx.fillStyle = PEN;
  ctx.strokeStyle = "rgba(244, 236, 214, 0.7)";
  ctx.lineWidth = 3;
  ctx.font = font;

  const left = 10;
  const top = 8;
  const hp = hud.hp ?? 0;
  const maxHp = hud.maxHp ?? 3;
  for (let i = 0; i < maxHp; i++) {
    const x = left + i * 14;
    ctx.beginPath();
    ctx.moveTo(x, top + 8);
    ctx.lineTo(x + 8, top);
    ctx.lineTo(x + 10, top + 10);
    ctx.closePath();
    if (i < hp) ctx.fill();
    else {
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  ctx.font = small;
  ctx.fillText(hud.gun || "", left, top + 18);
  ctx.textAlign = "right";
  ctx.fillText(hud.marks || "", view.width - 10, top);
  ctx.fillText(hud.bank || "", view.width - 10, top + 16);
  if (hud.tag) ctx.fillText(hud.tag, view.width - 10, top + 32);
  if (hud.clock) {
    ctx.fillStyle = hud.overtime ? "#9a2b2b" : PEN;
    ctx.fillText(hud.clock, view.width - 10, top + (hud.tag ? 48 : 32));
    ctx.fillStyle = PEN;
  }
  ctx.textAlign = "left";
  if (hud.hint) {
    ctx.globalAlpha = Math.min(1, hud.hintLife ?? 1);
    ctx.fillText(hud.hint, left, view.height - 28);
    ctx.globalAlpha = 1;
  }
  if (hud.caption) {
    ctx.textAlign = "center";
    ctx.font = font;
    ctx.fillText(hud.caption, view.width / 2, view.height - 36);
  }
  if (hud.hunt) {
    ctx.save();
    ctx.translate(view.width / 2, 36);
    ctx.rotate(-0.08);
    ctx.strokeStyle = "#9a2b2b";
    ctx.lineWidth = 2;
    ctx.strokeRect(-48, -12, 96, 24);
    ctx.fillStyle = "#9a2b2b";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 18px Caveat, 'Segoe Print', 'Comic Sans MS', cursive";
    ctx.fillText("охота", 0, 1);
    ctx.restore();
  }
  if (hud.overtime) {
    ctx.save();
    ctx.translate(view.width / 2, hud.hunt ? 64 : 36);
    ctx.rotate(0.06);
    ctx.strokeStyle = "#9a2b2b";
    ctx.lineWidth = 2;
    ctx.strokeRect(-48, -12, 96, 24);
    ctx.fillStyle = "#9a2b2b";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 18px Caveat, 'Segoe Print', 'Comic Sans MS', cursive";
    ctx.fillText("время", 0, 1);
    ctx.restore();
  }
  if (hud.exitOpen) {
    ctx.save();
    ctx.translate(view.width / 2, view.height - 52);
    ctx.rotate(0.05);
    ctx.strokeStyle = "#1a3d6e";
    ctx.strokeRect(-62, -11, 124, 22);
    ctx.fillStyle = "#1a3d6e";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 16px Caveat, 'Segoe Print', 'Comic Sans MS', cursive";
    ctx.fillText("выходы открыты", 0, 1);
    ctx.restore();
  }
  if (hud.notebook && hud.notebook > 0) {
    const t = Math.min(1, hud.notebook);
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 1.4);
    ctx.translate(view.width / 2, view.height / 2);
    ctx.rotate(-0.12);
    ctx.strokeStyle = "#9a2b2b";
    ctx.lineWidth = 3;
    ctx.strokeRect(-110, -28, 220, 56);
    ctx.fillStyle = "#9a2b2b";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 28px Caveat, 'Segoe Print', 'Comic Sans MS', cursive";
    ctx.fillText("тетрадь исписана", 0, 2);
    ctx.restore();
  }
  ctx.restore();
}

function drawShot(ctx, shot, mode = "full") {
  if (!shot.alive && shot.trail.length < 2) return;
  const pts = shot.trail;
  const enemy = shot.team === "enemy";
  const thick = enemy ? 1 : Math.min(1.7, (shot.radius ?? 5) / 5);
  const heard = mode === "heard";
  ctx.save();
  ctx.globalAlpha = heard ? 0.28 : 1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = enemy ? ENEMY_LASER_GLOW : LASER_GLOW;
  ctx.lineWidth = (heard ? 4 : 7) * thick;
  drawInkPath(ctx, heard && pts.length > 3 ? pts.slice(-4) : pts);
  ctx.strokeStyle = enemy ? ENEMY_LASER : LASER;
  ctx.lineWidth = (heard ? 1.5 : 2.4) * thick;
  drawInkPath(ctx, heard && pts.length > 3 ? pts.slice(-4) : pts);
  if (!heard) {
    ctx.fillStyle = enemy ? ENEMY_LASER : LASER;
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, Math.max(2.4, (shot.radius ?? 5) * 0.64), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawFrame(
  ctx,
  view,
  level,
  player,
  shots,
  enemies,
  exitOpen,
  preview,
  pickups = [],
  fx = {},
) {
  const world = worldSize();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, view.width, view.height);
  if (!level || !player) {
    drawPaper(ctx, world.width, world.height);
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, view.width, view.height);
  ctx.clip();
  if (fx.camera) applyCamera(ctx, fx.camera);
  const vis = fx.camera ? viewRect(fx.camera, CELL) : null;
  drawPaper(ctx, world.width, world.height);
  drawWallTiles(ctx, level.tiles, vis, fx.fog);
  drawGates(ctx, level, fx.fog);
  drawSpawnDens(ctx, level.spawnDens, performance.now() / 1000, fx.fog, fx.huntFlash || 0);
  drawExitStamps(ctx, level, fx.hud?.heat || 0);
  drawWallInk(ctx, level.walls, vis, fx.fog);
  if (fx.fog) drawFogOverlay(ctx, fx.fog, vis);
  const seen = (x, y) => !fx.fog || fx.fog.worldVisible(x, y);
  for (const target of level.targets) {
    if (seen(target.x, target.y)) drawTarget(ctx, target, fx.targetPulse);
  }
  for (const pickup of pickups) {
    if (!pickup.alive) continue;
    if (!seen(pickup.x, pickup.y)) continue;
    if (pickup.kind === "life") drawLifePickup(ctx, pickup);
    if (pickup.kind === "ammo") drawAmmoPickup(ctx, pickup);
  }
  drawInkPools(ctx, fx.inkPools, vis);
  if (fx.particles) drawFx(ctx, fx.particles);
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    if (seen(enemy.x, enemy.y)) drawEnemy(ctx, enemy, "full");
    else if (fx.hear && fx.hear.enemy(enemy)) drawEnemy(ctx, enemy, "heard");
  }
  drawPreview(ctx, preview);
  for (const shot of shots) {
    if (shot.team === "player") {
      drawShot(ctx, shot, "full");
      continue;
    }
    if (seen(shot.x, shot.y)) drawShot(ctx, shot, "full");
    else if (fx.hear && fx.hear.shot(shot)) drawShot(ctx, shot, "heard");
  }
  if (!fx.hidePlayer) {
    drawPlayer(ctx, player);
    drawMuzzleFlash(ctx, player, fx.muzzleFlash || 0);
  }
  ctx.restore();
  drawHud(ctx, view, fx.hud);
}
