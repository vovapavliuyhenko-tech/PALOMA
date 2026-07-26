/* ════════════════════════════════════════════════════════
   product.js — страница товара PALOMA
   Depends on: paloma-products.js, catalog-data.js, script.js
   ════════════════════════════════════════════════════════ */
(function initProductPage() {
  "use strict";

  const pdpMain = document.getElementById("pdpMain");
  if (!pdpMain) return;

  const ADDONS = [
    {
      id: "addon-coffee",
      name: "Кофе к букету",
      price: 250,
      placeholderBg: "linear-gradient(135deg,#5c3d28,#8a6248)",
      image: "images/addons/coffee.jpg",
      category: "coffee",
    },
    {
      id: "addon-dessert",
      name: "Десерт из витрины",
      price: 320,
      placeholderBg: "linear-gradient(135deg,#c4a882,#8a6248)",
      image: "images/addons/dessert.jpg",
      category: "coffee",
    },
    {
      id: "addon-card",
      name: "Открытка",
      price: 150,
      placeholderBg: "linear-gradient(135deg,#d4bcc8,#8a5858)",
      image: "images/addons/card.jpg",
      category: "vases",
    },
    {
      id: "addon-vase",
      name: "Ваза",
      price: 980,
      placeholderBg: "linear-gradient(135deg,#e0d8cc,#9c8870)",
      image: "images/addons/vase.jpg",
      category: "vases",
    },
    {
      id: "addon-gift-wrap",
      name: "Подарочная упаковка",
      price: 200,
      placeholderBg: "linear-gradient(135deg,#d4c8b8,#8a7860)",
      image: "images/addons/gift-wrap.jpg",
      category: "vases",
    },
  ];

  const notFoundEl = document.getElementById("pdpNotFound");
  const mainPh = document.getElementById("pdpMainPh");
  const mainImg = document.getElementById("pdpMainImg");
  const thumbsEl = document.getElementById("pdpThumbs");
  const catEl = document.getElementById("pdpCat");
  const nameEl = document.getElementById("pdpName");
  const priceEl = document.getElementById("pdpPrice");
  const compRow = document.getElementById("pdpCompositionRow");
  const compEl = document.getElementById("pdpComposition");
  const descEl = document.getElementById("pdpDesc");
  const sizesEl = document.getElementById("pdpSizes");
  const sizeBtnsEl = document.getElementById("pdpSizeBtns");
  const budgetEl = document.getElementById("pdpBudget");
  const budgetRange = document.getElementById("pdpBudgetRange");
  const budgetInput = document.getElementById("pdpBudgetInput");
  const budgetMinEl = document.getElementById("pdpBudgetMin");
  const budgetMaxEl = document.getElementById("pdpBudgetMax");
  const qtyVal = document.getElementById("pdpQtyVal");
  const qtyDec = document.getElementById("pdpQtyDec");
  const qtyInc = document.getElementById("pdpQtyInc");
  const addToCartBtn = document.getElementById("pdpAddToCart");
  const wishBtn = document.getElementById("pdpWishlist");
  const toast = document.getElementById("pdpToast");
  const toastText = document.getElementById("pdpToastText");
  const breadCatLink = document.getElementById("pdpBreadcrumbCatLink");
  const breadNameEl = document.getElementById("pdpBreadcrumbName");
  const addonsGrid = document.getElementById("pdpAddonsGrid");
  const giftToggle = document.getElementById("pdpGiftToggle");
  const giftFields = document.getElementById("pdpGiftFields");
  const cardText = document.getElementById("pdpCardText");
  const recipientName = document.getElementById("pdpRecipientName");
  const recipientPhone = document.getElementById("pdpRecipientPhone");
  const fulfillBtns = document.getElementById("pdpFulfillBtns");
  const deliveryDate = document.getElementById("pdpDeliveryDate");
  const photoBefore = document.getElementById("pdpPhotoBefore");
  const importantEl = document.getElementById("pdpImportant");
  const importantBody = document.getElementById("pdpImportantBody");
  const similarSection = document.getElementById("pdpSimilar");
  const similarGrid = document.getElementById("pdpSimilarGrid");

  let fulfillMode = "delivery";

  let product = null;
  let rawProduct = null;
  let qty = 1;
  let selectedSize = null;
  let sizePriceDelta = 0;
  let budgetMode = false;
  let budgetTotal = 0;
  let toastTimer = null;

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function findProducts(slug) {
    if (!slug) return { norm: null, raw: null };

    if (window.PALOMA_CATALOG) {
      const norm =
        window.PALOMA_CATALOG.getBySlug(slug) ||
        window.PALOMA_CATALOG.getById(slug);
      if (norm) {
        const raw = (window.PALOMA_PRODUCTS || []).find((p) => p.id === norm.id);
        return { norm, raw: raw || null };
      }
    }

    const raw = (window.PALOMA_PRODUCTS || []).find(
      (p) => p.slug === slug || p.id === slug,
    );
    if (!raw) return { norm: null, raw: null };

    const norm = window.PALOMA_CATALOG?.getById(raw.id) || {
      id: raw.id,
      name: raw.name,
      category: raw.categories?.[0] || "online",
      categoryLabel: "",
      price: raw.price,
      composition: raw.composition || "",
      desc: raw.desc || "",
      placeholderBg: raw.placeholderGradient?.main || "",
      placeholderBgHover: raw.placeholderGradient?.hover || null,
      image: raw.image || null,
      imageHover: raw.imageHover || null,
      slug: raw.slug || raw.id,
    };

    return { norm, raw };
  }

  function formatPrice(n) {
    return n.toLocaleString("ru-RU") + " ₽";
  }

  /* ─── SEO/AI: Product + Offer + BreadcrumbList (страница динамическая,
         поэтому схему собираем из реальных данных товара в рантайме) ─── */
  var SITE = "https://paloma.website";
  function absUrl(p) {
    if (!p) return null;
    if (/^https?:\/\//.test(p)) return p;
    return SITE + "/" + String(p).replace(/^\/+/, "");
  }
  /* Динамические canonical + OG + Twitter под конкретный товар.
     На статике мета в <head> общая — здесь переписываем её под slug,
     чтобы репосты и склейка в поиске были корректными. */
  function updateSeoMeta() {
    if (!product) return;
    var slug = product.slug || product.id;
    var url = SITE + "/product.html?slug=" + encodeURIComponent(slug);
    var img = absUrl((rawProduct && rawProduct.image) || product.image) || "";
    var raw = (rawProduct && rawProduct.desc) || product.composition || "";
    var priceTxt = product.price
      ? (product.priceFrom ? "от " : "") + formatPrice(product.price) + ". "
      : "";
    var desc = (
      product.name +
      " — " +
      priceTxt +
      (raw ? raw + " " : "") +
      "Доставка по Новороссийску, Геленджику и Анапе, фото букета перед отправкой."
    ).slice(0, 300);

    function meta(sel, attr, key, val) {
      if (!val) return;
      var el = document.head.querySelector(sel + '[' + attr + '="' + key + '"]');
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", val);
    }

    var mdesc = document.head.querySelector('meta[name="description"]');
    if (!mdesc) {
      mdesc = document.createElement("meta");
      mdesc.setAttribute("name", "description");
      document.head.appendChild(mdesc);
    }
    mdesc.setAttribute("content", desc.slice(0, 160));

    var canon = document.head.querySelector('link[rel="canonical"]');
    if (!canon) {
      canon = document.createElement("link");
      canon.setAttribute("rel", "canonical");
      document.head.appendChild(canon);
    }
    canon.setAttribute("href", url);

    var ogTitle = product.name + " — PALOMA, Новороссийск";
    meta("meta", "property", "og:type", "product");
    meta("meta", "property", "og:url", url);
    meta("meta", "property", "og:title", ogTitle);
    meta("meta", "property", "og:description", desc.slice(0, 200));
    meta("meta", "property", "og:image", img);
    meta("meta", "name", "twitter:card", "summary_large_image");
    meta("meta", "name", "twitter:title", ogTitle);
    meta("meta", "name", "twitter:description", desc.slice(0, 200));
    meta("meta", "name", "twitter:image", img);
  }

  function injectSeoSchema() {
    if (!product) return;
    var slug = product.slug || product.id;
    var productUrl = SITE + "/product.html?slug=" + encodeURIComponent(slug);
    var img = absUrl((rawProduct && rawProduct.image) || product.image);
    var descText =
      (rawProduct && rawProduct.desc) || product.desc || product.composition || product.name;
    var catLabel = product.categoryLabel || "Каталог";
    var catUrl = SITE + "/catalog.html?cat=" + encodeURIComponent(product.category || "");
    var productNode = {
      "@type": "Product",
      name: product.name,
      description: descText,
      sku: product.id,
      url: productUrl,
      brand: { "@type": "Brand", name: "PALOMA" },
      offers: {
        "@type": "Offer",
        price: product.price,
        priceCurrency: "RUB",
        availability: "https://schema.org/InStock",
        url: productUrl,
        seller: { "@id": SITE + "/#business" },
      },
    };
    if (img) productNode.image = img;
    var graph = {
      "@context": "https://schema.org",
      "@graph": [
        productNode,
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Главная", item: SITE + "/" },
            { "@type": "ListItem", position: 2, name: "Каталог", item: SITE + "/catalog.html" },
            { "@type": "ListItem", position: 3, name: catLabel, item: catUrl },
            { "@type": "ListItem", position: 4, name: product.name, item: productUrl },
          ],
        },
      ],
    };
    var old = document.getElementById("pdp-seo-jsonld");
    if (old) old.remove();
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.id = "pdp-seo-jsonld";
    s.textContent = JSON.stringify(graph);
    document.head.appendChild(s);
  }

  function updatePriceDisplay() {
    if (!priceEl || !product) return;
    /* Для авторских цена под названием — стоимость букета как на фото (product.price),
       она НЕ меняется при движении ползунка бюджета.
       Для товаров с размерным рядом считаем от истинной базы (rawProduct.price = S),
       прибавляя дельту выбранного размера. */
    const base =
      rawProduct && rawProduct.price != null ? rawProduct.price : product.price;
    const total = budgetMode ? product.price : base + sizePriceDelta;
    priceEl.textContent =
      (product.priceFrom ? "от " : "") + formatPrice(total);
  }

  function showNotFound() {
    Array.from(pdpMain.children).forEach((el) => {
      if (el.id !== "pdpNotFound") el.hidden = true;
    });
    if (notFoundEl) notFoundEl.hidden = false;
    document.title = "Товар не найден — PALOMA";
  }

  function renderProduct() {
    document.title = `${product.name} — купить с доставкой в Новороссийске — PALOMA`;
    updateSeoMeta();

    if (breadCatLink) {
      breadCatLink.textContent = product.categoryLabel || "Каталог";
      breadCatLink.href = `catalog.html?cat=${encodeURIComponent(product.category)}`;
    }
    if (breadNameEl) breadNameEl.textContent = product.name;
    if (catEl) catEl.textContent = product.categoryLabel || "";
    if (nameEl) nameEl.textContent = product.name;
    updatePriceDisplay();

    if (product.composition && compEl && compRow) {
      compEl.textContent = product.composition;
    } else if (compRow) {
      compRow.hidden = true;
    }

    const descText = rawProduct?.desc || product.desc || "";
    if (descEl) {
      descEl.textContent = descText;
      descEl.hidden = !descText;
    }

    /* Авторские букеты — шкала бюджета вместо размерного ряда. */
    if ((rawProduct?.categories || []).includes("authors")) {
      renderBudget();
    } else {
      renderSizes();
    }
    renderGallery();
    renderImportant();
    bindWishlistButton();
    injectSeoSchema();
  }

  /* «Что важно знать» — текст зависит от типа букета (моно / подписка / обычный).
     Для не-букетов (вазы, десерты) плашку не показываем. */
  function renderImportant() {
    if (!importantEl || !importantBody) return;
    const cats = rawProduct?.categories || [];
    const BOUQUET = ["season", "bestsellers", "online", "compositions", "events", "wedding", "mono", "duo", "authors"];
    let paras = null;

    if (cats.includes("subscription")) {
      paras = [
        "Состав не согласовываем заранее: в этом и есть смысл подписки — вы получаете букет-сюрприз, а не тот, что уже видели. Каждый букет собирает флорист на своё усмотрение из самых свежих цветов недели.",
        "Пожелания учитываем всегда: желаемые цвета, аллергия, нелюбимые цветы — расскажите один раз, и мы будем это помнить.",
      ];
    } else if (cats.includes("mono")) {
      paras = [
        "Моно-букет собираем из одного вида цветка — только из того, что прошло отбор по свежести.",
        "Если цветка нет в поставке — предложим замену, близкую по фактуре и подходящую под повод. Решение всегда за Вами.",
        "Перед отправкой пришлём фото готового букета. Не совпало — пересоберём бесплатно.",
        "Аллергия или пожелания по составу — напишите в комментарии к заказу.",
      ];
    } else if (cats.some((c) => BOUQUET.includes(c))) {
      paras = [
        "Букет собираем максимально близко к фото. Свежесть важнее буквального совпадения: если цветок не прошёл отбор — заменим равноценным, не меняя настроение букета.",
        "Перед отправкой пришлём фото готового букета. Не совпало с ожиданием — пересоберём бесплатно.",
        "Аллергия или пожелания по составу — напишите в комментарии к заказу.",
      ];
    }

    if (!paras) {
      importantEl.hidden = true;
      return;
    }
    importantBody.innerHTML = paras
      .map((t) => '<p class="pdp-accordion__intro">' + esc(t) + "</p>")
      .join("");
    importantEl.hidden = false;
  }

  function renderSizes() {
    const sizes = rawProduct?.sizes;
    if (!sizes?.length || !sizesEl || !sizeBtnsEl) return;

    sizesEl.hidden = false;
    sizeBtnsEl.innerHTML = "";

    /* По умолчанию выбираем размер «как на фото» (photoSize), иначе первый. */
    const photoSize = rawProduct?.photoSize;
    let defaultIdx = 0;
    if (photoSize) {
      const idx = sizes.findIndex(
        (s) => (s.code || s.label) === photoSize,
      );
      if (idx >= 0) defaultIdx = idx;
    }

    sizes.forEach((size, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pdp-size-btn" + (i === defaultIdx ? " is-active" : "");
      btn.textContent = size.label || size.code;
      btn.dataset.size = size.code || size.label;
      btn.dataset.delta = String(size.priceDelta || 0);
      btn.setAttribute("aria-pressed", i === defaultIdx ? "true" : "false");

      btn.addEventListener("click", () => {
        sizeBtnsEl.querySelectorAll(".pdp-size-btn").forEach((b) => {
          b.classList.remove("is-active");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("is-active");
        btn.setAttribute("aria-pressed", "true");
        selectedSize = btn.dataset.size;
        sizePriceDelta = parseInt(btn.dataset.delta, 10) || 0;
        updatePriceDisplay();
      });

      sizeBtnsEl.appendChild(btn);
    });

    selectedSize = sizes[defaultIdx].code || sizes[defaultIdx].label;
    sizePriceDelta = sizes[defaultIdx].priceDelta || 0;
    /* Цена под названием должна учитывать размер «как на фото» (photoSize),
       поэтому пересчитываем после установки дельты по умолчанию. */
    updatePriceDisplay();
  }

  /* Шкала бюджета для авторских: клиент выбирает сумму, флорист собирает под неё.
     Диапазон фиксированный: от 3000 ₽ до 30000 ₽ (для дорогих букетов — до 40000 ₽).
     Цена под названием остаётся стоимостью «как на фото», ползунок влияет только
     на итог в корзине. По умолчанию бюджет равен цене букета на фото. */
  function renderBudget() {
    if (!budgetEl || !budgetRange) return;

    const base = product.price;
    const min = 3000;
    const max = base >= 18000 ? 40000 : 30000;
    let def = Math.round(base / 500) * 500;
    if (def < min) def = min;
    if (def > max) def = max;

    budgetRange.min = String(min);
    budgetRange.max = String(max);
    budgetRange.step = "500";
    budgetRange.value = String(def);

    budgetMode = true;
    selectedSize = "budget";
    /* budgetTotal — итоговая сумма бюджета (уходит в корзину), отдельно от base. */
    budgetTotal = def;

    if (budgetInput) {
      budgetInput.min = String(min);
      budgetInput.max = String(max);
      budgetInput.step = "500";
      budgetInput.value = String(def);
    }
    if (budgetMinEl) budgetMinEl.textContent = formatPrice(min);
    if (budgetMaxEl) budgetMaxEl.textContent = formatPrice(max);

    function clampSnap(raw) {
      let val = Math.round((parseInt(raw, 10) || min) / 500) * 500;
      if (val < min) val = min;
      if (val > max) val = max;
      return val;
    }

    function paint(val) {
      budgetTotal = val;
      const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
      budgetRange.style.setProperty("--pct", pct + "%");
      updatePriceDisplay();
    }

    /* Ползунок → синхроним поле ввода на лету. */
    budgetRange.addEventListener("input", () => {
      const val = clampSnap(budgetRange.value);
      if (budgetInput) budgetInput.value = String(val);
      paint(val);
    });

    if (budgetInput) {
      /* Поле ввода → двигаем ползунок. Привязку к 500 делаем по завершении
         ввода (change/blur), чтобы не мешать печатать промежуточные цифры. */
      budgetInput.addEventListener("input", () => {
        const raw = parseInt(budgetInput.value, 10);
        if (!Number.isFinite(raw)) return;
        let val = raw;
        if (val < min) val = min;
        if (val > max) val = max;
        budgetRange.value = String(Math.round(val / 500) * 500);
        paint(Math.round(val / 500) * 500);
      });
      budgetInput.addEventListener("change", () => {
        const val = clampSnap(budgetInput.value);
        budgetInput.value = String(val);
        budgetRange.value = String(val);
        paint(val);
      });
    }

    paint(def);

    if (sizesEl) sizesEl.hidden = true;
    budgetEl.hidden = false;
  }

  function renderGallery() {
    const bg = product.placeholderBg || "";
    const bgHover = product.placeholderBgHover || bg;

    if (mainPh) mainPh.style.background = bg;

    const photos = [];
    if (product.image) photos.push({ src: product.image, alt: product.name });
    if (product.imageHover)
      photos.push({ src: product.imageHover, alt: `${product.name} — вид 2` });

    if (!photos.length) {
      if (mainImg) {
        mainImg.removeAttribute("src");
        mainImg.style.display = "none";
      }
      if (thumbsEl) thumbsEl.innerHTML = "";
      return;
    }

    if (mainImg) mainImg.style.display = "";
    setMainPhoto(photos[0], 0);

    if (!thumbsEl) return;
    thumbsEl.innerHTML = "";

    if (photos.length === 1) return;

    photos.forEach((photo, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pdp-gallery__thumb" + (i === 0 ? " is-active" : "");
      btn.setAttribute("aria-label", `Фото ${i + 1}`);

      const ph = document.createElement("div");
      ph.className = "pdp-gallery__thumb-ph";
      ph.style.background = i === 0 ? bg : bgHover;

      const img = document.createElement("img");
      img.className = "pdp-gallery__thumb-img";
      img.src = photo.src;
      img.alt = photo.alt;
      img.loading = "lazy";
      img.onerror = () => {
        img.style.display = "none";
      };

      btn.appendChild(ph);
      btn.appendChild(img);
      btn.addEventListener("click", () => setMainPhoto(photo, i));
      thumbsEl.appendChild(btn);
    });
  }

  function setMainPhoto(photo, index) {
    if (mainImg) {
      mainImg.src = photo.src;
      mainImg.alt = photo.alt;
      mainImg.style.opacity = "1";
      mainImg.onerror = () => {
        mainImg.style.opacity = "0";
      };
    }

    thumbsEl?.querySelectorAll(".pdp-gallery__thumb").forEach((btn, i) => {
      btn.classList.toggle("is-active", i === index);
    });
  }

  function initQty() {
    if (!qtyVal || !qtyDec || !qtyInc) return;

    function update() {
      qtyVal.textContent = String(qty);
      qtyDec.disabled = qty <= 1;
    }

    qtyDec.addEventListener("click", () => {
      if (qty > 1) {
        qty--;
        update();
      }
    });
    qtyInc.addEventListener("click", () => {
      if (qty < 99) {
        qty++;
        update();
      }
    });

    update();
  }

  function addToCart(item) {
    if (window.PalomaCart?.add) {
      window.PalomaCart.add(item);
      return;
    }

    const KEY = "paloma_cart_v3";
    let items = [];
    try {
      items = JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      items = [];
    }

    const existing = items.find((i) => i.id === item.id);
    if (existing) {
      existing.qty = (existing.qty || 1) + (item.qty || 1);
    } else {
      items.push(item);
    }

    localStorage.setItem(KEY, JSON.stringify(items));
    const count = items.reduce((s, i) => s + (i.qty || 1), 0);
    document
      .querySelectorAll(".site-header__cart-count, #cartCount")
      .forEach((el) => {
        el.textContent = count > 0 ? String(count) : "0";
        el.classList.toggle("is-empty", count === 0);
      });
  }

  function initCart() {
    addToCartBtn?.addEventListener("click", () => {
      if (!product || !rawProduct) return;

      const base =
        rawProduct && rawProduct.price != null ? rawProduct.price : product.price;
      const unitPrice = budgetMode ? budgetTotal : base + sizePriceDelta;
      const sizeLabel = budgetMode
        ? `Бюджет ${formatPrice(unitPrice)}`
        : sizeBtnsEl?.querySelector(".pdp-size-btn.is-active")?.textContent?.trim() ||
          selectedSize ||
          "M";
      const lineId = budgetMode
        ? `${product.id}-b${unitPrice}`
        : `${product.id}-${selectedSize || "m"}`;

      addToCart({
        id: lineId,
        name: product.name,
        price: unitPrice,
        qty,
        size: sizeLabel,
        addons: collectExtras(),
        image: product.image || "",
        bg: product.placeholderBg || "",
        category: product.category || "",
        slug: product.slug || "",
      });

      showToast(`«${product.name}» добавлен в корзину`);
    });
  }

  function bindWishlistButton() {
    if (!wishBtn || !product) return;
    wishBtn.dataset.productId = product.id;
    window.PalomaWishlist?.syncButtons?.();
  }

  function showToast(message, duration = 2200) {
    if (!toast || !toastText) return;

    if (toastTimer) {
      clearTimeout(toastTimer);
      toast.classList.remove("is-hiding");
    }

    toastText.textContent = message;
    toast.hidden = false;

    toastTimer = setTimeout(() => {
      toast.classList.add("is-hiding");
      setTimeout(() => {
        toast.hidden = true;
        toast.classList.remove("is-hiding");
      }, 320);
    }, duration);
  }

  function renderAddons() {
    if (!addonsGrid) return;

    ADDONS.forEach((addon) => {
      const card = document.createElement("div");
      card.className = "addon-card";
      card.dataset.addonId = addon.id;

      card.innerHTML = `
        <div class="addon-card__media">
          <div class="addon-card__ph"
               style="background:${esc(addon.placeholderBg)};"
               aria-hidden="true"></div>
          ${
            addon.image
              ? `<img src="${esc(addon.image)}" alt="${esc(addon.name)}"
                      loading="lazy" class="addon-card__img"
                      style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"
                      onerror="this.style.display='none'">`
              : ""
          }
        </div>
        <div class="addon-card__body">
          <h3 class="addon-card__name">${esc(addon.name)}</h3>
          <p class="addon-card__price">${addon.price.toLocaleString("ru-RU")} ₽</p>
          <button type="button" class="addon-card__btn"
                  data-addon-id="${esc(addon.id)}"
                  aria-label="Добавить ${esc(addon.name)} в корзину">
            Добавить
          </button>
        </div>
      `;

      card.querySelector(".addon-card__btn")?.addEventListener("click", (e) => {
        const btn = e.currentTarget;
        addToCart({
          id: addon.id,
          name: addon.name,
          price: addon.price,
          qty: 1,
          size: "—",
          addons: [],
          bg: addon.placeholderBg,
          category: addon.category,
          type: "addon",
          linkedTo: product?.id,
        });

        btn.textContent = "✓ Добавлено";
        btn.classList.add("is-added");
        btn.disabled = true;
        showToast(`«${addon.name}» добавлен в корзину`);

        setTimeout(() => {
          btn.textContent = "Добавить";
          btn.classList.remove("is-added");
          btn.disabled = false;
        }, 2000);
      });

      addonsGrid.appendChild(card);
    });
  }

  function initGiftAndFulfill() {
    if (giftToggle && giftFields) {
      giftToggle.addEventListener("change", () => {
        giftFields.hidden = !giftToggle.checked;
      });
    }
    if (fulfillBtns) {
      const btns = fulfillBtns.querySelectorAll(".pdp-fulfill__btn");
      btns.forEach((btn) => {
        btn.addEventListener("click", () => {
          fulfillMode = btn.dataset.fulfill || "delivery";
          btns.forEach((b) => b.classList.toggle("is-active", b === btn));
        });
      });
    }
  }

  function collectExtras() {
    const extras = [];
    extras.push(fulfillMode === "pickup" ? "Самовывоз" : "Доставка");
    if (deliveryDate && deliveryDate.value) {
      extras.push("Дата: " + deliveryDate.value);
    }
    if (photoBefore && photoBefore.checked) extras.push("Фото перед отправкой");
    if (giftToggle && giftToggle.checked) {
      if (cardText && cardText.value.trim()) {
        extras.push("Открытка: " + cardText.value.trim());
      }
      const rn = recipientName && recipientName.value.trim();
      const rp = recipientPhone && recipientPhone.value.trim();
      if (rn || rp) extras.push("Получатель: " + [rn, rp].filter(Boolean).join(", "));
    }
    return extras;
  }

  function renderSimilar() {
    if (!similarGrid || !similarSection || !window.PALOMA_CATALOG || !product) return;
    const items = window.PALOMA_CATALOG.getSimilar(product.id, 4) || [];
    if (!items.length) return;
    similarGrid.innerHTML = items
      .map(function (p) {
        const href = "product.html?slug=" + encodeURIComponent(p.slug || p.id);
        const media = p.image
          ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async" width="600" height="870">'
          : '<span class="home-product-card__ph" style="background:' + esc(p.placeholderBg || "") + '"></span>';
        return (
          '<article class="home-product-card">' +
          '<a href="' + href + '" class="home-product-card__media" aria-label="Подробнее: ' + esc(p.name) + '">' + media + "</a>" +
          '<div class="home-product-card__body">' +
          '<h3 class="home-product-card__title"><a href="' + href + '">' + esc(p.name) + "</a></h3>" +
          '<p class="home-product-card__price">' + formatPrice(p.price) + "</p>" +
          '<div class="home-product-card__actions">' +
          '<a href="' + href + '" class="home-product-card__more">Подробнее</a>' +
          "</div></div></article>"
        );
      })
      .join("");
    similarSection.hidden = false;

    /* Ecommerce: показ списка «Похожие товары» (impressions). */
    if (window.palomaEcommerce && window.palomaEcomProduct) {
      window.palomaEcommerce(
        "impressions",
        items.map(function (p, i) {
          return window.palomaEcomProduct(p, {
            list: "Похожие товары",
            position: i + 1,
          });
        }),
      );
    }

    // Запускаем карусель как на главной: стрелки/прогресс + автопрокрутка
    if (typeof window.initProductCarousels === "function") {
      window.initProductCarousels();
    }
    if (typeof window.initPalomaAutoScroll === "function") {
      window.initPalomaAutoScroll();
    }
  }

  function init() {
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("slug") || params.get("id");

    if (!slug) {
      showNotFound();
      return;
    }

    const found = findProducts(slug);
    product = found.norm;
    rawProduct = found.raw;

    if (!product) {
      showNotFound();
      return;
    }

    renderProduct();
    /* Цель: просмотр карточки товара (только для реально найденного товара). */
    if (window.palomaGoal) window.palomaGoal("view_product");
    if (window.palomaEcommerce && window.palomaEcomProduct) {
      window.palomaEcommerce("detail", [window.palomaEcomProduct(product)]);
    }
    renderAddons();
    renderSimilar();
    initGiftAndFulfill();
    bindWishlistButton();
    initQty();
    initCart();
  }

  init();
})();
