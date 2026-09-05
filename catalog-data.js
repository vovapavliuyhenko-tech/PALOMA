/* ============================================================
   catalog-data.js — хелперы каталога PALOMA
   Источник товаров: paloma-products.js (window.PALOMA_PRODUCTS)
   Подключать после paloma-products.js
   ============================================================ */
(function () {
  "use strict";

  const CATEGORY_LABELS = {
    online: "Онлайн-витрина",
    season: "Самый сезон",
    bestsellers: "Бестселлеры",
    compositions: "Композиции и корзины",
    mono: "Моно и дуобукеты",
    duo: "Дуобукеты",
    authors: "Авторские",
    wedding: "Свадебные",
    vases: "Вазы и подарки",
    desserts: "Десерты",
    subscription: "Цветочная подписка",
    events: "Оформление мероприятия",
  };

  const FILTER_ALIASES = {
    /* короткие псевдонимы; разделы online/season/bestsellers/compositions
       пока без товаров — показываем свою (пустую) категорию, не подменяя */
    best: "bestsellers",
    comp: "compositions",
    sub: "subscription",
  };

  /* Slug для product.html?slug=… */
  const PRODUCT_SLUGS = {
    c1: "kameliya",
    c2: "provans",
    c3: "ayvori",
    c4: "bordo",
    c6: "granat",
    c8: "shelk",
    c9: "dyuna",
    c10: "siciliya",
    c11: "terrakot",
    c12: "morrigan",
  };

  function normalizeBadge(badge) {
    if (!badge) return null;
    if (badge === "Хит") return "HIT";
    if (badge === "Новинка") return "NEW";
    return null;
  }

  function normalizeProduct(p) {
    const cats = Array.isArray(p.categories)
      ? p.categories.slice()
      : p.category
        ? [p.category]
        : [];
    const pg = p.placeholderGradient || {};

    /* Цена на карточке — начальная, с пометкой «от», плюс сам размер,
       которому она соответствует (displaySize — его кладёт в корзину
       кнопка «В корзину» в каталоге).

       Раньше здесь показывалась цена размера с фотографии (photoSize),
       и «от» при этом убиралось как «точная цена». На деле каталог
       открывался ценами 7 500 / 11 100 / 26 600 ₽, тогда как те же
       букеты начинаются с 2 300 / 4 220 / 9 100 ₽ — завышение до 3,3×
       на первом же экране. Вдобавок карточка расходилась с товарной
       страницей: там у того же букета написано «от 2 300 ₽».

       Показываем минимальную цену: она честная, совпадает с товарной
       страницей и не отпугивает на входе. photoSize остаётся в данных —
       он ещё нужен галерее. */
    let displayPrice = p.price;
    let displaySize = null;
    let priceFrom = !!p.priceFrom;
    if (Array.isArray(p.sizes) && p.sizes.length) {
      const priced = p.sizes.map((s) => ({
        size: s.code || s.label || null,
        price: p.price + (s.priceDelta || 0),
      }));
      const cheapest = priced.reduce((a, b) => (b.price < a.price ? b : a));
      displayPrice = cheapest.price;
      displaySize = cheapest.size;
      /* «от» — только когда размеры действительно стоят по-разному */
      if (priced.some((x) => x.price !== cheapest.price)) priceFrom = true;
    }

    return {
      id: p.id,
      name: p.name,
      categories: cats,
      category: cats[0] || "online",
      categoryLabel: CATEGORY_LABELS[cats[0]] || "",
      price: displayPrice,
      /* размер, которому соответствует цена выше */
      displaySize: displaySize,
      photoSize: p.photoSize || null,
      /* Цена «от» — итог согласует менеджер (свадебные букеты идут диапазоном) */
      priceFrom: priceFrom,
      description: p.composition || "",
      composition: p.composition || "",
      desc: p.desc || "",
      pairs: p.pairs || "",
      image: p.image || null,
      imageHover: p.imageHover || null,
      placeholderBg:
        pg.main ||
        p.placeholderBg ||
        "linear-gradient(135deg, #d4c8b8, #8a7860)",
      placeholderBgHover: pg.hover || null,
      badge: normalizeBadge(p.badge),
      slug: p.slug || PRODUCT_SLUGS[p.id] || p.id,
    };
  }

  function getNormalized() {
    return (window.PALOMA_PRODUCTS || []).map(normalizeProduct);
  }

  function resolveFilter(cat) {
    if (!cat || cat === "all") return "all";
    return FILTER_ALIASES[cat] || cat;
  }

  window.PALOMA_CATALOG = {
    getAll() {
      return getNormalized();
    },

    getByCategory(cat) {
      const want = resolveFilter(cat);
      if (want === "all") return this.getAll();
      return this.getAll().filter((p) => p.categories.includes(want));
    },

    getById(id) {
      const raw = (window.PALOMA_PRODUCTS || []).find((p) => p.id === id);
      return raw ? normalizeProduct(raw) : null;
    },

    getBySlug(slug) {
      return this.getAll().find((p) => p.slug === slug) || null;
    },

    getSimilar(id, limit = 4) {
      const product = this.getById(id);
      if (!product) return [];
      return this.getAll()
        .filter(
          (p) =>
            p.id !== id &&
            p.categories.some((c) => product.categories.includes(c)),
        )
        .slice(0, limit);
    },

    getAddons(limit = 6) {
      const addonCategories = ["vases", "subscription"];
      return this.getAll()
        .filter((p) =>
          p.categories.some((c) => addonCategories.includes(c)),
        )
        .slice(0, limit);
    },

    resolveFilter,
  };
})();
