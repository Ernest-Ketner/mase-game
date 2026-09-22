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
  {
    id: "eraser",
    title: "Ластик крошится",
    body: "В пенале серая пыль. Ею ещё можно стереть лишнее — или ссыпать в карман.",
    choices: [
      {
        label: "Стереть штрих",
        hint: "Вместе со штрихом может уйти и прокачка.",
        apply: (ctx) => {
          const name = stripRandomUpgrade(ctx.run, ctx.rng, ctx.player, { avoidWeapons: true });
          if (name && ctx.rng() < 0.5) return `стёрто: ${name}`;
          ctx.heal(1);
          return name ? `пыль села на ${name}, но тебе полегчало (+1 HP)` : "пыль только на пальцах, +1 HP";
        },
      },
      {
        label: "Ссыпать в карман",
        hint: "Пригодится. Или нет.",
        apply: (ctx) => {
          if (ctx.rng() < 0.5) {
            const gift = tryUpgrade(ctx.run, ctx.player, "stun_hit", ctx.rng);
            return gift ? `крошки острые: ${gift}` : "крошки высыпались мимо";
          }
          ctx.run.targetBank += 1;
          return "в пыли завалялась метка: +1 в банк";
        },
      },
    ],
  },
  {
    id: "staple",
    title: "Скрепка",
    body: "На поле блестит скрепка. Разогнуть — получится шило. Оставить — держит листы.",
    choices: [
      {
        label: "Разогнуть",
        hint: "Уколешься или проткнёшь бумагу.",
        apply: (ctx) => {
          if (ctx.rng() < 0.4 && ctx.player.hp > 1) {
            ctx.player.hp -= 1;
            return "уколол палец";
          }
          const gift = tryUpgrade(ctx.run, ctx.player, "pierce_plus", ctx.rng);
          return gift ? `остриё вышло: ${gift}` : "скрепка согнулась обратно";
        },
      },
      {
        label: "Скрепить листы",
        hint: "Пачка толще.",
        apply: (ctx) => {
          if (ctx.rng() < 0.55) {
            ctx.run.targetBank += 2;
            return "между листами нашлись метки: +2";
          }
          const gift = tryUpgrade(ctx.run, ctx.player, "shield_once", ctx.rng);
          return gift ? `скрепка как броня: ${gift}` : "листы держатся, и только";
        },
      },
    ],
  },
  {
    id: "trace",
    title: "Калька",
    body: "Полупрозрачный лист. Через него видно чужой чертёж — или только свои пальцы.",
    choices: [
      {
        label: "Обвести",
        hint: "Копия редко бывает точной.",
        apply: (ctx) => {
          if (ctx.rng() < 0.6) {
            const name = giveRandomUpgrade(ctx.run, ctx.player, ctx.rng);
            return name ? `калька сняла: ${name}` : "обвёл пустоту";
          }
          ctx.run.targetBank = Math.max(0, ctx.run.targetBank - 1);
          return "сбился с клетки и потерял метку";
        },
      },
      {
        label: "Скомкать",
        hint: "Меньше соблазна копировать.",
        apply: (ctx) => {
          ctx.grantInvuln(2);
          const gift = tryUpgrade(ctx.run, ctx.player, "dodge_nerf", ctx.rng);
          return gift ? `комком прикрылся: ${gift}` : "скомкал и на секунды прикрылся";
        },
      },
    ],
  },
  {
    id: "lead",
    title: "Грифель",
    body: "Карандаш хрустнул. Грифель ещё острый, если не доломать.",
    choices: [
      {
        label: "Заточить о край",
        hint: "Линия станет злее.",
        apply: (ctx) => {
          const id = ctx.rng() < 0.5 ? "dmg" : "crit";
          const gift = tryUpgrade(ctx.run, ctx.player, id, ctx.rng);
          return gift ? `остриё: ${gift}` : "грифель только царапает";
        },
      },
      {
        label: "Доломать",
        hint: "Короткий, зато в руке.",
        apply: (ctx) => {
          if (ctx.player.hp > 1 && ctx.rng() < 0.35) {
            ctx.player.hp -= 1;
            return "осколок в палец";
          }
          const gift = tryUpgrade(ctx.run, ctx.player, "cd", ctx.rng);
          return gift ? `короткие штрихи: ${gift}` : "выбросил крошку и пошёл";
        },
      },
    ],
  },
  {
    id: "margin",
    title: "Поля для замечаний",
    body: "Учитель оставил пустую полосу. Туда можно вписать оправдание — или смотреть дальше.",
    choices: [
      {
        label: "Вписать оправдание",
        hint: "Могут засчитать. Могут нет.",
        apply: (ctx) => {
          if (ctx.rng() < 0.5) {
            ctx.run.targetBank += 2;
            return "«зачёт» на полях: +2 метки";
          }
          const name = stripRandomUpgrade(ctx.run, ctx.rng, ctx.player, { avoidWeapons: true });
          return name ? `зачёркнули красным: ${name}` : "полей не хватило, ничего не вышло";
        },
      },
      {
        label: "Смотреть в поля",
        hint: "Там иногда виден следующий штрих.",
        apply: (ctx) => {
          const id = ctx.rng() < 0.5 ? "sight" : "hearing";
          const gift = tryUpgrade(ctx.run, ctx.player, id, ctx.rng);
          return gift ? `на полях схема: ${gift}` : "поля пустые";
        },
      },
    ],
  },
  {
    id: "punch",
    title: "Дырокол",
    body: "Кто-то пробил край листа. Дырки ровные, как прицел.",
    choices: [
      {
        label: "Целиться в дырку",
        hint: "Либо попадёшь, либо бумага кончится.",
        apply: (ctx) => {
          const gift = tryUpgrade(ctx.run, ctx.player, "aim_preview", ctx.rng);
          if (gift && ctx.rng() < 0.7) return `сквозь дырку видно: ${gift}`;
          if (ctx.player.hp > 1) ctx.player.hp -= 1;
          return gift ? `прицел есть, но палец прищемило: ${gift}` : "дырокол щёлкнул вхолостую";
        },
      },
      {
        label: "Заткнуть дырки",
        hint: "Тише, зато слепо.",
        apply: (ctx) => {
          ctx.heal(1);
          const gift = tryUpgrade(ctx.run, ctx.player, "enemy_cd", ctx.rng);
          return gift ? `дыры заткнуты: ${gift}` : "заткнул и перевёл дух, +1 HP";
        },
      },
    ],
  },
  {
    id: "verso",
    title: "Оборот листа",
    body: "С той стороны проступает чужой черновик. Перевернуть или не трогать.",
    choices: [
      {
        label: "Перевернуть",
        hint: "Там решение или помарка.",
        apply: (ctx) => {
          if (ctx.rng() < 0.5) {
            const name = giveRandomUpgrade(ctx.run, ctx.player, ctx.rng);
            return name ? `на обороте готово: ${name}` : "оборот пустой";
          }
          ctx.run.targetBank = Math.max(0, ctx.run.targetBank - 2);
          return "это был черновик контрольной: −2 метки";
        },
      },
      {
        label: "Не трогать",
        hint: "Пусть просвечивает.",
        apply: (ctx) => {
          ctx.grantInvuln(1.8);
          const gift = tryUpgrade(ctx.run, ctx.player, "slow_bots", ctx.rng);
          return gift ? `чернила с оборота тормозят: ${gift}` : "оборот так и просвечивает";
        },
      },
    ],
  },
  {
    id: "glue",
    title: "Клей-карандаш",
    body: "Колпачок не держится. Клей ещё липкий — можно схватить удачу или приклеиться самому.",
    choices: [
      {
        label: "Мазнуть по лучу",
        hint: "Прилипнет к врагу. Или к стене.",
        apply: (ctx) => {
          const id = ctx.rng() < 0.5 ? "stun_hit" : "slow_shots";
          const gift = tryUpgrade(ctx.run, ctx.player, id, ctx.rng);
          return gift ? `липкая линия: ${gift}` : "клей высох на пальцах";
        },
      },
      {
        label: "Заклеить дыру",
        hint: "Бумага целее, ход уже.",
        apply: (ctx) => {
          ctx.heal(2);
          if (ctx.rng() < 0.4) {
            const name = stripRandomUpgrade(ctx.run, ctx.rng, ctx.player, { avoidWeapons: true });
            if (name) return `залепил вместе с ${name}, зато +2 HP`;
          }
          return "дыра заклеилась, +2 HP";
        },
      },
    ],
  },
  {
    id: "blotter",
    title: "Промокашка",
    body: "Розовая промокашка впитывает всё, до чего дотянется. Можно приложить к луже — или к себе.",
    choices: [
      {
        label: "Промокнуть лужу",
        hint: "Чернила уйдут. Вместе с чем-нибудь полезным.",
        apply: (ctx) => {
          const name = stripRandomUpgrade(ctx.run, ctx.rng, ctx.player, { avoidWeapons: true });
          const gift = tryUpgrade(ctx.run, ctx.player, "ink_pool", ctx.rng);
          if (name && gift) return `впитала ${name}, оставила ${gift}`;
          if (gift) return `лужа собралась: ${gift}`;
          if (name) return `промокашка съела ${name}`;
          return "бумага сухая, впитывать нечего";
        },
      },
      {
        label: "Приложить к руке",
        hint: "Пятно или передышка.",
        apply: (ctx) => {
          if (ctx.rng() < 0.55) {
            ctx.heal(2);
            return "розовое тепло: +2 HP";
          }
          const gift = tryUpgrade(ctx.run, ctx.player, "life_steal", ctx.rng);
          return gift ? `пятно пьёт чужое: ${gift}` : "просто розовое пятно";
        },
      },
    ],
  },
  {
    id: "bell",
    title: "Звонок с урока",
    body: "Где-то в коридоре трезвонит. Можно сорваться бегом или дописать строку.",
    choices: [
      {
        label: "Сорваться",
        hint: "Успеешь уйти. Или споткнёшься.",
        apply: (ctx) => {
          if (ctx.rng() < 0.45) {
            const gift = tryUpgrade(ctx.run, ctx.player, "move", ctx.rng);
            return gift ? `коридор пустой: ${gift}` : "выскочил и ничего не уронил";
          }
          ctx.grantInvuln(2.2);
          return "споткнулся о парту, но на бегу тебя не достать";
        },
      },
      {
        label: "Дописать строку",
        hint: "Звонок подождёт. Учитель — нет.",
        apply: (ctx) => {
          if (ctx.rng() < 0.5) {
            const name = giveRandomUpgrade(ctx.run, ctx.player, ctx.rng);
            return name ? `успел дописать: ${name}` : "строка оборвалась";
          }
          ctx.run.targetBank = Math.max(0, ctx.run.targetBank - 1);
          return "отобрали тетрадь на проверку: −1 метка";
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
