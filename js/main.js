import {
  generateLevel,
  cellCenter,
  CELL,
  MARGIN,
  COLS,
  ROWS,
  sealEntryGate,
  openExitGate,
  updateGates,
  TARGET_RADIUS,
  TARGET_COUNT,
  pickSheetTag,
  SHEET_TAGS,
  exitKindAtPoint,
} from "./maze.js";
import { createPlayer, updatePlayer, muzzlePoint, hurtPlayer, healPlayer, grantInvuln } from "./player.js";
import {
  createWeapon,
  updateWeapon,
  tryFirePlayer,
  createShot,
  updateShot,
  shotHitsCircle,
  traceLaser,
  steerShotToward,
  splitShot,
} from "./laser.js";
import { createInput } from "./input.js";
import { setupCanvas, drawFrame } from "./render.js";
import { createCamera, snapCamera, updateCamera, screenToWorld, viewSize, shakeCamera } from "./camera.js";
import { updateEnemies, hurtEnemy, kindHint, stunEnemy } from "./enemy.js";
import { createRunState, applyPlayerStats, resetLevelShield, usesAmmo, syncMoveSpeed, NOTEBOOK_GOAL, SHEET_AMMO_GRANT } from "./run.js";
import {
  pickOffers,
  applyUpgrade,
  getWeapon,
  addAmmo,
  ammoDropAmount,
  ammoDropChance,
  offerTitle,
  listTaken,
  listTakenLines,
} from "./upgrades.js";
import {
  createFog,
  resetFog,
  updateFog,
  canHearEnemy,
  canHearPoint,
  revealWorld,
} from "./fog.js";
import {
  createSpawner,
  beginSheetSpawns,
  tickSpawner,
  queueSpawn,
  spawnMenuGrunt,
  wavePhase,
} from "./spawn.js";
import { parseSeedFromUrl, randomSeed, sheetRng } from "./seed.js";
import { bindAudioUnlock, sfx, toggleMute, isMuted } from "./audio.js";
import { createFx, resetFx, spawnBlot, spawnDamage, updateFx } from "./fx.js";
import { pickSheetEvent } from "./events.js";
import { sheetTimeLimit, overtimeInterval, formatClock } from "./deadline.js";

const EXIT_NEED = 4;
const PICK_COST = 3;
const RECORD_KEY = "mase-best-sheet";

const canvas = document.getElementById("game");
const statusEl = document.getElementById("status");
const overlayEl = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlaySub = document.getElementById("overlay-sub");
const overlayKicker = document.getElementById("overlay-kicker");
const upgradePanel = document.getElementById("upgrade-panel");
const upgradeSkip = document.getElementById("upgrade-skip");
const shopTaken = document.getElementById("shop-taken");
const upgradeCards = [
  document.getElementById("upgrade-0"),
  document.getElementById("upgrade-1"),
  document.getElementById("upgrade-2"),
];
const menuPanel = document.getElementById("menu-panel");
const menuPage = document.getElementById("menu-page");
const menuPageText = document.getElementById("menu-page-text");
const deathPanel = document.getElementById("death-panel");
const deathBuild = document.getElementById("death-build");
const pauseNotes = document.getElementById("pause-notes");
const eventBody = document.getElementById("event-body");
const eventContinue = document.getElementById("event-continue");
const view = viewSize();
const ctx = setupCanvas(canvas, view.width, view.height);
const camera = createCamera();
const input = createInput(canvas);
const bounds = {
  left: MARGIN,
  top: MARGIN,
  right: MARGIN + COLS * CELL,
  bottom: MARGIN + ROWS * CELL,
};

let sheet = null;
let player = null;
let weapon = null;
let shots = [];
let pickups = [];
let enemies = [];
let inkPools = [];
let levelNum = 1;
let lost = false;
let paused = false;
let run = createRunState();
let upgradeOffers = null;
let shopMode = "bank";
let eventChoices = null;
let eventResultNote = "";
let pendingBounty = 0;
let lastTime = performance.now();
const fog = createFog();
const spawner = createSpawner();
const particles = createFx();
let muzzleFlash = 0;
let huntFlash = 0;
let huntWasOn = false;
let exitWasOpen = false;
let notebookFlash = 0;
let mode = "menu";
let menuScreen = "root";
let menuTime = 0;
let runSeed = parseSeedFromUrl() || randomSeed();
let seenKinds = new Set();
let kindHintText = "";
let kindHintLife = 0;
let stepClock = 0;
let sheetTimer = 0;
let sheetTimed = false;
let overtime = false;
let overtimeWait = 0;
let lastHurtCause = "laser";
let muteHintLife = 0;
let timeRng = Math.random;

function setStatus(text) {
  statusEl.textContent = text;
}

function bestSheet() {
  const n = Number(sessionStorage.getItem(RECORD_KEY) || 0);
  return Number.isFinite(n) ? n : 0;
}

function rememberBest() {
  const prev = bestSheet();
  if (levelNum > prev) sessionStorage.setItem(RECORD_KEY, String(levelNum));
}

function setMenuChrome(on, root = false) {
  document.body.classList.toggle("in-menu", on);
  overlayEl.classList.toggle("is-menu", on);
  overlayEl.classList.toggle("is-root-menu", on && root);
  overlayEl.classList.remove("is-defeat");
  if (overlayKicker) overlayKicker.classList.toggle("hidden", !(on && root));
}

function hidePanels() {
  if (upgradePanel) upgradePanel.classList.add("hidden");
  if (menuPanel) menuPanel.classList.add("hidden");
  if (menuPage) menuPage.classList.add("hidden");
  if (deathPanel) deathPanel.classList.add("hidden");
  if (pauseNotes) pauseNotes.classList.add("hidden");
  if (eventBody) {
    eventBody.classList.add("hidden");
    eventBody.classList.remove("is-result");
  }
  if (eventContinue) eventContinue.classList.add("hidden");
}

function showOverlay(title, sub) {
  overlayTitle.textContent = title;
  overlaySub.textContent = sub;
  overlayEl.classList.remove("hidden");
}

function hideOverlay() {
  overlayEl.classList.add("hidden");
  overlayEl.classList.remove("is-defeat");
  setMenuChrome(false);
  hidePanels();
}

function exitNeed() {
  return run.mods.exitEarly ? 3 : EXIT_NEED;
}

function hitCount() {
  return sheet?.targets?.filter((t) => t.hit).length ?? 0;
}

function world() {
  return {
    sheet,
    enemies,
    run,
    levelNum,
    hitCount,
    onSpawn() {
      sfx.portal();
    },
    onChampionEvent() {
      sfx.hunt();
    },
    heat: run.heat || 0,
  };
}

function showUpgradeSelect(offers, mode = "bank") {
  upgradeOffers = offers;
  shopMode = mode;
  paused = false;
  hidePanels();
  setMenuChrome(false);
  if (mode === "bounty") {
    showOverlay("Добыча", "Сильный упал · выбери 1 из 2");
  } else {
    const keys = offers.length >= 3 ? "1 / 2 / 3" : "1 / 2";
    showOverlay(
      "Прокачка",
      `Метки: ${run.targetBank} · выбор ${PICK_COST} · ${keys} или Дальше`,
    );
  }
  if (upgradeSkip) upgradeSkip.classList.toggle("hidden", mode === "bounty");
  fillShopTaken(true);
  if (upgradePanel) {
    upgradePanel.classList.remove("hidden");
    for (let i = 0; i < upgradeCards.length; i++) {
      const card = upgradeCards[i];
      const up = offers[i];
      if (!card) continue;
      card.classList.remove("is-rare", "is-ink");
      if (!up) {
        card.classList.add("hidden");
        continue;
      }
      card.classList.remove("hidden");
      if (up.rarity === "rare") card.classList.add("is-rare");
      if (up.rarity === "ink") card.classList.add("is-ink");
      card.querySelector(".upgrade-key").textContent = String(i + 1);
      card.querySelector(".upgrade-title").textContent = offerTitle(up, run);
      card.querySelector(".upgrade-desc").textContent = up.desc;
    }
  }
}

function hideUpgradeSelect() {
  upgradeOffers = null;
  shopMode = "bank";
  eventChoices = null;
  if (upgradePanel) upgradePanel.classList.add("hidden");
  if (upgradeSkip) upgradeSkip.classList.remove("hidden");
  if (eventBody) {
    eventBody.classList.add("hidden");
    eventBody.classList.remove("is-result");
  }
  if (eventContinue) eventContinue.classList.add("hidden");
  fillShopTaken(false);
}

function fillShopTaken(show) {
  if (!shopTaken) return;
  if (!show) {
    shopTaken.classList.add("hidden");
    shopTaken.textContent = "";
    return;
  }
  const taken = listTaken(run);
  shopTaken.textContent = taken.length
    ? `уже есть:\n${taken.join("\n")}`
    : "уже есть: пока ничего";
  shopTaken.classList.remove("hidden");
}

function ensureMenuBackdrop() {
  if (sheet && player && mode === "menu" && enemies.length > 0) return;
  const rng = sheetRng(runSeed, 0);
  const tag = pickSheetTag(1, rng);
  sheet = generateLevel(rng, { tag, seed: runSeed });
  const outside = sheet.spawnOutside || cellCenter(sheet.start.c, sheet.start.r);
  player = createPlayer(outside);
  player.angle = Math.PI / 2;
  shots = [];
  pickups = [];
  enemies = [];
  inkPools = [];
  resetFog(fog);
  resetFx(particles);
  spawnMenuGrunt(sheet, enemies);
  snapCamera(camera, player.x + 70, player.y + 90);
}

function tickMenuCamera(dt) {
  if (!sheet || !player) return;
  menuTime += dt;
  const cx = player.x + Math.sin(menuTime * 0.21) * 120 + 40;
  const cy = player.y + Math.cos(menuTime * 0.15) * 100 + 50;
  updateCamera(camera, cx, cy, dt);
  if (enemies.length > 0) {
    updateEnemies(enemies, sheet.cells, sheet.walls, player, shots, dt, false, sheet.spawnDens || [], {
      huntMode: false,
      visionMult: 0.4,
    });
  }
}

function showMenu(screen = "root") {
  mode = "menu";
  menuScreen = screen;
  lost = false;
  paused = false;
  hideUpgradeSelect();
  hidePanels();
  ensureMenuBackdrop();
  setMenuChrome(true, screen === "root");
  overlayEl.classList.remove("hidden");
  if (screen === "root") {
    showOverlay("Лабиринт", "Играть — новый лист 1 · Enter");
    if (menuPanel) menuPanel.classList.remove("hidden");
    return;
  }
  if (menuPage) menuPage.classList.remove("hidden");
  if (screen === "controls") {
    showOverlay("Управление", "");
    menuPageText.textContent =
      "WASD или стрелки — ходить.\nЛКМ или пробел — выстрел, можно зажать.\nM — выключить или включить звук.\nНа бегу лучи разлетаются шире, чем стоя.\nПрицел (пунктир траектории) берётся как апгрейд.\nEsc — пауза (в меню — назад).\nR — начать забег заново с того же сида.";
  } else if (screen === "about") {
    showOverlay("Об игре", "");
    menuPageText.textContent =
      `Собери ${EXIT_NEED} мишени из ${TARGET_COUNT} — откроются два шлюза снизу.\nЗелёный «тихо» — обычный следующий лист и происшествие с выбором. Красный «жар» — следующий лист сложнее; каждый красный подряд поднимает жар (враги крепче и чаще).\nМишени только подбирать: подойти вплотную, выстрелом не сбить.\nЛишние метки копятся: после листа 3 метки = выбор 1 из 2 апгрейдов, при банке 6 — 3 карточки.\nС ${Math.ceil(TARGET_COUNT * 0.75)} мишеней начинается охота.\nСтраж и чемпион — не с первого листа. Цель тетради — ${NOTEBOOK_GOAL} листов, можно идти дальше.\nИногда лист со сроком (с 2-го); после ${NOTEBOOK_GOAL} срок всегда и короче. Если время вышло — раз в несколько секунд 1 урон.\nАвтомат и дробь получают +${SHEET_AMMO_GRANT} патронов на каждом новом листе.\nСид забега: ${runSeed}`;
  } else {
    showOverlay("Рекорд", "");
    const best = bestSheet();
    menuPageText.textContent = best > 0
      ? `Лучший лист за эту сессию: ${best}.\nСбрасывается, если закрыть вкладку.\nСид: ${runSeed}`
      : `Пока нет рекорда. Пройди хотя бы один лист.\nСид: ${runSeed}`;
  }
}

function startGame() {
  try {
    restartFromFirst();
  } catch (err) {
    console.error(err);
    mode = "menu";
    showMenu("root");
    if (overlaySub) overlaySub.textContent = `ошибка: ${err?.message || err}`;
  }
}

function syncSeedUrl(seed) {
  if (typeof history === "undefined" || !history.replaceState) return;
  try {
    const url = new URL(location.href);
    url.searchParams.set("seed", String(seed >>> 0));
    history.replaceState(null, "", url);
  } catch {
    /* file:// или старый браузер — сид всё равно в памяти */
  }
}

function startFreshSeed() {
  runSeed = randomSeed();
  syncSeedUrl(runSeed);
  restartFromFirst();
}

function goToMenu() {
  hideUpgradeSelect();
  sheet = null;
  player = null;
  enemies = [];
  shots = [];
  showMenu("root");
}

function trySealEntry() {
  if (!sheet.entryGate || sheet.entryGate.sealed || sheet.entryGate.anim === "close") {
    return;
  }
  const insideY = MARGIN + CELL * 1.6;
  if (player.y < insideY) return;
  for (const cell of sheet.entryGate.cells) {
    const pos = cellCenter(cell.c, cell.r);
    if (Math.hypot(player.x - pos.x, player.y - pos.y) < player.radius + CELL * 0.55) {
      return;
    }
  }
  sealEntryGate(sheet);
}

function tryOpenExit() {
  if (!sheet || sheet.exitOpen) return;
  if (hitCount() >= exitNeed()) openExitGate(sheet);
}

function makeSheet() {
  const rng = sheetRng(runSeed, levelNum);
  const tag = pickSheetTag(levelNum, rng);
  const timeLimit = sheetTimeLimit(levelNum, rng);
  const level = generateLevel(rng, { tag, seed: hashVisible(runSeed, levelNum) });
  level.timeLimit = timeLimit;
  return level;
}

function hashVisible(seed, level) {
  return (seed + level * 10007) >>> 0;
}

function loadSheet(keepPlayer = false) {
  run.heat = Math.max(0, Math.floor(Number(run.pendingHeat) || 0));
  run.pendingHeat = 0;
  const prevHp = keepPlayer && player ? player.hp : null;
  sheet = makeSheet();
  const outside = sheet.spawnOutside || cellCenter(sheet.start.c, sheet.start.r);
  if (!keepPlayer || !player) {
    player = createPlayer(outside);
  } else {
    player.x = outside.x;
    player.y = outside.y;
    player.hp = prevHp;
  }
  player.angle = Math.PI / 2;
  resetLevelShield(run);
  applyPlayerStats(player, run);
  if (keepPlayer && run.mods.levelHeal) healPlayer(player);
  if (usesAmmo(run)) addAmmo(run, SHEET_AMMO_GRANT);
  run.firstShotPending = !!run.mods.firstShot;
  weapon = createWeapon();
  shots = [];
  pickups = [];
  enemies = [];
  inkPools = [];
  lost = false;
  paused = false;
  resetFog(fog);
  resetFx(particles);
  muzzleFlash = 0;
  huntFlash = 0;
  huntWasOn = false;
  exitWasOpen = false;
  pendingBounty = 0;
  seenKinds = new Set();
  kindHintText = "";
  kindHintLife = 0;
  lastHurtCause = "laser";
  sheetTimed = (sheet.timeLimit || 0) > 0;
  sheetTimer = sheet.timeLimit || 0;
  overtime = false;
  overtimeWait = 0;
  timeRng = sheetRng(runSeed, levelNum + 50000);
  hideUpgradeSelect();
  hideOverlay();
  beginSheetSpawns(spawner, world());
  snapCamera(camera, player.x, player.y);
  rememberBest();
  updateHud();
}

function restartFromFirst() {
  mode = "play";
  levelNum = 1;
  run = createRunState();
  notebookFlash = 0;
  loadSheet(false);
}

function goNextSheet() {
  hideUpgradeSelect();
  hideOverlay();
  const from = levelNum;
  levelNum += 1;
  if (from === NOTEBOOK_GOAL) {
    notebookFlash = 2.4;
    sfx.notebook();
  }
  loadSheet(true);
}

function shopCount() {
  return run.targetBank >= 6 ? 3 : 2;
}

function beginUpgradePick() {
  if (run.targetBank < PICK_COST) {
    afterShop();
    return;
  }
  const offers = pickOffers(run, shopCount());
  if (offers.length === 0) {
    afterShop();
    return;
  }
  showUpgradeSelect(offers);
}

function afterShop() {
  hideUpgradeSelect();
  if (run.pendingEvent) {
    run.pendingEvent = false;
    const rng = sheetRng(runSeed, levelNum + 77001);
    const ev = pickSheetEvent(run, rng);
    if (ev) {
      showSheetEvent(ev);
      return;
    }
  }
  goNextSheet();
}

function showSheetEvent(ev) {
  eventChoices = ev.choices;
  shopMode = "event";
  upgradeOffers = ev.choices.map((c) => ({
    id: c.label,
    title: c.label,
    desc: c.hint || "",
  }));
  paused = false;
  hidePanels();
  setMenuChrome(false);
  showOverlay(ev.title, "");
  if (eventBody) {
    eventBody.textContent = ev.body;
    eventBody.classList.remove("hidden");
  }
  if (upgradeSkip) upgradeSkip.classList.add("hidden");
  fillShopTaken(false);
  if (upgradePanel) {
    upgradePanel.classList.remove("hidden");
    for (let i = 0; i < upgradeCards.length; i++) {
      const card = upgradeCards[i];
      const up = upgradeOffers[i];
      if (!card) continue;
      card.classList.remove("is-rare", "is-ink");
      if (!up) {
        card.classList.add("hidden");
        continue;
      }
      card.classList.remove("hidden");
      card.querySelector(".upgrade-key").textContent = String(i + 1);
      card.querySelector(".upgrade-title").textContent = up.title;
      card.querySelector(".upgrade-desc").textContent = up.desc;
    }
  }
}

function resolveEventChoice(index) {
  const choice = eventChoices?.[index];
  if (!choice) return;
  sfx.upgrade();
  const rng = sheetRng(runSeed, levelNum + 77002 + index);
  const note = choice.apply({
    run,
    player,
    rng,
    heal: (n) => healPlayer(player, n),
    grantInvuln: (t) => grantInvuln(player, t),
  });
  applyPlayerStats(player, run);
  showEventResult(choice.label, note);
}

function showEventResult(choiceLabel, note) {
  eventChoices = null;
  eventResultNote = note || "ничего особенного";
  shopMode = "event-result";
  upgradeOffers = [{ id: "continue" }];
  paused = false;
  hidePanels();
  setMenuChrome(false);
  showOverlay("Что вышло", `выбор: ${choiceLabel} · Enter — дальше`);
  if (eventBody) {
    eventBody.textContent = eventResultNote;
    eventBody.classList.add("is-result");
    eventBody.classList.remove("hidden");
  }
  if (eventContinue) eventContinue.classList.remove("hidden");
  fillShopTaken(false);
}

function dismissEventResult() {
  if (shopMode !== "event-result") return;
  const note = eventResultNote;
  eventResultNote = "";
  hideUpgradeSelect();
  goNextSheet();
  if (note) {
    kindHintText = note;
    kindHintLife = 2.8;
  }
}

function chooseUpgrade(index) {
  if (shopMode === "event-result") {
    dismissEventResult();
    return;
  }
  if (!upgradeOffers || !upgradeOffers[index]) return;
  if (shopMode === "event") {
    resolveEventChoice(index);
    return;
  }
  sfx.upgrade();
  if (shopMode === "bounty") {
    applyUpgrade(run, upgradeOffers[index].id, player);
    applyPlayerStats(player, run);
    grantInvuln(player, 2);
    hideUpgradeSelect();
    hideOverlay();
    updateHud();
    return;
  }
  if (run.targetBank < PICK_COST) return;
  run.targetBank -= PICK_COST;
  applyUpgrade(run, upgradeOffers[index].id, player);
  applyPlayerStats(player, run);
  hideUpgradeSelect();
  beginUpgradePick();
}

function skipShop() {
  if (!upgradeOffers) return;
  if (shopMode === "event-result") {
    dismissEventResult();
    return;
  }
  if (shopMode === "bounty" || shopMode === "event") return;
  afterShop();
}

function gunLabel() {
  const wpn = getWeapon(run);
  let gunText = weapon.cooldown > 0 ? `${wpn.label} ${weapon.cooldown.toFixed(1)}с` : `${wpn.label} готов`;
  if (usesAmmo(run)) gunText += ` · ${run.ammo}/${run.ammoMax}`;
  return gunText;
}

function hudState() {
  if (mode === "menu") {
    return {
      caption: "",
      marks: "",
      bank: "",
      gun: "",
      hp: 0,
      maxHp: 0,
    };
  }
  const hit = hitCount();
  const total = sheet?.targets?.length || TARGET_COUNT;
  return {
    hp: player?.hp ?? 0,
    maxHp: player?.maxHp ?? 3,
    gun: gunLabel(),
    marks: `метки ${hit}/${total}`,
    bank: `банк ${run.targetBank}`,
    tag: sheetTagLine(),
    hunt: isHuntMode(),
    exitOpen: !!sheet?.exitOpen && !isHuntMode() && !overtime,
    hint: muteHintLife > 0 ? (isMuted() ? "звук выкл" : "звук вкл") : kindHintText,
    hintLife: muteHintLife > 0 ? muteHintLife : kindHintLife,
    notebook: notebookFlash,
    clock: sheetTimed ? (overtime ? "0:00" : formatClock(sheetTimer)) : "",
    overtime,
    heat: run.heat || 0,
  };
}

function sheetTagLine() {
  const bits = [];
  if (sheet?.tagLabel) bits.push(sheet.tagLabel);
  if (run.heat) bits.push(run.heat > 1 ? `жар ${run.heat}` : "жар");
  if (sheetTimed) bits.push("срок");
  if (levelNum > NOTEBOOK_GOAL) bits.push("дальше тетради");
  return bits.join(" · ");
}

function pauseSheetText() {
  const lines = [];
  const tag = SHEET_TAGS.find((t) => t.id === sheet?.tag);
  if (tag) lines.push(`${tag.label} — ${tag.hint}`);
  else lines.push("обычный лист — без особой нарезки");
  if (run.heat) {
    lines.push(
      run.heat > 1
        ? `жар ${run.heat} — враги ещё крепче и чаще (серия красных выходов)`
        : "жар — враги крепче и чаще, может выйти лишний чемпион",
    );
  }
  if (sheetTimed) {
    lines.push(
      overtime
        ? "срок вышел — раз в несколько секунд 1 урон"
        : "срок — пока часы не кончились",
    );
  }
  if (levelNum > NOTEBOOK_GOAL) {
    lines.push("дальше тетради — срок на каждом листе и короче");
  }
  lines.push("шлюзы снизу: тихо — происшествие, жар — сложнее (серия копится)");
  const wpn = getWeapon(run);
  lines.push("");
  lines.push(`оружие: ${wpn.label}`);
  const taken = listTakenLines(run);
  lines.push(taken.length ? taken.join("\n") : "прокачек пока нет");
  return lines.join("\n");
}

function updateHud() {
  if (mode === "menu") {
    setStatus("Выход с 4 мишеней · тихо — происшествие · жар копится");
    return;
  }
  if (lost) {
    setStatus(`Попал под лазер · уровень ${levelNum} · рекорд ${bestSheet()}`);
    return;
  }
  if (upgradeOffers) {
    if (shopMode === "bounty") setStatus("Добыча · выбери апгрейд 1 / 2");
    else if (shopMode === "event") setStatus("Происшествие · выбери 1 / 2");
    else if (shopMode === "event-result") setStatus("Что вышло · Enter — дальше");
    else setStatus(`Прокачка · метки ${run.targetBank} · уровень ${levelNum} → ${levelNum + 1}`);
    return;
  }
  if (paused) {
    setStatus(`Пауза · уровень ${levelNum} · сид ${runSeed}`);
    return;
  }
  const h = hudState();
  setStatus(`${h.marks} · ${h.bank} · ${h.gun} · лист ${levelNum}`);
}

function maybeDropLoot(x, y, forceAmmo = false) {
  if (player.hp < player.maxHp && Math.random() < run.mods.lifeDropChance) {
    pickups.push({
      kind: "life",
      x,
      y,
      radius: 9,
      alive: true,
      bob: Math.random() * Math.PI * 2,
    });
  }
  const empty = usesAmmo(run) && run.ammo <= 0;
  if (forceAmmo || empty || Math.random() < ammoDropChance(run)) {
    pickups.push({
      kind: "ammo",
      x: x + 8,
      y: y - 6,
      radius: 8,
      amount: ammoDropAmount(run),
      alive: true,
      bob: Math.random() * Math.PI * 2,
    });
  }
}

function collectPickups() {
  for (const pickup of pickups) {
    if (!pickup.alive) continue;
    const reach = player.radius + pickup.radius;
    if (Math.hypot(player.x - pickup.x, player.y - pickup.y) > reach) continue;
    if (pickup.kind === "life" && healPlayer(player)) {
      pickup.alive = false;
    } else if (pickup.kind === "ammo" && addAmmo(run, pickup.amount || 6)) {
      pickup.alive = false;
    }
  }
  pickups = pickups.filter((p) => p.alive);
}

function onTargetHit() {
  run.targetBank += 1;
  sfx.mark();
  tryOpenExit();
  if (run.mods.reloadOnTarget && weapon) {
    weapon.cooldown *= 0.5;
  }
  if (run.mods.targetHealEvery > 0) {
    run.targetHealCount += 1;
    if (run.targetHealCount >= run.mods.targetHealEvery) {
      run.targetHealCount = 0;
      healPlayer(player);
    }
  }
}

function collectTargets() {
  let gained = false;
  for (const target of sheet.targets) {
    if (target.hit) continue;
    if (Math.hypot(player.x - target.x, player.y - target.y) < player.radius + TARGET_RADIUS + 2) {
      target.hit = true;
      gained = true;
      onTargetHit();
    }
  }
  if (gained) tryOpenExit();
}

function tryShowBounty() {
  if (pendingBounty <= 0 || upgradeOffers || lost || paused || mode !== "play") return;
  pendingBounty -= 1;
  const offers = pickOffers(run, 2);
  if (offers.length === 0) return;
  showUpgradeSelect(offers, "bounty");
}

function tryAdvance() {
  if (mode !== "play" || lost || upgradeOffers || !sheet?.exitOpen) return;
  const kind = exitKindAtPoint(sheet, player.x, player.y);
  if (!kind) return;
  if (kind === "heat") {
    run.pendingHeat = (Number(run.heat) || 0) + 1;
    run.pendingEvent = false;
  } else {
    run.pendingHeat = 0;
    run.pendingEvent = true;
  }
  beginUpgradePick();
}

function tryLose() {
  if (lost || player.hp > 0) return;
  lost = true;
  paused = false;
  rememberBest();
  sfx.die();
  hideUpgradeSelect();
  hidePanels();
  setMenuChrome(false);
  overlayEl.classList.add("is-defeat");
  const cause = lastHurtCause === "time" ? "Время вышло" : "Попал под лазер";
  showOverlay("Поражение", `${cause} · лист ${levelNum} · рекорд ${bestSheet()}`);
  if (deathBuild) deathBuild.textContent = buildRecap();
  if (deathPanel) deathPanel.classList.remove("hidden");
  updateHud();
}

function buildRecap() {
  const wpn = getWeapon(run);
  const taken = listTaken(run);
  const lines = [
    `оружие: ${wpn.label}`,
    taken.length > 0 ? taken.join(" · ") : "без апгрейдов",
    `лист ${levelNum} · сид ${runSeed}`,
  ];
  return lines.join("\n");
}

function tickDeadline(dt) {
  if (!sheetTimed || lost) return;
  if (!overtime) {
    sheetTimer -= dt;
    if (sheetTimer <= 0) {
      sheetTimer = 0;
      overtime = true;
      overtimeWait = overtimeInterval(timeRng);
      sfx.hunt();
    }
    return;
  }
  overtimeWait -= dt;
  if (overtimeWait > 0) return;
  lastHurtCause = "time";
  const hpLost = hurtPlayer(player, run);
  spawnBlot(particles, player.x, player.y, "#9a2b2b", 8);
  shakeCamera(camera, 3);
  if (hpLost) sfx.hurt();
  overtimeWait = overtimeInterval(timeRng);
  tryLose();
}

function shoot() {
  if (mode !== "play" || lost || paused || upgradeOffers) return;
  const origin = muzzlePoint(player);
  const dir = {
    x: Math.cos(player.angle),
    y: Math.sin(player.angle),
  };
  const axis = input.axis();
  const fired = tryFirePlayer(weapon, origin, dir, run, getWeapon(run), {
    lowHp: player.hp <= 1,
    moving: axis.x !== 0 || axis.y !== 0,
  });
  if (!fired) return;
  muzzleFlash = 0.08;
  sfx.shoot();
  for (const shot of fired) shots.push(shot);
}

function aimPreview() {
  if (mode !== "play" || !run.mods.aimPreview || lost || paused || upgradeOffers || !sheet) {
    return null;
  }
  const origin = muzzlePoint(player);
  const wpn = getWeapon(run);
  let maxBounces = wpn.bounces + run.mods.bounceBonus;
  if (run.mods.forceNoBounce) maxBounces = 0;
  const maxLen = 2400;
  return {
    points: traceLaser(
      origin,
      { x: Math.cos(player.angle), y: Math.sin(player.angle) },
      sheet.walls,
      maxBounces,
      maxLen,
    ),
    bright: false,
  };
}

function togglePause() {
  if (mode !== "play" || lost || upgradeOffers) return;
  paused = !paused;
  if (paused) {
    hidePanels();
    setMenuChrome(false);
    overlayEl.classList.remove("is-defeat");
    showOverlay("Пауза", `Esc — продолжить · R — с 1-го · M — звук · сид ${runSeed}`);
    if (pauseNotes) {
      pauseNotes.textContent = pauseSheetText();
      pauseNotes.classList.remove("hidden");
    }
  } else {
    hideOverlay();
  }
  updateHud();
}

function isHuntMode() {
  if (!sheet) return false;
  return wavePhase(hitCount()) === "hunt";
}

function nearestEnemy(x, y, skip) {
  let best = null;
  let bestD = Infinity;
  for (const e of enemies) {
    if (!e.alive || e === skip) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

function announceKind(enemy) {
  if (!enemy || seenKinds.has(enemy.kind)) return;
  const hint = kindHint(enemy.kind);
  if (!hint) return;
  seenKinds.add(enemy.kind);
  kindHintText = hint;
  kindHintLife = 2.2;
}

function resolveHits(shot) {
  if (shot.team === "player") {
    if (sheet?.targets) {
      for (const target of sheet.targets) {
        if (target.hit) continue;
        if (shotHitsCircle(shot, target.x, target.y, TARGET_RADIUS + 4)) {
          spawnBlot(particles, target.x, target.y, "#1b3358", 8);
          sfx.reject();
          shot.alive = false;
          return;
        }
      }
    }
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      if (!shot._pierced) shot._pierced = new Set();
      if (shot._pierced.has(enemy)) continue;
      if (shotHitsCircle(shot, enemy.x, enemy.y, enemy.radius)) {
        const blocked =
          (enemy.kind === "warden" && enemy.shieldTimer > 0) || enemy.emergeTimer > 0;
        if (blocked) {
          spawnBlot(particles, enemy.x, enemy.y, "#1a3d6e", 5);
          shot.alive = false;
          return;
        }
        stunEnemy(enemy, 0.5 + (run.mods.stunBonus || 0));
        if ((enemy.plates ?? 0) > 0) {
          hurtEnemy(enemy);
          spawnDamage(particles, enemy.x, enemy.y, 1, true);
          spawnBlot(particles, enemy.x, enemy.y, "#1a3d6e", 6);
          shot.alive = false;
          return;
        }
        shot._pierced.add(enemy);
        let dmg = shot.damage || 1;
        if (run.mods.bounceDamage && shot.bounces > 0) dmg += 1;
        if (run.mods.critChance > 0 && Math.random() < run.mods.critChance) dmg += 1;
        spawnDamage(particles, enemy.x, enemy.y, dmg);
        spawnBlot(particles, enemy.x, enemy.y, "#7a2d1a", 6);
        for (let i = 0; i < dmg; i++) {
          if (!enemy.alive) break;
          hurtEnemy(enemy);
        }
        if (!enemy.alive) {
          sfx.kill();
          const needAmmo = usesAmmo(run) && run.ammo <= 0;
          maybeDropLoot(enemy.x, enemy.y, needAmmo);
          if (enemy.kind === "champion") {
            pendingBounty += 1;
            grantInvuln(player, 2);
          }
          if (run.mods.lifeSteal > 0 && Math.random() < run.mods.lifeSteal) {
            healPlayer(player);
          }
        }
        if (shot.pierce > 0) {
          shot.pierce -= 1;
        } else {
          shot.alive = false;
          if (shot.inkDrop) {
            inkPools.push({ x: shot.x, y: shot.y, radius: CELL * 0.9, life: 2 });
          }
          return;
        }
      }
    }
    return;
  }

  if (shotHitsCircle(shot, player.x, player.y, player.radius)) {
    shot.alive = false;
    lastHurtCause = "laser";
    const hpLost = hurtPlayer(player, run);
    spawnBlot(particles, player.x, player.y, "#9a2b2b", 8);
    shakeCamera(camera, 3);
    if (hpLost) sfx.hurt();
    tryLose();
  }
}

function afterShotMove(shot, dt) {
  if (shot.bounced) {
    sfx.bounce();
    if (shot.seek) {
      const near = nearestEnemy(shot.x, shot.y);
      if (near) steerShotToward(shot, near.x, near.y, 0.55);
    }
    if (shot.split && Math.random() < 0.42) {
      shots.push(splitShot(shot));
    }
  }
  if (shot.fogCut && shot.team === "player") {
    revealWorld(fog, shot.x, shot.y, 1.5, 1);
  }
  if (shot.inkDrop && !shot.alive) {
    inkPools.push({ x: shot.x, y: shot.y, radius: CELL * 0.9, life: 2 });
  }
}

function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;
  stepClock += dt;
  if (input.consumeMute()) {
    toggleMute();
    muteHintLife = 1.4;
  }
  if (kindHintLife > 0) kindHintLife = Math.max(0, kindHintLife - dt);
  if (kindHintLife <= 0 && !muteHintLife) kindHintText = "";
  if (muteHintLife > 0) muteHintLife = Math.max(0, muteHintLife - dt);
  if (notebookFlash > 0) notebookFlash = Math.max(0, notebookFlash - dt);

  if (mode === "menu") {
    if (input.consumePause()) {
      if (menuScreen !== "root") showMenu("root");
    }
    const wantPlay = menuScreen === "root" && (input.consumeConfirm() || input.consumeShoot());
    if (wantPlay) startGame();
    else {
      input.consumeShoot();
      input.consumeConfirm();
    }
    input.consumeRestart();
    input.consumeChoice();
    input.consumeMute();
    tickMenuCamera(dt);
    updateHud();
    drawFrame(ctx, view, sheet, player, shots, enemies, sheet?.exitOpen, null, pickups, {
      camera,
      hidePlayer: true,
      targetPulse: true,
      hud: hudState(),
    });
    requestAnimationFrame(frame);
    return;
  }

  if (input.consumePause()) {
    if (upgradeOffers) skipShop();
    else togglePause();
  }
  if (input.consumeRestart()) startGame();
  if (input.consumeConfirm() && upgradeOffers) skipShop();

  const choice = input.consumeChoice?.();
  if (upgradeOffers && choice != null) chooseUpgrade(choice);

  const locked = lost || paused || !!upgradeOffers;

  const aim = screenToWorld(camera, input.mouse.x, input.mouse.y);
  input.mouse.wx = aim.x;
  input.mouse.wy = aim.y;

  if (input.consumeShoot() || input.isShootHeld()) shoot();

  if (!sheet || !player) {
    requestAnimationFrame(frame);
    return;
  }

  syncMoveSpeed(player, run);
  const axis = input.axis();
  updatePlayer(player, input, sheet.walls, dt, locked, sheet.grid, sheet);
  if (!locked && (axis.x !== 0 || axis.y !== 0)) sfx.step(stepClock);
  if (!locked) updateWeapon(weapon, dt);

  if (!locked) {
    collectTargets();
    collectPickups();
    trySealEntry();
    tryOpenExit();
    updateGates(sheet, dt);
    tickDeadline(dt);
    tickSpawner(spawner, dt, world());
    for (const e of enemies) {
      if (e.alive && e.emergeTimer <= 0) announceKind(e);
    }

    const hunting = isHuntMode();
    if (hunting && !huntWasOn) {
      huntFlash = 0.55;
      sfx.hunt();
    }
    huntWasOn = hunting;
    if (sheet.exitOpen && !exitWasOpen) huntFlash = Math.max(huntFlash, 0.35);
    exitWasOpen = sheet.exitOpen;

    const enemyShots = updateEnemies(
      enemies,
      sheet.cells,
      sheet.walls,
      player,
      shots,
      dt,
      locked,
      sheet.spawnDens || [],
      {
        huntMode: hunting,
        visionMult: run.mods.visionMult * (1 + 0.08 * (run.heat || 0)),
        enemySpeedMult: run.mods.enemySpeedMult * (1 + 0.1 * (run.heat || 0)),
        dodgeFail: run.mods.dodgeFail,
        enemyFireMult: run.mods.enemyFireMult * Math.max(0.5, 1 - 0.1 * (run.heat || 0)),
        wardenShieldMult: run.mods.wardenShieldMult,
        huntCalm: run.mods.huntCalm,
        inkPools,
      },
    );
    for (const enemy of enemies) {
      if (!enemy.alive || !enemy.wantsBackup) continue;
      enemy.wantsBackup = false;
      queueSpawn(spawner, world(), "grunt");
    }
    for (const fire of enemyShots) {
      sfx.enemyShoot();
      shots.push(
        createShot(
          { x: fire.x, y: fire.y },
          { x: fire.dx, y: fire.dy },
          "enemy",
          { speedMult: run.mods.enemyShotMult },
        ),
      );
    }

    for (const shot of shots) {
      if (!shot.alive) continue;
      updateShot(shot, sheet.walls, bounds, dt);
      afterShotMove(shot, dt);
    }
    for (const shot of shots) {
      if (!shot.alive) continue;
      resolveHits(shot);
    }
    for (const pickup of pickups) pickup.bob += dt * 4;
    for (const pool of inkPools) pool.life -= dt;
    inkPools = inkPools.filter((p) => p.life > 0);
    updateFx(particles, dt);
    enemies = enemies.filter((e) => e.alive);
    shots = shots.filter((s) => s.alive);
    tryShowBounty();
    tryAdvance();
    updateFog(fog, sheet.cells, player, dt, {
      visionBonus: run.mods.playerVisionBonus || 0,
      hearBonus: run.mods.playerHearBonus || 0,
      visionNerf: sheet.tag === "draft" ? -2 : 0,
    });
  } else {
    updateFx(particles, dt);
  }

  if (muzzleFlash > 0) muzzleFlash = Math.max(0, muzzleFlash - dt);
  if (huntFlash > 0) huntFlash = Math.max(0, huntFlash - dt);
  updateCamera(camera, player.x, player.y, dt);

  updateHud();
  drawFrame(
    ctx,
    view,
    sheet,
    player,
    shots,
    enemies,
    sheet.exitOpen,
    aimPreview(),
    pickups,
    {
      fog,
      camera,
      hear: {
        enemy: (e) => canHearEnemy(fog, e),
        shot: (s) => canHearPoint(fog, s.x, s.y),
      },
      muzzleFlash,
      huntFlash,
      targetPulse: true,
      inkPools,
      particles,
      hud: hudState(),
    },
  );
  requestAnimationFrame(frame);
}

for (let i = 0; i < upgradeCards.length; i++) {
  const card = upgradeCards[i];
  if (!card) continue;
  card.addEventListener("click", () => {
    if (upgradeOffers) chooseUpgrade(i);
  });
}

if (upgradeSkip) {
  upgradeSkip.addEventListener("click", () => skipShop());
}

if (eventContinue) {
  eventContinue.addEventListener("click", () => dismissEventResult());
}

document.getElementById("menu-play")?.addEventListener("click", () => startGame());
document.getElementById("menu-controls")?.addEventListener("click", () => showMenu("controls"));
document.getElementById("menu-about")?.addEventListener("click", () => showMenu("about"));
document.getElementById("menu-record")?.addEventListener("click", () => showMenu("record"));
document.getElementById("menu-back")?.addEventListener("click", () => showMenu("root"));
document.getElementById("death-retry")?.addEventListener("click", () => startGame());
document.getElementById("death-new")?.addEventListener("click", () => startFreshSeed());
document.getElementById("death-menu")?.addEventListener("click", () => goToMenu());

bindAudioUnlock();

try {
  showMenu("root");
  requestAnimationFrame(frame);
} catch (err) {
  console.error(err);
  setStatus(`Ошибка запуска: ${err?.message || err}`);
}
