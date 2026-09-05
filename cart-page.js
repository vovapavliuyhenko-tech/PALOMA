/* ════════════════════════════════════════════════════════
   cart-page.js — доп. логика страницы cart.html
   ════════════════════════════════════════════════════════ */
(function initCartPage() {
  "use strict";

  if (!document.body.classList.contains("cart-page")) return;

  const ADDONS = [
    {
      id: "addon-coffee",
      name: "Кофе к букету",
      price: 250,
      bg: "linear-gradient(135deg,#5c3d28,#8a6248)",
      image: "images/paloma/catalog/upsell-coffee.jpg",
      category: "coffee",
    },
    {
      id: "addon-dessert",
      name: "Десерт из витрины",
      price: 320,
      bg: "linear-gradient(135deg,#c4a882,#8a6248)",
      image: "images/paloma/catalog/upsell-dessert.jpg",
      category: "coffee",
    },
    {
      id: "addon-card",
      name: "Открытка",
      price: 150,
      bg: "linear-gradient(135deg,#d4bcc8,#8a5858)",
      image: "images/paloma/included/card.jpg",
      category: "vases",
    },
    {
      id: "addon-vase",
      name: "Ваза",
      price: 980,
      bg: "linear-gradient(135deg,#e0d8cc,#9c8870)",
      image: "images/paloma/catalog/upsell-vase.jpg",
      category: "vases",
    },
    {
      id: "addon-packaging",
      name: "Подарочная упаковка",
      price: 200,
      bg: "linear-gradient(135deg,#d4c8b8,#8a7860)",
      image: "",
      category: "vases",
    },
  ];

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function plural(n, one, few, many) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) {
      return `${n} ${few}`;
    }
    return `${n} ${many}`;
  }

  function renderAddons() {
    const grid = document.getElementById("cartAddonsGrid");
    if (!grid) return;

    ADDONS.forEach((addon) => {
      const card = document.createElement("div");
      card.className = "cart-addon-card";
      card.dataset.productId = addon.id;
      card.dataset.productName = addon.name;
      card.dataset.productPrice = String(addon.price);
      card.dataset.productBg = addon.bg;
      card.dataset.productCat = addon.category;

      card.innerHTML = `
        <div class="cart-addon-card__media"
             style="background:${esc(addon.bg)}" aria-hidden="true">
          ${
            addon.image
              ? `<img src="${esc(addon.image)}" alt="${esc(addon.name)}"
                    loading="lazy" class="cart-addon-card__img"
                    onerror="this.style.display='none'">`
              : ""
          }
        </div>
        <div class="cart-addon-card__body">
          <p class="cart-addon-card__name">${esc(addon.name)}</p>
          <p class="cart-addon-card__price">
            ${addon.price.toLocaleString("ru-RU")} ₽
          </p>
          <button type="button" class="cart-addon-card__btn"
                  data-add-to-cart
                  aria-label="Добавить ${esc(addon.name)} к заказу">
            Добавить
          </button>
        </div>`;
      grid.appendChild(card);
    });

    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-add-to-cart]");
      if (!btn || !window.PalomaCart) return;
      const card = btn.closest("[data-product-id]");
      if (!card) return;

      window.PalomaCart.add({
        id: card.dataset.productId,
        name: card.dataset.productName,
        price: parseInt(card.dataset.productPrice, 10) || 0,
        qty: 1,
        bg: card.dataset.productBg || "",
        image: card.querySelector("img")?.src || "",
        category: card.dataset.productCat || "",
      });

      const orig = btn.textContent;
      btn.textContent = "✓";
      btn.disabled = true;
      setTimeout(() => {
        btn.textContent = orig;
        btn.disabled = false;
      }, 1200);
    });
  }

  function updateCartPageMeta() {
    if (!window.PalomaCart) return;
    const items = window.PalomaCart.getItems();
    const count = window.PalomaCart.calcCount(items);
    const subtotal = window.PalomaCart.calcTotal(items);

    const countEl = document.getElementById("cartPageCount");
    const subtotalEl = document.getElementById("cartPageSubtotal");
    const totalEl = document.getElementById("cartPageTotal");

    if (countEl) {
      countEl.textContent = plural(count, "товар", "товара", "товаров");
    }
    const fmt = subtotal.toLocaleString("ru-RU") + " ₽";
    if (subtotalEl) subtotalEl.textContent = fmt;
    if (totalEl) totalEl.textContent = fmt;
  }

  renderAddons();
  document.addEventListener("paloma-cart-updated", updateCartPageMeta);

  if (window.PalomaCart) {
    window.PalomaCart.renderCartPage(window.PalomaCart.getItems());
    updateCartPageMeta();
  }
})();
