/* ════════════════════════════════════════════════════════
   wishlist.js — избранное PALOMA
   Подключать после script.js на всех страницах
   ════════════════════════════════════════════════════════ */
window.PalomaWishlist = (function () {
  "use strict";

  const KEY = "paloma_wishlist";
  /* Снимок данных товара (имя/цена/фон/slug) — чтобы выезжающая панель
     избранного рендерилась на любой странице, даже без catalog-data.js. */
  const META_KEY = "paloma_wishlist_meta";

  function load() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  }

  function save(ids) {
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* ignore */
    }
  }

  function loadMeta() {
    try {
      const m = JSON.parse(localStorage.getItem(META_KEY) || "{}");
      return m && typeof m === "object" ? m : {};
    } catch {
      return {};
    }
  }

  function saveMeta(map) {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  function setMeta(id, meta) {
    if (!meta) return;
    const map = loadMeta();
    map[String(id)] = {
      name: meta.name || "",
      price: Number(meta.price) || 0,
      bg: meta.bg || "",
      image: meta.image || "",
      slug: meta.slug || "",
      category: meta.category || "",
    };
    saveMeta(map);
  }

  function has(id) {
    return load().includes(String(id));
  }

  function add(id, meta) {
    const sid = String(id);
    const ids = load();
    if (!ids.includes(sid)) {
      ids.push(sid);
      save(ids);
      /* Цель: товар реально добавлен в избранное (только новый, не повтор). */
      if (window.palomaGoal) window.palomaGoal("favorite_add");
    }
    if (meta) setMeta(sid, meta);
    _notify(sid, true);
  }

  function remove(id) {
    const sid = String(id);
    const ids = load().filter((i) => i !== sid);
    save(ids);
    const map = loadMeta();
    if (map[sid]) {
      delete map[sid];
      saveMeta(map);
    }
    _notify(sid, false);
  }

  function toggle(id, meta) {
    if (has(id)) {
      remove(id);
      return false;
    }
    add(id, meta);
    return true;
  }

  function count() {
    return load().length;
  }

  function _setButtonState(btn, active) {
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.setAttribute(
      "aria-label",
      active ? "Убрать из избранного" : "Добавить в избранное",
    );
  }

  function updateCountBadge() {
    const n = count();
    document
      .querySelectorAll(
        "[data-wishlist-count], .wishlist-count, .header-wishlist-count, #wishlistCount",
      )
      .forEach((el) => {
        el.textContent = n > 9 ? "9+" : n > 0 ? String(n) : "";
        el.hidden = n === 0;
        el.setAttribute("aria-hidden", n === 0 ? "true" : "false");
        if (el.style) {
          el.style.display = n > 0 ? "flex" : "none";
        }
        el.setAttribute(
          "aria-label",
          n > 0 ? `${n} товаров в избранном` : "0 товаров в избранном",
        );
      });
    /* если открыта выезжающая панель — держим её в актуальном виде */
    if (document.getElementById("wishlistDrawer")?.classList.contains("is-open")) {
      renderDrawer();
    }
  }

  function syncButtons() {
    const ids = load();

    document
      .querySelectorAll("[data-wishlist-btn], .product-card__wishlist")
      .forEach((btn) => {
        const id =
          btn.dataset.wishlistBtn ||
          btn.dataset.productId ||
          btn.closest("[data-product-id]")?.dataset.productId ||
          btn.closest(".product-card")?.dataset.id;
        if (!id) return;
        _setButtonState(btn, ids.includes(String(id)));
      });

    const pdpBtn = document.getElementById("pdpWishlist");
    if (pdpBtn?.dataset.productId) {
      _setButtonState(pdpBtn, ids.includes(String(pdpBtn.dataset.productId)));
    }

    updateCountBadge();
  }

  function _notify(id, active) {
    document
      .querySelectorAll(
        `[data-wishlist-btn="${CSS.escape(id)}"], [data-product-id="${CSS.escape(id)}"]`,
      )
      .forEach((el) => {
        if (
          el.classList.contains("product-card__wishlist") ||
          el.hasAttribute("data-wishlist-btn") ||
          el.id === "pdpWishlist"
        ) {
          _setButtonState(el, active);
        }
      });

    const pdp = document.getElementById("pdpWishlist");
    if (pdp?.dataset.productId === String(id)) {
      _setButtonState(pdp, active);
    }

    updateCountBadge();
  }

  function injectButtons() {
    document.querySelectorAll(".product-card").forEach((card) => {
      const media = card.querySelector(".product-card__media");
      if (!media) return;
      if (media.querySelector("[data-wishlist-btn], .product-card__wishlist"))
        return;

      const id = String(
        card.dataset.id || card.dataset.productId || "",
      ).trim();
      if (!id) return;

      card.setAttribute("data-product-id", id);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "product-card__wishlist";
      btn.dataset.wishlistBtn = id;
      btn.dataset.productId = id;
      btn.setAttribute("aria-label", "Добавить в избранное");
      btn.setAttribute("aria-pressed", "false");
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.5-9.5-9C.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8-2.5 4.5-9.5 9-9.5 9z"/></svg>';
      media.appendChild(btn);
    });
    syncButtons();
  }

  function checkEmpty() {
    const grid = document.getElementById("wishlistGrid");
    const emptyEl = document.getElementById("wishlistEmpty");
    if (!grid || !emptyEl) return;

    const hasCards = grid.querySelectorAll(".product-card").length > 0;
    emptyEl.hidden = hasCards;
    grid.hidden = !hasCards;

    const countEl = document.getElementById("wishlistHeroCount");
    const remaining = grid.querySelectorAll(".product-card").length;
    if (countEl) {
      countEl.textContent = remaining
        ? plural(remaining, "товар", "товара", "товаров")
        : "";
    }
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
      return `${n} ${few}`;
    return `${n} ${many}`;
  }

  /* ── Снимок товара из DOM кнопки (карточка или PDP) ── */
  function _bgFromCard(card) {
    if (!card) return "";
    const main =
      card.querySelector(".product-card__image--main") ||
      card.querySelector(".product-card__img--main");
    if (!main) return "";
    const st = main.getAttribute("style") || "";
    const m = st.match(/background[^;]*:\s*([^;]+)/i);
    if (m) return m[1].trim();
    const cs = getComputedStyle(main).backgroundImage;
    return cs && cs !== "none" ? cs : "";
  }

  function _metaFromButton(btn, id) {
    /* PDP */
    if (btn.id === "pdpWishlist") {
      const nameEl = document.querySelector(".pdp-title, .product__title, h1");
      const priceEl = document.querySelector(
        "[data-pdp-price], .pdp-price, .product__price",
      );
      const price = priceEl
        ? parseInt(String(priceEl.textContent).replace(/[^\d]/g, ""), 10) || 0
        : 0;
      return {
        name: btn.dataset.productName || nameEl?.textContent?.trim() || "",
        price,
        slug:
          new URLSearchParams(location.search).get("slug") ||
          btn.dataset.slug ||
          id,
        bg: "",
        image: "",
      };
    }
    const card = btn.closest(".product-card");
    if (!card) return null;
    return {
      name: card.dataset.name || "",
      price: parseInt(card.dataset.price, 10) || 0,
      slug: card.dataset.slug || card.dataset.id || id,
      category: card.dataset.category || "",
      bg: _bgFromCard(card),
      image: "",
    };
  }

  /* ── Данные товара для рендера: каталог → иначе снимок ── */
  function _productView(id) {
    const sid = String(id);
    if (window.PALOMA_CATALOG?.getById) {
      const p = window.PALOMA_CATALOG.getById(sid);
      if (p) {
        return {
          id: sid,
          name: p.name || "Товар",
          price: Number(p.price) || 0,
          slug: p.slug || sid,
          bg: p.placeholderBg || "",
          image: p.image || "",
        };
      }
    }
    const meta = loadMeta()[sid];
    if (meta) {
      return {
        id: sid,
        name: meta.name || "Товар",
        price: Number(meta.price) || 0,
        slug: meta.slug || sid,
        bg: meta.bg || "",
        image: meta.image || "",
      };
    }
    return { id: sid, name: "Товар", price: 0, slug: sid, bg: "", image: "" };
  }

  function _escWl(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ════════════════ Выезжающая панель «Избранное» ════════════════ */
  function openDrawer() {
    const d = document.getElementById("wishlistDrawer");
    if (!d) {
      location.href = "wishlist.html";
      return;
    }
    renderDrawer();
    d.hidden = false;
    d.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => d.classList.add("is-open"));
    document.getElementById("wishlistDrawerClose")?.focus();
    document
      .getElementById("wishlistOpenBtn")
      ?.setAttribute("aria-expanded", "true");
  }

  function closeDrawer() {
    const d = document.getElementById("wishlistDrawer");
    if (!d) return;
    d.classList.remove("is-open");
    document.body.style.overflow = "";
    document
      .getElementById("wishlistOpenBtn")
      ?.setAttribute("aria-expanded", "false");
    setTimeout(() => {
      if (!d.classList.contains("is-open")) {
        d.hidden = true;
        d.setAttribute("aria-hidden", "true");
      }
    }, 400);
  }

  function _drawerItemHTML(p) {
    const bg = p.bg || "var(--color-bg-alt, #f3efe9)";
    const href = `product.html?slug=${encodeURIComponent(p.slug || p.id)}`;
    const img = p.image
      ? `<img src="${_escWl(p.image)}" alt="${_escWl(p.name)}" class="cart-drawer__item-img" loading="lazy" onerror="this.style.display='none'">`
      : "";
    return `
      <div class="cart-drawer__item wishlist-drawer__item" data-wl-item="${_escWl(p.id)}">
        <a class="cart-drawer__item-media" href="${_escWl(href)}"
           style="background:${_escWl(bg)}" aria-hidden="true">${img}</a>
        <div class="cart-drawer__item-info">
          <p class="cart-drawer__item-name"><a href="${_escWl(href)}">${_escWl(p.name)}</a></p>
          <p class="cart-drawer__item-size">${(p.price || 0).toLocaleString("ru-RU")} ₽</p>
          <button type="button" class="wishlist-drawer__incart"
                  data-wl-addcart="${_escWl(p.id)}">В корзину</button>
        </div>
        <div class="cart-drawer__item-price-col">
          <button type="button" class="cart-drawer__item-remove"
                  data-wl-remove="${_escWl(p.id)}"
                  aria-label="Убрать ${_escWl(p.name)} из избранного">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>`;
  }

  function renderDrawer() {
    const listEl = document.getElementById("wishlistDrawerList");
    const emptyEl = document.getElementById("wishlistDrawerEmpty");
    const bodyEl = document.getElementById("wishlistDrawerBody");
    if (!listEl) return;

    const items = load().map(_productView);

    if (!items.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (bodyEl) bodyEl.hidden = true;
      listEl.innerHTML = "";
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    if (bodyEl) bodyEl.hidden = false;
    listEl.innerHTML = items.map(_drawerItemHTML).join("");
  }

  function _bindDrawer() {
    const d = document.getElementById("wishlistDrawer");
    if (!d || d.dataset.bound) return;
    d.dataset.bound = "1";
    d.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-wl-remove]");
      if (rm) {
        remove(rm.dataset.wlRemove);
        renderDrawer();
        return;
      }
      const ac = e.target.closest("[data-wl-addcart]");
      if (ac) {
        const p = _productView(ac.dataset.wlAddcart);
        if (window.PalomaCart?.add) {
          window.PalomaCart.add({
            id: `${p.id}-quick-m-${p.price}`,
            name: p.name,
            price: p.price,
            qty: 1,
            size: "M",
            addons: [],
            bg: p.bg || "",
            slug: p.slug,
          });
          const prev = ac.textContent;
          ac.textContent = "✓ В корзине";
          ac.classList.add("is-done");
          setTimeout(() => {
            ac.textContent = prev;
            ac.classList.remove("is-done");
          }, 1400);
        }
        return;
      }
      if (e.target.closest("[data-wishlist-close]") || e.target === d) {
        closeDrawer();
      }
    });
  }

  function initClickDelegation() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(
        "[data-wishlist-btn], .product-card__wishlist, #pdpWishlist",
      );
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const id =
        btn.dataset.wishlistBtn ||
        btn.dataset.productId ||
        btn.closest("[data-product-id]")?.dataset.productId ||
        btn.closest(".product-card")?.dataset.id;

      if (!id) return;

      /* собираем снимок только при добавлении (когда товара ещё нет) */
      const meta = has(id) ? null : _metaFromButton(btn, id);
      const nowActive = toggle(id, meta);

      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        btn.style.transform = "scale(1.2)";
        window.setTimeout(() => {
          btn.style.transform = "";
        }, 200);
      }

      if (document.body.classList.contains("wishlist-page") && !nowActive) {
        const card = btn.closest(".product-card");
        if (card) {
          card.style.opacity = "0";
          card.style.transform = "scale(0.94)";
          card.style.transition =
            "opacity 0.35s ease, transform 0.35s ease";
          setTimeout(() => {
            card.remove();
            checkEmpty();
          }, 360);
        }
      }
    });
  }

  function _initDrawerControls() {
    _bindDrawer();
    document.addEventListener("click", (e) => {
      if (e.target.closest("#wishlistOpenBtn, [data-wishlist-open]")) {
        e.preventDefault();
        openDrawer();
        return;
      }
      if (e.target.closest("#wishlistDrawerClose, [data-wishlist-close]")) {
        closeDrawer();
        return;
      }
      if (e.target.id === "wishlistDrawerBackdrop") {
        closeDrawer();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });
  }

  function init() {
    initClickDelegation();
    _initDrawerControls();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        injectButtons();
        syncButtons();
        _bindDrawer();
      });
    } else {
      injectButtons();
      syncButtons();
      _bindDrawer();
    }
  }

  /* Алиасы для совместимости со script.js / catalog.js */
  const updateUi = syncButtons;

  return {
    load,
    save,
    has,
    add,
    remove,
    toggle,
    count,
    syncButtons,
    updateUi,
    updateCountBadge,
    injectButtons,
    checkEmpty,
    openDrawer,
    closeDrawer,
    open: openDrawer,
    close: closeDrawer,
    renderDrawer,
    init,
  };
})();

window.palomaInitWishlistIcons = window.PalomaWishlist.injectButtons;
window.PalomaWishlist.init();
