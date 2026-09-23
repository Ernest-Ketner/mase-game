import { applyWeaponSwap, usesAmmo, weaponDef, createRunState, applyPlayerStats } from "./run.js";

export const UPGRADE_CATALOG = [
  { id: "laser_spd", title: "Быстрый луч", desc: "Скорость снаряда +25%", maxStacks: 4, rarity: "common", syn: "laser", effect: { mul: { laserSpeedMult: 1.25 } } },
  { id: "wpn_smg", title: "Автомат", desc: "Сменить ствол на автомат", rarity: "rare", weapon: "wpn_smg", special: "weapon" },
  { id: "wpn_pierce", title: "Пробивной луч", desc: "Сменить ствол на пробивной", rarity: "rare", weapon: "wpn_pierce", special: "weapon" },
  { id: "wpn_shotgun", title: "Дробь", desc: "Сменить ствол на дробь", rarity: "rare", weapon: "wpn_shotgun", special: "weapon" },
  { id: "wpn_laser", title: "Карандаш", desc: "Сменить ствол на лазер без лимита патронов", rarity: "common", weapon: "wpn_laser", special: "weapon" },
  { id: "cd", title: "Скорострельность", desc: "Кулдаун −15%", maxStacks: 3, rarity: "common", syn: "any", effect: { mul: { cooldownMult: 0.85 } } },
  { id: "bounce_plus", title: "Лишний отскок", desc: "+1 рикошет", maxStacks: 3, rarity: "common", syn: "bounce", effect: { add: { bounceBonus: 1 } } },
  { id: "bounce_zero_dmg", title: "Прямой удар", desc: "Без рикошета. Урон не ниже 2", rarity: "rare", syn: "laser", special: "no_bounce" },
  { id: "dmg", title: "Тяжёлый удар", desc: "+1 урон всем своим лучам", maxStacks: 2, rarity: "rare", syn: "any", effect: { add: { damage: 1 } } },
  { id: "move", title: "Лёгкий шаг", desc: "Скорость ходьбы +12%", maxStacks: 3, rarity: "common", syn: "any", effect: { mul: { moveMult: 1.12 } } },
  { id: "run_acc", title: "Стрельба на бегу", desc: "Меньше разброс, пока бежишь", maxStacks: 2, rarity: "common", syn: "any", special: "run_acc" },
  { id: "aim_preview", title: "Прицел", desc: "Пунктир всегда показывает траекторию луча", rarity: "common", syn: "any", effect: { set: { aimPreview: true } } },
  { id: "hp_max", title: "Запас сил", desc: "Макс. жизни +1 и сразу +1 HP", maxStacks: 3, rarity: "rare", syn: "any", special: "hp_max" },
  { id: "life_steal", title: "Жажда", desc: "25% шанс восстановить 1 HP при убийстве", rarity: "ink", syn: "any", effect: { set: { lifeSteal: 0.25 } } },
  { id: "ammo_cap", title: "Большой магазин", desc: "Ёмкость патронов +50% и немного патронов сразу", maxStacks: 2, rarity: "common", syn: "ammo", special: "ammo_cap" },
  { id: "ammo_drop", title: "Запасливость", desc: "Патроны выпадают чаще и пачками больше", maxStacks: 2, rarity: "common", syn: "ammo", effect: { add: { ammoDropBonus: 0.2 } } },
  { id: "vision_nerf", title: "Тень", desc: "Дальность зрения врагов −18%", maxStacks: 2, rarity: "common", syn: "any", effect: { mul: { visionMult: 0.82 } } },
  { id: "shield_once", title: "Щит уровня", desc: "1 блок урона на каждом листе", rarity: "rare", syn: "any", special: "shield" },
  { id: "double_tap", title: "Двойной выстрел", desc: "Шанс сразу выпустить второй снаряд", maxStacks: 2, rarity: "rare", syn: "any", special: "double_tap" },
  { id: "slow_shots", title: "Тяжёлый воздух", desc: "Снаряды врагов −18% скорости", maxStacks: 2, rarity: "common", syn: "any", effect: { mul: { enemyShotMult: 0.82 } } },
  { id: "exit_early", title: "Ранний выход", desc: "Если цель — метки, выход с 3 вместо 4", rarity: "rare", syn: "any", effect: { set: { exitEarly: true } } },
  { id: "armor", title: "Броня", desc: "Неуязвимость после урона 1.6 с", rarity: "rare", syn: "any", effect: { set: { invulnTime: 1.6 } } },
  { id: "lucky", title: "Удача", desc: "Жизни дропаются чаще; патроны тоже", rarity: "ink", syn: "any", special: "lucky" },
  { id: "crit", title: "Метка", desc: "Шанс нанести +1 урон", maxStacks: 2, rarity: "rare", syn: "any", special: "crit" },
  { id: "bounce_hurt", title: "Рикошет больнее", desc: "После отскока луч бьёт на +1", rarity: "rare", syn: "bounce", effect: { set: { bounceDamage: true } } },
  { id: "target_heal", title: "Трофей", desc: "Каждая 3-я мишень восстанавливает 1 HP", rarity: "rare", syn: "any", effect: { set: { targetHealEvery: 3 } } },
  { id: "last_stand", title: "На грани", desc: "При 1 HP ходьба и скорострельность +20%", rarity: "ink", syn: "any", effect: { set: { lastStand: true } } },
  { id: "warden_break", title: "Щитолом", desc: "Щит стража держится почти вдвое меньше", rarity: "rare", syn: "any", effect: { set: { wardenShieldMult: 0.55 } } },
  { id: "slow_bots", title: "Топь", desc: "Враги ходят медленнее", maxStacks: 2, rarity: "common", syn: "any", effect: { mul: { enemySpeedMult: 0.84 } } },
  { id: "spawn_wound", title: "Жгучий портал", desc: "Враги выходят уже ранеными (−1 HP)", rarity: "ink", syn: "any", effect: { set: { spawnWound: 1 } } },
  { id: "reload_mark", title: "Сбор зарядки", desc: "Мишень сбрасывает половину перезарядки", rarity: "common", syn: "any", effect: { set: { reloadOnTarget: true } } },
  { id: "level_heal", title: "Передышка", desc: "В начале каждого следующего листа +1 HP", rarity: "rare", syn: "any", effect: { set: { levelHeal: true } } },
  { id: "pierce_plus", title: "Пробивной заряд", desc: "Выстрелы пробивают ещё одну цель. Ствол тот же", maxStacks: 2, rarity: "rare", syn: "any", effect: { add: { pierceBonus: 1 } } },
  { id: "fat_beam", title: "Толстый луч", desc: "Свой снаряд шире, проще попасть", maxStacks: 2, rarity: "common", syn: "any", effect: { mul: { shotRadiusMult: 1.4 } } },
  { id: "stun_hit", title: "Оглушение", desc: "Попадание держит врага ещё +0.3 с", maxStacks: 3, rarity: "common", syn: "any", effect: { add: { stunBonus: 0.3 } } },
  { id: "first_shot", title: "Первый выстрел", desc: "Первый выстрел на листе без перезарядки и +1 урон", rarity: "rare", syn: "any", special: "first_shot" },
  { id: "enemy_cd", title: "Сбой", desc: "Враги стреляют реже", maxStacks: 2, rarity: "common", syn: "any", effect: { mul: { enemyFireMult: 1.25 } } },
  { id: "dodge_nerf", title: "Слепой шаг", desc: "Враги чаще не успевают шагнуть от луча", maxStacks: 2, rarity: "common", syn: "any", effect: { add: { dodgeFail: 0.2 } } },
  { id: "hunt_calm", title: "Хладнокровие", desc: "В режиме охоты враги не ускоряются и не стреляют чаще", rarity: "ink", syn: "any", effect: { set: { huntCalm: true } } },
  { id: "sight", title: "Зоркость", desc: "Дальше видишь в тумане (+3 клетки)", maxStacks: 2, rarity: "common", syn: "any", effect: { add: { playerVisionBonus: 3 } } },
  { id: "hearing", title: "Слух", desc: "Слышишь сквозь стены дальше. Десять раз — весь обычный лист", maxStacks: 12, rarity: "common", syn: "any", effect: { add: { playerHearBonus: (Math.hypot(32, 40) - 5) / 10 } } },
  { id: "bounce_seek", title: "Ищейка", desc: "После отскока луч чуть доворачивает к ближайшему врагу", rarity: "ink", syn: "bounce", effect: { set: { bounceSeek: true } } },
  { id: "bounce_split", title: "Чернильный скол", desc: "Шанс второго короткого луча в точке рикошета", rarity: "ink", syn: "bounce", effect: { set: { bounceSplit: true } } },
  { id: "smg_burst", title: "Очередь", desc: "Автомат: 3 луча, расход 2 патрона", rarity: "ink", syn: "smg", effect: { set: { smgBurst: true } } },
  { id: "ink_pool", title: "Лужа", desc: "Дробь оставляет лужу на 2 с — враги в ней медленнее", rarity: "ink", syn: "shotgun", effect: { set: { inkPool: true } } },
  { id: "fog_cut", title: "Прорезь", desc: "Пробивной открывает туман вдоль пути на 1.5 с", rarity: "ink", syn: "pierce", effect: { set: { fogCut: true } } },
  { id: "last_clip", title: "Последний ряд", desc: "При патронах ≤ 25% урон +1", rarity: "rare", syn: "ammo", effect: { set: { lastClip: true } } },
];

const RARITY_WEIGHT = { common: 10, rare: 4, ink: 2 };

export function getUpgrade(id) {
  return UPGRADE_CATALOG.find((u) => u.id === id) || null;
}

export function getWeapon(run) {
  return weaponDef(run.weaponId);
}

export function addAmmo(run, amount) {
  if (!usesAmmo(run)) return false;
  if (!Number.isFinite(run.ammoMax)) return false;
  if (run.ammo >= run.ammoMax) return false;
  run.ammo = Math.min(run.ammoMax, run.ammo + amount);
  return true;
}

export function ammoDropChance(run) {
  if (!usesAmmo(run)) return 0;
  return Math.min(0.75, 0.35 + run.mods.ammoDropBonus);
}

export function ammoDropAmount(run) {
  const base = run.weaponId === "wpn_shotgun" ? 4 : 6;
  return base + (run.mods.ammoDropBonus > 0 ? 2 : 0);
}

function stackCount(run, id) {
  return run.stacks?.[id] || 0;
}

function weaponSyn(run) {
  if (run.weaponId === "wpn_smg") return ["smg", "ammo", "any"];
  if (run.weaponId === "wpn_shotgun") return ["shotgun", "ammo", "any"];
  if (run.weaponId === "wpn_pierce") return ["pierce", "bounce", "laser", "any"];
  return ["laser", "bounce", "any"];
}

function weaponBounces(run) {
  if (run.mods.forceNoBounce) return false;
  return (weaponDef(run.weaponId).bounces || 0) > 0;
}

export function isAvailable(run, upgrade) {
  const max = upgrade.maxStacks || 1;
  if (stackCount(run, upgrade.id) >= max) return false;
  if (run.taken.has(upgrade.id) && max <= 1) return false;
  for (const req of upgrade.requires || []) {
    if (!run.taken.has(req) && stackCount(run, req) < 1) return false;
  }
  if (upgrade.weapon || upgrade.special === "weapon") return false;
  const bounceIds = new Set(["bounce_plus", "bounce_hurt", "bounce_seek", "bounce_split", "bounce_zero_dmg"]);
  if (bounceIds.has(upgrade.id) || upgrade.syn === "bounce") {
    if (!weaponBounces(run)) return false;
  }
  if (upgrade.syn === "ammo" && !usesAmmo(run)) return false;
  if (upgrade.syn === "smg" && run.weaponId !== "wpn_smg") return false;
  if (upgrade.syn === "shotgun" && run.weaponId !== "wpn_shotgun") return false;
  if (upgrade.syn === "pierce" && run.weaponId !== "wpn_pierce") return false;
  if (upgrade.syn === "laser" && run.weaponId !== "wpn_laser" && run.weaponId !== "wpn_pierce") return false;
  return true;
}

const LIFE_IDS = new Set(["hp_max", "level_heal", "target_heal", "life_steal", "lucky"]);

function weightOf(u, lowLife = false) {
  const base = RARITY_WEIGHT[u.rarity] || 6;
  if (!lowLife || !LIFE_IDS.has(u.id)) return base;
  if (u.id === "hp_max") return base * 8;
  return base * 4;
}

function pickWeighted(list, rng, lowLife = false) {
  let sum = 0;
  for (const u of list) sum += weightOf(u, lowLife);
  if (sum <= 0) return null;
  let roll = rng() * sum;
  for (const u of list) {
    roll -= weightOf(u, lowLife);
    if (roll <= 0) return u;
  }
  return list[list.length - 1];
}

export function pickOffers(run, count = 2, rng = Math.random, opts = {}) {
  const lowLife = !!opts.lowLife;
  const all = UPGRADE_CATALOG.filter((u) => isAvailable(run, u));
  const exclude = new Set(opts.exclude || []);
  const pool = all.filter((u) => !exclude.has(u.id));
  if (pool.length === 0 && all.length === 0) return [];
  const syn = new Set(weaponSyn(run));
  const synergy = pool.filter((u) => u.syn && syn.has(u.syn) && !u.weapon);
  const life = pool.filter((u) => LIFE_IDS.has(u.id));
  const picks = [];
  const used = new Set();

  const take = (u) => {
    if (!u || used.has(u.id)) return;
    if (u.weapon && picks.some((p) => p.weapon)) return;
    picks.push(u);
    used.add(u.id);
  };

  if (lowLife && life.length > 0 && rng() < 0.75) take(pickWeighted(life, rng, true));
  else if (synergy.length > 0) take(pickWeighted(synergy, rng, lowLife));

  let guard = 0;
  while (picks.length < Math.min(count, pool.length) && guard < 40) {
    guard += 1;
    const rest = pool.filter((u) => !used.has(u.id));
    if (rest.length === 0) break;
    take(pickWeighted(rest, rng, lowLife));
  }
  guard = 0;
  while (picks.length < Math.min(count, all.length) && guard < 40) {
    guard += 1;
    const rest = all.filter((u) => !used.has(u.id));
    if (rest.length === 0) break;
    take(pickWeighted(rest, rng, lowLife));
  }
  return picks.slice(0, count);
}

export function pickTwoOffers(run, rng = Math.random) {
  return pickOffers(run, 2, rng);
}

function applyEffectBlob(mods, blob, stackIndex) {
  if (!blob) return;
  if (blob.mul) {
    for (const [k, v] of Object.entries(blob.mul)) mods[k] *= v;
  }
  if (blob.add) {
    for (const [k, v] of Object.entries(blob.add)) mods[k] += v;
  }
  if (blob.set) {
    for (const [k, v] of Object.entries(blob.set)) mods[k] = v;
  }
  if (blob.setMax) {
    for (const [k, arr] of Object.entries(blob.setMax)) {
      const v = arr[Math.min(stackIndex, arr.length - 1)];
      mods[k] = Math.max(mods[k] || 0, v);
    }
  }
}

function applySpecial(run, player, special, stackIndex) {
  const m = run.mods;
  switch (special) {
    case "weapon":
      break;
    case "no_bounce":
      m.forceNoBounce = true;
      m.damage = Math.max(m.damage, 2);
      break;
    case "run_acc":
      m.moveAcc = Math.max(m.moveAcc, stackIndex === 0 ? 0.45 : 0.75);
      break;
    case "hp_max":
      m.maxHpBonus += 1;
      if (player) {
        player.maxHp = 3 + m.maxHpBonus;
        player.hp = Math.min(player.maxHp, player.hp + 1);
      }
      break;
    case "ammo_cap":
      m.ammoCapMult *= 1.5;
      if (usesAmmo(run) && Number.isFinite(run.ammoMax)) {
        run.ammoMax = Math.round(run.ammoMax * 1.5);
        run.ammo = Math.min(run.ammoMax, run.ammo + Math.ceil(run.ammoMax * 0.25));
      }
      break;
    case "shield":
      m.levelShield = true;
      m.shieldCharges = 1;
      if (player) player.shieldCharges = 1;
      break;
    case "double_tap":
      m.doubleTap = stackIndex === 0 ? 0.3 : 0.5;
      break;
    case "lucky":
      m.lifeDropChance = 0.35;
      m.ammoDropBonus += 0.15;
      break;
    case "crit":
      m.critChance = stackIndex === 0 ? 0.2 : 0.35;
      break;
    case "first_shot":
      m.firstShot = true;
      run.firstShotPending = true;
      break;
    default:
      break;
  }
}

export function offerDesc(upgrade, run) {
  if (!upgrade) return "";
  if (upgrade.id === "lucky") {
    return usesAmmo(run) ? "Жизни и патроны дропаются чаще" : "Жизни дропаются чаще";
  }
  if (upgrade.id === "double_tap") {
    const chance = stackCount(run, upgrade.id) === 0 ? 30 : 50;
    const extra = usesAmmo(run) ? ", тратит патрон" : "";
    return `Шанс ${chance}% сразу выпустить второй снаряд${extra}`;
  }
  if (upgrade.id === "crit") {
    const chance = stackCount(run, upgrade.id) === 0 ? 20 : 35;
    return `Шанс ${chance}% нанести +1 урон`;
  }
  if (upgrade.id === "wpn_laser") {
    const starter = run?.starterWeaponId || run?.weaponId;
    if (starter === "wpn_laser") return "Вернуться к своему лазеру без лимита патронов";
    return "Сменить ствол на лазер без лимита патронов";
  }
  return upgrade.desc || "";
}

export function offerTitle(upgrade, run) {
  const max = upgrade.maxStacks || 1;
  if (max <= 1) return upgrade.title;
  const n = stackCount(run, upgrade.id) + 1;
  return `${upgrade.title} (${n}/${max})`;
}

export function takenLabel(upgrade, run) {
  const n = stackCount(run, upgrade.id);
  if (n <= 0) return null;
  const max = upgrade.maxStacks || 1;
  if (max <= 1) return upgrade.title;
  return `${upgrade.title} (${n}/${max})`;
}

export function listTaken(run) {
  return UPGRADE_CATALOG.map((u) => takenLabel(u, run)).filter(Boolean);
}

export function listTakenLines(run) {
  return listBuildLines(run).filter((line) => !line.lost).map((line) => line.text);
}

export function listBuildLines(run) {
  const removed = new Map((run.lost || []).map((row) => [row.id, row.removed]));
  const lines = [];
  for (const upgrade of UPGRADE_CATALOG) {
    const title = takenLabel(upgrade, run);
    if (!title) continue;
    lines.push({ text: `${title} — ${offerDesc(upgrade, run)}`, lost: false });
  }
  for (const upgrade of UPGRADE_CATALOG) {
    if (stackCount(run, upgrade.id) > 0) continue;
    const count = removed.get(upgrade.id) || 0;
    if (count <= 0) continue;
    const max = upgrade.maxStacks || 1;
    const title = max > 1 ? `${upgrade.title} (${count}/${max})` : upgrade.title;
    lines.push({ text: `${title} — ${offerDesc(upgrade, run)}`, lost: true });
  }
  return lines;
}

export function applyUpgrade(run, id, player = null) {
  const upgrade = getUpgrade(id);
  if (!upgrade || !isAvailable(run, upgrade)) return false;
  noteGain(run, id);
  forceApplyUpgrade(run, upgrade, player);
  return true;
}

function forceApplyUpgrade(run, upgrade, player = null) {
  if (!run.stacks) run.stacks = {};
  const stackIndex = stackCount(run, upgrade.id);
  run.stacks[upgrade.id] = stackIndex + 1;
  if (run.stacks[upgrade.id] >= (upgrade.maxStacks || 1)) run.taken.add(upgrade.id);
  applyEffectBlob(run.mods, upgrade.effect, stackIndex);
  if (upgrade.special) applySpecial(run, player, upgrade.special, stackIndex);
}

export function takenEntries(run) {
  return Object.entries(run.stacks || {}).filter(([, n]) => n > 0);
}

export function rebuildFromStacks(run, player = null) {
  const saved = { ...(run.stacks || {}) };
  const ammo = run.ammo;
  const starter = run.starterWeaponId || run.weaponId || "wpn_laser";
  const keep = {
    targetBank: run.targetBank,
    heat: run.heat,
    pendingHeat: run.pendingHeat,
    pendingEvent: run.pendingEvent,
    targetHealCount: run.targetHealCount,
    firstShotPending: run.firstShotPending,
  };
  const fresh = createRunState();
  run.taken = fresh.taken;
  run.stacks = {};
  run.mods = fresh.mods;
  run.weaponId = fresh.weaponId;
  run.ammo = fresh.ammo;
  run.ammoMax = fresh.ammoMax;
  run.firstShotPending = false;
  run.targetHealCount = keep.targetHealCount;
  run.targetBank = keep.targetBank;
  run.heat = keep.heat;
  run.pendingHeat = keep.pendingHeat;
  run.pendingEvent = keep.pendingEvent;
  applyWeaponSwap(run, starter, true);
  for (const u of UPGRADE_CATALOG) {
    if (u.weapon) continue;
    const n = saved[u.id] || 0;
    for (let i = 0; i < n; i++) forceApplyUpgrade(run, u, null);
  }
  if (usesAmmo(run) && Number.isFinite(ammo) && Number.isFinite(run.ammoMax)) {
    run.ammo = Math.min(run.ammoMax, ammo);
  }
  run.firstShotPending = !!(keep.firstShotPending && run.mods.firstShot);
  if (player) applyPlayerStats(player, run);
}

export function stripUpgrade(run, id, player = null) {
  if (!run.stacks?.[id]) return false;
  noteLoss(run, id);
  run.stacks[id] -= 1;
  if (run.stacks[id] <= 0) {
    delete run.stacks[id];
    run.taken.delete(id);
  } else {
    run.taken.delete(id);
  }
  rebuildFromStacks(run, player);
  return true;
}

function noteLoss(run, id) {
  if (!run.lost) run.lost = [];
  const row = run.lost.find((item) => item.id === id);
  if (row) row.removed += 1;
  else run.lost.push({ id, removed: 1 });
}

function noteGain(run, id) {
  if (!run.lost) return;
  const index = run.lost.findIndex((item) => item.id === id);
  if (index < 0) return;
  run.lost[index].removed -= 1;
  if (run.lost[index].removed <= 0) run.lost.splice(index, 1);
}

export function stripRandomUpgrade(run, rng = Math.random, player = null, opts = {}) {
  let ids = takenEntries(run).map(([id]) => id);
  if (opts.avoidWeapons) {
    const noWpn = ids.filter((id) => !getUpgrade(id)?.weapon);
    if (noWpn.length) ids = noWpn;
  }
  if (ids.length === 0) return null;
  const id = ids[Math.floor(rng() * ids.length)];
  const title = getUpgrade(id)?.title || id;
  stripUpgrade(run, id, player);
  return title;
}
