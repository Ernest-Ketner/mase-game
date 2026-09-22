import { applyUpgrade, pickOffers, stripRandomUpgrade, takenEntries, addAmmo, getUpgrade } from "./upgrades.js";
import { usesAmmo } from "./run.js";

function pick(rng, list) {
  if (!list.length) return null;
  return list[Math.floor(rng() * list.length)];
}

function giveRandomUpgrade(run, player, rng) {
  const offers = pickOffers(run, 4, rng);
  const up = pick(rng, offers);
  if (!up) return null;
  applyUpgrade(run, up.id, player);
  return up.title;
}

function tryUpgrade(run, player, id, rng) {
  if (applyUpgrade(run, id, player)) return getUpgrade(id)?.title || id;
  return giveRandomUpgrade(run, player, rng);
}

const EVENTS = [
  {
    id: "blot",
    title: "Клякса на полях",
    body: "Чернила расплылись по клетке. Можно стереть — или оставить как часть рисунка.",
    choices: [
      {
        label: "Стереть пальцем",
        hint: "Бумага потемнеет, что-то пропадёт.",
        apply: (ctx) => {
          const name = stripRandomUpgrade(ctx.run, ctx.rng, ctx.player, { avoidWeapons: true });
          if (name) return `стёрлось: ${name}`;
          ctx.heal(1);
          return "стирать было нечего — только бумагу погладил, +1 HP";
        },
      },
      {
        label: "Оставить кляксу",
        hint: "Может выйти забавно.",
        apply: (ctx) => {
          const name = giveRandomUpgrade(ctx.run, ctx.player, ctx.rng);
          return name ? `клякса легла как ${name}` : "клякса просто высохла";
        },
      },
    ],
  },
  {
    id: "page",
    title: "Чужая страница",
    body: "Между листами торчит чужой листок. Почерк знакомый — и нет.",
    choices: [
      {
        label: "Прочитать",
        hint: "Там рецепт или ругательство.",
        apply: (ctx) => {
          if (ctx.rng() < 0.55) {
            const name = giveRandomUpgrade(ctx.run, ctx.player, ctx.rng);
            return name ? `на полях было: ${name}` : "прочёл ерунду";
          }
          ctx.run.targetBank = Math.max(0, ctx.run.targetBank - 2);
          return "это был донос учителю: −2 метки из банка";
        },
      },
      {
        label: "Сжечь в чернильнице",
        hint: "Следов не останется.",
        apply: (ctx) => {
          if (usesAmmo(ctx.run) && addAmmo(ctx.run, 8)) return "пепел пахнет порохом: +8 патронов";
          ctx.heal(1);
          return "тепло от бумажки: +1 HP";
        },
      },
    ],
  },
  {
    id: "compass",
    title: "Дырка от циркуля",
    body: "Кто-то уже тыкал в этот лист. Дырка смотрит на тебя.",
    choices: [
      {
        label: "Заткнуть пальцем",
        hint: "Будет неловко, зато цело.",
        apply: (ctx) => {
          if (ctx.player.hp > 1) {
            ctx.player.hp -= 1;
            const gift = tryUpgrade(ctx.run, ctx.player, "shield_once", ctx.rng);
            return gift ? `укололся, но получил: ${gift}` : "укололся";
          }
          const gift = tryUpgrade(ctx.run, ctx.player, "armor", ctx.rng);
          return gift ? `крови нет, зато ${gift}` : "крови нет";
        },
      },
      {
        label: "Разорвать шире",
        hint: "Сквозняк.",
        apply: (ctx) => {
          const name = stripRandomUpgrade(ctx.run, ctx.rng, ctx.player, { avoidWeapons: true });
          const gift = tryUpgrade(ctx.run, ctx.player, "pierce_plus", ctx.rng);
          return name ? `вырвал ${name}, зато ${gift || "край порван"}` : `рванул край — ${gift || "только дырка"}`;
        },
      },
    ],
  },
  {
    id: "note",
    title: "Записка одноклассника",
    body: "«Не ходи зелёным». Потом приписка: «или как раз ходи».",
    choices: [
      {
        label: "Поверить",
        hint: "Автор явно торопился.",
        apply: (ctx) => {
          if (ctx.rng() < 0.5) {
            ctx.run.targetBank += 3;
            return "это пароль к запасу меток: +3 в банк";
          }
          const name = stripRandomUpgrade(ctx.run, ctx.rng, ctx.player);
          return name ? `это была шутка. Потеряно: ${name}` : "шутка вышла в пустоту";
        },
      },
      {
        label: "Выбросить",
        hint: "Меньше знаешь.",
        apply: (ctx) => {
          ctx.grantInvuln(2.5);
          return "руки свободны, на пару секунд никто не достанет";
        },
      },
    ],
  },
  {
    id: "edge",
    title: "Стёртый край",
    body: "Нижний угол листа серый, как будто его уже жали ластиком.",
    needTaken: true,
    choices: [
      {
        label: "Стереть ещё",
        hint: "Можно снять лишний штрих.",
        apply: (ctx) => {
          const name = stripRandomUpgrade(ctx.run, ctx.rng, ctx.player);
          ctx.heal(2);
          return name ? `стер ${name}, зато полегчало (+2 HP)` : "+2 HP";
        },
      },
      {
        label: "Обвести заново",
        hint: "Вернуть контур.",
        apply: (ctx) => {
          const gift = tryUpgrade(ctx.run, ctx.player, "hp_max", ctx.rng);
          return gift ? `контур толще: ${gift}` : "контур так и остался серым";
        },
      },
    ],
  },
  {
    id: "carbon",
    title: "Копирка",
    body: "Под листом фиолетовая копирка. Всё, что нарисуешь, уйдёт вниз.",
    choices: [
      {
        label: "Обвести оружие",
        hint: "Копия может смазаться.",
        apply: (ctx) => {
          if (ctx.rng() < 0.5) {
            const gift = tryUpgrade(ctx.run, ctx.player, "dmg", ctx.rng);
            return gift ? `копия удалась: ${gift}` : "копия смазалась";
          }
          const gift = tryUpgrade(ctx.run, ctx.player, "cd", ctx.rng);
          return gift ? `смазалось, зато ${gift}` : "смазалось в никуда";
        },
      },
      {
        label: "Убрать копирку",
        hint: "Чистый лист.",
        apply: (ctx) => {
          ctx.run.targetBank += 2;
          return "под копиркой лежали две метки";
        },
      },
    ],
  },
  {
    id: "teacher",
    title: "Учитель заглянул",
    body: "Тень над партой. Можно спрятать тетрадь или показать как есть.",
    choices: [
      {
        label: "Захлопнуть",
        hint: "Палец между страницами.",
        apply: (ctx) => {
          if (ctx.player.hp > 1) ctx.player.hp -= 1;
          ctx.grantInvuln(3);
          return "прищемил палец, зато на секунды стал неуязвим";
        },
      },
      {
        label: "Показать рисунок",
        hint: "Оценка непредсказуема.",
        apply: (ctx) => {
          if (ctx.rng() < 0.45) {
            const name = giveRandomUpgrade(ctx.run, ctx.player, ctx.rng);
            return name ? `похвалили: ${name}` : "кивнули и ушли";
          }
          ctx.run.targetBank = Math.max(0, ctx.run.targetBank - 1);
          return "«перерисовать» — минус метка из банка";
        },
      },
    ],
  },
  {
    id: "ruler",
    title: "Линейка треснула",
    body: "Пластмасса щёлкнула пополам. Обломки ещё годны.",
    choices: [
      {
        label: "Стрелять обломком",
        hint: "Короче, злее.",
        apply: (ctx) => {
          const gift = tryUpgrade(ctx.run, ctx.player, "fat_beam", ctx.rng);
          return gift ? `обломок: ${gift}` : "обломок выскользнул";
        },
      },
      {
        label: "Выбросить",
        hint: "Не соваться с трещиной.",
        apply: (ctx) => {
          if (usesAmmo(ctx.run) && addAmmo(ctx.run, 6)) return "в пенале ещё патроны: +6";
          const gift = tryUpgrade(ctx.run, ctx.player, "move", ctx.rng);
          return gift ? `без линейки: ${gift}` : "выбросил и пошёл дальше";
        },
      },
    ],
  },
  {
    id: "inkwell",
    title: "Чернильница",
    body: "Синяя лужа ползёт к твоему краю. Ещё секунда — и всё синее.",
    choices: [
      {
        label: "Отскочить",
        hint: "Лужа возьмёт что-то другое.",
        apply: (ctx) => {
          const name = stripRandomUpgrade(ctx.run, ctx.rng, ctx.player, { avoidWeapons: true });
          const gift = tryUpgrade(ctx.run, ctx.player, "move", ctx.rng);
          return name ? `лужа съела ${name}, зато ${gift || "успел"}` : gift ? `успел, ${gift}` : "успел";
        },
      },
      {
        label: "Макнуть луч",
        hint: "Много чернил.",
        apply: (ctx) => {
          const gift = tryUpgrade(ctx.run, ctx.player, "laser_spd", ctx.rng);
          return gift ? `луч впитал чернила: ${gift}` : "чернила только пачкают";
        },
      },
    ],
  },
  {
    id: "bookmark",
    title: "Чужая закладка",
    body: "Между клетками торчит лента. Тяни — или оставь, вдруг держит лист.",
    needTaken: true,
    choices: [
      {
        label: "Вытянуть",
        hint: "Что-то высыпется.",
        apply: (ctx) => {
          const name = stripRandomUpgrade(ctx.run, ctx.rng, ctx.player);
          const gift = giveRandomUpgrade(ctx.run, ctx.player, ctx.rng);
          if (name && gift) return `выпало ${name}, влезло ${gift}`;
          if (gift) return `в ленте было: ${gift}`;
          if (name) return `лента унесла ${name}`;
          return "лента пустая";
        },
      },
      {
        label: "Оставить",
        hint: "Пусть держит.",
        apply: (ctx) => {
          const gift = tryUpgrade(ctx.run, ctx.player, "level_heal", ctx.rng);
          return gift ? `закладка держит лист: ${gift}` : "лента так и торчит";
        },
      },
    ],
  },
];

function eligible(event, run) {
  if (event.needTaken && takenEntries(run).length === 0) return false;
  return true;
}

export function pickSheetEvent(run, rng) {
  const pool = EVENTS.filter((ev) => eligible(ev, run));
  if (pool.length === 0) return null;
  const copy = pool.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = copy[i];
    copy[i] = copy[j];
    copy[j] = t;
  }
  const ev = copy[0];
  return {
    id: ev.id,
    title: ev.title,
    body: ev.body,
    choices: ev.choices.map((c) => ({
      label: c.label,
      hint: c.hint,
      apply: c.apply,
    })),
  };
}
