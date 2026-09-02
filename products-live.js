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

  /* ── Витрина главной страницы ─────────────────────────────────────────────
     Раньше карточки в этом блоке были свёрстаны руками, и мы лишь сверяли у
     них цену и название с каталогом. Теперь блок умеет собираться из каталога
     сам: отметили товар галочкой в панели — он появился на главной.

     Если подборка пуста, блок остаётся прежним: свёрстанные карточки и
     заголовок «Онлайн-витрина». Пустая витрина на главной хуже старой. */
  var SHOWCASE_CAT = "online";
  var SHOWCASE_TITLE = "Онлайн-витрина";
  var SHOWCASE_LINK = "catalog.html?cat=" + SHOWCASE_CAT;
  var SHOWCASE_MAX = 12;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* Цена ровно по тому же правилу, что было в свёрстанной разметке:
     базовая цена товара, «от» — когда итог согласует менеджер. */
  function priceText(p) {
    return (p.priceFrom ? "от " : "") + Number(p.price || 0).toLocaleString("ru-RU") + " ₽";
  }

  function cardHtml(p) {
    var slug = encodeURIComponent(p.slug || p.id);
    var name = esc(p.name || "");
    var href = "product.html?slug=" + slug;
    return '<article class="home-product-card">' +
      '<a href="' + href + '" class="home-product-card__media" aria-label="Подробнее: ' + name + '">' +
        (p.image
          ? '<img src="' + esc(p.image) + '" alt="' + name +
            '" loading="lazy" decoding="async" width="600" height="870">'
          : "") +
      "</a>" +
      '<div class="home-product-card__body">' +
        '<h3 class="home-product-card__title"><a href="' + href + '">' + name + "</a></h3>" +
        '<p class="home-product-card__price">' + esc(priceText(p)) + "</p>" +
        '<div class="home-product-card__actions">' +
          '<a href="' + href + '" class="home-product-card__more" aria-label="' + name +
            ' — подробнее">Подробнее</a>' +
        "</div>" +
      "</div>" +
    "</article>";
  }

  function pickShowcase() {
    var list = window.PALOMA_PRODUCTS || [];
    var out = [];
    for (var i = 0; i < list.length && out.length < SHOWCASE_MAX; i++) {
      var cats = list[i].categories;
      var has = Array.isArray(cats) ? cats.indexOf(SHOWCASE_CAT) >= 0 : cats === SHOWCASE_CAT;
      if (has) out.push(list[i]);
    }
    return out;
  }

  /* Бесконечная прокрутка (paloma-carousel-autoscroll.js) работает на копиях
     карточек: дорожка = оригинал + копия. Обычно она клонирует уже наши
     карточки — мы отрисовываем их раньше. Но если товары приехали из базы
     позже, клонировать некому: её защёлка autoscrollInit уже стоит. Тогда
     копии делаем сами, иначе лента доедет до конца и дёрнется. */
  function cloneForLoop(track) {
    var cards = Array.prototype.slice.call(track.children);
    cards.forEach(function (card) {
      var clone = card.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.querySelectorAll("a, button, [tabindex]").forEach(function (el) {
        el.setAttribute("tabindex", "-1");
      });
      track.appendChild(clone);
    });
  }

  var showcaseFilled = false;

  function renderShowcase() {
    var section = document.getElementById("online-showcase");
    if (!section) return false;
    var track = section.querySelector("[data-carousel-track]");
    if (!track) return false;

    var picked = pickShowcase();
    if (!picked.length) return false;      // подборка пуста — оставляем как было
    if (showcaseFilled) return true;       // уже собрали, второй раз не трогаем

    var title = section.querySelector(".home-showcase__title");
    if (title) title.textContent = SHOWCASE_TITLE;
    var all = section.querySelector(".home-showcase__catalog-link");
    if (all) all.setAttribute("href", SHOWCASE_LINK);

    track.innerHTML = picked.map(cardHtml).join("");
    showcaseFilled = true;

    if (section.dataset.autoscrollInit === "1") cloneForLoop(track);
    /* Стрелки и полоса прогресса считают ширину дорожки — пересчитаем. */
    try { window.dispatchEvent(new Event("resize")); } catch (e) { /* ок */ }
    window.PalomaWishlist && window.PalomaWishlist.syncButtons &&
      window.PalomaWishlist.syncButtons();
    window.palomaRebindCursorHovers && window.palomaRebindCursorHovers();
    return true;
  }

  /* Запасной путь: подборка пуста, на главной остаются свёрстанные карточки.
     Цену, название и фото всё равно сверяем с каталогом, а пропавший товар
     прячем — карточка не должна вести на пустую страницу. */
  function syncHomeShowcase() {
    if (renderShowcase()) return;

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
        var txt = priceText(p);
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
