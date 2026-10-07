import { spendGold, getGold } from "./wallet.js";
import { usesAmmo, weaponDef } from "./run.js";
import { UPGRADE_CATALOG, applyUpgrade, isAvailable } from "./upgrades.js";

const META_KEY = "mase-meta";

const INK = [
  { id: "blue", title: "Синие", price: 0 },
  { id: "black", title: "Чёрные", price: 2000 },
  { id: "green", title: "Зелёные", price: 4000 },
  { id: "purple", title: "Фиолетовые", price: 6000 },
  { id: "red", title: "Красные", price: 8000 },
];

const HELMETS = [
  { id: "helm", title: "Каска", price: 0 },
  { id: "beret", title: "Берет", price: 2500 },
  { id: "cap", title: "Кепка", price: 5000 },
  { id: "hood", title: "Капюшон", price: 8000 },
];

const MARKS = [
  { id: "none", title: "Без знака", price: 0 },
  { id: "star", title: "Звезда", price: 3000 },
  { id: "cross", title: "Крест", price: 5000 },
  { id: "ring", title: "Кольцо", price: 7500 },
];

const BEAMS = [
  { id: "red", title: "Красный", price: 0 },
  { id: "blue", title: "Синий", price: 2000 },
  { id: "green", title: "Зелёный", price: 4500 },
  { id: "gold", title: "Золотой", price: 6500 },
  { id: "violet", title: "Фиолетовый", price: 8000 },
];

const GUNS = [
  {
    id: "wpn_laser",
    title: "Лазер",
    levels: [
      { title: "медленнее перегрев", price: 3000 },
      { title: "+1 рикошет", price: 6000 },
      { title: "быстрее луч", price: 12000 },
    ],
  },
  {
    id: "wpn_smg",
    title: "Автомат",
    levels: [
      { title: "+20% магазин", price: 3000 },
      { title: "меньше разброс", price: 6000 },
      { title: "шанс не тратить патрон", price: 12000 },
    ],
  },
  {
    id: "wpn_pierce",
    title: "Пробивной",
    levels: [
      { title: "быстрее кулдаун", price: 3000 },
      { title: "+1 пробитие", price: 6000 },
      { title: "шире луч", price: 12000 },
    ],
  },
  {
    id: "wpn_shotgun",
    title: "Дробь",
    levels: [
      { title: "+1 дробина", price: 3000 },
      { title: "кучнее", price: 6000 },
      { title: "+2 патрона на лист", price: 12000 },
    ],
  },
];

const PERKS = [
  { id: "first_shield", title: "Щит листа", price: 4000, desc: "На первом листе один заряд силового поля" },
  { id: "free_reroll", title: "Черновик", price: 5000, desc: "Раз за забег обновить карточки бесплатно" },
  { id: "start_card", title: "Закладка", price: 6000, desc: "Забег начинается с одной обычной карточки" },
  { id: "early_third", title: "Три карты", price: 10000, desc: "Третья карточка в прокачке уже при банке 4" },
  { id: "gold_boost", title: "Надбавка", price: 10000, desc: "+20% золота за врагов" },
  { id: "last_breath", title: "С колена", price: 15000, desc: "Раз за забег встать с 1 HP вместо поражения" },
];

export const NOTEBOOK_PAGES = ["skins", "weapons", "perks", "tally"];

const INK_HEX = {
  blue: "#1b3358",
  black: "#1a1a1a",
  green: "#1a4d32",
  purple: "#4a2468",
  red: "#8d2a2a",
};

const BEAM_HEX = {
  red: { core: "#d31f1f", glow: "rgba(255, 70, 60, 0.45)" },
  blue: { core: "#1e5aab", glow: "rgba(40, 110, 200, 0.45)" },
  green: { core: "#1a7a45", glow: "rgba(40, 160, 90, 0.4)" },
  gold: { core: "#c4a035", glow: "rgba(220, 170, 40, 0.45)" },
  violet: { core: "#6a3d9a", glow: "rgba(140, 80, 190, 0.45)" },
};

let cached = null;

function blank() {
  return {
    v: 1,
    ink: "blue",
    helmet: "helm",
    mark: "none",
    beam: "red",
    owned: {},
    weapon: { wpn_laser: 0, wpn_smg: 0, wpn_pierce: 0, wpn_shotgun: 0 },
    perks: {},
    notebooks: 0,
    bestSheet: 0,
    runs: 0,
  };
}

function readStored() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return blank();
    const data = JSON.parse(raw);
    const base = blank();
    if (!data || typeof data !== "object") return base;
    base.ink = INK.some((x) => x.id === data.ink) ? data.ink : "blue";
    base.helmet = HELMETS.some((x) => x.id === data.helmet) ? data.helmet : "helm";
    base.mark = MARKS.some((x) => x.id === data.mark) ? data.mark : "none";
    base.beam = BEAMS.some((x) => x.id === data.beam) ? data.beam : "red";
    base.owned = data.owned && typeof data.owned === "object" ? { ...data.owned } : {};
    for (const gun of GUNS) {
      const n = Math.floor(Number(data.weapon?.[gun.id]));
      base.weapon[gun.id] = Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : 0;
    }
    base.perks = data.perks && typeof data.perks === "object" ? { ...data.perks } : {};
    base.notebooks = Math.max(0, Math.floor(Number(data.notebooks)) || 0);
    base.bestSheet = Math.max(0, Math.floor(Number(data.bestSheet)) || 0);
    base.runs = Math.max(0, Math.floor(Number(data.runs)) || 0);
    return base;
  } catch {
    return blank();
  }
}

function writeStored(state) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(state));
  } catch {
    /* приватный режим — тетрадь живёт до закрытия вкладки */
  }
}

function state() {
  if (!cached) cached = readStored();
  return cached;
}

function save() {
  writeStored(state());
}

export function resetMeta() {
  cached = blank();
  save();
}

export function hasPerk(id) {
  return !!state().perks[id];
}

export function weaponLevel(weaponId) {
  return state().weapon[weaponId] || 0;
}

export function playerLook() {
  const s = state();
  const beam = BEAM_HEX[s.beam] || BEAM_HEX.red;
  return {
    ink: INK_HEX[s.ink] || INK_HEX.blue,
    helmet: s.helmet,
    mark: s.mark,
    beam: beam.core,
    beamGlow: beam.glow,
  };
}

function skinOwned(slot, id, price) {
  if (price <= 0) return true;
  return !!state().owned[`${slot}:${id}`];
}

function priceLabel(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function skinGroup(title, slot, list, equipped) {
  const gold = getGold();
  return {
    title,
    items: list.map((item) => {
      const owned = skinOwned(slot, item.id, item.price);
      const on = equipped === item.id;
      return {
        id: `${slot}:${item.id}`,
        title: item.title,
        price: item.price,
        owned,
        on,
        disabled: !owned && gold < item.price,
        label: on ? `${item.title} · надет` : owned ? item.title : `${item.title} · ${priceLabel(item.price)}`,
        swatch: slot === "ink" ? INK_HEX[item.id] : slot === "beam" ? BEAM_HEX[item.id]?.core : "",
      };
    }),
  };
}

export function pageModel(pageId) {
  const s = state();
  if (pageId === "weapons") {
    return {
      title: "Стволы",
      groups: GUNS.map((gun) => {
        const have = s.weapon[gun.id] || 0;
        return {
          title: gun.title,
          items: gun.levels.map((level, i) => {
            const n = i + 1;
            const owned = have >= n;
            const next = have + 1 === n;
            const locked = !owned && !next;
            return {
              id: `gun:${gun.id}:${n}`,
              title: level.title,
              price: level.price,
              owned,
              on: owned,
              disabled: locked || (!owned && getGold() < level.price),
              label: owned
                ? `${n}. ${level.title}`
                : locked
                  ? `${n}. ${level.title}`
                  : `${n}. ${level.title} · ${priceLabel(level.price)}`,
            };
          }),
        };
      }),
    };
  }
  if (pageId === "perks") {
    return {
      title: "Способности",
      groups: [
        {
          title: "На забег",
          items: PERKS.map((perk) => {
            const owned = !!s.perks[perk.id];
            return {
              id: `perk:${perk.id}`,
              title: perk.title,
              desc: perk.desc,
              price: perk.price,
              owned,
              on: owned,
              disabled: !owned && getGold() < perk.price,
              label: owned ? `${perk.title} · есть` : `${perk.title} · ${priceLabel(perk.price)}`,
            };
          }),
        },
      ],
    };
  }
  if (pageId === "tally") {
    return {
      title: "Счёт",
      tally: true,
      notebooks: s.notebooks,
      bestSheet: s.bestSheet,
      runs: s.runs,
    };
  }
  return {
    title: "Скины",
    groups: [
      skinGroup("Чернила", "ink", INK, s.ink),
      skinGroup("Шлем", "helmet", HELMETS, s.helmet),
      skinGroup("Знак", "mark", MARKS, s.mark),
      skinGroup("Луч", "beam", BEAMS, s.beam),
    ],
  };
}

export function buy(id) {
  const s = state();
  if (id.startsWith("gun:")) {
    const [, weaponId, levelRaw] = id.split(":");
    const level = Math.floor(Number(levelRaw));
    const gun = GUNS.find((g) => g.id === weaponId);
    if (!gun || level < 1 || level > 3) return { ok: false };
    const have = s.weapon[weaponId] || 0;
    if (have >= level) return { ok: true };
    if (level !== have + 1) return { ok: false, reason: "order" };
    const price = gun.levels[level - 1].price;
    if (!spendGold(price)) return { ok: false, reason: "gold" };
    s.weapon[weaponId] = level;
    save();
    return { ok: true };
  }
  if (id.startsWith("perk:")) {
    const perkId = id.slice(5);
    const perk = PERKS.find((p) => p.id === perkId);
    if (!perk) return { ok: false };
    if (s.perks[perkId]) return { ok: true };
    if (!spendGold(perk.price)) return { ok: false, reason: "gold" };
    s.perks[perkId] = true;
    save();
    return { ok: true };
  }
  const [slot, skinId] = id.split(":");
  const table = slot === "ink" ? INK : slot === "helmet" ? HELMETS : slot === "mark" ? MARKS : slot === "beam" ? BEAMS : null;
  const item = table?.find((x) => x.id === skinId);
  if (!item) return { ok: false };
  if (item.price > 0 && !s.owned[id]) {
    if (!spendGold(item.price)) return { ok: false, reason: "gold" };
    s.owned[id] = true;
  }
  s[slot] = skinId;
  save();
  return { ok: true };
}

function growAmmo(run) {
  if (!usesAmmo(run)) return;
  const cap = Math.round(weaponDef(run.weaponId).ammo * run.mods.ammoCapMult);
  const prev = run.ammoMax;
  run.ammoMax = cap;
  if (!Number.isFinite(run.ammo) || run.ammo >= prev - 0.01) run.ammo = cap;
  else run.ammo = Math.min(cap, run.ammo);
}

/** Бонусы текущего ствола. Вызывать на свежих mods: в начале забега и после пересборки стеков. */
export function applyMetaBonuses(run) {
  if (!run?.mods) return;
  const level = weaponLevel(run.weaponId);
  const m = run.mods;
  if (run.weaponId === "wpn_laser") {
    if (level >= 1) m.heatMult *= 0.75;
    if (level >= 2) m.bounceBonus += 1;
    if (level >= 3) m.laserSpeedMult *= 1.2;
  } else if (run.weaponId === "wpn_smg") {
    if (level >= 1) {
      m.ammoCapMult *= 1.2;
      growAmmo(run);
    }
    if (level >= 2) m.moveSpreadMult = (m.moveSpreadMult || 1) * 0.65;
    if (level >= 3) m.ammoSave = Math.max(m.ammoSave || 0, 0.22);
  } else if (run.weaponId === "wpn_pierce") {
    if (level >= 1) m.pierceCdMult *= 0.82;
    if (level >= 2) m.pierceBonus += 1;
    if (level >= 3) m.shotRadiusMult *= 1.35;
  } else if (run.weaponId === "wpn_shotgun") {
    if (level >= 1) m.pelletBonus += 1;
    if (level >= 2) m.spreadMult *= 0.7;
    if (level >= 3) m.sheetAmmoBonus += 2;
  }
}

export function grantStartCard(run, rng = Math.random) {
  if (!hasPerk("start_card") || !run || run._startCard) return run?._startCard || null;
  const pool = UPGRADE_CATALOG.filter((u) => u.rarity === "common" && !u.weapon && isAvailable(run, u));
  if (pool.length === 0) return null;
  const card = pool[Math.floor(rng() * pool.length) % pool.length];
  if (!applyUpgrade(run, card.id, null)) return null;
  run._startCard = card.id;
  return card.id;
}

export function noteRun() {
  const s = state();
  s.runs += 1;
  save();
  return s.runs;
}

export function noteSheet(levelNum) {
  const n = Math.max(0, Math.floor(Number(levelNum)) || 0);
  const s = state();
  if (n > s.bestSheet) {
    s.bestSheet = n;
    save();
  }
  return s.bestSheet;
}

export function noteNotebook() {
  const s = state();
  s.notebooks += 1;
  save();
  return s.notebooks;
}

/** Черточки по пять: четыре палочки и пятая наискосок. */
export function tallyGroups(count) {
  const n = Math.max(0, Math.floor(Number(count)) || 0);
  const groups = [];
  let left = n;
  while (left > 0) {
    const take = Math.min(5, left);
    groups.push(take);
    left -= take;
  }
  return groups;
}
