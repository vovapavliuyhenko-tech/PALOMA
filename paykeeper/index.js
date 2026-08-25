/* ════════════════════════════════════════════════════════
   PALOMA — Yandex Cloud Function для оплаты через PayKeeper
   (интернет-эквайринг АО «Альфа-Банк»).

   Единственное место, где живут логин и пароль от ЛК PayKeeper
   и секретное слово (переменные окружения). В сайт они не попадают:
   сайт статический, всё его содержимое видно покупателю.

   Два маршрута (различаются query-параметром ?a=):
     POST /?a=create   — сайт просит ссылку на оплату
     POST /?a=webhook  — PayKeeper сообщает, что счёт оплачен
                         (этот адрес вписывается в ЛК → Настройки →
                          Получение информации о платежах → POST-оповещения)

   Зависимостей нет — Node 18 умеет fetch и md5 сам.
   ════════════════════════════════════════════════════════ */
"use strict";

const crypto = require("crypto");

/* Дата сборки архива. Видна в ?a=ping — по ней проверяют, что в облако
   загрузился именно свежий paloma-pay.zip, а не старый. */
const BUILD = "2026-08-25-1";

/* ── настройки из переменных окружения функции ── */
const PK_SERVER = (process.env.PK_SERVER || "https://paloma.server.paykeeper.ru").replace(/\/+$/, "");
const PK_USER = process.env.PK_USER || "";
const PK_PASSWORD = process.env.PK_PASSWORD || "";
const PK_SECRET = process.env.PK_SECRET || ""; /* секретное слово из ЛК */
const SITE = (process.env.PK_SITE || "https://paloma.website").replace(/\/+$/, "");

/* Telegram-бот менеджера: заказ уходит менеджеру автоматически, не завися от
   того, отправит ли клиент сообщение сам. Пусто → уведомления выключены. */
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || "";
const TG_CHAT_ID = process.env.TG_CHAT_ID || "";
/* База Telegram Bot API. По умолчанию — официальный api.telegram.org. Если из
   региона функции Telegram недоступен (блокировка), задаём TG_API_BASE = адрес
   прокси-релея (напр. Cloudflare Worker), который сам достучится до Telegram. */
const TG_API_BASE = (process.env.TG_API_BASE || "https://api.telegram.org").replace(/\/+$/, "");

const ORIGINS = [SITE, "https://www.paloma.website", "http://localhost:5500", "http://127.0.0.1:5500"];
const AUTH = "Basic " + Buffer.from(`${PK_USER}:${PK_PASSWORD}`).toString("base64");

/* TG_CHAT_ID может содержать несколько чатов через запятую —
   шлём в каждый (личка менеджера + рабочая группа и т.п.) */
function tgChatIds() {
  return TG_CHAT_ID.split(",").map((s) => s.trim()).filter(Boolean);
}

/* Один вызов Telegram Bot API. Ошибки не роняют заказ — логируем.
   Жёсткий таймаут на запрос: без него медленный ответ Telegram (например, когда
   он сам скачивает картинку по ссылке) подвешивал всю функцию до kill по
   таймауту исполнения, и фото не уходили. */
async function tgCall(method, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${TG_API_BASE}/bot${TG_BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) console.error("[telegram]", method, payload.chat_id, res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("[telegram] error", method, payload.chat_id, e && e.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/* Один запрос sendMessage с разбором ответа (нужен status и parameters,
   чтобы обработать миграцию супергруппы и flood-лимит 429). */
async function sendMessageOnce(chatId, text) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`${TG_API_BASE}/bot${TG_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: ctrl.signal,
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (!res.ok) console.error("[telegram] sendMessage", chatId, res.status, JSON.stringify(data));
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    console.error("[telegram] sendMessage error", chatId, e && e.message);
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

/* Надёжная отправка текста в один чат: обработка миграции группы→супергруппы,
   flood-лимита (429 retry_after) и одна обычная повторная попытка. */
async function sendMessageResilient(chatId, text) {
  let r = await sendMessageOnce(chatId, text);
  if (r.ok) return true;
  /* status 0 = сеть недоступна (таймаут/abort): повтор не поможет и только
     «съест» время до 504 всей функции. Быстро выходим — доставку восстановит
     прокси через TG_API_BASE. */
  if (r.status === 0) return false;
  const params = (r.data && r.data.parameters) || {};
  /* группа превратилась в супергруппу — у неё новый chat_id */
  if (params.migrate_to_chat_id) {
    r = await sendMessageOnce(params.migrate_to_chat_id, text);
    if (r.ok) return true;
  }
  /* превышен лимит частоты — ждём и повторяем */
  if (r.status === 429 && params.retry_after) {
    await new Promise((res) => setTimeout(res, Math.min(params.retry_after, 6) * 1000 + 250));
    r = await sendMessageOnce(chatId, text);
    if (r.ok) return true;
  }
  /* транзиентный сбой — одна обычная повторная попытка */
  await new Promise((res) => setTimeout(res, 500));
  r = await sendMessageOnce(chatId, text);
  return r.ok;
}

/* Уведомление менеджеру в Telegram. Шлём ПОСЛЕДОВАТЕЛЬНО (не Promise.all),
   чтобы не ловить flood-лимит на втором чате (из-за него в группу приходило
   только фото, а текст — нет). Не роняет заказ при ошибке. */
async function notifyManager(text) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return false;
  const payload = String(text).slice(0, 4000);
  let anyOk = false;
  for (const chatId of tgChatIds()) {
    if (await sendMessageResilient(chatId, payload)) anyOk = true;
  }
  return anyOk;
}


/* Скачать картинку один раз. Возвращает байты или null. */
async function fetchPhotoBytes(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) { console.error("[photo] fetch", url, r.status); return null; }
    return Buffer.from(await r.arrayBuffer());
  } catch (e) {
    console.error("[photo] fetch error", url, e && e.message);
    return null;
  } finally { clearTimeout(timer); }
}

/* Отправка альбомом: все фото заказа уходят ОДНИМ запросом на чат.
   Раньше на каждое фото и каждый чат был свой запрос, а картинка
   качалась заново под каждый чат: заказ из трёх букетов на два чата —
   шесть скачиваний и шесть загрузок подряд. Функция живёт 10 секунд и
   не доживала до конца: текст уже ушёл, фото — нет. Отсюда и было
   «фото приходят не всегда». */
async function sendAlbumToChat(chatId, photos, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));

  if (photos.length === 1) {
    if (caption) form.append("caption", caption);
    form.append("photo", new Blob([photos[0].bytes], { type: "image/jpeg" }), "bouquet.jpg");
    return tgMultipart("sendPhoto", form, chatId);
  }

  const media = photos.map(function (p, i) {
    const item = { type: "photo", media: "attach://file" + i };
    if (i === 0 && caption) item.caption = caption;
    return item;
  });
  form.append("media", JSON.stringify(media));
  photos.forEach(function (p, i) {
    form.append("file" + i, new Blob([p.bytes], { type: "image/jpeg" }), "bouquet" + i + ".jpg");
  });
  return tgMultipart("sendMediaGroup", form, chatId);
}

async function tgMultipart(method, form, chatId) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`${TG_API_BASE}/bot${TG_BOT_TOKEN}/${method}`, {
      method: "POST",
      body: form, /* fetch сам проставит multipart Content-Type с boundary */
      signal: ctrl.signal,
    });
    if (!res.ok)
      console.error("[telegram] " + method, chatId, res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("[telegram] " + method + " error", chatId, e && e.message);
    return false;
  } finally { clearTimeout(timer); }
}

async function notifyPhotos(urls, caption) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID || !urls || !urls.length) return;
  /* Альбом Telegram вмещает до 10 медиа; больше и не собираем. */
  const list = urls.slice(0, 10);
  /* Качаем параллельно и ОДИН раз на все чаты. */
  const downloaded = await Promise.all(list.map(fetchPhotoBytes));
  const photos = [];
  downloaded.forEach(function (bytes, i) {
    if (bytes) photos.push({ url: list[i], bytes: bytes });
  });
  if (!photos.length) { console.error("[photo] ни одно фото не скачалось"); return; }
  await Promise.all(tgChatIds().map((chatId) => sendAlbumToChat(chatId, photos, caption)));
}

/* ── Хранилище деталей онлайн-заказа между «создан счёт» и «оплачено» ──
   Webhook об оплате приходит с сервера PayKeeper АВТОМАТИЧЕСКИ (без действий
   клиента), но в нём только сумма и номер — нет состава. Поэтому при создании
   счёта складываем полный текст + фото сюда, а webhook достаёт их и отправляет
   менеджеру сам. Живёт в той же базе Neon (переменная DATABASE_URL). */
let pendingReady = false;
async function pendingEnsure(db) {
  if (pendingReady) return;
  await db.query(
    "CREATE TABLE IF NOT EXISTS pending_orders (" +
      " order_id text PRIMARY KEY," +
      " manager_text text NOT NULL," +
      " photos jsonb NOT NULL DEFAULT '[]'::jsonb," +
      " total integer NOT NULL DEFAULT 0," +
      " created_at timestamptz NOT NULL DEFAULT now())",
  );
  /* meta — данные клиента и состав для CRM. Оплата приходит webhook'ом, где
     кроме номера и суммы ничего нет, поэтому поля кладём здесь, при создании
     счёта, и достаём вместе с текстом. Колонку добавляем отдельно: таблица
     уже существует на боевой базе. */
  await db.query(
    "ALTER TABLE pending_orders ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb",
  );
  pendingReady = true;
}
async function pendingStore(orderId, managerText, photos, total, meta) {
  if (!process.env.DATABASE_URL) return false;
  const db = require("./db");
  await pendingEnsure(db);
  await db.query(
    "INSERT INTO pending_orders(order_id, manager_text, photos, total, meta)" +
      " VALUES ($1,$2,$3::jsonb,$4,$5::jsonb)" +
      " ON CONFLICT (order_id) DO UPDATE SET" +
      " manager_text=EXCLUDED.manager_text, photos=EXCLUDED.photos," +
      " total=EXCLUDED.total, meta=EXCLUDED.meta",
    [
      orderId,
      String(managerText || "").slice(0, 3500),
      JSON.stringify(photos || []),
      Math.round(Number(total) || 0),
      JSON.stringify(meta || {}),
    ],
  );
  return true;
}
/* Атомарно забирает и удаляет строку: кто первый (webhook или thank-you), тот и
   шлёт уведомление — второй получит null и не продублирует. */
/* ── Самопроверка связи с Telegram ──────────────────────────────────
   «Иногда не доходит» невозможно чинить вслепую: причин пять, и в логах
   они выглядят по-разному. Этот маршрут проходит всю цепочку и говорит,
   что именно сломано — токен, адрес чата, права бота или сеть до
   Telegram. Шлёт в чаты одно тестовое сообщение и одно фото. */
async function tgSelfTest() {
  const out = {
    настройки: {
      токен_бота: TG_BOT_TOKEN ? "задан" : "НЕ ЗАДАН",
      чаты: TG_CHAT_ID ? tgChatIds() : "НЕ ЗАДАНЫ",
      адрес_api: TG_API_BASE,
      через_прокси: TG_API_BASE.indexOf("api.telegram.org") === -1,
    },
    шаги: [],
    чаты: [],
  };
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    out.итог = "Уведомления выключены: не заданы TG_BOT_TOKEN или TG_CHAT_ID.";
    return out;
  }

  const timed = async (name, fn) => {
    const t0 = Date.now();
    try {
      const r = await fn();
      out.шаги.push({ шаг: name, ок: r.ok, мс: Date.now() - t0, ответ: r.info });
      return r;
    } catch (e) {
      out.шаги.push({ шаг: name, ок: false, мс: Date.now() - t0, ответ: String(e && e.message) });
      return { ok: false };
    }
  };

  /* 1. Доступен ли Telegram и жив ли токен */
  await timed("связь с Telegram (getMe)", async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${TG_API_BASE}/bot${TG_BOT_TOKEN}/getMe`, { signal: ctrl.signal });
      const d = await res.json().catch(() => ({}));
      return { ok: res.ok, info: res.ok ? "бот @" + ((d.result || {}).username || "?") : JSON.stringify(d) };
    } finally { clearTimeout(timer); }
  });

  /* 2. По каждому чату: существует ли, и проходят ли текст и фото */
  /* Берём настоящее фото букета: оно того же типа и веса, что уходит с
     заказами, — проверка должна повторять боевой путь, а не облегчённый. */
  const photoUrl = SITE + "/images/paloma/catalog/mono-hydrangea-pink.jpg";
  let bytes = null;
  try { bytes = await fetchPhotoBytes(photoUrl); } catch (e) { /* ниже отметим */ }

  for (const chatId of tgChatIds()) {
    const item = { чат: chatId };
    /* существует ли чат и есть ли доступ */
    try {
      const res = await fetch(`${TG_API_BASE}/bot${TG_BOT_TOKEN}/getChat?chat_id=` + encodeURIComponent(chatId));
      const d = await res.json().catch(() => ({}));
      item.найден = res.ok;
      if (res.ok) {
        item.название = (d.result || {}).title || (d.result || {}).username || "";
        item.тип = (d.result || {}).type || "";
      } else {
        item.ошибка = (d && d.description) || ("код " + res.status);
      }
    } catch (e) {
      item.найден = false;
      item.ошибка = String(e && e.message);
    }

    /* текст */
    const t1 = Date.now();
    item.текст_дошёл = await sendMessageResilient(
      chatId,
      "🔧 Проверка связи PALOMA. Это тестовое сообщение, заказом не является.",
    );
    item.текст_мс = Date.now() - t1;

    /* фото */
    if (!bytes) {
      item.фото_дошло = false;
      item.фото_ошибка = "не удалось скачать картинку с сайта: " + photoUrl;
    } else {
      const t2 = Date.now();
      item.фото_дошло = await sendAlbumToChat(chatId, [{ bytes: bytes }], "🔧 Проверка отправки фото");
      item.фото_мс = Date.now() - t2;
    }
    out.чаты.push(item);
  }

  const плохо = out.чаты.filter((c) => !c.текст_дошёл || !c.фото_дошло);
  out.итог = плохо.length
    ? "Есть проблемы — смотрите поля «ошибка» у чатов выше."
    : "Всё в порядке: текст и фото доходят во все чаты.";
  return out;
}

/* Неоплаченные заказы: счёт выставлен, деньги не пришли. Нужны, чтобы
   найти заказы, потерявшиеся до появления статуса «ждёт оплаты». */
async function pendingList(limit) {
  if (!process.env.DATABASE_URL) return [];
  const db = require("./db");
  await pendingEnsure(db);
  const res = await db.query(
    "SELECT order_id, total, manager_text, meta, created_at" +
      " FROM pending_orders ORDER BY created_at DESC LIMIT $1",
    [Math.min(Math.max(Number(limit) || 50, 1), 200)],
  );
  return res.rows || [];
}

async function pendingTake(orderId) {
  if (!process.env.DATABASE_URL) return null;
  const db = require("./db");
  await pendingEnsure(db);
  const res = await db.query(
    "DELETE FROM pending_orders WHERE order_id=$1 RETURNING manager_text, photos, total, meta",
    [orderId],
  );
  return res.rows && res.rows[0] ? res.rows[0] : null;
}
/* ── Страховочный журнал заказов ──
   Каждый заказ/заявку пишем в БД (Neon доступен, даже когда Telegram — нет),
   чтобы НИ ОДИН заказ не потерялся при сбое доставки. Помечаем, ушёл ли он в TG.
   Посмотреть последние: GET ?a=orders&token=ADMIN_TOKEN. Всё best-effort — сбой
   журнала никогда не роняет заказ. */
let ordersLogReady = false;
async function ordersLogEnsure(db) {
  if (ordersLogReady) return;
  await db.query(
    "CREATE TABLE IF NOT EXISTS orders_log (" +
      " id bigserial PRIMARY KEY," +
      " order_id text," +
      " kind text," +
      " text text NOT NULL," +
      " tg_delivered boolean NOT NULL DEFAULT false," +
      " created_at timestamptz NOT NULL DEFAULT now())",
  );
  ordersLogReady = true;
}
/* Пишем заказ В БАЗУ ДО попытки отправки в Telegram — тогда даже если отправка
   зависнет и функцию убьёт по таймауту, заказ уже сохранён и не потеряется.
   Возвращает id записи (для последующей отметки о доставке). */
/* Ограничитель ожидания. Возвращает null, если не успели, и НЕ бросает:
   вызывающему коду не нужно обкладываться try/catch, а заказ не должен
   зависеть от того, проснулась ли база. */
async function withDeadline(promise, ms, label) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((res) => { timer = setTimeout(() => res(Symbol.for("late")), ms); }),
    ]).then((v) => (v === Symbol.for("late")
      ? (console.error("[deadline] не дождались:", label, ms + " мс"), null)
      : v));
  } catch (e) {
    console.error("[deadline] ошибка:", label, e && e.message);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function logOrder(orderId, kind, text, meta) {
  /* Параллельно кладём заказ в CRM (crm.js) — там те же данные, но полями,
     чтобы админка умела искать и вести статус. Журнал остаётся как есть:
     это страховка, и ломать её ради CRM нельзя. */
  try {
    await require("./crm").save(orderId, kind, text, meta);
  } catch (e) {
    console.error("[crm] save skipped", e && e.message);
  }
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = require("./db");
    await ordersLogEnsure(db);
    const r = await db.query(
      "INSERT INTO orders_log(order_id, kind, text) VALUES ($1,$2,$3) RETURNING id",
      [String(orderId || "").slice(0, 64), String(kind || ""), String(text || "").slice(0, 3800)],
    );
    return r.rows && r.rows[0] ? r.rows[0].id : null;
  } catch (e) {
    console.error("[orders_log] error", e && e.message);
    return null;
  }
}
/* Отмечаем, что заказ успешно ушёл в Telegram (best-effort).
   orderId нужен, чтобы та же отметка легла и в CRM. */
async function markDelivered(logId, orderId) {
  if (orderId) {
    try {
      await require("./crm").markDelivered(orderId);
    } catch (e) {
      console.error("[crm] mark skipped", e && e.message);
    }
  }
  if (!logId || !process.env.DATABASE_URL) return;
  try {
    const db = require("./db");
    await db.query("UPDATE orders_log SET tg_delivered = true WHERE id = $1", [logId]);
  } catch (e) {
    console.error("[orders_log] mark error", e && e.message);
  }
}
async function ordersRecent(limit) {
  const db = require("./db");
  await ordersLogEnsure(db);
  const res = await db.query(
    "SELECT order_id, kind, text, tg_delivered, created_at FROM orders_log ORDER BY id DESC LIMIT $1",
    [Math.min(Math.max(Number(limit) || 50, 1), 200)],
  );
  return res.rows || [];
}

function normPhotos(photos) {
  if (Array.isArray(photos)) return photos;
  try {
    const a = JSON.parse(photos || "[]");
    return Array.isArray(a) ? a : [];
  } catch (e) {
    return [];
  }
}

/* ── прайс-лист: тот же, что на сайте (файлы копирует sync.js) ── */
global.window = global.window || {};
require("./paloma-products.js");
require("./coffee-menu-data.js");
let PRODUCTS = global.window.PALOMA_PRODUCTS || [];
const COFFEE = global.window.PALOMA_COFFEE_MENU || [];

/* Максимум добавок к кофе: молоко 100 + сироп 60 (см. COLD_ADDONS в coffee-ea.js) */
const COFFEE_ADDONS_MAX = 200;
/* Позиции со свободной суммой (сертификат, копилка, подписка) — задаёт покупатель */
const OPEN_MIN = 100;
const OPEN_MAX = 300000;
const DELIVERY_ALLOWED = [0, 350];

/* Товары с фиксированной ценой: допы букета + апселлы чекаута.
   Пересобирается при обновлении каталога из базы — см. rebuildCatalog. */
let FIXED = {};

/* Префиксы каталожных id (c — букеты и вазы, m — моно, w — свадебные).
   Берём из самого прайса: иначе новая группа товаров молча проваливается
   в диапазон «свободной суммы» и её цену можно подменить в браузере. */
let CATALOG_ID_RE = /^$/;

function rebuildCatalog() {
  FIXED = {};
  PRODUCTS.forEach((p) => {
    (p.addons || []).forEach((a) => {
      FIXED[a.id] = Math.max(FIXED[a.id] || 0, Number(a.price) || 0);
    });
  });
  Object.assign(FIXED, {
    "upsell-coffee": 250,
    "upsell-vase": 1500,
    "upsell-secateurs": 1000,
    "upsell-dessert": 190,
  });
  const prefixes = [
    ...new Set(
      PRODUCTS.map((p) => (String(p.id).match(/^([a-z]+)\d+$/i) || [])[1]).filter(Boolean),
    ),
  ];
  CATALOG_ID_RE = new RegExp("^((?:" + prefixes.join("|") + ")\\d+)(?:[-_]|$)");
}
rebuildCatalog();

/* ── Каталог из базы ────────────────────────────────────────────────────────
   Товары правятся в админке, а цену при оплате проверяет эта функция — значит
   она обязана знать новые товары. Держим список в памяти тёплого экземпляра:
   подряд идущие запросы базу не дёргают. Если база недоступна — молча
   остаёмся на встроенном прайсе, оплата старых товаров продолжает работать. */
const CATALOG_TTL_MS = 60000;
/* Жёсткий потолок на чтение каталога. Заказ важнее свежих цен: если база
   просыпается дольше, чем нужно (Neon после простоя, холодный старт), мы НЕ
   имеем права утянуть за собой весь запрос — иначе функцию убьёт по таймауту
   и заказ не дойдёт ни в Telegram, ни в панель. Не успели — работаем по
   встроенному прайсу. */
const CATALOG_WAIT_MS = 2500;
/* Потолки на запись в базу на пути заказа. Заказ уже ушёл в Telegram —
   ждать медленную базу дольше незачем. */
const LOG_WAIT_MS = 4000;
const MARK_WAIT_MS = 1500;
let catalogLoadedAt = 0;
let catalogFromDb = false;

async function readCatalog() {
  const list = await require("./products.js").listForPricing();
  if (Array.isArray(list) && list.length) {
    PRODUCTS = list;
    catalogFromDb = true;
    rebuildCatalog();
  }
}

async function refreshCatalog() {
  if (catalogLoadedAt && Date.now() - catalogLoadedAt < CATALOG_TTL_MS) return catalogFromDb;
  catalogLoadedAt = Date.now();
  let timer = null;
  try {
    await Promise.race([
      readCatalog(),
      new Promise((_, rej) => {
        timer = setTimeout(() => rej(new Error("каталог не ответил за " + CATALOG_WAIT_MS + " мс")), CATALOG_WAIT_MS);
      }),
    ]);
  } catch (e) {
    /* Не смогли — пусть следующий запрос попробует снова, а не ждёт минуту. */
    catalogLoadedAt = 0;
    console.error("[products] работаем по встроенному прайсу:", e && e.message);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return catalogFromDb;
}

/* Категории, которые считаем «букетом» — только их фото шлём менеджеру.
   Вазы, десерты, подписка, оформление, кофе и допы в фото не попадают. */
const BOUQUET_CATS = new Set([
  "mono", "duo", "wedding", "authors", "online", "season", "bestsellers", "compositions",
]);

/* Публичные ссылки на фото букетов из заказа (без повторов, максимум 10). */
function bouquetPhotos(body) {
  const raw = Array.isArray(body.items) ? body.items : [];
  const urls = [];
  const seen = new Set();
  for (const it of raw) {
    const code = String(it.id || "").match(CATALOG_ID_RE);
    if (!code) continue;
    const p = PRODUCTS.find((x) => x.id === code[1]);
    if (!p || !p.image) continue;
    const cats = Array.isArray(p.categories) ? p.categories : p.category ? [p.category] : [];
    if (!cats.some((c) => BOUQUET_CATS.has(c))) continue;
    const url = /^https?:\/\//i.test(p.image) ? p.image : SITE + "/" + String(p.image).replace(/^\/+/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= 10) break;
  }
  return urls;
}

function md5(s) {
  return crypto.createHash("md5").update(s, "utf8").digest("hex");
}

/* Разрешённый диапазон цены строки корзины.
   Букеты и кофе считаем по каталогу; свободные суммы — по границам. */
function allowedRange(id) {
  /* Строка корзины — «<id товара>-<размер>»: c1-M, m9-XL, w3-base.
     Если id похож на каталожный, но товара нет — это ошибка, а не «свободная сумма». */
  const code = String(id || "").match(CATALOG_ID_RE);
  if (code) {
    const p = PRODUCTS.find((x) => x.id === code[1]);
    if (!p) return null;
    const base = Number(p.price) || 0;
    const addons = (p.addons || []).reduce((s, a) => s + (Number(a.price) || 0), 0);
    /* Авторские — свободный выбор бюджета шкалой на странице товара.
       Диапазон фиксированный, как на фронте: от 3000 ₽ до 30000 ₽
       (для дорогих букетов от 18000 ₽ — до 40000 ₽). */
    if ((p.categories || []).includes("authors")) {
      const budgetMax = base >= 18000 ? 40000 : 30000;
      return { min: 3000, max: budgetMax + addons };
    }
    const maxDelta = (p.sizes || []).reduce((m, s) => Math.max(m, Number(s.priceDelta) || 0), 0);
    return { min: base, max: base + maxDelta + addons };
  }

  const cof = COFFEE.filter((x) => String(id).startsWith(x.id)).sort((a, b) => b.id.length - a.id.length)[0];
  if (cof) {
    const prices = String(cof.priceLabel || "")
      .split("/")
      .map((s) => parseInt(String(s).replace(/[^0-9]/g, ""), 10))
      .filter((n) => n > 0);
    const base = Number(cof.price) || 0;
    const lo = prices.length ? Math.min(...prices) : base;
    const hi = prices.length ? Math.max(...prices) : base;
    return { min: Math.min(lo, base), max: Math.max(hi, base) + COFFEE_ADDONS_MAX };
  }

  if (Object.prototype.hasOwnProperty.call(FIXED, id)) {
    return { min: FIXED[id], max: FIXED[id] };
  }

  return { min: OPEN_MIN, max: OPEN_MAX };
}

/* Проверка всей корзины. Возвращает {names, total} или {error}.
   Цены из браузера не принимаются на веру: их можно подменить в localStorage. */
function verifyCart(body) {
  const raw = Array.isArray(body.items) ? body.items : [];
  if (!raw.length || raw.length > 50) return { error: "Корзина пуста или слишком большая" };

  const delivery = Number(body.delivery) || 0;
  if (!DELIVERY_ALLOWED.includes(delivery)) return { error: "Недопустимая стоимость доставки" };

  const names = [];
  let sum = 0;

  for (const it of raw) {
    const price = Number(it.price);
    const qty = Number(it.qty) || 1;
    if (!Number.isFinite(price) || price <= 0) return { error: "Некорректная цена позиции" };
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) return { error: "Некорректное количество" };

    const range = allowedRange(it.id);
    if (!range) return { error: "Неизвестный товар: " + it.id };
    if (price < range.min || price > range.max) {
      return { error: "Цена позиции не совпадает с каталогом: " + it.id };
    }

    sum += price * qty;
    names.push(String(it.name || "Позиция") + (qty > 1 ? ` × ${qty}` : ""));
  }

  if (delivery > 0) {
    sum += delivery;
    names.push("Доставка");
  }

  if (sum < 1) return { error: "Сумма заказа меньше 1 ₽" };
  return { names, total: sum };
}

/* ── МАРКИРОВКА: разбор позиций заказа ──────────────────────────────────────
   Товар считается маркированным, если у него в каталоге стоит marked: true.
   Тумблер выключен по умолчанию → обычные букеты идут прежним путём. */
function catalogIdOf(lineId) {
  const m = String(lineId || "").match(CATALOG_ID_RE);
  return m ? m[1] : null;
}
function buildOrderLines(items) {
  return (Array.isArray(items) ? items : []).map((it) => {
    const cid = catalogIdOf(it.id);
    const p = cid ? PRODUCTS.find((x) => x.id === cid) : null;
    return {
      sku: (p && p.id) || cid || String(it.id),
      name: String(it.name || (p && p.name) || "Позиция").slice(0, 128),
      qty: Number(it.qty) || 1,
      price: Number(it.price) || 0,
      marked: !!(p && p.marked),
    };
  });
}
function detectMarkedLines(items) {
  return buildOrderLines(items).filter((l) => l.marked);
}

/* ⚠️⚠️ ФОРМАТ ДЛЯ PAYKEEPER — ПОДТВЕРДИТЬ У ПОДДЕРЖКИ ДО БОЕВОГО ЗАПУСКА ⚠️⚠️
   Метод «выставление счёта» принимает структурную корзину внутри service_name
   через метку ;PKC|<json-массив позиций>|; . Поля позиции — по справке PayKeeper.
   tax берём из переменной PK_TAX (код налога вашей системы) — тоже уточнить.
   Пока ни один товар не marked:true — эта функция в бою не вызывается. */
function buildMarkedServiceName(orderLines, reservation, delivery) {
  const PK_TAX = process.env.PK_TAX || "none";
  const bySku = {};
  (reservation.codes || []).forEach((c) => {
    (bySku[c.sku] = bySku[c.sku] || []).push(c);
  });

  const positions = [];
  for (const ln of orderLines) {
    if (ln.marked) {
      // Маркированный товар — по одной позиции на каждую единицу, у каждой свой код.
      for (let i = 0; i < ln.qty; i++) {
        const code = (bySku[ln.sku] || []).shift();
        const pos = {
          name: ln.name, price: ln.price, quantity: 1, sum: ln.price,
          tax: PK_TAX, payment_type: "full",
          item_type: (code && code.item_type) || "goods_coded",
        };
        if (code && code.code_b64) pos.item_code_b64 = code.code_b64;
        else pos.item_code = code ? code.code : "";
        positions.push(pos);
      }
    } else {
      positions.push({
        name: ln.name, price: ln.price, quantity: ln.qty, sum: ln.price * ln.qty,
        tax: PK_TAX, payment_type: "full", item_type: "goods_uncoded",
      });
    }
  }
  if (delivery > 0) {
    positions.push({
      name: "Доставка", price: delivery, quantity: 1, sum: delivery,
      tax: PK_TAX, payment_type: "full", item_type: "service",
    });
  }

  const shortName = positions.map((p) => p.name).join(", ").slice(0, 120);
  return shortName + ";PKC|" + JSON.stringify(positions) + "|;";
}

/* ── HTTP-обвязка ── */
function cors(origin) {
  const allow = ORIGINS.includes(origin) ? origin : SITE;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function reply(status, data, origin) {
  return {
    statusCode: status,
    headers: Object.assign({ "Content-Type": "application/json" }, cors(origin)),
    body: JSON.stringify(data),
  };
}

function rawBody(event) {
  return event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64").toString("utf8")
    : event.body || "";
}

/* ── создание счёта и получение ссылки на оплату ──
   Шаг 1: GET /info/settings/token/      → токен безопасности
   Шаг 2: POST /change/invoice/preview/  → invoice_id
   Ссылка: <сервер>/bill/<invoice_id>/                                   */
async function createInvoice(body, origin) {
  if (!PK_USER || !PK_PASSWORD) return reply(500, { error: "Функция не настроена" }, origin);

  const orderId = String(body.orderId || "").trim();
  if (!/^[A-Za-z0-9-]{6,64}$/.test(orderId)) return reply(400, { error: "Некорректный номер заказа" }, origin);

  const cart = verifyCart(body);
  if (cart.error) return reply(400, { error: cart.error }, origin);

  // ── Маркировка: если в заказе есть marked-товар — бронируем коды ДО оплаты.
  //    Обычный заказ (без marked-товаров) сюда не заходит и базу не трогает. */
  const markedLines = detectMarkedLines(body.items);
  let reservation = null;
  if (markedLines.length) {
    const marking = require("./marking");
    try {
      reservation = await marking.createOrderWithReservations(
        orderId, cart.total, buildOrderLines(body.items),
      );
    } catch (e) {
      if (e && e.code === "NO_FREE_CODE")
        return reply(409, { error: "Нет свободных кодов маркировки для товара: " + e.sku }, origin);
      console.error("[marking] reserve error", e && e.stack);
      return reply(500, { error: "Ошибка резервирования кода маркировки" }, origin);
    }
  }

  const tokenRes = await fetch(`${PK_SERVER}/info/settings/token/`, {
    headers: { Authorization: AUTH },
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  const token = tokenJson && tokenJson.token;
  if (!tokenRes.ok || !token) {
    console.error("[paykeeper] token failed", tokenRes.status, JSON.stringify(tokenJson));
    return reply(502, { error: "PayKeeper не выдал токен" }, origin);
  }

  const form = new URLSearchParams({
    token,
    pay_amount: cart.total.toFixed(2),
    clientid: String(body.clientName || "Покупатель PALOMA").slice(0, 128),
    orderid: orderId,
    // Маркированный заказ уходит структурной корзиной (с кодами) через метку PKC.
    service_name: reservation
      ? buildMarkedServiceName(buildOrderLines(body.items), reservation, Number(body.delivery) || 0).slice(0, 4000)
      : cart.names.join(", ").slice(0, 250),
  });
  if (body.email) form.set("client_email", String(body.email).slice(0, 128));
  if (body.phone) form.set("client_phone", String(body.phone).replace(/\D/g, "").slice(0, 16));

  const invRes = await fetch(`${PK_SERVER}/change/invoice/preview/`, {
    method: "POST",
    headers: {
      Authorization: AUTH,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const invJson = await invRes.json().catch(() => ({}));
  const invoiceId = invJson && invJson.invoice_id;

  if (!invRes.ok || !invoiceId) {
    // Счёт не создан — возвращаем зарезервированные коды обратно на склад.
    if (reservation) {
      try { await require("./marking").cancelOrderRelease(orderId, "invoice failed"); }
      catch (e) { console.error("[marking] release on fail", e && e.message); }
    }
    console.error("[paykeeper] invoice failed", invRes.status, JSON.stringify(invJson));
    return reply(502, { error: invJson.msg || "PayKeeper не принял заказ" }, origin);
  }

  // Счёт создан — привязываем его к заказу (для сопоставления при оплате).
  if (reservation) {
    try { await require("./marking").attachInvoice(orderId, invoiceId); }
    catch (e) { console.error("[marking] attachInvoice", e && e.message); }
  }

  console.log("[paykeeper] invoice", orderId, cart.total, invoiceId);

  /* Онлайн-заказ уходит менеджеру ТОЛЬКО после оплаты. Детали (полный текст +
     фото) складываем в pending_orders — webhook об оплате достанет их и отправит
     АВТОМАТИЧЕСКИ, без действий клиента (не нужно жать «Продолжить»). Если БД
     недоступна — не теряем заказ: шлём сразу, пометив, что он ещё не оплачен. */
  const details = String(body.managerText || cart.names.join(", ")).slice(0, 3500);
  const photos = bouquetPhotos(body);
  let stashed = false;
  try {
    /* meta — поля клиента для CRM: webhook об оплате приходит без них. */
    stashed = await pendingStore(orderId, details, photos, cart.total, {
      clientName: body.clientName || "",
      phone: body.phone || "",
      email: body.email || "",
      messenger: body.messengerContact || body.messenger || "",
      items: Array.isArray(body.items) ? body.items : [],
      deliveryInfo: body.deliveryInfo || {},
    });
  } catch (e) {
    console.error("[pending] store error", orderId, e && e.message);
  }

  /* Заказ виден в панели СРАЗУ, со статусом «ждёт оплаты». Раньше он до
     оплаты не попадал никуда: клиент уходил со страницы оплаты, и для
     студии заказа не существовало — узнавали, только если клиент писал
     сам. Когда деньги придут, статус сам сменится на «новый». */
  try {
    await require("./crm").save(
      orderId,
      "online_pending",
      "⏳ ЖДЁТ ОПЛАТЫ\n№ " + orderId + "\nСумма: " +
        cart.total.toLocaleString("ru-RU") + " ₽\n\n" + details,
      crmMeta(body, { payment: "online", total: cart.total }),
      "pending",
    );
  } catch (e) {
    console.error("[crm] pending save skipped", e && e.message);
  }

  if (!stashed) {
    await notifyManager(
      "🆕 НОВЫЙ ЗАКАЗ (⏳ ещё не оплачен)\n№ " + orderId + "\nСумма: " +
        cart.total.toLocaleString("ru-RU") + " ₽\n\n" + details,
    );
    await notifyPhotos(photos, "🖼 Букеты по заказу № " + orderId);
  }

  return reply(
    200,
    { paymentUrl: `${PK_SERVER}/bill/${invoiceId}/`, orderId, total: cart.total },
    origin,
  );
}

/* ── уведомление менеджеру без оплаты (заказ «при получении») ──
   Цель — чтобы В БОТ ПОПАДАЛИ АБСОЛЮТНО ВСЕ заказы, а не только онлайн-оплаты.
   PayKeeper тут не участвует: просто пересылаем менеджеру состав заказа.
   Намеренно устойчиво: если прайс на функции рассинхронён и verifyCart
   отклонил бы заказ — уведомление всё равно уходит (managerText уже собран
   сайтом и содержит сумму), потеря заказа хуже неточной суммы в шапке. */
/* Поля заказа для CRM — из того, что прислала страница. Ничего не считаем
   и не проверяем: сумма и состав уже посчитаны выше, здесь только раскладка
   по полям, чтобы админка умела искать и фильтровать. */
function crmMeta(body, extra) {
  const b = body || {};
  const m = {
    clientName: b.clientName || "",
    phone: b.phone || "",
    email: b.email || "",
    messenger: b.messengerContact || b.messenger || "",
    items: Array.isArray(b.items) ? b.items : [],
    /* b.delivery — это стоимость доставки (число). Адрес, дату и время
       страница присылает отдельным объектом deliveryInfo. */
    delivery: b.deliveryInfo && typeof b.deliveryInfo === "object" ? b.deliveryInfo : {},
    payment: b.payment || "",
    total: 0,
  };
  if (extra) Object.keys(extra).forEach((k) => { if (extra[k] != null) m[k] = extra[k]; });
  return m;
}

async function handleNotify(body, origin) {
  const orderId = String(body.orderId || "").trim();
  if (!/^[A-Za-z0-9-]{6,64}$/.test(orderId)) {
    return reply(400, { error: "Некорректный номер заказа" }, origin);
  }
  const details = String(body.managerText || "").slice(0, 3500);
  if (!details) return reply(400, { error: "Пустой заказ" }, origin);

  /* Заявка со страницы «Оформление» (не заказ из корзины): без корзины/фото,
     свой заголовок уже внутри managerText — шлём как есть + номер. */
  if (body.kind === "event_lead") {
    const msg = details + "\n№ " + orderId;
    /* Сначала Telegram, потом база — это то, что менеджер реально видит. */
    const ok = await notifyManager(msg);
    const logId = await withDeadline(
      logOrder(orderId, "event_lead", msg, crmMeta(body)), LOG_WAIT_MS, "журнал заявки");
    if (ok) await withDeadline(markDelivered(logId, orderId), MARK_WAIT_MS, "отметка о доставке");
    console.log("[paykeeper] notify event_lead", orderId, ok);
    return reply(200, { ok: true, orderId, delivered: ok }, origin);
  }

  const cart = verifyCart(body); /* только ради суммы в шапке — не блокирует */
  const totalStr = cart && !cart.error ? cart.total.toLocaleString("ru-RU") + " ₽" : "";

  /* Онлайн-оплата: страница thank-you — ЗАПАСНОЙ путь к webhook (на случай, если
     webhook по какой-то причине не дошёл). Берём детали из pending_orders
     атомарно: если строку уже забрал webhook — здесь ничего не шлём (без дублей).
     Если БД недоступна — отправляем из того, что прислала страница. */
  if (body.payment === "online_paid") {
    try {
      const row = await pendingTake(orderId);
      if (!row) {
        console.log("[paykeeper] notify online_paid dup-skip", orderId);
        return reply(200, { ok: true, orderId, skipped: true }, origin);
      }
      const msg = "✅ ОПЛАЧЕН (онлайн картой)\n№ " + orderId + "\nСумма: " +
        (row.total ? row.total.toLocaleString("ru-RU") + " ₽" : totalStr) + "\n\n" + row.manager_text;
      /* Данные клиента положили в pending при создании счёта — берём их
         оттуда: в этот момент страница присылает только номер заказа. */
      const logId = await logOrder(orderId, "online_paid", msg,
        crmMeta(row.meta || body, { payment: "online_paid", total: row.total }));
      const ok = await notifyManager(msg);
      if (ok) await markDelivered(logId, orderId);
      const ph = normPhotos(row.photos);
      if (ph.length) await notifyPhotos(ph, "🖼 Букеты по заказу № " + orderId);
      console.log("[paykeeper] notify online_paid", orderId, ok);
      return reply(200, { ok: true, orderId, delivered: ok }, origin);
    } catch (e) {
      console.error("[pending] notify take error", orderId, e && e.message);
      const msg = "✅ ОПЛАЧЕН (онлайн картой)\n№ " + orderId + (totalStr ? "\nСумма: " + totalStr : "") + "\n\n" + details;
      const logId = await logOrder(orderId, "online_paid", msg,
        crmMeta(body, { payment: "online_paid", total: cart && !cart.error ? cart.total : 0 }));
      const ok = await notifyManager(msg);
      if (ok) await markDelivered(logId, orderId);
      await notifyPhotos(bouquetPhotos(body), "🖼 Букеты по заказу № " + orderId);
      console.log("[paykeeper] notify online_paid fallback", orderId, ok);
      return reply(200, { ok: true, orderId, delivered: ok }, origin);
    }
  }

  const header =
    "🆕 НОВЫЙ ЗАКАЗ" +
    (body.payment === "payment_on_receipt" ? " (оплата при получении)" : "");

  const msg = header + "\n№ " + orderId + (totalStr ? "\nСумма: " + totalStr : "") + "\n\n" + details;

  /* ПОРЯДОК ВАЖЕН: сначала Telegram, потом база.
     Раньше заказ сперва писался в журнал и в панель, и медленная база (Neon
     после простоя) съедала весь таймаут функции — заказ не доходил вообще
     никуда: ни в бот, ни в панель. Менеджер смотрит в Telegram, поэтому туда
     отправляем первым делом, а записи в базу ограничиваем по времени. */
  const ok = await notifyManager(msg);
  const logId = await withDeadline(
    logOrder(orderId, body.payment || "order", msg,
      crmMeta(body, { total: cart && !cart.error ? cart.total : 0 })),
    LOG_WAIT_MS, "журнал заказа");
  if (ok) await withDeadline(markDelivered(logId, orderId), MARK_WAIT_MS, "отметка о доставке");
  await notifyPhotos(bouquetPhotos(body), "🖼 Букеты по заказу № " + orderId);
  console.log("[paykeeper] notify", orderId, body.payment || "", ok);
  return reply(200, { ok: true, orderId, delivered: ok }, origin);
}

/* ── POST-оповещение об оплате ──
   PayKeeper шлёт form-urlencoded: id, sum, clientid, orderid, key
   key    = md5(id + sum(2 знака) + clientid + orderid + секретное слово)
   ответ  = "OK " + md5(id + секретное слово)
   Без верной подписи не отвечаем OK: адрес функции публичный. */
async function handleWebhook(event) {
  const p = new URLSearchParams(rawBody(event));
  const id = p.get("id") || "";
  const sum = p.get("sum") || "";
  const clientid = p.get("clientid") || "";
  const orderid = p.get("orderid") || "";
  const key = p.get("key") || "";

  const amount = Number(sum);
  const expected = md5(
    id + (Number.isFinite(amount) ? amount.toFixed(2) : sum) + clientid + orderid + PK_SECRET,
  );

  if (!PK_SECRET || key !== expected) {
    console.error("[paykeeper] bad signature", id, orderid);
    return { statusCode: 401, headers: { "Content-Type": "text/plain" }, body: "Error! Bad signature" };
  }

  console.log("[paykeeper] paid", JSON.stringify({ id, orderid, sum, clientid }));

  /* Маркировка: если заказ был с кодами — переводим их в «продан» (идемпотентно).
     Обёрнуто в try/catch: сбой базы НЕ должен ломать ответ PayKeeper. Работает
     только когда база подключена (иначе маркировки в проекте просто нет). */
  if (process.env.DATABASE_URL) {
    try {
      const res = await require("./marking").markPaidByExternalId(orderid);
      if (res && res.found && res.sold) console.log("[marking] sold", orderid, res.sold);
    } catch (e) {
      console.error("[marking] webhook mark error", e && e.message);
    }
  }

  /* Полное уведомление о заказе — АВТОМАТИЧЕСКИ после оплаты. Детали брали из
     pending_orders (положили при создании счёта). pendingTake удаляет строку и
     возвращает её атомарно: кто первый (webhook или страница thank-you), тот и
     шлёт — дублей не будет. Клиенту НЕ нужно жать «Продолжить». */
  const amountStr = Number.isFinite(amount) ? amount.toLocaleString("ru-RU") : sum;
  try {
    const row = await pendingTake(orderid);
    if (row) {
      const msg = "✅ ОПЛАЧЕН (онлайн картой)\n№ " + orderid + "\nСумма: " + amountStr + " ₽\n\n" + row.manager_text;
      const logId = await logOrder(orderid, "online_paid", msg,
        crmMeta(row.meta, {
          payment: "online_paid",
          total: Number.isFinite(amount) ? Math.round(amount) : row.total,
        }));
      const ok = await notifyManager(msg);
      if (ok) await markDelivered(logId, orderid);
      const ph = normPhotos(row.photos);
      if (ph.length) await notifyPhotos(ph, "🖼 Букеты по заказу № " + orderid);
    }
    /* row === null → детали уже отправил другой путь (thank-you) либо их не
       сохраняли (заказ ушёл при создании как «не оплачен») — не дублируем. */
  } catch (e) {
    /* БД недоступна — шлём хотя бы короткое подтверждение, чтобы факт оплаты не потерялся. */
    console.error("[pending] webhook take error", orderid, e && e.message);
    await notifyManager(
      "✅ ОПЛАЧЕН\n№ " + orderid + "\nСумма: " + amountStr + " ₽\nКлиент: " + (clientid || "—"),
    );
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "text/plain" },
    body: "OK " + md5(id + PK_SECRET),
  };
}

/* для локальной проверки: node paykeeper/test.js */
module.exports._verifyCart = verifyCart;
module.exports._handleWebhook = handleWebhook;
module.exports._handleNotify = handleNotify;
module.exports._bouquetPhotos = bouquetPhotos;
module.exports._refreshCatalog = refreshCatalog;

module.exports.handler = async function handler(event) {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || "";
  const method = (event.httpMethod || "").toUpperCase();
  const action = (event.queryStringParameters || {}).a || "create";

  // Таймер Яндекса вызывает функцию БЕЗ http-метода — это сигнал «почисти брони».
  if (!event.httpMethod) {
    try {
      const marking = require("./marking");
      const n = await marking.releaseExpired();
      return { statusCode: 200, body: "released " + n };
    } catch (e) {
      console.error("[marking] timer release error", e && e.stack);
      return { statusCode: 500, body: "err" };
    }
  }

  if (method === "OPTIONS") return { statusCode: 204, headers: cors(origin), body: "" };

  /* ── Проверка «какая версия функции сейчас работает». Без токена: отдаём
     только версию сборки и количества товаров, ничего секретного. Нужна,
     чтобы после загрузки нового архива было видно, доехал он или нет. ── */
  if (action === "ping") {
    const out = { ok: true, версия: BUILD };
    try {
      require("./paloma-products.js");
      const seed = (global.window && global.window.PALOMA_PRODUCTS) || [];
      Object.assign(out, await require("./products.js").health(seed.length));
    } catch (e) {
      out.база = "недоступна: " + (e && e.message);
    }
    return reply(200, out, origin);
  }

  // ── Публичный каталог из базы (для сайта). GET и POST, без токена. ──
  if (action === "products") {
    try {
      require("./paloma-products.js");
      const seedCount = ((global.window && global.window.PALOMA_PRODUCTS) || []).length;
      const res = await require("./products.js").listForSite(seedCount);
      return reply(200, { ok: true, ...res }, origin);
    } catch (e) {
      console.error("[products] list error", e && e.stack);
      return reply(500, { error: "Ошибка каталога" }, origin);
    }
  }

  /* ── Фото товара по ссылке из каталога. Публично: картинки открывает
     любой посетитель, а браузеру разрешаем держать их в кэше — файл под
     конкретным id не меняется никогда (новое фото = новый id). ── */
  if (action === "img") {
    try {
      const id = (event.queryStringParameters || {}).id;
      const img = await require("./products.js").getImage(id);
      if (!img) return reply(404, { error: "Нет такой картинки" }, origin);
      return {
        statusCode: 200,
        headers: {
          "Content-Type": img.mime,
          "Cache-Control": "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*",
        },
        body: img.body,
        isBase64Encoded: true,
      };
    } catch (e) {
      console.error("[products] image error", e && e.stack);
      return reply(500, { error: "Ошибка картинки" }, origin);
    }
  }

  // Часть админ-маршрутов разрешаем и по GET — чтобы можно было «просто открыть ссылку».
  const ADMIN_ACTIONS = [
    "migrate", "release-expired", "codes-stats",
    "import-codes", "void-code", "selftest",
    "products-migrate", "products-all", "products-reorder",
    "product-save", "product-delete", "product-active", "product-image",
    "orders",
    "crm-list", "crm-update", "crm-import", "crm-import-pending", "pending-list", "tg-selftest",
  ];
  const ADMIN_GET_OK =
    action === "migrate" || action === "release-expired" ||
    action === "codes-stats" || action === "selftest" ||
    action === "products-migrate" || action === "products-all" || action === "orders" ||
    action === "crm-list" || action === "crm-import" ||
    action === "crm-import-pending" || action === "pending-list" ||
    action === "tg-selftest";
  if (method !== "POST" && !ADMIN_GET_OK)
    return reply(405, { error: "Только POST" }, origin);

  // ── Админские маршруты маркировки (защищены токеном ADMIN_TOKEN) ──
  if (ADMIN_ACTIONS.includes(action)) {
    const qs = event.queryStringParameters || {};
    // действия с телом — разбираем заранее (там же token).
    /* CRM-страница шлёт пароль в ТЕЛЕ POST, а не в адресной строке: строка
       запроса оседает в логах, тело — нет. Поэтому тело разбираем у всех
       crm-действий, включая читающие. Для GET rawBody пуст — parse("{}") ок. */
    /* Тело разбираем у ВСЕХ админ-действий, а не у избранных.
       Панели шлют пароль в ТЕЛЕ POST, а не в адресной строке: query-строка
       оседает в логах функции и в истории браузера, тело — нет. Пока список
       вёлся вручную, забытое в нём действие отвечало «Нет доступа» на верный
       пароль — ровно так сломалась панель каталога на products-all.
       Для GET тело пустое, JSON.parse("{}") отрабатывает вхолостую. */
    let bodyObj = {};
    try { bodyObj = JSON.parse(rawBody(event) || "{}"); }
    catch { return reply(400, { error: "Некорректный JSON" }, origin); }
    const token = qs.token || bodyObj.token;
    if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN)
      return reply(403, { error: "Нет доступа" }, origin);
    // ── Страховочный журнал заказов: последние заказы, даже если TG не доходил ──
    if (action === "orders") {
      try {
        return reply(200, { ok: true, orders: await ordersRecent(qs.limit) }, origin);
      } catch (e) {
        console.error("[orders] list error", e && e.message);
        return reply(500, { error: "Ошибка журнала: " + (e && e.message) }, origin);
      }
    }
    // ── Самопроверка Telegram: что именно не доходит и почему ──
    if (action === "tg-selftest") {
      try {
        return reply(200, { ok: true, проверка: await tgSelfTest() }, origin);
      } catch (e) {
        console.error("[tg-selftest]", e && e.stack);
        return reply(500, { error: "Ошибка самопроверки: " + (e && e.message) }, origin);
      }
    }

    // ── Неоплаченные заказы: счёт выставлен, деньги не пришли ──
    if (action === "pending-list") {
      try {
        return reply(200, { ok: true, pending: await pendingList(qs.limit) }, origin);
      } catch (e) {
        console.error("[pending] list error", e && e.message);
        return reply(500, { error: "Ошибка: " + (e && e.message) }, origin);
      }
    }

    // ── CRM: заказы и заявки полями, со статусом и заметкой ──
    if (action.indexOf("crm-") === 0) {
      try {
        const crm = require("./crm");
        if (action === "crm-list") {
          return reply(200, {
            ok: true,
            ...(await crm.list({
              q: qs.q, status: qs.status, kind: qs.kind,
              from: qs.from, to: qs.to, limit: qs.limit, offset: qs.offset,
            })),
          }, origin);
        }
        if (action === "crm-update")
          return reply(200, { ...(await crm.update(bodyObj.orderId, bodyObj)) }, origin);
        if (action === "crm-import")
          return reply(200, { ok: true, ...(await crm.importLegacy()) }, origin);
        if (action === "crm-import-pending")
          return reply(200, { ok: true, ...(await crm.importPending()) }, origin);
      } catch (e) {
        console.error("[crm] admin action error", e && e.stack);
        return reply(500, { error: "Ошибка CRM: " + (e && e.message) }, origin);
      }
    }
    // ── Каталог товаров (админка) ──
    if (action.indexOf("product") === 0) {
      try {
        const products = require("./products.js");
        catalogLoadedAt = 0; // каталог правили — перечитать при следующем заказе
        const builtInPrice = () => {
          require("./paloma-products.js"); // наполняет global.window.PALOMA_PRODUCTS
          return (global.window && global.window.PALOMA_PRODUCTS) || [];
        };

        /* Вернуть недостающие товары прайса. Это лечение оборвавшегося переноса,
           поэтому работает и после отметки о нём. Существующие товары не
           трогаются: у них могли поменять цену, фото и порядок. */
        if (action === "products-migrate")
          return reply(200, { ok: true, ...(await products.restoreMissing(builtInPrice())) }, origin);

        if (action === "products-all") {
          /* Первое открытие панели: каталог наполняется сам из встроенного
             прайса. Нажимать «перенести» вручную не нужно, а повторно перенос
             не сработает — отметка о нём лежит в базе. */
          const seeded = await products.autoSeed(builtInPrice);
          const list = await products.listAll();
          /* builtIn — сколько товаров в исходном прайсе. Панель сравнивает его
             со своим списком и предлагает дозагрузить, если перенос оборвался. */
          return reply(200, {
            ok: true,
            версия: BUILD,
            seeded: seeded.seeded || 0,
            repaired: !!seeded.repaired,
            builtIn: builtInPrice().length,
            products: list,
          }, origin);
        }
        if (action === "product-save")
          return reply(200, { ok: true, product: await products.save(bodyObj.product || bodyObj) }, origin);
        if (action === "product-delete")
          return reply(200, { ok: true, ...(await products.remove(bodyObj.id)) }, origin);
        if (action === "product-active")
          return reply(200, { ok: true, ...(await products.setActive(bodyObj.id, bodyObj.active)) }, origin);
        if (action === "products-reorder")
          return reply(200, { ok: true, ...(await products.reorder(bodyObj.ids)) }, origin);
        if (action === "product-image") {
          const saved = await products.saveImage(bodyObj.dataUrl);
          /* Ссылку собирает админка: адрес функции знает только она. */
          return reply(200, { ok: true, ...saved, path: "?a=img&id=" + saved.id }, origin);
        }
      } catch (e) {
        console.error("[products] admin action error", e && e.stack);
        return reply(500, { error: "Ошибка: " + (e && e.message) }, origin);
      }
    }

    try {
      const marking = require("./marking");
      if (action === "migrate")
        return reply(200, { ok: true, migrated: await marking.runMigrations() }, origin);
      if (action === "release-expired")
        return reply(200, { ok: true, released: await marking.releaseExpired() }, origin);
      if (action === "codes-stats")
        return reply(200, { ok: true, stats: await marking.codesStats(qs.sku || null) }, origin);
      if (action === "selftest")
        return reply(200, { ok: true, test: await marking.selfTest() }, origin);
      if (action === "void-code")
        return reply(200, { ok: true, ...(await marking.voidByCode(bodyObj.code, bodyObj.reason)) }, origin);

      // import-codes: коды принимаем массивом codes[] или сплошным текстом codesText.
      let codes = bodyObj.codes;
      if (!Array.isArray(codes) && typeof bodyObj.codesText === "string")
        codes = bodyObj.codesText.split(/[\r\n,;]+/);
      const res = await marking.importCodes(bodyObj.sku, codes || [], bodyObj.itemType || "goods_coded");
      return reply(200, { ok: true, ...res }, origin);
    } catch (e) {
      console.error("[marking] admin action error", e && e.stack);
      return reply(500, { error: "Ошибка: " + (e && e.message) }, origin);
    }
  }

  try {
    /* Подтягиваем товары из базы: без этого новый товар из админки
       не пройдёт проверку цены и покупатель увидит «Неизвестный товар». */
    await refreshCatalog();

    if (action === "webhook") return await handleWebhook(event);

    let body;
    try {
      body = JSON.parse(rawBody(event) || "{}");
    } catch {
      return reply(400, { error: "Некорректный JSON" }, origin);
    }
    if (action === "notify") return await handleNotify(body, origin);
    return await createInvoice(body, origin);
  } catch (e) {
    console.error("[paykeeper] error", e && e.stack);
    return reply(500, { error: "Внутренняя ошибка" }, origin);
  }
};
