/* ════════════════════════════════════════════════════════
   products.js — каталог товаров в базе (Neon Postgres).

   Единый источник правды для сайта и (позже) для проверки цены при оплате.
   В одной строке хранится ВЕСЬ объект товара в поле data (JSONB) — той же
   формы, что и window.PALOMA_PRODUCTS на сайте. Поэтому фронту и бэку не нужно
   менять форму данных: публичный список отдаёт ровно такие же объекты.

   Таблица создаётся автоматически (ensureTable) и один раз заполняется из
   встроенного прайса (seedIfEmpty) — миграция без отдельных SQL-файлов.
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

// Разовое наполнение таблицы из встроенного прайса (только если она пуста).
async function seedIfEmpty(seedArr) {
  await ensureTable();
  const cnt = await query(`SELECT COUNT(*)::int AS n FROM products`);
  if (cnt.rows[0].n > 0) return { seeded: 0, skipped: true };
  let n = 0;
  for (let i = 0; i < seedArr.length; i++) {
    const p = seedArr[i];
    const id = String(p.id);
    const slug = p.slug || slugify(p.name);
    await query(
      `INSERT INTO products (id, slug, active, sort, data)
       VALUES ($1,$2,TRUE,$3,$4) ON CONFLICT (id) DO NOTHING`,
      [id, slug, i, JSON.stringify(p)]
    );
    n++;
  }
  return { seeded: n, skipped: false };
}

// Публичный список для сайта — только активные, в порядке сортировки.
async function listActive() {
  await ensureTable();
  const r = await query(
    `SELECT data FROM products WHERE active = TRUE ORDER BY sort ASC, id ASC`
  );
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

// Собрать безопасный объект товара из данных админки (базовые поля).
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
  // Дефолты для полей, которые пока не редактируются в базовой форме
  if (!out.sizes) out.sizes = [];
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

module.exports = {
  ensureTable, seedIfEmpty, listActive, listAll, save, remove, setActive, slugify,
};
