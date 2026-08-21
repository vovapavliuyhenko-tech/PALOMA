/* ════════════════════════════════════════════════════════
   crm.js — журнал заказов и заявок со структурой (мини-CRM)

   Зачем отдельный файл: index.js проводит оплату, и трогать его
   лишний раз опасно. Здесь вся работа с таблицей crm_orders, а
   index.js только зовёт crm.save() рядом с существующим logOrder().

   Отличие от orders_log: тот хранит заказ ОДНОЙ строкой текста и
   остаётся страховкой «ничего не потерялось». Здесь — поля, по
   которым можно искать, фильтровать и вести статус.

   Всё best-effort: любая ошибка CRM никогда не роняет заказ.
   ════════════════════════════════════════════════════════ */
"use strict";

/* pending — заказ создан, счёт выставлен, деньги ещё не пришли. Такие
   заказы раньше не попадали никуда: клиент уходил со страницы оплаты, и
   для студии заказа не существовало. Теперь они видны сразу. */
const STATUSES = ["pending", "new", "work", "done", "cancelled"];

let ready = false;

async function ensure(db) {
  if (ready) return;
  await db.query(
    "CREATE TABLE IF NOT EXISTS crm_orders (" +
      " order_id text PRIMARY KEY," +
      " kind text NOT NULL DEFAULT ''," +
      " status text NOT NULL DEFAULT 'new'," +
      " client_name text NOT NULL DEFAULT ''," +
      " phone text NOT NULL DEFAULT ''," +
      " email text NOT NULL DEFAULT ''," +
      " messenger text NOT NULL DEFAULT ''," +
      " total integer NOT NULL DEFAULT 0," +
      " items jsonb NOT NULL DEFAULT '[]'::jsonb," +
      " delivery jsonb NOT NULL DEFAULT '{}'::jsonb," +
      " payment text NOT NULL DEFAULT ''," +
      " text text NOT NULL DEFAULT ''," +
      " note text NOT NULL DEFAULT ''," +
      " tg_delivered boolean NOT NULL DEFAULT false," +
      " created_at timestamptz NOT NULL DEFAULT now()," +
      " updated_at timestamptz NOT NULL DEFAULT now())",
  );
  await db.query(
    "CREATE INDEX IF NOT EXISTS crm_orders_created_idx ON crm_orders (created_at DESC)",
  );
  ready = true;
}

function str(v, max) {
  return String(v == null ? "" : v).slice(0, max || 256);
}

/* Телефон в цифрах — чтобы поиск находил номер в любом написании
   (+7 (900) 000-00-00 и 89000000000 — это один и тот же клиент). */
function digits(v) {
  return String(v == null ? "" : v).replace(/\D/g, "").slice(0, 20);
}

function jsonOr(value, fallback) {
  try {
    return JSON.stringify(value == null ? fallback : value);
  } catch (e) {
    return JSON.stringify(fallback);
  }
}

/* Сохранить заказ/заявку. Повторный вызов по тому же номеру обновляет
   данные, но НЕ трогает статус и заметку — их ведёт менеджер руками,
   и приход webhook об оплате не должен сбрасывать их в «новый». */
async function save(orderId, kind, text, meta, initialStatus) {
  if (!process.env.DATABASE_URL) return false;
  const id = str(orderId, 64);
  if (!id) return false;
  const m = meta || {};
  const start = STATUSES.indexOf(initialStatus) >= 0 ? initialStatus : "new";
  try {
    const db = require("./db");
    await ensure(db);
    await db.query(
      "INSERT INTO crm_orders" +
        " (order_id, kind, client_name, phone, email, messenger, total, items, delivery, payment, text, status)" +
        " VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)" +
        " ON CONFLICT (order_id) DO UPDATE SET" +
        "  kind = EXCLUDED.kind," +
        /* пустое значение из позднего вызова не должно затирать заполненное */
        "  client_name = COALESCE(NULLIF(EXCLUDED.client_name,''), crm_orders.client_name)," +
        "  phone       = COALESCE(NULLIF(EXCLUDED.phone,''),       crm_orders.phone)," +
        "  email       = COALESCE(NULLIF(EXCLUDED.email,''),       crm_orders.email)," +
        "  messenger   = COALESCE(NULLIF(EXCLUDED.messenger,''),   crm_orders.messenger)," +
        "  total       = GREATEST(EXCLUDED.total, crm_orders.total)," +
        "  items       = CASE WHEN EXCLUDED.items = '[]'::jsonb THEN crm_orders.items ELSE EXCLUDED.items END," +
        "  delivery    = CASE WHEN EXCLUDED.delivery = '{}'::jsonb THEN crm_orders.delivery ELSE EXCLUDED.delivery END," +
        "  payment     = COALESCE(NULLIF(EXCLUDED.payment,''),     crm_orders.payment)," +
        "  text        = EXCLUDED.text," +
        /* Оплата пришла — «ждёт оплаты» превращается в «новый». Статусы,
           которые менеджер поставил руками, не трогаем никогда. */
        "  status      = CASE WHEN crm_orders.status = 'pending' AND EXCLUDED.status <> 'pending'" +
        "                     THEN EXCLUDED.status ELSE crm_orders.status END," +
        "  updated_at  = now()",
      [
        id,
        str(kind, 32),
        str(m.clientName, 128),
        digits(m.phone),
        str(m.email, 128),
        str(m.messenger, 64),
        Math.round(Number(m.total) || 0),
        jsonOr(m.items, []),
        jsonOr(m.delivery, {}),
        str(m.payment, 32),
        str(text, 3800),
        start,
      ],
    );
    return true;
  } catch (e) {
    console.error("[crm] save error", id, e && e.message);
    return false;
  }
}

/* Отметка «ушло в Telegram» — по тому же признаку, что в orders_log. */
async function markDelivered(orderId) {
  if (!process.env.DATABASE_URL) return;
  try {
    const db = require("./db");
    await ensure(db);
    await db.query(
      "UPDATE crm_orders SET tg_delivered = true WHERE order_id = $1",
      [str(orderId, 64)],
    );
  } catch (e) {
    console.error("[crm] mark error", e && e.message);
  }
}

/* Список с фильтрами. Всё необязательно:
   q — поиск по номеру, имени, телефону и тексту заказа
   status — new|work|done|cancelled
   kind — тип записи
   from/to — даты (YYYY-MM-DD), включительно
   limit/offset — постранично */
async function list(params) {
  const db = require("./db");
  await ensure(db);
  const p = params || {};
  const where = [];
  const args = [];

  if (p.status && STATUSES.indexOf(String(p.status)) >= 0) {
    args.push(String(p.status));
    where.push("status = $" + args.length);
  }
  if (p.kind) {
    args.push(str(p.kind, 32));
    where.push("kind = $" + args.length);
  }
  if (p.from) {
    args.push(String(p.from).slice(0, 10));
    where.push("created_at >= $" + args.length + "::date");
  }
  if (p.to) {
    args.push(String(p.to).slice(0, 10));
    /* +1 день, чтобы «по 14 августа» включало весь этот день */
    where.push("created_at < ($" + args.length + "::date + interval '1 day')");
  }
  const q = str(p.q, 120).trim();
  if (q) {
    const d = digits(q);
    args.push("%" + q.toLowerCase() + "%");
    const like = "$" + args.length;
    let cond =
      "(lower(order_id) LIKE " + like +
      " OR lower(client_name) LIKE " + like +
      " OR lower(text) LIKE " + like +
      " OR lower(note) LIKE " + like;
    if (d) {
      args.push("%" + d + "%");
      cond += " OR phone LIKE $" + args.length;
    }
    where.push(cond + ")");
  }

  const sql = where.length ? " WHERE " + where.join(" AND ") : "";
  const limit = Math.min(Math.max(Number(p.limit) || 50, 1), 200);
  const offset = Math.max(Number(p.offset) || 0, 0);

  const rows = await db.query(
    "SELECT order_id, kind, status, client_name, phone, email, messenger," +
      " total, items, delivery, payment, text, note, tg_delivered, created_at, updated_at" +
      " FROM crm_orders" + sql +
      " ORDER BY created_at DESC LIMIT " + limit + " OFFSET " + offset,
    args,
  );

  /* Счётчики по статусам — считаем по тем же фильтрам, но без фильтра
     статуса, иначе в шапке всегда была бы одна ненулевая плашка. */
  const cntWhere = [];
  const cntArgs = [];
  ["kind", "from", "to"].forEach(function (key) {
    if (!p[key]) return;
    if (key === "kind") {
      cntArgs.push(str(p.kind, 32));
      cntWhere.push("kind = $" + cntArgs.length);
    } else if (key === "from") {
      cntArgs.push(String(p.from).slice(0, 10));
      cntWhere.push("created_at >= $" + cntArgs.length + "::date");
    } else {
      cntArgs.push(String(p.to).slice(0, 10));
      cntWhere.push("created_at < ($" + cntArgs.length + "::date + interval '1 day')");
    }
  });
  const counts = await db.query(
    "SELECT status, count(*)::int AS n FROM crm_orders" +
      (cntWhere.length ? " WHERE " + cntWhere.join(" AND ") : "") +
      " GROUP BY status",
    cntArgs,
  );
  const byStatus = {};
  (counts.rows || []).forEach(function (r) {
    byStatus[r.status] = r.n;
  });

  return { orders: rows.rows || [], counts: byStatus };
}

/* Смена статуса и/или заметки менеджера. */
async function update(orderId, patch) {
  const db = require("./db");
  await ensure(db);
  const id = str(orderId, 64);
  if (!id) return { ok: false, error: "Не указан номер заказа" };

  const sets = [];
  const args = [];
  const p = patch || {};

  if (p.status != null) {
    if (STATUSES.indexOf(String(p.status)) < 0)
      return { ok: false, error: "Неизвестный статус: " + p.status };
    args.push(String(p.status));
    sets.push("status = $" + args.length);
  }
  if (p.note != null) {
    args.push(str(p.note, 2000));
    sets.push("note = $" + args.length);
  }
  if (!sets.length) return { ok: false, error: "Нечего менять" };

  sets.push("updated_at = now()");
  args.push(id);
  const res = await db.query(
    "UPDATE crm_orders SET " + sets.join(", ") +
      " WHERE order_id = $" + args.length + " RETURNING order_id, status, note, updated_at",
    args,
  );
  if (!res.rows || !res.rows[0]) return { ok: false, error: "Заказ не найден: " + id };
  return { ok: true, order: res.rows[0] };
}

/* Разовый перенос старого журнала в CRM: строки, которых ещё нет.
   Полей там нет — переносим номер, тип, текст и дату, статус «новый».
   Идемпотентно: повторный запуск ничего не дублирует. */
async function importLegacy() {
  const db = require("./db");
  await ensure(db);
  const res = await db.query(
    "INSERT INTO crm_orders (order_id, kind, text, tg_delivered, created_at)" +
      " SELECT DISTINCT ON (order_id) order_id, coalesce(kind,''), text, tg_delivered, created_at" +
      "  FROM orders_log" +
      "  WHERE order_id IS NOT NULL AND order_id <> ''" +
      "  ORDER BY order_id, id DESC" +
      " ON CONFLICT (order_id) DO NOTHING",
  );
  return { imported: res.rowCount || 0 };
}

module.exports = { save, markDelivered, list, update, importLegacy, STATUSES };
