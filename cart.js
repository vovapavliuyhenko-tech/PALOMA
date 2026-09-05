/* ════════════════════════════════════════════════════════
   cart.js — корзина + checkout PALOMA (cart.html)
   ════════════════════════════════════════════════════════ */
(function initCartCheckout() {
  "use strict";

  const form = document.getElementById("cartCheckoutForm");
  const cartEmpty = document.getElementById("cartEmpty");
  const cartContent = document.getElementById("cartContent");
  const summaryItems = document.getElementById("cartSummaryItems");
  const summarySubtotal = document.getElementById("cartSummarySubtotal");
  const summaryTotal = document.getElementById("cartSummaryTotal");
  const addonsList = document.getElementById("cartAddonsList");
  const deliveryRadios = form?.querySelectorAll('[name="delivery"]');
  const deliveryFields = document.getElementById("deliveryFields");
  const loadingEl = document.getElementById("cartCheckoutLoading");
  const loadingText = document.getElementById("cartCheckoutLoadingText");
  const failedBanner = document.getElementById("paymentFailedBanner");
  const failedClose = document.getElementById("paymentFailedClose");
  const cardTextArea = document.getElementById("cf-card-text");
  const cardTextCount = document.getElementById("cardTextCount");

  if (!form || !cartEmpty || !cartContent) return;

  const CFG = window.PALOMA_PAYMENT_CONFIG || {
    TEST_MODE: true,
    PAYMENT_ENDPOINT: "/api/create-payment",
    RETURN_URL_SUCCESS: "thank-you.html",
    RETURN_URL_FAIL: "cart.html?payment=failed",
    WHATSAPP_NUMBER: "79897707000",
    TELEGRAM_HANDLE: "paloma_novorossiysk",
    CITY: "Новороссийск",
    ADDRESS: "ул. Энгельса, 74",
  };

  const CART_KEY = "paloma_cart_v3";
  const cartApi = window.PalomaCart;

  const ADDONS = [
    {
      id: "addon-coffee",
      name: "Кофе",
      price: 250,
      bg: "linear-gradient(135deg,#5c3d28,#8a6248)",
      image: "images/paloma/catalog/upsell-coffee.jpg",
      category: "coffee",
    },
    {
      id: "addon-dessert",
      name: "Десерт",
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
  ];

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getItems() {
    return cartApi ? cartApi.getItems() : [];
  }

  function calcTotal(items) {
    return cartApi
      ? cartApi.calcTotal(items)
      : items.reduce((s, i) => s + i.price * (i.qty || 1), 0);
  }

  function syncDeliveryFieldsVisibility() {
    const sel = form.querySelector('[name="delivery"]:checked');
    const isCourier = sel?.value === "courier";
    if (deliveryFields) deliveryFields.hidden = !isCourier;
    const addr = document.getElementById("cf-address");
    if (addr) addr.required = isCourier;
  }

  deliveryRadios?.forEach((radio) => {
    radio.addEventListener("change", syncDeliveryFieldsVisibility);
  });

  function renderAddons() {
    if (!addonsList) return;

    addonsList.innerHTML = ADDONS.map(
      (a) => `
      <div class="cart-addon-card" data-addon-id="${esc(a.id)}">
        <div class="cart-addon-card__img" style="background:${esc(a.bg)};">
          ${
            a.image
              ? `<img src="${esc(a.image)}" alt="${esc(a.name)}" loading="lazy"
                    class="cart-addon-card__photo"
                    onerror="this.style.display='none'">`
              : ""
          }
        </div>
        <div class="cart-addon-card__name">${esc(a.name)}</div>
        <div class="cart-addon-card__price">${a.price.toLocaleString("ru-RU")} ₽</div>
        <button type="button" class="cart-addon-card__add" data-addon-id="${esc(a.id)}">
          Добавить
        </button>
      </div>`,
    ).join("");

    addonsList.querySelectorAll("[data-addon-id].cart-addon-card__add").forEach((btn) => {
      btn.addEventListener("click", () => {
        const addon = ADDONS.find((x) => x.id === btn.dataset.addonId);
        if (!addon || !cartApi) return;
        cartApi.add({
          id: addon.id,
          name: addon.name,
          price: addon.price,
          qty: 1,
          bg: addon.bg,
          image: addon.image,
          category: addon.category,
        });
        const orig = btn.textContent;
        btn.textContent = "✓";
        btn.disabled = true;
        setTimeout(() => {
          btn.textContent = orig;
          btn.disabled = false;
        }, 1200);
        refresh();
      });
    });
  }

  function refresh() {
    cartApi?.reloadFromStorage?.();
    const items = getItems();

    if (!items.length) {
      cartEmpty.hidden = false;
      cartContent.hidden = true;
      return;
    }

    cartEmpty.hidden = true;
    cartContent.hidden = false;

    if (!summaryItems || !summaryTotal) return;

    summaryItems.innerHTML = items
      .map((item) => {
        const meta = [];
        if (item.size && item.size !== "—" && item.category !== "coffee") meta.push(`Размер ${item.size}`);
        if (item.addons?.length) meta.push(item.addons.filter(Boolean).join(", "));
        const metaStr = meta.filter(Boolean).join(" · ");
        const mediaStyle = item.bg
          ? `background:${esc(item.bg)};`
          : "background:var(--color-bg-alt);";
        const imgHtml = item.image
          ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" class="cart-summary-item__photo" loading="lazy" onerror="this.style.display='none'">`
          : "";

        return `
      <div class="cart-summary-item" data-id="${esc(item.id)}">
        <div class="cart-summary-item__img" style="${mediaStyle}">${imgHtml}</div>
        <div class="cart-summary-item__info">
          <div class="cart-summary-item__name">${esc(item.name)}</div>
          <div class="cart-summary-item__qty">
            <button type="button" class="cart-qty-btn" data-cart-qty="${esc(item.id)}" data-delta="-1" aria-label="Уменьшить">−</button>
            <span class="cart-qty-val">${item.qty || 1}</span>
            <button type="button" class="cart-qty-btn" data-cart-qty="${esc(item.id)}" data-delta="1" aria-label="Увеличить">+</button>
          </div>
          ${metaStr ? `<div class="cart-summary-item__meta">${esc(metaStr)}</div>` : ""}
        </div>
        <div class="cart-summary-item__price-col">
          <span class="cart-summary-item__price">${(item.price * (item.qty || 1)).toLocaleString("ru-RU")} ₽</span>
          <button type="button" class="cart-summary-item__remove" data-cart-remove="${esc(item.id)}">Удалить</button>
        </div>
      </div>`;
      })
      .join("");

    summaryItems.querySelectorAll("[data-cart-qty]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-cart-qty");
        const delta = parseInt(btn.getAttribute("data-delta"), 10) || 0;
        cartApi?.bumpQtyById?.(id, delta);
        refresh();
      });
    });

    summaryItems.querySelectorAll("[data-cart-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        cartApi?.removeById?.(btn.getAttribute("data-cart-remove"));
        refresh();
      });
    });

    const fmt = calcTotal(items).toLocaleString("ru-RU") + " ₽";
    if (summarySubtotal) summarySubtotal.textContent = fmt;
    summaryTotal.textContent = fmt;
    syncDeliveryFieldsVisibility();
    window.palomaRebindCursorHovers?.();
  }

  function initDateMin() {
    const dateInput = document.getElementById("cf-date");
    if (dateInput) {
      dateInput.min = new Date().toISOString().split("T")[0];
    }
  }

  function initCardTextCounter() {
    if (!cardTextArea || !cardTextCount) return;
    cardTextArea.addEventListener("input", () => {
      cardTextCount.textContent = String(cardTextArea.value.length);
    });
  }

  function initPaymentFailedBanner() {
    if (!failedBanner || !failedClose) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "failed") {
      failedBanner.hidden = false;
    }
    failedClose.addEventListener("click", () => {
      failedBanner.hidden = true;
    });
  }

  function initFieldClearOnInput() {
    form.querySelectorAll(".cart-field__input, .cart-field__textarea, .cart-field__select").forEach((input) => {
      input.addEventListener("input", () => {
        input.classList.remove("is-error");
        const errEl = document.getElementById(input.id + "-error");
        if (errEl) errEl.hidden = true;
      });
      input.addEventListener("change", () => {
        input.classList.remove("is-error");
        const errEl = document.getElementById(input.id + "-error");
        if (errEl) errEl.hidden = true;
      });
    });
  }

  const FIELD_RULES = [
    {
      id: "cf-name",
      errorId: "cf-name-error",
      validate: (v) => v.trim().length >= 2,
      message: "Укажите имя (минимум 2 символа)",
    },
    {
      id: "cf-phone",
      errorId: "cf-phone-error",
      validate: (v) => /^[\d\s+\-()]{10,}$/.test(v.trim()),
      message: "Укажите корректный телефон",
    },
    {
      id: "cf-date",
      errorId: "cf-date-error",
      validate: (v) => Boolean(v),
      message: "Выберите дату",
    },
  ];

  function validate() {
    let valid = true;

    FIELD_RULES.forEach((rule) => {
      const input = document.getElementById(rule.id);
      const errEl = document.getElementById(rule.errorId);
      if (!input) return;
      const ok = rule.validate(input.value);
      input.classList.toggle("is-error", !ok);
      if (errEl) {
        errEl.hidden = ok;
        if (!ok) errEl.textContent = rule.message;
      }
      if (!ok) valid = false;
    });

    const delivery = form.querySelector('[name="delivery"]:checked');
    const deliveryErr = document.getElementById("delivery-error");
    if (!delivery) {
      if (deliveryErr) {
        deliveryErr.hidden = false;
        deliveryErr.textContent = "Выберите способ получения";
      }
      valid = false;
    } else if (deliveryErr) {
      deliveryErr.hidden = true;

      if (delivery.value === "courier") {
        const addr = document.getElementById("cf-address");
        const addrErr = document.getElementById("cf-address-error");
        const addrOk = addr && addr.value.trim().length >= 5;
        addr?.classList.toggle("is-error", !addrOk);
        if (addrErr) addrErr.hidden = !!addrOk;
        if (!addrOk) valid = false;
      }
    }

    const intervalEl = document.getElementById("cf-interval");
    const intervalErr = document.getElementById("cf-interval-error");
    const needsInterval = delivery?.value === "courier";
    const intervalOk = !needsInterval || (intervalEl && intervalEl.value.trim().length > 0);
    intervalEl?.classList.toggle("is-error", needsInterval && !intervalOk);
    if (intervalErr) {
      intervalErr.hidden = intervalOk;
      if (!intervalOk) intervalErr.textContent = "Выберите интервал доставки";
    }
    if (!intervalOk) valid = false;

    const payment = form.querySelector('[name="payment"]:checked');
    const paymentErr = document.getElementById("payment-error");
    if (!payment) {
      if (paymentErr) {
        paymentErr.hidden = false;
        paymentErr.textContent = "Выберите способ оплаты";
      }
      valid = false;
    } else if (paymentErr) {
      paymentErr.hidden = true;
    }

    return valid;
  }

  function scrollToFirstError() {
    const firstError = form.querySelector(
      ".is-error, .cart-field__error:not([hidden])",
    );
    firstError
      ?.closest(".cart-section, .cart-field")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function collectOrder() {
    const g = (id) => document.getElementById(id)?.value?.trim() || "";
    const r = (name) => form.querySelector(`[name="${name}"]:checked`)?.value || "";
    const items = getItems();
    const total = calcTotal(items);

    return {
      orderId: _generateOrderId(),
      createdAt: new Date().toISOString(),
      status: "pending",
      customer: {
        name: g("cf-name"),
        phone: g("cf-phone"),
        email: g("cf-email"),
        messenger: g("cf-messenger"),
        contactMethod: r("contact_method"),
      },
      recipient: {
        name: g("cf-rec-name"),
        phone: g("cf-rec-phone"),
      },
      delivery: {
        method: r("delivery"),
        address: g("cf-address"),
        courierComment: g("cf-courier-note"),
        date: g("cf-date"),
        interval: document.getElementById("cf-interval")?.value || "",
      },
      cardText: g("cf-card-text"),
      comment: g("cf-comment"),
      paymentMethod: r("payment"),
      items: items.map((i) => ({ ...i })),
      total,
      city: CFG.CITY || "Новороссийск",
    };
  }

  async function handleSubmit() {
    if (!getItems().length) {
      refresh();
      return;
    }

    if (!validate()) {
      scrollToFirstError();
      return;
    }

    const order = collectOrder();

    try {
      localStorage.setItem("paloma_last_order", JSON.stringify(order));
    } catch {
      /* ignore */
    }

    showLoading("Создаём заказ...");

    /*
     * TODO: подключить backend-прокси для ЮKassa / Яндекс Pay.
     * Secret Key хранится только на сервере (см. payment-config.js).
     * POST /api/create-payment → { paymentUrl } → redirect.
     */
    if (CFG.TEST_MODE) {
      await _sleep(1200);
      _onPaymentSuccess(order);
      return;
    }

    try {
      updateLoadingText("Перенаправляем на страницу оплаты...");
      const res = await fetch(CFG.PAYMENT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order,
          paymentMethod: order.paymentMethod,
          returnUrl:
            CFG.RETURN_URL_SUCCESS +
            "?orderId=" +
            encodeURIComponent(order.orderId),
        }),
      });

      if (!res.ok) throw new Error("HTTP " + res.status);

      const data = await res.json();

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else if (data.status === "succeeded") {
        _onPaymentSuccess(order);
      } else {
        throw new Error("No paymentUrl");
      }
    } catch (err) {
      console.error("[PALOMA Cart Checkout]", err);
      hideLoading();
      window.location.href = CFG.RETURN_URL_FAIL;
    }
  }

  function _onPaymentSuccess(order) {
    try {
      localStorage.setItem("paloma_last_order", JSON.stringify(order));
      sessionStorage.setItem("paloma_checkout_success", order.orderId);
    } catch {
      /* ignore */
    }

    if (cartApi?.emptyCart) {
      cartApi.emptyCart();
    } else {
      localStorage.removeItem(CART_KEY);
      localStorage.removeItem("paloma_cart_v1");
    }

    window.location.href =
      CFG.RETURN_URL_SUCCESS +
      "?orderId=" +
      encodeURIComponent(order.orderId) +
      "&method=" +
      encodeURIComponent(order.paymentMethod);
  }

  function showLoading(text) {
    if (!loadingEl) return;
    if (loadingText) loadingText.textContent = text || "Загрузка...";
    loadingEl.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function hideLoading() {
    if (!loadingEl) return;
    loadingEl.hidden = true;
    document.body.style.overflow = "";
  }

  function updateLoadingText(text) {
    if (loadingText) loadingText.textContent = text;
  }

  function _generateOrderId() {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    return "PL-" + ts + "-" + rand;
  }

  function _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  [document.getElementById("cartSubmitBtn"), document.getElementById("cartSubmitMobile")].forEach(
    (btn) => {
      btn?.addEventListener("click", (e) => {
        e.preventDefault();
        handleSubmit();
      });
    },
  );

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    handleSubmit();
  });

  document.addEventListener("paloma-cart-updated", refresh);

  initDateMin();
  initCardTextCounter();
  initPaymentFailedBanner();
  initFieldClearOnInput();
  renderAddons();
  refresh();
})();
