/* ════════════════════════════════════════════════════════
   products.js — каталог товаров в базе (Neon Postgres).

   Единый источник правды для сайта и (позже) для проверки цены при оплате.
   В одной строке хранится ВЕСЬ объект товара в поле data (JSONB) — той же
   формы, что и window.PALOMA_PRODUCTS на сайте. Поэтому фронту и бэку не нужно
   менять форму данных: публичный список отдаёт ровно такие же объекты.

   Таблица создаётся автоматически (ensureTable) и один раз заполняется из
   встроенного прайса (autoSeed) — миграция без отдельных SQL-файлов.
   ════════════════════════════════════════════════════════ */
"use strict";

const { query } = require("./db");

let ready = false;

// Создать таблицу, если её ещё нет (безопасно вызывать при каждом запросе).
async function ensureTable() {
  if (ready) return;
  await query(
    `CREATE TABLE IF NOT EXISTS products (
       id         TEXT PRIMARY KEY,
       slug       TEXT,
       active     BOOLEAN NOT NULL DEFAULT TRUE,
       sort       INTEGER NOT NULL DEFAULT 0,
       data       JSONB   NOT NULL,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );
  await query(`CREATE INDEX IF NOT EXISTS products_active_sort ON products (active, sort)`);
  ready = true;
}

// Транслитерация в slug (латиница-дефисы) — если у товара его нет.
function slugify(s) {
  const map = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"e",ж:"zh",з:"z",и:"i",й:"y",к:"k",
    л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",х:"h",ц:"c",
    ч:"ch",ш:"sh",щ:"sch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
  };
  return String(s || "")
    .toLowerCase()
    .split("").map((ch) => (map[ch] !== undefined ? map[ch] : ch)).join("")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || ("tovar-" + Date.now());
}

/* Отметка «каталог уже переносили». Без неё пустой каталог заполнялся бы
   заново после того, как владелец сам удалил из него все товары. */
async function ensureSettings() {
  await query(
    `CREATE TABLE IF NOT EXISTS app_settings (
       key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );
}
/* Отметка хранит, СКОЛЬКО товаров было в прайсе на момент переноса. Первая
   версия писала туда просто дату — по такой отметке нельзя понять, доехал
   перенос целиком или оборвался. Значение без числа считаем недостоверным
   и проверяем каталог заново (один раз). */
async function seededMark() {
  await ensureSettings();
  const r = await query(`SELECT value FROM app_settings WHERE key = 'catalog_seeded'`);
  if (!r.rows.length) return null;
  const raw = String(r.rows[0].value || "");
  try {
    const box = JSON.parse(raw);
    if (box && typeof box.count === "number") return box;
  } catch (e) { /* старая отметка — просто дата */ }
  return { count: null, legacy: true };
}
async function markSeeded(count) {
  await ensureSettings();
  await query(
    `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('catalog_seeded', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [JSON.stringify({ at: new Date().toISOString(), count: Number(count) || 0 })]
  );
}

/* Первое открытие админки: каталог наполняется сам, вручную ничего нажимать
   не нужно. Отметку ставим ТОЛЬКО когда перенос дошёл до конца — оборвавшийся
   на полпути возобновится при следующем открытии панели.

   Отдельно лечим каталоги, перенесённые сломанной версией: у них отметка без
   числа, поэтому один раз досылаем недостающее и переписываем отметку. */
async function autoSeed(getSeed) {
  await ensureTable();
  const mark = await seededMark();
  const seed = getSeed() || [];

  if (mark && !mark.legacy && mark.count >= seed.length) {
    return { seeded: 0, skipped: true };
  }

  const res = await insertMissing(seed);
  const cnt = await query(`SELECT COUNT(*)::int AS n FROM products`);
  const complete = cnt.rows[0].n >= seed.length;
  /* Не дошло до конца — отметку не ставим, следующий заход продолжит. */
  if (complete) await markSeeded(seed.length);
  return {
    seeded: res.added,
    skipped: false,
    repaired: !!(mark && mark.legacy && res.added),
    complete,
  };
}

/* Досыпать в каталог товары встроенного прайса, которых там нет.
   Уже лежащие в базе не трогаем: у них могли поменять цену, фото и порядок.

   Пишем ПАЧКАМИ, а не по одному. Раньше 128 товаров вставлялись 128 отдельными
   запросами в базу — функция не укладывалась в свой таймаут и обрывалась
   посередине, а каталог оставался заполненным наполовину. */
const SEED_CHUNK = 50;

async function insertMissing(seedArr) {
  await ensureTable();
  const list = Array.isArray(seedArr) ? seedArr : [];
  let added = 0;
  for (let from = 0; from < list.length; from += SEED_CHUNK) {
    const chunk = list.slice(from, from + SEED_CHUNK);
    const values = [];
    const params = [];
    chunk.forEach((p, k) => {
      const i = from + k;
      const b = params.length;
      params.push(String(p.id), p.slug || slugify(p.name), i, JSON.stringify(p));
      values.push(`($${b + 1},$${b + 2},TRUE,$${b + 3},$${b + 4}::jsonb)`);
    });
    if (!values.length) continue;
    const r = await query(
      `INSERT INTO products (id, slug, active, sort, data)
       VALUES ${values.join(",")} ON CONFLICT (id) DO NOTHING`,
      params
    );
    added += r.rowCount || 0;
  }
  return { added, total: list.length };
}

/* Ручное восстановление из панели: вернуть недостающие товары прайса.
   Отличается от autoSeed тем, что работает и после отметки о переносе —
   это лечение оборвавшегося переноса, а не повторный перенос. */
async function restoreMissing(seedArr) {
  const res = await insertMissing(seedArr);
  await markSeeded((seedArr || []).length);
  return res;
}

/* Публичная сводка для проверки «доехала ли новая функция». Без токена:
   ничего секретного, только числа и дата сборки. */
async function health(seedCount) {
  await ensureTable();
  const cnt = await query(`SELECT COUNT(*)::int AS n FROM products`);
  const act = await query(`SELECT COUNT(*)::int AS n FROM products WHERE active = TRUE`);
  const mark = await seededMark();
  return {
    товаров_в_прайсе: seedCount,
    товаров_в_базе: cnt.rows[0].n,
    из_них_видно_на_сайте: act.rows[0].n,
    перенос_завершён: !!(mark && !mark.legacy && mark.count >= seedCount),
  };
}

// Публичный список для сайта — только активные, в порядке сортировки.
async function listActive() {
  await ensureTable();
  const r = await query(
    `SELECT data FROM products WHERE active = TRUE ORDER BY sort ASC, id ASC`
  );
  return r.rows.map((row) => row.data);
}

/* Список для проверки цены на бэкенде — ВКЛЮЧАЯ скрытые товары.
   Скрытый товар мог остаться у покупателя в корзине: с витрины он пропал,
   но оплатить его нужно дать — иначе на кассе вылезет «неизвестный товар». */
async function listForPricing() {
  await ensureTable();
  const r = await query(`SELECT data FROM products ORDER BY sort ASC, id ASC`);
  return r.rows.map((row) => row.data);
}

// Полный список для админки — с метаданными (active/sort/updated).
async function listAll() {
  await ensureTable();
  const r = await query(
    `SELECT id, slug, active, sort, data, updated_at
       FROM products ORDER BY sort ASC, id ASC`
  );
  return r.rows.map((row) => ({
    id: row.id, slug: row.slug, active: row.active, sort: row.sort,
    updatedAt: row.updated_at, ...row.data,
  }));
}

/* ── Размеры букета ─────────────────────────────────────────────────────────
   Строка размера: { code, label, priceDelta }. code уходит в id строки корзины
   («m1-M») и в чек, поэтому только латиница и цифры. priceDelta — доплата к
   базовой цене; отрицательной быть не может, иначе на бэкенде поедет верхняя
   граница допустимой цены. */
const ONE_SIZE = { code: "one", label: "Один размер", priceDelta: 0 };

function buildSizes(raw) {
  const out = [];
  const seen = new Set();
  (Array.isArray(raw) ? raw : []).slice(0, 8).forEach((s, i) => {
    if (!s || typeof s !== "object") return;
    let code = String(s.code || "").trim().replace(/[^A-Za-z0-9]/g, "").slice(0, 12);
    const label = String(s.label || "").trim().slice(0, 60) || code;
    if (!label) return;                     // ни кода, ни подписи — строку выкидываем
    if (!code) code = "r" + (i + 1);
    while (seen.has(code.toUpperCase())) code += i + 1;
    seen.add(code.toUpperCase());
    const delta = Math.round(Number(s.priceDelta) || 0);
    out.push({ code, label, priceDelta: delta > 0 ? delta : 0 });
  });
  return out.length ? out : [Object.assign({}, ONE_SIZE)];
}

// Собрать безопасный объект товара из данных админки.
function buildProduct(input, existing) {
  const base = existing || {};
  const name = String(input.name != null ? input.name : base.name || "").trim();
  const price = Math.round(Number(input.price != null ? input.price : base.price) || 0);
  let categories = input.categories != null ? input.categories : base.categories;
  if (typeof categories === "string") categories = [categories];
  if (!Array.isArray(categories)) categories = categories ? [categories] : [];
  categories = categories.map((c) => String(c).trim()).filter(Boolean);
  const badge = input.badge != null ? (String(input.badge).trim() || null) : (base.badge || null);
  const out = Object.assign({}, base, {
    name,
    price,
    categories,
    badge,
    composition: input.composition != null ? String(input.composition) : (base.composition || ""),
    desc: input.desc != null ? String(input.desc) : (base.desc || ""),
    image: input.image != null ? String(input.image) : (base.image || ""),
  });

  /* Размеры. Не прислали — оставляем прежние (правка цены не должна их стирать). */
  out.sizes = input.sizes != null
    ? buildSizes(input.sizes)
    : (Array.isArray(base.sizes) && base.sizes.length ? base.sizes : [Object.assign({}, ONE_SIZE)]);

  /* Какой размер на фотографии: от него считается цена на карточке каталога.
     Значение обязано быть одним из кодов, иначе карточка молча покажет базовую. */
  const wantPhoto = input.photoSize != null ? input.photoSize : base.photoSize;
  const codes = out.sizes.map((s) => s.code);
  out.photoSize = codes.indexOf(String(wantPhoto || "")) >= 0 ? String(wantPhoto) : null;

  /* Цена «от» — итог согласует менеджер (свадебные, оформление). */
  out.priceFrom = input.priceFrom != null ? !!input.priceFrom : !!base.priceFrom;

  if (!out.addons) {
    out.addons = [
      { id: "card", label: "Открытка", price: 350 },
      { id: "vase", label: "Ваза", price: 1200 },
      { id: "coffee", label: "Кофе с собой", price: 320 },
    ];
  }
  return out;
}

// Создать/обновить товар. Возвращает сохранённый объект.
async function save(input) {
  await ensureTable();
  if (!input || typeof input !== "object") throw new Error("Нет данных товара");
  if (!String(input.name || "").trim()) throw new Error("Не указано название");

  let id = String(input.id || "").trim();
  let row = null;
  if (id) {
    const r = await query(`SELECT active, sort, data FROM products WHERE id = $1`, [id]);
    if (r.rows.length) row = r.rows[0];
  }
  if (!id) id = "p" + Date.now(); // латиница+цифры → распознаётся валидатором цены

  const existing = row ? row.data : null;
  const data = buildProduct(input, existing);
  data.id = id;
  data.slug = (input.slug && String(input.slug).trim()) || (existing && existing.slug) || slugify(data.name);

  // active/sort: берём из запроса, иначе оставляем прежние (или дефолт для нового)
  const active = input.active != null ? !!input.active : (row ? row.active : true);
  let sort;
  if (input.sort != null) sort = Math.round(Number(input.sort) || 0);
  else if (row) sort = row.sort;
  else {
    const mx = await query(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM products`);
    sort = mx.rows[0].s;
  }

  await query(
    `INSERT INTO products (id, slug, active, sort, data, updated_at)
       VALUES ($1,$2,$3,$4,$5, now())
     ON CONFLICT (id) DO UPDATE
       SET slug = EXCLUDED.slug, active = EXCLUDED.active,
           sort = EXCLUDED.sort, data = EXCLUDED.data, updated_at = now()`,
    [id, data.slug, active, sort, JSON.stringify(data)]
  );
  return Object.assign({ id, active, sort }, data);
}

// Удалить товар (насовсем).
async function remove(id) {
  await ensureTable();
  id = String(id || "").trim();
  if (!id) throw new Error("Не указан id");
  const r = await query(`DELETE FROM products WHERE id = $1`, [id]);
  return { deleted: r.rowCount };
}

// Показать/скрыть без удаления.
async function setActive(id, active) {
  await ensureTable();
  id = String(id || "").trim();
  if (!id) throw new Error("Не указан id");
  const r = await query(`UPDATE products SET active = $2, updated_at = now() WHERE id = $1`, [id, !!active]);
  return { updated: r.rowCount, active: !!active };
}



/* ── Порядок вывода: админка присылает id в нужной последовательности ── */
async function reorder(ids) {
  await ensureTable();
  if (!Array.isArray(ids) || !ids.length) throw new Error("Пустой список порядка");
  if (ids.length > 500) throw new Error("Слишком длинный список");
  for (let i = 0; i < ids.length; i++) {
    await query(`UPDATE products SET sort = $2, updated_at = now() WHERE id = $1`,
      [String(ids[i]), i]);
  }
  return { ordered: ids.length };
}

/* ════════════════════════════════════════════════════════
   Фотографии товаров.

   Храним в базе, а отдаём наружу ссылкой «?a=img&id=…»: так админке не нужны
   ни бакет, ни ключи Object Storage — клиентка просто выбирает файл. Браузер
   перед отправкой ужимает снимок до ~1600 px, поэтому строки небольшие.
   ════════════════════════════════════════════════════════ */
let imgReady = false;
async function ensureImages() {
  if (imgReady) return;
  await query(
    `CREATE TABLE IF NOT EXISTS product_images (
       id         TEXT PRIMARY KEY,
       mime       TEXT NOT NULL,
       body       TEXT NOT NULL,
       bytes      INTEGER NOT NULL DEFAULT 0,
       created_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );
  imgReady = true;
}

const IMG_MIME = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const IMG_MAX_BYTES = 2 * 1024 * 1024; // запрос и ответ функции ограничены 3,5 МБ

// Принять data:URL из админки, вернуть { id } для ссылки «?a=img&id=…».
async function saveImage(dataUrl) {
  await ensureImages();
  const m = /^data:([a-z/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || "").trim());
  if (!m) throw new Error("Это не картинка (ожидается data:image/…;base64)");
  const mime = m[1].toLowerCase();
  if (!IMG_MIME[mime]) throw new Error("Формат не поддерживается: " + mime + ". Нужен JPG, PNG или WEBP");
  const body = m[2].replace(/\s+/g, "");
  const bytes = Math.floor((body.length * 3) / 4);
  if (bytes < 100) throw new Error("Файл пустой");
  if (bytes > IMG_MAX_BYTES) throw new Error("Файл больше 2 МБ — уменьшите снимок");
  const id = "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  await query(
    `INSERT INTO product_images (id, mime, body, bytes) VALUES ($1,$2,$3,$4)`,
    [id, mime, body, bytes]
  );
  return { id, mime, bytes };
}

// Отдать картинку по ссылке (публично, без токена).
async function getImage(id) {
  await ensureImages();
  id = String(id || "").trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(id)) return null;
  const r = await query(`SELECT mime, body FROM product_images WHERE id = $1`, [id]);
  return r.rows.length ? r.rows[0] : null;
}

module.exports = {
  ensureTable, listActive, listAll, save, remove, setActive, slugify,
  reorder, saveImage, getImage, listForPricing, autoSeed, restoreMissing, health, buildSizes,
};
