/* ════════════════════════════════════════════════════════
   ratelimit.js — ограничение частоты запросов.

   Зачем. Функция открыта в интернет, и до этого модуля у неё не было
   никакого предела: пароль админки можно было перебирать бесконечно,
   а публичной ручкой notify — засыпать рабочий чат менеджера.

   Почему через базу, а не счётчиком в памяти. Облачная функция живёт
   во множестве копий сразу, и запросы растекаются по ним. Счётчик в
   памяти одной копии видит лишь свою долю попыток — для перебора
   пароля это бесполезно. Общая для всех копий база считает честно.

   Окно скользит «прыжком»: набрали лимит — ждём до конца окна.
   Точность здесь не нужна, нужен потолок.
   ════════════════════════════════════════════════════════ */
"use strict";

const { query } = require("./db");

let ready = false;

async function ensureTable() {
  if (ready) return;
  await query(
    `CREATE TABLE IF NOT EXISTS rate_limits (
       bucket       TEXT PRIMARY KEY,
       hits         INTEGER     NOT NULL DEFAULT 0,
       window_start TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );
  ready = true;
}

/* Кто спрашивает. За функцией стоит балансировщик Яндекса, поэтому
   реальный адрес приходит не из соединения.

   Первым делом смотрим requestContext.identity.sourceIp: событие
   Яндекса повторяет формат AWS, и адрес лежит именно там. Заголовки —
   запасной путь, и перебираем их без учёта регистра: имена приходят
   по-разному, а точное совпадение легко промахивается.

   Возвращаем null, если адрес определить не удалось. Именно null, а не
   общее ведро: раньше здесь стояла строка «неизвестно», и все посетители
   считались одним — десять неудачных попыток с любого адреса запирали
   и владельца. Как это лечится, см. в index.js на месте вызова. */
function clientIp(event) {
  const ctx = (event && event.requestContext) || {};
  const direct = (ctx.identity && ctx.identity.sourceIp) || ctx.sourceIp || "";
  if (direct) return String(direct).split(",")[0].trim();

  const h = (event && event.headers) || {};
  for (const key of Object.keys(h)) {
    const k = key.toLowerCase();
    if (k === "x-forwarded-for" || k === "x-real-ip") {
      const first = String(h[key] || "").split(",")[0].trim();
      if (first) return first;
    }
  }
  return null;
}

/* Отметить обращение и сказать, можно ли пускать.

   Один запрос в базу на проверку: INSERT ... ON CONFLICT сам решает,
   продолжается старое окно или началось новое. Возвращает строку уже
   с обновлённым счётчиком, поэтому читать отдельно не нужно.

   При сбое базы ПУСКАЕМ. Панели без базы всё равно бесполезны, а
   запереть хозяйку магазина в её же админке из-за моргнувшей сети —
   хуже, чем на минуту остаться без лимита. */
async function hit(bucket, limit, windowSec) {
  try {
    await ensureTable();
    const r = await query(
      `INSERT INTO rate_limits (bucket, hits, window_start)
            VALUES ($1, 1, now())
       ON CONFLICT (bucket) DO UPDATE SET
            hits = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2::float8)
                        THEN 1 ELSE rate_limits.hits + 1 END,
            window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2::float8)
                        THEN now() ELSE rate_limits.window_start END
       RETURNING hits, EXTRACT(EPOCH FROM (window_start + make_interval(secs => $2::float8) - now()))::int AS left_sec`,
      [String(bucket).slice(0, 200), windowSec]
    );
    const row = r.rows[0] || { hits: 1, left_sec: windowSec };
    return {
      ok: row.hits <= limit,
      hits: row.hits,
      retryAfter: Math.max(Number(row.left_sec) || 0, 1),
    };
  } catch (e) {
    console.error("[ratelimit] сбой базы, пропускаем без счёта:", e && e.message);
    return { ok: true, hits: 0, retryAfter: 0 };
  }
}

/* Посмотреть счётчик, НЕ увеличивая его.

   Нужно именно так. Если считать только промахи и отвечать «слишком
   много попыток» после лимита, перебор не останавливается: неверный
   пароль даёт 429, а верный — всё равно пускает, то есть угадывать
   можно бесконечно. Поэтому у админских действий сначала смотрим
   счётчик и при исчерпанном лимите отказываем СРАЗУ, не сверяя пароль. */
async function peek(bucket, limit, windowSec) {
  try {
    await ensureTable();
    const r = await query(
      `SELECT hits, EXTRACT(EPOCH FROM (window_start + make_interval(secs => $2::float8) - now()))::int AS left_sec
         FROM rate_limits
        WHERE bucket = $1 AND window_start > now() - make_interval(secs => $2::float8)`,
      [String(bucket).slice(0, 200), windowSec]
    );
    const row = r.rows[0];
    if (!row) return { ok: true, hits: 0, retryAfter: 0 };
    return {
      ok: row.hits < limit,
      hits: row.hits,
      retryAfter: Math.max(Number(row.left_sec) || 0, 1),
    };
  } catch (e) {
    console.error("[ratelimit] сбой базы при чтении счётчика:", e && e.message);
    return { ok: true, hits: 0, retryAfter: 0 };
  }
}

/* Сбросить счётчик — зовём после удачного входа в админку, чтобы
   менеджер, промахнувшийся пару раз мимо пароля, не донашивал их
   до конца окна. */
async function reset(bucket) {
  try {
    await ensureTable();
    await query(`DELETE FROM rate_limits WHERE bucket = $1`, [String(bucket).slice(0, 200)]);
  } catch (e) {
    console.error("[ratelimit] не удалось сбросить счётчик:", e && e.message);
  }
}

module.exports = { hit, peek, reset, clientIp };
