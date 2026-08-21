/* ════════════════════════════════════════════════════════
   products-live.js — товары каталога из базы.

   Подключать СРАЗУ ПОСЛЕ paloma-products.js на всех страницах, где есть товары.

   Как это работает:
   1. Встроенный файл paloma-products.js остаётся страховкой — если сеть или
      сервер молчат, сайт показывает ровно то, что показывал раньше.
   2. Из localStorage мгновенно (до первой отрисовки) подставляется последний
      известный список, поэтому изменения из админки видны без «прыжка».
   3. В фоне запрашивается свежий список; если он отличается — обновляем
      window.PALOMA_PRODUCTS на месте и просим страницы перерисоваться.

   Пустой ответ сервера НИКОГДА не затирает каталог: лучше старые товары,
   чем пустая витрина.
   ════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var API = "https://functions.yandexcloud.net/d4ek26aklvok10biu54h";
  var KEY = "paloma:products:v1";
  var CACHE_TTL = 24 * 60 * 60 * 1000; // сутки — дальше кэшу не верим

  /* Перерисовщики страниц. Каждая страница добавляет свой:
     (window.PALOMA_RERENDER = window.PALOMA_RERENDER || []).push(fn) */
  window.PALOMA_RERENDER = window.PALOMA_RERENDER || [];

  function same(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
  }

  /* Меняем массив НА МЕСТЕ: на него уже могли сохранить ссылку другие скрипты. */
  function apply(list) {
    if (!Array.isArray(list) || !list.length) return false;
    var cur = window.PALOMA_PRODUCTS;
    if (!Array.isArray(cur)) { window.PALOMA_PRODUCTS = list.slice(); return true; }
    if (same(cur, list)) return false;
    cur.length = 0;
    Array.prototype.push.apply(cur, list);
    return true;
  }

  /* ── Онлайн-витрина главной страницы ──────────────────────────────────────
     Карточки там свёрстаны руками (подборка редактируется в index.html), но
     цена, название и фото обязаны совпадать с каталогом, а удалённый товар
     не должен вести на пустую страницу. Поэтому карточки не перерисовываем,
     а сверяем с каталогом: расхождения правим, пропавшее прячем. */
  function syncHomeShowcase() {
    var cards = document.querySelectorAll(".home-product-card");
    if (!cards.length) return;
    var list = window.PALOMA_PRODUCTS || [];
    if (!list.length) return;
    var hidden = 0;

    Array.prototype.forEach.call(cards, function (card) {
      var link = card.querySelector('a[href*="slug="]');
      if (!link) return;
      var slug = (link.getAttribute("href").split("slug=")[1] || "").split("&")[0];
      try { slug = decodeURIComponent(slug); } catch (e) { /* оставляем как есть */ }
      if (!slug) return;

      var p = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].slug === slug || list[i].id === slug) { p = list[i]; break; }
      }

      if (!p) {                       // товар удалён или скрыт — убираем карточку
        card.style.display = "none";
        hidden++;
        return;
      }
      card.style.display = "";

      var title = card.querySelector(".home-product-card__title a") ||
                  card.querySelector(".home-product-card__title");
      if (title && p.name && title.textContent !== p.name) title.textContent = p.name;

      var price = card.querySelector(".home-product-card__price");
      if (price) {
        /* Ровно то же правило, что было в свёрстанной разметке: базовая цена,
           «от» — если итог согласует менеджер. */
        var txt = (p.priceFrom ? "от " : "") +
          Number(p.price || 0).toLocaleString("ru-RU") + " ₽";
        if (price.textContent.replace(/\s/g, "") !== txt.replace(/\s/g, "")) {
          price.textContent = txt;
        }
      }

      var img = card.querySelector("img");
      if (img && p.image && img.getAttribute("src") !== p.image) {
        img.setAttribute("src", p.image);
        if (p.name) img.setAttribute("alt", p.name);
      }
    });

    /* Карусель считает ширину дорожки — после скрытия карточек пересчитаем. */
    if (hidden) {
      try { window.dispatchEvent(new Event("resize")); } catch (e) { /* ок */ }
    }
  }

  function rerender() {
    (window.PALOMA_RERENDER || []).forEach(function (fn) {
      try { fn(); } catch (e) { /* одна сломанная страница не должна ломать остальные */ }
    });
    try {
      window.dispatchEvent(new CustomEvent("paloma:products-updated"));
    } catch (e) { /* старые браузеры */ }
  }

  /* ── 1. мгновенно: последний известный список ── */
  try {
    var raw = window.localStorage && localStorage.getItem(KEY);
    if (raw) {
      var box = JSON.parse(raw);
      if (box && box.at && Date.now() - box.at < CACHE_TTL) apply(box.products);
    }
  } catch (e) { /* приватный режим, переполненное хранилище */ }

  /* ── 2. в фоне: свежий список ── */
  function refresh() {
    if (typeof fetch !== "function") return;
    fetch(API + "?a=products", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.ok || !Array.isArray(d.products) || !d.products.length) return;
        try {
          localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), products: d.products }));
        } catch (e) { /* не влезло — не беда */ }
        if (apply(d.products)) rerender();
      })
      .catch(function () { /* нет сети — остаёмся на встроенном прайсе */ });
  }

  window.PALOMA_RERENDER.push(syncHomeShowcase);

  function start() {
    syncHomeShowcase(); // список из кэша уже применён — сверяем сразу
    refresh();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.PALOMA_PRODUCTS_REFRESH = refresh;
})();
