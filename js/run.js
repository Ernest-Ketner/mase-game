import {
  PLAYER_MAX_HP,
  PLAYER_BASE_SPEED,
  PLAYER_BASE_RADIUS,
} from "./player.js";
import { MAX_BOUNCES, PLAYER_COOLDOWN, PLAYER_LASER_SPEED } from "./laser.js";

export const NOTEBOOK_GOAL = 20;
export const SHEET_AMMO_GRANT = 6;
export const GOLD_PER_KILL = 10;
export const LIFE_PRICES = [900, 1900, 2800, 3400, 4300, 5000];
export const REROLL_PRICE = 100;

export function rerollPrice(run) {
  const cut = Math.min(0.6, Math.max(0, Number(run?.mods?.rerollDiscount) || 0));
  return Math.round(REROLL_PRICE * (1 - cut));
}

export function lifePrice(bought) {
  const i = Math.max(0, Math.floor(Number(bought)) || 0);
  return LIFE_PRICES[Math.min(i, LIFE_PRICES.length - 1)];
}

export function createRunState() {
  return {
    taken: new Set(),
    weaponId: "wpn_laser",
    starterWeaponId: "wpn_laser",
    ammo: Infinity,
    ammoMax: Infinity,
    firstShotPending: false,
    targetHealCount: 0,
    targetBank: 0,
    goldEarned: 0,
    livesBought: 0,
    heat: 0,
    pendingHeat: 0,
    pendingEvent: false,
    stacks: {},
    lost: [],
    mods: {
      laserSpeedMult: 1,
      cooldownMult: 1,
      bounceBonus: 0,
      forceNoBounce: false,
      damage: 1,
      moveMult: 1,
      maxHpBonus: 0,
      lifeSteal: 0,
      ammoCapMult: 1,
      ammoDropBonus: 0,
      visionMult: 1,
      levelShield: false,
      shieldCharges: 0,
      doubleTap: 0,
      enemyShotMult: 1,
      exitEarly: false,
      invulnTime: 1,
      lifeDropChance: 0.2,
      critChance: 0,
      bounceDamage: false,
      targetHealEvery: 0,
      lastStand: false,
      wardenShieldMult: 1,
      enemySpeedMult: 1,
      spawnWound: 0,
      reloadOnTarget: false,
      levelHeal: false,
      pierceBonus: 0,
      shotRadiusMult: 1,
      firstShot: false,
      enemyFireMult: 1,
      dodgeFail: 0,
      huntCalm: false,
      playerVisionBonus: 0,
      playerHearBonus: 0,
      aimPreview: false,
      moveAcc: 0,
      bounceSeek: false,
      bounceSplit: false,
      smgBurst: false,
      inkPool: false,
      fogCut: false,
      lastClip: false,
      slowBonus: 0,
      stunOnHit: 0,
      poolOnHit: 0,
      poolOnKill: false,
      poolOnBounce: 0,
      poolOnHurt: false,
      poolOnTarget: false,
      poolRadiusMult: 1,
      poolLifeBonus: 0,
      poolAcid: false,
      poolSticky: false,
      poolDeep: false,
      heatMult: 1,
      coolMult: 1,
      ammoSave: 0,
      spreadMult: 1,
      moveSpreadMult: 1,
      pelletBonus: 0,
      pierceCdMult: 1,
      sheetAmmoBonus: 0,
      finisher: false,
      ambush: false,
      chainKill: false,
      plateBreak: false,
      bigGame: false,
      farShot: false,
      closeShot: false,
      targetShield: false,
      dodgeChance: 0,
      overtimeSlow: 1,
      secondWind: false,
      killRush: false,
      dash: false,
      crouch: false,
      mapPeek: false,
      compass: false,
      enemyMark: false,
      shotHearBonus: 0,
      goldBonus: 0,
      rerollDiscount: 0,
      bankBonus: 0,
      champBounty: false,
      aimJam: 0,
      portalSlow: 1,
      panic: false,
      champShieldMult: 1,
      shoutMute: false,
      smgLong: false,
      firstShotDamage: false,
      wallPierce: 0,
      quietStep: false,
      wallSlide: 1,
    },
  };
}

export function usesAmmo(run) {
  return run.weaponId === "wpn_smg" || run.weaponId === "wpn_shotgun";
}

export function resetLevelShield(run) {
  if (run.mods.levelShield) run.mods.shieldCharges = 1;
  else run.mods.shieldCharges = 0;
}

export function applyPlayerStats(player, run) {
  const maxHp = PLAYER_MAX_HP + run.mods.maxHpBonus;
  player.maxHp = maxHp;
  player.hp = Math.min(maxHp, Math.max(1, player.hp ?? maxHp));
  player.radius = PLAYER_BASE_RADIUS;
  player.shieldCharges = run.mods.shieldCharges;
  syncMoveSpeed(player, run);
}

export function syncMoveSpeed(player, run) {
  let speed = PLAYER_BASE_SPEED * run.mods.moveMult;
  if (run.mods.lastStand && player.hp <= 1) speed *= 1.2;
  if (player.rushTimer > 0) speed *= 1.25;
  if (player.dashTimer > 0) speed *= 3.2;
  player.speed = speed;
}

export function weaponDef(weaponId) {
  switch (weaponId) {
    case "wpn_smg":
      return {
        id: "wpn_smg",
        label: "Автомат",
        cooldown: 0.35,
        speedMult: 2,
        bounces: 0,
        ammo: 24,
        pierce: 0,
        pellets: 1,
        spread: 0,
      };
    case "wpn_pierce":
      return {
        id: "wpn_pierce",
        label: "Пробивной",
        cooldown: 1.6,
        speedMult: 1.15,
        bounces: MAX_BOUNCES,
        ammo: Infinity,
        pierce: 1,
        pellets: 1,
        spread: 0,
      };
    case "wpn_shotgun":
      return {
        id: "wpn_shotgun",
        label: "Дробь",
        cooldown: 1.1,
        speedMult: 1.4,
        bounces: 0,
        ammo: 18,
        pierce: 0,
        pellets: 3,
        spread: 0.22,
      };
    default:
      return {
        id: "wpn_laser",
        label: "Лазер",
        cooldown: PLAYER_COOLDOWN,
        speedMult: 1,
        bounces: 1,
        ammo: Infinity,
        pierce: 0,
        pellets: 1,
        spread: 0,
      };
  }
}

export function applyWeaponSwap(run, weaponId, asStarter = false) {
  if (asStarter) run.starterWeaponId = weaponId;
  else if (!run.starterWeaponId) run.starterWeaponId = weaponId;
  const prevUses = usesAmmo(run);
  run.weaponId = weaponId;
  const stats = weaponDef(weaponId);
  if (usesAmmo(run)) {
    const cap = Math.round(stats.ammo * run.mods.ammoCapMult);
    if (prevUses && Number.isFinite(run.ammo)) {
      run.ammo = Math.min(cap, Math.max(run.ammo, Math.floor(cap * 0.5)));
    } else {
      run.ammo = cap;
    }
    run.ammoMax = cap;
  } else {
    run.ammo = Infinity;
    run.ammoMax = Infinity;
  }
}

export { PLAYER_LASER_SPEED };
