/* ════════════════════════════════════════════════════════
   build-sitemap.mjs — пересборка sitemap.xml из каталога

   Карту сайта раньше вели руками, поэтому она отставала: на
   26 июля в ней было 58 товаров, а в каталоге уже 130 — 72
   карточки поисковики просто не видели.

   Запуск из корня проекта:
     node tools/build-sitemap.mjs

   ЗАПУСКАТЬ ПОСЛЕ КАЖДОГО ДОБАВЛЕНИЯ ТОВАРОВ ИЛИ СТАТЕЙ.
   ════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SITE = "https://paloma.website";
const today = new Date().toISOString().slice(0, 10);

/* Данные сайта лежат как window.* — подставляем окружение браузера. */
globalThis.window = globalThis.window || {};
require("../paloma-products.js");
require("../blog-data.js");
const products = globalThis.window.PALOMA_PRODUCTS || [];
const blog = globalThis.window.PALOMA_BLOG || [];

/* Статические страницы. Служебные (корзина, оформление, админка,
   CRM) сюда намеренно не попадают — они закрыты в robots.txt. */
const STATIC = [
  ["", "daily", "1.0"],
  ["catalog.html", "daily", "0.9"],
  ["coffee.html", "weekly", "0.8"],
  ["coffee-item.html", "weekly", "0.6"],
  ["subscription.html", "monthly", "0.7"],
  ["event-decoration.html", "monthly", "0.7"],
  ["event-decoration-author.html", "monthly", "0.6"],
  ["events.html", "monthly", "0.7"],
  ["weddings.html", "monthly", "0.7"],
  ["wedding-piggy-bank.html", "monthly", "0.6"],
  ["gift-certificate.html", "monthly", "0.6"],
  ["care.html", "monthly", "0.6"],
  ["delivery.html", "monthly", "0.7"],
  ["contacts.html", "monthly", "0.7"],
  ["blog.html", "weekly", "0.7"],
  ["live.html", "monthly", "0.4"],
  ["payment.html", "yearly", "0.3"],
  ["offer.html", "yearly", "0.3"],
  ["privacy.html", "yearly", "0.3"],
  ["cookies.html", "yearly", "0.3"],
];

const urls = [];
const seen = new Set();

function add(path, changefreq, priority, lastmod = today) {
  const loc = SITE + "/" + path;
  if (seen.has(loc)) return;
  seen.add(loc);
  urls.push({ loc, lastmod, changefreq, priority });
}

for (const [path, cf, pr] of STATIC) add(path, cf, pr);

/* Товары — по slug, как их открывает product.js */
let skipped = 0;
for (const p of products) {
  const slug = p.slug || p.id;
  if (!slug) { skipped += 1; continue; }
  add("product.html?slug=" + encodeURIComponent(slug), "weekly", "0.8");
}

/* Статьи блога */
for (const a of blog) {
  if (!a.id) continue;
  add("blog-article.html?id=" + encodeURIComponent(a.id), "monthly", "0.6");
}

const esc = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls
    .map(
      (u) =>
        "  <url>\n" +
        `    <loc>${esc(u.loc)}</loc>\n` +
        `    <lastmod>${u.lastmod}</lastmod>\n` +
        `    <changefreq>${u.changefreq}</changefreq>\n` +
        `    <priority>${u.priority}</priority>\n` +
        "  </url>\n",
    )
    .join("") +
  "</urlset>\n";

writeFileSync(new URL("../sitemap.xml", import.meta.url), xml, "utf8");

console.log("sitemap.xml пересобран:");
console.log("  страниц всего:  " + urls.length);
console.log("  из них товаров: " + products.length);
console.log("  статей блога:   " + blog.length);
if (skipped) console.log("  ПРОПУЩЕНО без slug: " + skipped);
