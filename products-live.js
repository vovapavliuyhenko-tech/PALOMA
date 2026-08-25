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
  var SEASON_KEY = "paloma:season-tabs";

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

  /* ── Праздничные вкладки ──────────────────────────────────────────────────
     Вкладка «1 сентября» в каталоге и в меню помечена data-season-tab и
     спрятана в разметке. Показываем её, только если в каталоге есть хоть один
     товар с этим разделом. Владелице достаточно поставить галочку в панели —
     вкладка появится сама, а когда праздник пройдёт и галочки снимут,
     исчезнет тоже сама. Править код для этого не нужно. */
  function syncSeasonTabs() {
    var tabs = document.querySelectorAll("[data-season-tab]");
    if (!tabs.length) return;
    var list = window.PALOMA_PRODUCTS || [];
    var live = [];

    Array.prototype.forEach.call(tabs, function (tab) {
      var cat = tab.getAttribute("data-season-tab");
      var has = false;
      for (var i = 0; i < list.length; i++) {
        var cats = list[i].categories;
        if (Array.isArray(cats) ? cats.indexOf(cat) >= 0 : cats === cat) { has = true; break; }
      }
      tab.hidden = !has;
      if (has && live.indexOf(cat) < 0) live.push(cat);
    });

    /* Ответ запоминаем: страницы без каталога (доставка, оплата, статьи) не
       качают ради одной вкладки весь список товаров — им хватит этой строки.
       Читает её script.js, он подключён везде. */
    try {
      if (list.length) localStorage.setItem(SEASON_KEY, live.join(","));
    } catch (e) { /* приватный режим */ }
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
  window.PALOMA_RERENDER.push(syncSeasonTabs);

  function start() {
    syncHomeShowcase(); // список из кэша уже применён — сверяем сразу
    syncSeasonTabs();
    refresh();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  window.PALOMA_PRODUCTS_REFRESH = refresh;
})();
