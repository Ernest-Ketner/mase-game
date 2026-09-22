import { CELL, worldSize } from "./maze.js";

/** Видимое окно в клетках (меньше полного листа 33×41). */
export const VIEW_COLS = 19;
export const VIEW_ROWS = 23;

export function viewSize() {
  return {
    width: VIEW_COLS * CELL,
    height: VIEW_ROWS * CELL,
  };
}

export function createCamera() {
  const view = viewSize();
  return {
    x: 0,
    y: 0,
    viewW: view.width,
    viewH: view.height,
    shake: 0,
    ox: 0,
    oy: 0,
  };
}

function clampCamera(cam) {
  const world = worldSize();
  const halfW = cam.viewW / 2;
  const halfH = cam.viewH / 2;
  const minX = halfW;
  const maxX = world.width - halfW;
  const minY = halfH;
  const maxY = world.height - halfH;
  cam.x = minX < maxX ? Math.max(minX, Math.min(maxX, cam.x)) : world.width / 2;
  cam.y = minY < maxY ? Math.max(minY, Math.min(maxY, cam.y)) : world.height / 2;
}

export function snapCamera(cam, x, y) {
  cam.x = x;
  cam.y = y;
  clampCamera(cam);
}

export function shakeCamera(cam, amount = 3) {
  cam.shake = Math.max(cam.shake || 0, amount);
}

export function updateCamera(cam, x, y, dt) {
  const k = 1 - Math.exp(-14 * dt);
  cam.x += (x - cam.x) * k;
  cam.y += (y - cam.y) * k;
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt * 18);
    const a = Math.random() * Math.PI * 2;
    const mag = cam.shake;
    cam.ox = Math.cos(a) * mag;
    cam.oy = Math.sin(a) * mag;
  } else {
    cam.ox = 0;
    cam.oy = 0;
  }
  clampCamera(cam);
}

export function applyCamera(ctx, cam) {
  ctx.translate(cam.viewW / 2 - cam.x + (cam.ox || 0), cam.viewH / 2 - cam.y + (cam.oy || 0));
}

export function screenToWorld(cam, sx, sy) {
  return {
    x: sx + cam.x - cam.viewW / 2,
    y: sy + cam.y - cam.viewH / 2,
  };
}

export function viewRect(cam, pad = 0) {
  return {
    left: cam.x - cam.viewW / 2 - pad,
    top: cam.y - cam.viewH / 2 - pad,
    right: cam.x + cam.viewW / 2 + pad,
    bottom: cam.y + cam.viewH / 2 + pad,
  };
}
