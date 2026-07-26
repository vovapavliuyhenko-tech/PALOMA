/* ════════════════════════════════════════════════════════
   cart-core.js — корзина PALOMA
   Подключать на всех страницах перед script.js
   ════════════════════════════════════════════════════════ */
window.PalomaCart = (function () {
  "use strict";

  const STORAGE_KEY = "paloma_cart_v3";
  const LEGACY_KEY = "paloma_cart_v1";

  /* ── Яндекс.Метрика: единый безопасный хелпер целей (счётчик 110912456) ──
     Вызываем ТОЛЬКО после реально успешного действия. Определён здесь, т.к.
     cart-core.js подключён почти на всех страницах; другие скрипты зовут его
     через window.palomaGoal && window.palomaGoal('...'). */
  function palomaGoal(name) {
    try {
      if (typeof window.ym === "function") window.ym(110912456, "reachGoal", name);
    } catch {
      /* цель не должна ломать основную логику */
    }
  }
  window.palomaGoal = palomaGoal;

  /* ── Яндекс.Метрика: электронная коммерция (ecommerce dataLayer) ──
     Счётчик инициализирован с ecommerce:"dataLayer" на всех страницах,
     поэтому Метрика читает изменения window.dataLayer. Пушим события
     detail / add / remove / purchase. Никогда не ломаем основную логику. */
  function ecomProduct(src, extra) {
    src = src || {};
    var p = {
      id: String(src.id != null ? src.id : src.slug || ""),
      name: src.name || "Товар",
      brand: "PALOMA",
    };
    var price = Number(src.price);
    if (!isNaN(price) && price > 0) p.price = price;
    var cat =
      src.category || (Array.isArray(src.categories) ? src.categories[0] : "");
    if (cat) p.category = String(cat);
    if (src.size) p.variant = String(src.size);
    if (extra) {
      for (var k in extra) {
        if (extra[k] != null) p[k] = extra[k];
      }
    }
    return p;
  }
  window.palomaEcomProduct = ecomProduct;

  function palomaEcommerce(actionType, products, actionField) {
    try {
      if (!actionType || !Array.isArray(products) || !products.length) return;
      window.dataLayer = window.dataLayer || [];
      var ecom = { currencyCode: "RUB" };
      if (actionType === "impressions") {
        /* impressions — прямой массив, без обёртки products/actionField */
        ecom.impressions = products;
      } else {
        var block = { products: products };
        if (actionField) block.actionField = actionField;
        ecom[actionType] = block;
      }
      window.dataLayer.push({ ecommerce: ecom });
    } catch {
      /* ecommerce не должен ломать основную логику */
    }
  }
  window.palomaEcommerce = palomaEcommerce;

  try {
    if (!localStorage.getItem(STORAGE_KEY) && localStorage.getItem(LEGACY_KEY)) {
      localStorage.setItem(STORAGE_KEY, localStorage.getItem(LEGACY_KEY));
    }
  } catch {
    /* ignore */
  }

  function getItems() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function saveItems(items) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* private mode / quota */
    }
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function calcTotal(items) {
    return (items || getItems()).reduce(
      (sum, i) => sum + (Number(i.price) || 0) * (i.qty || 1),
      0,
    );
  }

  function calcCount(items) {
    return (items || getItems()).reduce((sum, i) => sum + (i.qty || 1), 0);
  }

  function productHref(item) {
    const baseId = String(item.id).match(/^(c\d+)/i)?.[1] || item.id;
    const slug =
      item.slug ||
      (window.PALOMA_CATALOG?.getById?.(baseId)?.slug ?? null);
    if (slug) return `product.html?slug=${encodeURIComponent(slug)}`;
    if (baseId) return `product.html?id=${encodeURIComponent(baseId)}`;
    return "catalog.html";
  }

  function _dispatchUpdate() {
    document.dispatchEvent(new CustomEvent("paloma-cart-updated"));
  }

  function _updateBadge(items) {
    const count = calcCount(items);
    document
      .querySelectorAll(
        "[data-cart-count], .cart-count, #cartCount, .site-header__cart-count",
      )
      .forEach((el) => {
        el.textContent = count > 0 ? String(count) : "";
        el.style.display = count > 0 ? "flex" : "none";
        el.classList.toggle("is-empty", count === 0);
        el.toggleAttribute("hidden", count === 0);
        el.setAttribute("aria-hidden", count === 0 ? "true" : "false");
      });
    const openBtn = document.getElementById("cartOpenBtn");
    if (openBtn) {
      openBtn.setAttribute(
        "aria-label",
        count > 0 ? `Корзина, ${count} товаров` : "Корзина",
      );
    }
  }

  function _update() {
    const items = getItems();
    _updateBadge(items);
    _renderDrawer(items);
    if (document.body.classList.contains("cart-page")) {
      renderCartPage(items);
    }
    _dispatchUpdate();
  }

  function add(product) {
    const items = getItems();
    const id = String(product.id);
    const qtyAdd = product.qty || 1;
    const existing = items.find((i) => i.id === id);

    const clean = {
      id,
      name: product.name || "Товар",
      price: Number(product.price) || 0,
      qty: qtyAdd,
      size: product.size ?? "",
      bg: product.bg || "",
      image: product.image || "",
      category: product.category || "",
      addons: Array.isArray(product.addons)
        ? product.addons.filter(Boolean)
        : [],
    };
    if (product.slug) clean.slug = product.slug;
    if (product.type) clean.type = product.type;
    if (product.linkedTo) clean.linkedTo = product.linkedTo;

    if (existing) {
      existing.qty = (existing.qty || 1) + qtyAdd;
    } else {
      items.push(clean);
    }

    saveItems(items);
    _update();
    /* Цель: товар реально добавлен в корзину (после сохранения). */
    palomaGoal("add_to_cart");
    palomaEcommerce("add", [ecomProduct(clean, { quantity: qtyAdd })]);
    if (
      !document.body.classList.contains("cart-page") &&
      !document.body.classList.contains("checkout-page")
    ) {
      openDrawer();
    }
  }

  function removeById(id) {
    const sid = String(id);
    const gone = getItems().find((i) => i.id === sid);
    saveItems(getItems().filter((i) => i.id !== sid));
    _update();
    if (gone) {
      palomaEcommerce("remove", [
        ecomProduct(gone, { quantity: gone.qty || 1 }),
      ]);
    }
  }

  function remove(id) {
    removeById(id);
  }

  function bumpQtyById(id, delta) {
    const items = getItems();
    const item = items.find((i) => i.id === String(id));
    if (!item) return;
    const next = (item.qty || 1) + delta;
    if (next < 1) removeById(id);
    else {
      item.qty = next;
      saveItems(items);
      _update();
    }
  }

  function updateQty(id, _size, delta) {
    bumpQtyById(id, delta);
  }

  function setQty(id, _size, qty) {
    if (qty < 1) {
      removeById(id);
      return;
    }
    const items = getItems();
    const item = items.find((i) => i.id === String(id));
    if (!item) return;
    item.qty = qty;
    saveItems(items);
    _update();
  }

  function clear() {
    emptyCart();
  }

  function emptyCart() {
    saveItems([]);
    _update();
  }

  function reloadFromStorage() {
    _update();
  }

  function openDrawer() {
    const drawer = document.getElementById("cartDrawer");
    if (!drawer) return;
    drawer.hidden = false;
    drawer.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => drawer.classList.add("is-open"));
    document.getElementById("cartOpenBtn")?.setAttribute("aria-expanded", "true");
    document.getElementById("cartDrawerClose")?.focus();
  }

  function closeDrawer() {
    const drawer = document.getElementById("cartDrawer");
    if (!drawer) return;
    drawer.classList.remove("is-open");
    document.body.style.overflow = "";
    document.getElementById("cartOpenBtn")?.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      if (!drawer.classList.contains("is-open")) {
        drawer.hidden = true;
        drawer.setAttribute("aria-hidden", "true");
      }
    }, 400);
  }

  function _handleAction(btn) {
    const action = btn.dataset.cartAction;
    const id = btn.dataset.itemId;
    if (!id) return;
    if (action === "inc") bumpQtyById(id, 1);
    if (action === "dec") {
      const item = getItems().find((i) => i.id === id);
      if (item && (item.qty || 1) <= 1) removeById(id);
      else bumpQtyById(id, -1);
    }
    if (action === "remove") removeById(id);
  }

  function _bindListActions(listEl) {
    if (!listEl) return;
    listEl.querySelectorAll("[data-cart-action]").forEach((btn) => {
      btn.addEventListener("click", () => _handleAction(btn));
    });
  }

  function _resolveImage(item) {
    if (item.image) return item.image;
    /* запасной путь: тянем фото из каталога по базовому id (c12, c3-… → c12/c3) */
    const baseId = String(item.id || "").match(/^([a-z]?\d+)/i)?.[1];
    if (baseId && window.PALOMA_CATALOG?.getById) {
      const p = window.PALOMA_CATALOG.getById(baseId);
      if (p?.image) return p.image;
    }
    return "";
  }

  function _mediaHtml(item, imgClass) {
    const src = _resolveImage(item);
    if (src) {
      return `<img src="${esc(src)}" alt="${esc(item.name)}"
              class="${imgClass}" loading="lazy"
              onerror="this.style.display='none'">`;
    }
    return "";
  }

  function _metaLine(item) {
    const parts = [];
    if (item.size && item.size !== "—" && item.category !== "coffee") parts.push(esc(item.size));
    if (item.addons?.length) {
      parts.push(esc(item.addons.filter(Boolean).join(", ")));
    }
    return parts.join(" · ");
  }

  function _drawerItemHTML(item) {
    const id = esc(item.id);
    const qty = item.qty || 1;
    const lineTotal = (item.price * qty).toLocaleString("ru-RU");
    const meta = _metaLine(item);
    const bg = item.bg || "var(--color-bg-alt)";
    return `
      <div class="cart-drawer__item" data-item-id="${id}">
        <div class="cart-drawer__item-media"
             style="background:${esc(bg)}"
             aria-hidden="true">
          ${_mediaHtml(item, "cart-drawer__item-img")}
        </div>
        <div class="cart-drawer__item-info">
          <p class="cart-drawer__item-name">${esc(item.name)}</p>
          ${meta ? `<p class="cart-drawer__item-size">${meta}</p>` : ""}
          <div class="cart-drawer__item-qty" role="group" aria-label="Количество">
            <button type="button" class="cart-qty-btn"
                    data-cart-action="dec"
                    data-item-id="${id}"
                    aria-label="Уменьшить количество"
                    ${qty <= 1 ? "data-will-remove" : ""}>
              ${qty <= 1
                ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                     <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
                   </svg>`
                : "−"}
            </button>
            <span class="cart-qty-val" aria-live="polite">${qty}</span>
            <button type="button" class="cart-qty-btn"
                    data-cart-action="inc"
                    data-item-id="${id}"
                    aria-label="Увеличить количество">+</button>
          </div>
        </div>
        <div class="cart-drawer__item-price-col">
          <span class="cart-drawer__item-price">${lineTotal} ₽</span>
          <button type="button" class="cart-drawer__item-remove"
                  data-cart-action="remove"
                  data-item-id="${id}"
                  aria-label="Удалить ${esc(item.name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>`;
  }

  function _renderDrawer(items) {
    const listEl = document.getElementById("cartDrawerList");
    const totalEl = document.getElementById("cartDrawerTotal");
    const emptyEl = document.getElementById("cartDrawerEmpty");
    const bodyEl = document.getElementById("cartDrawerBody");

    if (!listEl && !document.getElementById("cartBody")) {
      _updateBadge(items);
      return;
    }

    /* Legacy drawer (#cartBody) */
    const legacyBody = document.getElementById("cartBody");
    if (legacyBody && !listEl) {
      _renderLegacyDrawer(items, legacyBody);
      return;
    }

    if (!listEl) return;

    if (!items.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (bodyEl) bodyEl.hidden = true;
      listEl.innerHTML = "";
      if (totalEl) totalEl.textContent = "0 ₽";
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (bodyEl) bodyEl.hidden = false;

    listEl.innerHTML = items.map((item) => _drawerItemHTML(item)).join("");
    _bindListActions(listEl);

    if (totalEl) {
      totalEl.textContent =
        calcTotal(items).toLocaleString("ru-RU") + " ₽";
    }
  }

  function _renderLegacyDrawer(items, bodyEl) {
    const emptyEl = document.getElementById("cartEmpty");
    const footerEl = document.getElementById("cartFooter");
    const subtotalEl = document.getElementById("cartSubtotal");
    const totalEl = document.getElementById("cartTotal");

    if (!items.length) {
      bodyEl.innerHTML = "";
      bodyEl.style.display = "none";
      footerEl?.classList.remove("is-visible");
      emptyEl?.classList.remove("is-hidden");
      if (subtotalEl) subtotalEl.textContent = "0 ₽";
      if (totalEl) totalEl.textContent = "0 ₽";
      return;
    }

    emptyEl?.classList.add("is-hidden");
    bodyEl.style.display = "block";
    footerEl?.classList.add("is-visible");

    bodyEl.innerHTML = items
      .map((item) => {
        const id = esc(item.id);
        const qty = item.qty || 1;
        const meta = _metaLine(item);
        return `
        <div class="cart-item" data-id="${id}">
          <div class="cart-item__img" style="background: ${item.bg || "var(--color-bg-alt)"};"></div>
          <div class="cart-item__info">
            <div class="cart-item__name">${esc(item.name)}</div>
            <div class="cart-item__meta">${meta || " "}</div>
            <div class="cart-item__bottom">
              <span class="cart-item__price">${(item.price * qty).toLocaleString("ru-RU")} ₽</span>
              <div class="cart-item__qty">
                <button type="button" class="quantity-btn" data-action="dec" data-cart-id="${id}" aria-label="Меньше">−</button>
                <span class="cart-item__qty-val">${qty}</span>
                <button type="button" class="quantity-btn" data-action="inc" data-cart-id="${id}" aria-label="Больше">+</button>
              </div>
            </div>
          </div>
          <button type="button" class="cart-item__remove" data-action="remove" data-cart-id="${id}" aria-label="Удалить">×</button>
        </div>`;
      })
      .join("");

    bodyEl.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const cid = btn.getAttribute("data-cart-id");
        if (!cid) return;
        if (btn.dataset.action === "inc") bumpQtyById(cid, 1);
        if (btn.dataset.action === "dec") bumpQtyById(cid, -1);
        if (btn.dataset.action === "remove") removeById(cid);
      });
    });

    const subtotal = calcTotal(items);
    const fmt = subtotal.toLocaleString("ru-RU") + " ₽";
    if (subtotalEl) subtotalEl.textContent = fmt;
    if (totalEl) totalEl.textContent = fmt;
  }

  function renderCartPage(items) {
    const listEl = document.getElementById("cartPageList");
    const totalEl = document.getElementById("cartPageTotal");
    const emptyEl = document.getElementById("cartPageEmpty");
    const contentEl = document.getElementById("cartPageContent");

    if (!listEl) return;

    items = items || getItems();

    if (!items.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (contentEl) contentEl.hidden = true;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    if (contentEl) contentEl.hidden = false;

    listEl.innerHTML = items.map((item) => _pageItemHTML(item)).join("");
    _bindListActions(listEl);

    const fmt = calcTotal(items).toLocaleString("ru-RU") + " ₽";
    if (totalEl) totalEl.textContent = fmt;
  }

  function _pageItemHTML(item) {
    const id = esc(item.id);
    const qty = item.qty || 1;
    const lineTotal = (item.price * qty).toLocaleString("ru-RU");
    const href = productHref(item);
    const meta = _metaLine(item);
    const bg = item.bg || "var(--color-bg-alt)";

    return `
      <div class="cart-page__item" data-item-id="${id}">
        <div class="cart-page__item-media"
             style="background:${esc(bg)}"
             aria-hidden="true">
          ${_mediaHtml(item, "cart-page__item-img")}
        </div>
        <div class="cart-page__item-info">
          <h3 class="cart-page__item-name">
            <a href="${esc(href)}">${esc(item.name)}</a>
          </h3>
          ${meta ? `<p class="cart-page__item-size">${meta}</p>` : ""}
          <p class="cart-page__item-unit-price">
            ${item.price.toLocaleString("ru-RU")} ₽ / шт.
          </p>
        </div>
        <div class="cart-page__item-qty" role="group" aria-label="Количество">
          <button type="button" class="cart-qty-btn"
                  data-cart-action="dec"
                  data-item-id="${id}"
                  aria-label="Уменьшить"
                  ${qty <= 1 ? "data-will-remove" : ""}>
            ${qty <= 1 ? "×" : "−"}
          </button>
          <span class="cart-qty-val" aria-live="polite">${qty}</span>
          <button type="button" class="cart-qty-btn"
                  data-cart-action="inc"
                  data-item-id="${id}"
                  aria-label="Увеличить">+</button>
        </div>
        <div class="cart-page__item-total">
          <span>${lineTotal} ₽</span>
          <button type="button" class="cart-page__item-remove"
                  data-cart-action="remove"
                  data-item-id="${id}"
                  aria-label="Удалить ${esc(item.name)}">
            Удалить
          </button>
        </div>
      </div>`;
  }

  function generateMessage(formData) {
    const d = formData || {};
    const list = getItems();
    const total = calcTotal(list);
    const lines = list.map((i) => {
      let line = `• ${i.name} × ${i.qty || 1} — ${(
        i.price * (i.qty || 1)
      ).toLocaleString("ru-RU")} ₽`;
      const bits = [];
      if (i.size && i.size !== "—" && i.category !== "coffee") bits.push(`размер ${i.size}`);
      if (i.addons?.length) bits.push(i.addons.filter(Boolean).join(", "));
      if (bits.length) line += ` (${bits.join("; ")})`;
      return line;
    });

    const delivMap = {
      pickup: "Самовывоз — Энгельса, 74",
      ask: "Уточнить у получателя",
      courier: "Курьером",
    };

    const payMap = {
      card: "Карта или СБП через ЮKassa",
      transfer: "Перевод после подтверждения",
      cash: "Наличные/карта при самовывозе",
      prepay: "Предоплата — свадебная флористика / оформление цветами",
    };

    const contactMap = {
      telegram: "Telegram",
      whatsapp: "WhatsApp",
      call: "Звонок",
      nocontact: "Не связываться без необходимости",
    };

    return [
      "🌸 Заказ PALOMA flowers coffee you",
      "",
      "📦 Состав:",
      lines.join("\n"),
      "",
      `💰 Итого: ${total.toLocaleString("ru-RU")} ₽`,
      "",
      `👤 Заказчик: ${d.name || "—"}`,
      `📞 Телефон: ${d.phone || "—"}`,
      d.telegram ? `✈️ Telegram: ${d.telegram}` : "",
      d.email ? `📧 Email: ${d.email}` : "",
      `💬 Связь: ${contactMap[d.contactMethod] || d.contactMethod || "—"}`,
      "",
      d.recipientName
        ? `🎁 Получатель: ${d.recipientName} ${d.recipientPhone || ""}`.trim()
        : "",
      "",
      `🚚 Доставка: ${delivMap[d.delivery] || d.delivery || "—"}`,
      d.delivery === "courier" && d.address ? `📍 Адрес: ${d.address}` : "",
      d.delivery === "courier" && d.date ? `📅 Дата: ${d.date}` : "",
      d.delivery === "courier" && d.interval
        ? `🕐 Интервал: ${d.interval}`
        : "",
      "",
      `💳 Оплата: ${payMap[d.payment] || d.payment || "—"}`,
      d.cardText ? `💌 Открытка: ${d.cardText}` : "",
      d.comment ? `📝 Комментарий: ${d.comment}` : "",
    ]
      .filter((l) => l !== "")
      .join("\n");
  }

  function _linkCheckoutButtons() {
    document.querySelectorAll(".cart-drawer__checkout").forEach((el) => {
      if (el.tagName === "A" && el.getAttribute("href") === "cart.html") {
        el.setAttribute("href", "checkout.html");
      }
    });
  }

  function init() {
    _linkCheckoutButtons();

    document.addEventListener("click", (e) => {
      if (e.target.closest("#cartOpenBtn, [data-cart-open]")) {
        e.preventDefault();
        if (!document.body.classList.contains("cart-page")) {
          openDrawer();
        }
      }
      if (e.target.closest("#cartDrawerClose, [data-cart-close]")) {
        closeDrawer();
      }
      if (e.target.id === "cartDrawerBackdrop") {
        closeDrawer();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });

    _update();
  }

  const api = {
    add,
    remove,
    removeById,
    updateQty,
    setQty,
    clear,
    emptyCart,
    getItems,
    calcTotal,
    calcCount,
    openDrawer,
    closeDrawer,
    open: openDrawer,
    close: closeDrawer,
    renderCartPage,
    reloadFromStorage,
    bumpQtyById,
    generateMessage,
    render: _update,
    init,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return api;
})();
