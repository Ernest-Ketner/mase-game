export function createFx() {
  return {
    blots: [],
    numbers: [],
    plates: [],
  };
}

export function resetFx(fx) {
  fx.blots.length = 0;
  fx.numbers.length = 0;
  fx.plates.length = 0;
}

export function spawnBlot(fx, x, y, color = "#1b3358", count = 7) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 90;
    fx.blots.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.28 + Math.random() * 0.18,
      max: 0.46,
      r: 1.4 + Math.random() * 2.4,
      color,
    });
  }
}

export function spawnDamage(fx, x, y, amount, plate = false) {
  fx.numbers.push({
    x: x + (Math.random() - 0.5) * 8,
    y: y - 12,
    text: plate ? "×" : String(amount),
    life: plate ? 0.4 : 0.35,
    max: plate ? 0.4 : 0.35,
    plate,
  });
  if (plate) {
    fx.plates.push({ x, y, life: 0.28, max: 0.28 });
  }
}

export function updateFx(fx, dt) {
  for (const b of fx.blots) {
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vx *= 0.88;
    b.vy *= 0.88;
  }
  for (const n of fx.numbers) {
    n.life -= dt;
    n.y -= 22 * dt;
  }
  for (const p of fx.plates) p.life -= dt;
  fx.blots = fx.blots.filter((b) => b.life > 0);
  fx.numbers = fx.numbers.filter((n) => n.life > 0);
  fx.plates = fx.plates.filter((p) => p.life > 0);
}

export function drawFx(ctx, fx) {
  ctx.save();
  ctx.lineCap = "round";
  for (const b of fx.blots) {
    const t = b.life / b.max;
    ctx.globalAlpha = 0.15 + 0.55 * t;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, b.r * (1.4 - t * 0.4), b.r * 0.7, b.x, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = "700 13px Caveat, 'Segoe Print', 'Comic Sans MS', cursive";
  ctx.textAlign = "center";
  for (const n of fx.numbers) {
    const t = n.life / n.max;
    ctx.globalAlpha = t;
    ctx.fillStyle = n.plate ? "#1a3d6e" : "#7a2d1a";
    ctx.fillText(n.text, n.x, n.y);
  }
  for (const p of fx.plates) {
    const t = p.life / p.max;
    ctx.globalAlpha = 0.7 * t;
    ctx.strokeStyle = "#1a3d6e";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(p.x - 7, p.y - 7);
    ctx.lineTo(p.x + 7, p.y + 7);
    ctx.moveTo(p.x + 7, p.y - 7);
    ctx.lineTo(p.x - 7, p.y + 7);
    ctx.stroke();
  }
  ctx.restore();
}
