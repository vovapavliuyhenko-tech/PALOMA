/* ════════════════════════════════════════════════════════
   catalog.js — фильтрация и рендер каталога PALOMA
   Depends on: paloma-products.js, catalog-data.js, script.js
   ════════════════════════════════════════════════════════ */
(function initCatalog() {
  "use strict";

  const grid = document.getElementById("catalogGrid");
  const filters = document.getElementById("catalogFilters");
  const countEl = document.getElementById("catalogCount");
  const emptyEl = document.getElementById("catalogEmpty");
  const resetBtn = document.getElementById("catalogResetBtn");

  if (!grid || !window.PALOMA_CATALOG) return;

  let currentFilter = "all";

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

  function getRawProduct(id) {
    return (window.PALOMA_PRODUCTS || []).find((p) => p.id === id);
  }

  function badgeClass(label) {
    const map = {
      Хит: "product-card__badge--hit",
      HIT: "product-card__badge--hit",
      Сезон: "product-card__badge--season",
      SEASON: "product-card__badge--season",
      Новинка: "product-card__badge--new",
      NEW: "product-card__badge--new",
    };
    return map[label] || "product-card__badge--hit";
  }

  function renderCard(product) {
    const raw = getRawProduct(product.id);
    const categories = product.categories.join(" ");
    const badgeLabel = raw?.badge || product.badge;
    const badgeHtml = badgeLabel
      ? `<span class="product-card__badge ${badgeClass(badgeLabel)}">${esc(badgeLabel)}</span>`
      : "";
    const hoverBg = product.placeholderBgHover || product.placeholderBg;
    const wishIds = window.PalomaWishlist?.load?.() || [];
    const isWished = wishIds.includes(String(product.id));
    const slug = product.slug || product.id;

    let mediaContent = "";
    if (product.image) {
      mediaContent = `
        <img class="product-card__img product-card__img--main"
             src="${esc(product.image)}"
             alt="${esc(product.name)}"
             loading="lazy"
             onerror="this.style.display='none'">
        ${
          product.imageHover
            ? `<img class="product-card__img product-card__img--hover"
                    src="${esc(product.imageHover)}"
                    alt="" loading="lazy" aria-hidden="true">`
            : ""
        }
        <div class="product-card__ph"
             style="background:${esc(product.placeholderBg)};"
             aria-hidden="true"></div>`;
    } else {
      mediaContent = `
        <div class="product-card__ph"
             style="background:${esc(product.placeholderBg)};"
             aria-hidden="true"></div>
        <div class="product-card__ph product-card__ph--hover"
             style="background:${esc(hoverBg)};"
             aria-hidden="true"></div>`;
    }

    const article = document.createElement("article");
    article.className = "product-card";
    article.dataset.id = product.id;
    article.dataset.productId = product.id;
    article.dataset.name = product.name;
    article.dataset.price = String(product.price);
    if (product.priceFrom) article.dataset.priceFrom = "1";
    article.dataset.category = categories;
    article.dataset.composition = product.composition || "";
    article.dataset.desc = raw?.desc || product.desc || "";
    article.dataset.pairs = raw?.pairs || product.pairs || "";

    article.innerHTML = `
      <div class="product-card__media">
        ${mediaContent}
        <a href="product.html?slug=${encodeURIComponent(slug)}"
           class="product-card__media-link"
           aria-label="Перейти на страницу ${esc(product.name)}"
           tabindex="-1"
           aria-hidden="true"></a>
        ${badgeHtml}
        <button type="button"
                class="product-card__wishlist${isWished ? " is-active" : ""}"
                data-wishlist-btn="${esc(product.id)}"
                data-product-id="${esc(product.id)}"
                aria-label="${isWished ? "Убрать из избранного" : "Добавить в избранное"}"
                aria-pressed="${isWished}">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 21s-7-4.5-9.5-9C.5 8 3 4 7 4c2 0 3.5 1 5 3 1.5-2 3-3 5-3 4 0 6.5 4 4.5 8-2.5 4.5-9.5 9-9.5 9z"/>
          </svg>
        </button>
      </div>
      <div class="product-card__body">
        <a href="product.html?slug=${encodeURIComponent(slug)}"
           class="product-card__name-link">
          <h3 class="product-card__name">${esc(product.name)}</h3>
        </a>
        ${
          product.description
            ? `<p class="product-card__desc">${esc(product.description)}</p>`
            : ""
        }
        <p class="product-card__price">${product.priceFrom ? "от " : ""}${product.price.toLocaleString("ru-RU")} ₽</p>
        <div class="product-card__btns">
          <a href="product.html?slug=${encodeURIComponent(slug)}"
             class="product-card__btn product-card__btn--detail"
             aria-label="Подробнее о ${esc(product.name)}">
            Подробнее
          </a>
          <button type="button"
                  class="product-card__btn product-card__btn--cart"
                  data-add-to-cart
                  aria-label="Добавить ${esc(product.name)} в корзину">
            В корзину
          </button>
        </div>
      </div>
    `;

    return article;
  }

  function revealCards() {
    const cards = grid.querySelectorAll(".product-card");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cards.forEach((c) => c.classList.add("is-visible", "is-revealed"));
      return;
    }
    requestAnimationFrame(() => {
      cards.forEach((card, i) => {
        setTimeout(
          () => card.classList.add("is-visible", "is-revealed"),
          Math.min(i * 60, 480),
        );
      });
    });
  }

  function afterRender() {
    window.PalomaWishlist?.syncButtons?.();
    window.palomaRebindCursorHovers?.();
    revealCards();
  }

  function renderGrid(filter) {
    currentFilter = window.PALOMA_CATALOG.resolveFilter(filter);

    const products = window.PALOMA_CATALOG.getByCategory(currentFilter);
    grid.innerHTML = "";

    if (!products.length) {
      if (emptyEl) emptyEl.hidden = false;
      if (countEl) countEl.textContent = "";
      return;
    }

    if (emptyEl) emptyEl.hidden = true;

    if (countEl) {
      countEl.textContent = plural(
        products.length,
        "товар",
        "товара",
        "товаров",
      );
    }

    const fragment = document.createDocumentFragment();
    products.forEach((product) => {
      fragment.appendChild(renderCard(product));
    });
    grid.appendChild(fragment);
    afterRender();

    /* Ecommerce: показ списка товаров (impressions). Ограничиваем 20
       позициями — контейнер данных Метрики не должен превышать 8192 симв. */
    if (window.palomaEcommerce && window.palomaEcomProduct) {
      const listName = "Каталог: " + (currentFilter || "все");
      window.palomaEcommerce(
        "impressions",
        products.slice(0, 20).map((p, i) =>
          window.palomaEcomProduct(p, { list: listName, position: i + 1 }),
        ),
      );
    }
  }

  function setActiveFilter(filter) {
    const resolved = window.PALOMA_CATALOG.resolveFilter(filter);
    filters?.querySelectorAll(".catalog-filter-btn:not(a)").forEach((b) => {
      const btnCat = window.PALOMA_CATALOG.resolveFilter(
        b.dataset.filter || "all",
      );
      const isActive =
        btnCat === resolved ||
        (b.dataset.filter || "") === filter ||
        (b.dataset.filter || "") === resolved;
      b.classList.toggle("is-active", isActive);
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  if (filters) {
    filters.addEventListener("click", (e) => {
      const btn = e.target.closest(".catalog-filter-btn");
      if (!btn) return;
      if (btn.tagName === "A") return; // ссылка-пилюля (Свадебная копилка) — даём перейти

      const filter = btn.dataset.filter || "all";
      const resolved = window.PALOMA_CATALOG.resolveFilter(filter);
      if (resolved === currentFilter) return;

      setActiveFilter(filter);

      const url = new URL(window.location.href);
      if (filter === "all") {
        url.searchParams.delete("cat");
      } else {
        url.searchParams.set("cat", filter);
      }
      history.replaceState(null, "", url.toString());

      renderGrid(filter);
    });
  }

  resetBtn?.addEventListener("click", () => {
    filters?.querySelector('[data-filter="all"]')?.click();
  });

  grid.addEventListener("click", (e) => {
    const cartBtn = e.target.closest("[data-add-to-cart]");
    if (cartBtn) {
      e.stopPropagation();
      const card = cartBtn.closest(".product-card");
      if (!card || !window.PalomaCart) return;

      const rawCat = (card.dataset.category || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      /* реальное фото товара (для корзины), плейсхолдер-градиент как фон-запас */
      const imgEl =
        card.querySelector(".product-card__img--main") ||
        card.querySelector(".product-card__image--main");
      let image = "";
      if (imgEl && imgEl.tagName === "IMG") {
        image = imgEl.getAttribute("src") || imgEl.currentSrc || "";
      }
      const phEl = card.querySelector(".product-card__ph");
      const bg = phEl ? getComputedStyle(phEl).background : "";

      window.PalomaCart.add({
        id: card.dataset.id + "-quick-m-" + (card.dataset.price || "0"),
        name: card.dataset.name || "",
        size: "M",
        addons: [],
        price: parseInt(card.dataset.price, 10) || 0,
        qty: 1,
        image,
        bg,
        category: rawCat[0] || "",
      });

      const prev = cartBtn.textContent;
      cartBtn.textContent = "✓";
      cartBtn.disabled = true;
      setTimeout(() => {
        cartBtn.textContent = prev;
        cartBtn.disabled = false;
      }, 1200);
      return;
    }

    const card = e.target.closest(".product-card");
    if (!card) return;
    if (e.target.closest(".product-card__wishlist")) return;
    if (e.target.closest("[data-add-to-cart]")) return;
    if (e.target.closest(".btn")) return;
    if (e.target.closest("a")) return;

    const productId = card.dataset.id;
    if (productId) {
      const p = window.PALOMA_CATALOG?.getById(productId);
      const slug = p?.slug || productId;
      location.href = `product.html?slug=${encodeURIComponent(slug)}`;
    }
  });

  function initFromUrl() {
    const qp = new URLSearchParams(window.location.search);
    const cat = qp.get("cat") || "all";
    const resolved = window.PALOMA_CATALOG.resolveFilter(cat);

    const targetBtn =
      filters?.querySelector(`[data-filter="${cat}"]`) ||
      filters?.querySelector(`[data-filter="${resolved}"]`) ||
      (cat !== "all"
        ? [...(filters?.querySelectorAll(".catalog-filter-btn") || [])].find(
            (b) =>
              window.PALOMA_CATALOG.resolveFilter(b.dataset.filter || "") ===
              resolved,
          )
        : null);

    if (targetBtn && cat !== "all") {
      setActiveFilter(targetBtn.dataset.filter || cat);
    } else {
      setActiveFilter("all");
    }

    renderGrid(cat === "all" ? "all" : targetBtn?.dataset.filter || cat);
  }

  initFromUrl();
})();
