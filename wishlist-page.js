/* ════════════════════════════════════════════════════════
   wishlist-page.js — рендер страницы избранного
   Depends on: paloma-products.js, catalog-data.js, wishlist.js
   ════════════════════════════════════════════════════════ */
(function initWishlistPage() {
  "use strict";

  if (!document.body.classList.contains("wishlist-page")) return;

  const grid = document.getElementById("wishlistGrid");
  const emptyEl = document.getElementById("wishlistEmpty");
  const countEl = document.getElementById("wishlistHeroCount");

  if (!grid) return;

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function plural(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
      return `${n} ${few}`;
    return `${n} ${many}`;
  }

  function getProductView(id) {
    if (window.PALOMA_CATALOG) {
      const norm = window.PALOMA_CATALOG.getById(id);
      if (norm) return norm;
    }
    const raw = (window.PALOMA_PRODUCTS || []).find((p) => p.id === id);
    if (!raw) return null;
    const pg = raw.placeholderGradient || {};
    return {
      id: raw.id,
      name: raw.name,
      slug: raw.slug || id,
      price: raw.price,
      category: raw.categories?.[0] || "",
      description: raw.composition || "",
      placeholderBg: pg.main || "",
      placeholderBgHover: pg.hover || null,
      badge: raw.badge || null,
    };
  }

  function renderCard(product) {
    const hoverBg = product.placeholderBgHover || product.placeholderBg;
    const badgeHtml = product.badge
      ? `<span class="product-card__badge">${esc(product.badge)}</span>`
      : "";

    const article = document.createElement("article");
    article.className = "product-card";
    article.dataset.id = product.id;
    article.dataset.productId = product.id;
    article.dataset.name = product.name;
    article.dataset.price = String(product.price);
    article.dataset.category = product.category || "";

    article.innerHTML = `
      <div class="product-card__media">
        <div class="product-card__image product-card__image--main"
             style="background:${esc(product.placeholderBg)};"></div>
        <div class="product-card__image product-card__image--hover"
             style="background:${esc(hoverBg)};"></div>
        ${badgeHtml}
        <button type="button"
                class="product-card__wishlist is-active"
                data-wishlist-btn="${esc(product.id)}"
                data-product-id="${esc(product.id)}"
                aria-label="Убрать из избранного"
                aria-pressed="true">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s-7-4.5-9.5-9C.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8-2.5 4.5-9.5 9-9.5 9z"/>
          </svg>
        </button>
      </div>
      <div class="product-card__body">
        <h3 class="product-card__title">${esc(product.name)}</h3>
        ${
          product.description
            ? `<p class="product-card__desc">${esc(product.description)}</p>`
            : ""
        }
        <div class="product-card__footer">
          <span class="product-card__price">${product.price.toLocaleString("ru-RU")} ₽</span>
        </div>
        <div class="product-card__actions">
          <a href="product.html?slug=${encodeURIComponent(product.slug || product.id)}"
             class="btn btn--light">Подробнее</a>
          <button type="button" class="btn btn--dark" data-add-to-cart>В корзину</button>
        </div>
      </div>
    `;

    const cartBtn = article.querySelector("[data-add-to-cart]");
    cartBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const item = {
        id: `${product.id}-quick-m-${product.price}`,
        name: product.name,
        price: product.price,
        qty: 1,
        size: "M",
        addons: [],
        bg: product.placeholderBg || "",
        category: product.category || "",
      };

      if (window.PalomaCart?.add) {
        window.PalomaCart.add(item);
      } else {
        cartFallback(item);
      }

      const prev = cartBtn.textContent;
      cartBtn.textContent = "✓";
      setTimeout(() => {
        cartBtn.textContent = prev;
      }, 1400);
    });

    article.addEventListener("click", (ev) => {
      if (ev.target.closest(".product-card__wishlist")) return;
      if (ev.target.closest("[data-add-to-cart]")) return;
      if (ev.target.closest(".btn")) return;
      if (ev.target.closest("a")) return;
      location.href = `product.html?slug=${encodeURIComponent(product.slug || product.id)}`;
    });

    return article;
  }

  function cartFallback(item) {
    const KEY = "paloma_cart_v3";
    let items = [];
    try {
      items = JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      items = [];
    }
    const ex = items.find((i) => i.id === item.id);
    if (ex) ex.qty = (ex.qty || 1) + 1;
    else items.push(item);
    localStorage.setItem(KEY, JSON.stringify(items));
    const count = items.reduce((s, i) => s + (i.qty || 1), 0);
    document.querySelectorAll(".site-header__cart-count").forEach((el) => {
      el.textContent = count > 0 ? String(count) : "0";
      el.classList.toggle("is-empty", count === 0);
    });
  }

  function render() {
    const ids = window.PalomaWishlist?.load() || [];
    const wished = ids.map(getProductView).filter(Boolean);

    if (countEl) {
      countEl.textContent = wished.length
        ? plural(wished.length, "товар", "товара", "товаров")
        : "";
    }

    if (!wished.length) {
      grid.hidden = true;
      grid.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    if (emptyEl) emptyEl.hidden = true;
    grid.hidden = false;
    grid.innerHTML = "";

    wished.forEach((product, i) => {
      const card = renderCard(product);
      card.style.transitionDelay = `${Math.min(i * 50, 400)}ms`;
      grid.appendChild(card);
    });

    requestAnimationFrame(() => {
      grid.querySelectorAll(".product-card").forEach((c) => {
        c.classList.add("is-revealed");
      });
    });

    window.PalomaWishlist?.syncButtons?.();
  }

  if (window.PalomaWishlist) {
    const origCheck = window.PalomaWishlist.checkEmpty;
    window.PalomaWishlist.checkEmpty = function () {
      origCheck();
      const remaining = grid.querySelectorAll(".product-card").length;
      if (countEl) {
        countEl.textContent = remaining
          ? plural(remaining, "товар", "товара", "товаров")
          : "";
      }
    };
  }

  render();

  /* Каталог обновился из базы (products-live.js) — перечитываем товары. */
  (window.PALOMA_RERENDER = window.PALOMA_RERENDER || []).push(render);

  window.addEventListener("storage", (e) => {
    if (e.key === "paloma_wishlist") render();
  });
})();
