(function () {
  "use strict";

  /* Мобильные/планшеты: тяжёлые фоновые видео не грузим ЗАРАНЕЕ (autoplay качает
     весь файл сразу — главный тормоз первой загрузки), а подгружаем ЛЕНИВО, когда
     пользователь долистывает до них. Так и быстрая загрузка, и видео реально
     проигрываются (портфолио на «Оформлении», фоны на главной). Десктоп не трогаем. */
  if (window.matchMedia && window.matchMedia("(max-width: 1024px)").matches) {
    var _vids = document.querySelectorAll("video[autoplay]");
    var _restoreVid = function (v) {
      var s = v.dataset.mobileSrc;
      if (s && !v.getAttribute("src")) {
        v.setAttribute("src", s);
        try { v.load(); } catch (e) {}
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      }
    };
    for (var _vi = 0; _vi < _vids.length; _vi++) {
      var _v = _vids[_vi];
      _v.removeAttribute("autoplay");
      _v.setAttribute("preload", "none");
      var _src = _v.getAttribute("src");
      if (_src) {
        _v.dataset.mobileSrc = _src;
        _v.removeAttribute("src");
      }
      try { _v.load(); } catch (e) {}
    }
    if ("IntersectionObserver" in window) {
      var _vio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            _restoreVid(en.target);
            _vio.unobserve(en.target);
          }
        });
      }, { rootMargin: "250px 0px" });
      for (var _vj = 0; _vj < _vids.length; _vj++) _vio.observe(_vids[_vj]);
    } else {
      for (var _vk = 0; _vk < _vids.length; _vk++) _restoreVid(_vids[_vk]);
    }
  }

  function syncBodyOverflow() {
    const modalOpen = document
      .getElementById("productModal")
      ?.classList.contains("is-open");
    const cartOpen = document
      .getElementById("cartDrawer")
      ?.classList.contains("is-open");
    document.body.style.overflow =
      modalOpen || cartOpen ? "hidden" : "";
  }

  /* Dropdown «Каталог» — desktop hover + aria, touch ≤1024 */
  (function initCatalogDropdown() {
    const wrap = document.querySelector(
      ".site-header__dropdown-wrap--catalog"
    );
    if (!wrap) return;

    let timeout;
    const trigger = wrap.querySelector(".site-header__link--has-dropdown");

    wrap.addEventListener("mouseenter", () => {
      clearTimeout(timeout);
      wrap.classList.add("is-open");
      trigger?.setAttribute("aria-expanded", "true");
    });
    wrap.addEventListener("mouseleave", () => {
      timeout = window.setTimeout(() => {
        wrap.classList.remove("is-open");
        trigger?.setAttribute("aria-expanded", "false");
      }, 160);
    });

    trigger?.addEventListener("click", (e) => {
      /* Сенсор/узкий экран: первый тап раскрывает категории, чтобы их можно
         было выбрать. Десктоп (и повторный тап) — переход ко ВСЕМ товарам. */
      if (window.innerWidth <= 1024 && !wrap.classList.contains("is-open")) {
        e.preventDefault();
        wrap.classList.add("is-open");
        trigger?.setAttribute("aria-expanded", "true");
        return;
      }
      window.location.href = "catalog.html";
    });

    document.addEventListener("click", (e) => {
      if (!(e.target instanceof Node)) return;
      if (wrap.contains(e.target)) return;
      wrap.classList.remove("is-open");
      trigger?.setAttribute("aria-expanded", "false");
    });
  })();

  /* Product modal */
  (function initProductModal() {
    const modal = document.getElementById("productModal");
    if (!modal) return;

    const modalTitle = document.getElementById("modalTitle");
    const modalPrice = document.getElementById("modalPrice");
    const modalDesc = document.getElementById("modalDesc");
    const modalComposition = document.getElementById("modalComposition");
    const modalPairs = document.getElementById("modalPairs");
    const modalTotal = document.getElementById("modalTotal");
    const modalMainImg = document.getElementById("modalMainImg");
    const thumbs = modal.querySelectorAll(".product-modal__thumb");
    const sizePills = modal.querySelectorAll(".size-pill");
    const addonInputs = modal.querySelectorAll(".addon input[type='checkbox']");
    const addBtn = document.getElementById("modalAddToCart");

    let currentProduct = null;
    let basePrice = 0;
    let currentMod = 0;

    function addonSum() {
      let s = 0;
      addonInputs.forEach((i) => {
        if (i.checked)
          s += parseInt(i.getAttribute("data-addon-price"), 10) || 0;
      });
      return s;
    }

    function recalcTotal() {
      let total = basePrice + currentMod + addonSum();
      if (modalTotal)
        modalTotal.textContent =
          total.toLocaleString("ru-RU") + " ₽";
    }

    function openModal(card) {
      const rawCat = (card.dataset.category || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      const primaryCat = rawCat[0] || "";
      currentProduct = {
        id: card.dataset.id,
        name: card.dataset.name,
        price: parseInt(card.dataset.price, 10) || 0,
        priceFrom: card.dataset.priceFrom === "1",
        composition: card.dataset.composition || "—",
        desc: card.dataset.desc || "—",
        pairs: card.dataset.pairs || "—",
        category: primaryCat,
      };
      basePrice = currentProduct.price;
      currentMod = 0;
      sizePills.forEach((p, i) => p.classList.toggle("is-active", i === 0));
      addonInputs.forEach((i) => {
        i.checked = false;
      });

      if (modalTitle) modalTitle.textContent = currentProduct.name;
      if (modalPrice)
        modalPrice.textContent =
          (currentProduct.priceFrom ? "от " : "") +
          currentProduct.price.toLocaleString("ru-RU") + " ₽";
      if (modalDesc) modalDesc.textContent = currentProduct.desc;
      if (modalComposition)
        modalComposition.textContent = currentProduct.composition;
      if (modalPairs) modalPairs.textContent = currentProduct.pairs || "—";

      const mainImg =
        card.querySelector(".product-card__image--main") ||
        card.querySelector(".product-card__img--main");
      if (modalMainImg && mainImg) {
        if (mainImg.tagName === "IMG") {
          const u = mainImg.currentSrc || mainImg.src;
          modalMainImg.style.background = u
            ? `url(${JSON.stringify(u)}) center/cover no-repeat`
            : "";
        } else {
          modalMainImg.style.background = getComputedStyle(mainImg).background;
        }
      }

      thumbs.forEach((t, i) =>
        t.classList.toggle("is-active", i === 0)
      );

      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      syncBodyOverflow();
      recalcTotal();
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      syncBodyOverflow();
    }

    document.querySelectorAll(".product-card").forEach((card) => {
      (
        card.querySelector("[data-add-to-cart]") ||
          card.querySelector(".btn.btn--dark")
      )?.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          const imgEl =
            card.querySelector(".product-card__img--main") ||
            card.querySelector(".product-card__image--main");
          const phEl = card.querySelector(".product-card__ph");
          const rawCat = (card.dataset.category || "")
            .trim()
            .split(/\s+/)
            .filter(Boolean);
          let image = "";
          let bg = "";
          if (imgEl && imgEl.tagName === "IMG") {
            image = imgEl.getAttribute("src") || imgEl.currentSrc || "";
          }
          if (phEl) bg = getComputedStyle(phEl).background;
          else if (imgEl && imgEl.tagName !== "IMG")
            bg = getComputedStyle(imgEl).background;
          window.PalomaCart?.add({
            id:
              card.dataset.id +
              "-quick-m-" +
              (card.dataset.price || "0"),
            name: card.dataset.name || "",
            size: "M",
            addons: [],
            price: parseInt(card.dataset.price, 10) || 0,
            qty: 1,
            image,
            bg,
            category: rawCat[0] || "",
          });
        }
      );

      const inCatalog = !!card.closest(".catalog-grid");
      const inRelated = !!card.closest(".product-related");
      const inShowcase = !!card.closest("#showcaseGrid");

      if (!inCatalog && !inRelated && !inShowcase) {
      card.querySelector(".btn.btn--light")?.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          openModal(card);
        }
      );

      card.addEventListener("click", (ev) => {
        if (ev.target.closest(".product-card__wishlist")) return;
        if (ev.target.closest(".product-card__actions")) return;
        openModal(card);
      });
      } else if (inCatalog || inRelated) {
        card.addEventListener("click", (ev) => {
          if (ev.target.closest(".product-card__wishlist")) return;
          if (ev.target.closest("[data-add-to-cart]")) return;
          if (ev.target.closest(".btn.btn--dark")) return;
          if (ev.target.closest("a")) return;
          const productId = card.dataset.id;
          if (productId) {
            location.href = `product.html?id=${encodeURIComponent(productId)}`;
          }
        });
      }
    });

    modal.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", closeModal);
    });

    sizePills.forEach((p) => {
      p.addEventListener("click", () => {
        sizePills.forEach((x) => x.classList.remove("is-active"));
        p.classList.add("is-active");
        currentMod = parseInt(p.getAttribute("data-mod"), 10) || 0;
        recalcTotal();
      });
    });

    addonInputs.forEach((i) =>
      i.addEventListener("change", recalcTotal)
    );

    thumbs.forEach((t) => {
      t.addEventListener("click", () => {
        thumbs.forEach((x) => x.classList.remove("is-active"));
        t.classList.add("is-active");
        if (modalMainImg)
          modalMainImg.style.background =
            getComputedStyle(t).background;
      });
    });

    addBtn?.addEventListener("click", () => {
      if (!currentProduct || !modalMainImg) return;
      const size =
        modal.querySelector(".size-pill.is-active")?.getAttribute(
          "data-size"
        ) || "S";
      const addons = [...addonInputs]
        .filter((i) => i.checked)
        .map((i) => {
          const lab = i.closest(".addon");
          return lab
            ? lab.textContent.replace(/\s*\+[\d\s₽]+$/, "").trim()
            : "";
        })
        .filter(Boolean);
      const lineTotal =
        basePrice +
        currentMod +
        addonSum();

      const mainBg = modalMainImg.style.background || "";
      const urlMatch = mainBg.match(/url\((['"]?)(.*?)\1\)/i);
      window.PalomaCart?.add({
        id:
          currentProduct.id +
          "-" +
          size +
          "-" +
          addons.join("_"),
        name: currentProduct.name,
        size,
        addons,
        price: lineTotal,
        qty: 1,
        image: urlMatch ? urlMatch[2] : "",
        bg: mainBg,
        category: currentProduct.category || "",
      });
      closeModal();
    });
  })();

  /* Страница каталога: фильтры */
  (function initCatalogFilters() {
    if (document.getElementById("catalogFilters")) return;
    const filters = document.querySelectorAll(
      "#catalogFiltersBar .filter-chip, #catalogFiltersBar .filter-btn",
    );
    const cards = document.querySelectorAll(
      ".catalog-grid .product-card",
    );
    if (filters.length === 0 || cards.length === 0) return;

    const CAT_MAP = {
      best: "bestsellers",
      comp: "compositions",
      sub: "subscription",
    };

    function resolveFilter(cat) {
      return CAT_MAP[cat] || cat;
    }

    function applyFilter(cat) {
      const want = resolveFilter(cat);
      cards.forEach((card) => {
        const raw = (
          card.getAttribute("data-category") || ""
        ).trim();
        const cardCats =
          raw.length > 0 ? raw.split(/\s+/).filter(Boolean) : [];
        const show =
          cat === "all" || cardCats.includes(want);
        card.classList.toggle("is-filtered-out", !show);
      });
      filters.forEach((f) =>
        f.classList.toggle("is-active", f.dataset.cat === cat)
      );
    }

    filters.forEach((f) => {
      f.addEventListener("click", () =>
        applyFilter(f.dataset.cat || "all")
      );
    });

    const qp = new URLSearchParams(window.location.search);
    const urlCat = qp.get("cat");
    if (urlCat) {
      const resolved = resolveFilter(urlCat);
      const match = [...filters].find(
        (f) =>
          f.dataset.cat === urlCat ||
          resolveFilter(f.dataset.cat || "") === resolved,
      );
      if (match) applyFilter(match.dataset.cat || "all");
      else applyFilter(urlCat);
    }
  })();

  /* Каталог: показать ещё карточки */
  (function initCatalogShowMore() {
    const btn = document.getElementById("catalogShowMoreBtn");
    const grid = document.getElementById("catalogGrid");
    if (!btn || !grid) return;

    const hiddenCards = [
      ...grid.querySelectorAll(".product-card.is-hidden"),
    ];
    if (hiddenCards.length === 0) {
      btn.hidden = true;
      return;
    }

    btn.addEventListener("click", () => {
      hiddenCards.forEach((c) =>
        c.classList.remove("is-hidden"),
      );
      btn.hidden = true;
      btn.setAttribute("aria-expanded", "true");
      window.PalomaWishlist?.injectButtons?.();
      window.PalomaWishlist?.updateUi?.();
      window.palomaRebindCursorHovers?.();
    });
  })();

  /* Отзывы — editorial-карусель (главная) */
  (function initReviews() {
    "use strict";

    const track = document.getElementById("reviewsTrack");
    const prevBtn = document.getElementById("reviewsPrev");
    const nextBtn = document.getElementById("reviewsNext");
    const dotsEl = document.getElementById("reviewsDots");
    const carousel = track?.closest(".reviews__carousel");

    if (!track) return;

    const slides = Array.from(track.querySelectorAll(".review-card"));
    const total = slides.length;
    let current = 0;
    let startX = 0;
    let isDragging = false;
    let mouseDown = false;

    if (total === 0) return;

    if (dotsEl) {
      slides.forEach((_, i) => {
        const dot = document.createElement("button");
        dot.className = "reviews__dot" + (i === 0 ? " is-active" : "");
        dot.type = "button";
        dot.setAttribute("role", "tab");
        dot.setAttribute("aria-label", `Отзыв ${i + 1} из ${total}`);
        dot.setAttribute("aria-selected", i === 0 ? "true" : "false");
        dot.dataset.index = String(i);
        dot.addEventListener("click", () => goTo(i));
        dotsEl.appendChild(dot);
      });
    }

    function getSlideOffset(index) {
      if (index === 0) return 0;

      let offset = 0;
      for (let i = 0; i < index; i++) {
        const slide = slides[i];
        const style = window.getComputedStyle(slide);
        offset +=
          slide.offsetWidth +
          (parseFloat(style.marginLeft) || 0) +
          (parseFloat(style.marginRight) || 0);
      }
      return offset;
    }

    function goTo(index) {
      current = Math.max(0, Math.min(index, total - 1));

      const offset = getSlideOffset(current);
      track.style.transform = `translateX(-${offset}px)`;

      if (carousel) {
        carousel.setAttribute(
          "aria-label",
          `Отзыв ${current + 1} из ${total}`,
        );
      }

      if (dotsEl) {
        dotsEl.querySelectorAll(".reviews__dot").forEach((dot, i) => {
          const active = i === current;
          dot.classList.toggle("is-active", active);
          dot.setAttribute("aria-selected", active.toString());
        });
      }

      if (prevBtn) prevBtn.disabled = current === 0;
      if (nextBtn) nextBtn.disabled = current === total - 1;
    }

    prevBtn?.addEventListener("click", () => goTo(current - 1));
    nextBtn?.addEventListener("click", () => goTo(current + 1));

        track.addEventListener(
          "touchstart",
          (e) => {
        startX = e.touches[0].clientX;
        isDragging = false;
          },
      { passive: true },
        );

        track.addEventListener(
      "touchmove",
          (e) => {
        if (Math.abs(e.touches[0].clientX - startX) > 8) isDragging = true;
      },
      { passive: true },
    );

    track.addEventListener(
      "touchend",
      (e) => {
        if (!isDragging) return;
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 48) {
          goTo(dx < 0 ? current + 1 : current - 1);
        }
        isDragging = false;
      },
      { passive: true },
    );

    track.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      startX = e.clientX;
      isDragging = false;
      mouseDown = true;
      track.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (e) => {
      if (!mouseDown) return;
      if (Math.abs(e.clientX - startX) > 8) isDragging = true;
    });

    window.addEventListener("mouseup", (e) => {
      if (!mouseDown) return;
      const dx = e.clientX - startX;
      if (isDragging && Math.abs(dx) > 48) {
        goTo(dx < 0 ? current + 1 : current - 1);
      }
      mouseDown = false;
      isDragging = false;
      track.style.cursor = "";
    });

    const section = track.closest(".reviews");
    section?.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
      goTo(current - 1);
    }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(current + 1);
      }
      if (e.key === "Home") {
        e.preventDefault();
        goTo(0);
      }
      if (e.key === "End") {
        e.preventDefault();
        goTo(total - 1);
      }
    });

    let resizeTimer;
    window.addEventListener(
      "resize",
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          const noAnim = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
          ).matches;
          if (noAnim) track.style.transition = "none";
          goTo(current);
          if (noAnim) {
            requestAnimationFrame(() => {
              track.style.transition = "";
            });
          }
        }, 100);
      },
      { passive: true },
    );

    goTo(0);
    window.PalomaReviews = {
      goTo,
      total,
      getCurrent: () => current,
    };
  })();

  /* Header: скролл */
  const siteHeader = document.getElementById("siteHeader");
  if (siteHeader) {
    const heroEl =
      document.getElementById("homeHero") ||
      document.getElementById("hero") ||
      document.querySelector(".hero-scene") ||
      document.querySelector(".coffee-hero") ||
      document.querySelector(".cf-hero") ||
      document.querySelector(".w-hero");

    function onHeaderScroll() {
      if (!heroEl) {
        siteHeader.classList.add("is-scrolled");
        return;
      }
      if (heroEl.id === "homeHero") {
        const heroBottom = heroEl.getBoundingClientRect().bottom;
        siteHeader.classList.toggle("is-scrolled", heroBottom <= 72);
        return;
      }
      if (window.scrollY > 60) siteHeader.classList.add("is-scrolled");
      else siteHeader.classList.remove("is-scrolled");
    }

    window.addEventListener("scroll", onHeaderScroll, { passive: true });
    window.addEventListener("resize", onHeaderScroll);
    onHeaderScroll();
  }

  /* Мобильное меню */
  (function initMobileNav() {
    const toggle = document.getElementById("menuToggle");
    const backdrop = document.getElementById("menuBackdrop");
    const panel = document.getElementById("mobileNav");
    if (!toggle || !backdrop || !panel) return;

    /* iOS/WebKit: у .site-header есть backdrop-filter (frosted-эффект), а он
       делает элемент «containing block» для position:fixed потомков. Панель
       мобильного меню лежит ВНУТРИ шапки — из-за этого на телефонах и планшетах
       она обрезалась по высоте шапки и «не открывалась полностью». Выносим
       панель и подложку в конец <body>, чтобы они позиционировались от вьюпорта,
       а не от шапки. CSS-селекторы у них по классам — от переноса не ломаются. */
    if (panel.parentElement !== document.body) document.body.appendChild(panel);
    if (backdrop.parentElement !== document.body) document.body.appendChild(backdrop);

    let previouslyFocused = null;
    let navScrollY = 0;

    function isMobileBp() {
      return window.matchMedia("(max-width: 1024px)").matches;
    }

    /* iOS Safari игнорирует overflow:hidden на body — фон продолжает
       прокручиваться под открытым меню, и панель «сворачивается».
       Надёжный замок: фиксируем body со смещением на текущую прокрутку. */
    function lockScroll() {
      navScrollY = window.scrollY || window.pageYOffset || 0;
      document.body.style.position = "fixed";
      document.body.style.top = `-${navScrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.width = "100%";
    }
    function unlockScroll() {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.style.width = "";
      window.scrollTo(0, navScrollY);
    }

    function openNav() {
      if (!isMobileBp()) return;
      previouslyFocused = document.activeElement;
      document.body.classList.add("is-nav-open");
      lockScroll();
      toggle.setAttribute("aria-expanded", "true");
      toggle.setAttribute("aria-label", "Закрыть меню");
      panel.setAttribute("aria-hidden", "false");
      backdrop.setAttribute("aria-hidden", "false");
      panel.querySelector(".site-header__mobile-link")?.focus({
        preventScroll: true,
      });
    }

    function closeNav() {
      document.body.classList.remove("is-nav-open");
      unlockScroll();
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Открыть меню");
      panel.setAttribute("aria-hidden", "true");
      backdrop.setAttribute("aria-hidden", "true");
      if (
        previouslyFocused &&
        typeof previouslyFocused.focus === "function"
      ) {
        previouslyFocused.focus({ preventScroll: true });
      }
      previouslyFocused = null;
    }

    const inner = panel.querySelector(".site-header__mobile-inner");
    if (inner && !inner.querySelector("[data-mobile-footer-injected]")) {
      inner.insertAdjacentHTML(
        "beforeend",
        `<div class="site-header__mobile-footer" data-mobile-footer-injected>
          <a href="https://t.me/palomanvrsk" class="site-header__mobile-muted" target="_blank" rel="noopener noreferrer">Telegram</a>
          <a href="https://wa.me/79897707000" class="site-header__mobile-muted" target="_blank" rel="noopener noreferrer">WhatsApp</a>
          <a href="tel:+79897707000" class="btn btn--dark site-header__mobile-cta">Позвонить нам</a>
        </div>`,
      );
    }

    toggle.addEventListener("click", () => {
      if (document.body.classList.contains("is-nav-open")) closeNav();
      else openNav();
    });
    backdrop.addEventListener("click", closeNav);

    panel.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => closeNav());
    });

    window.addEventListener(
      "resize",
      () => {
        if (!isMobileBp()) closeNav();
      },
      { passive: true }
    );
  })();

  /* Горизонтальные process-секции (кофейня, свадьбы, events) */
  (function initHorizontalProcesses() {
    const configs = [
      { viewportId: "coffeeProcessViewport", trackId: "coffeeProcessTrack" },
      { viewportId: "wProcessViewport", trackId: "wProcessTrack" },
      { viewportId: "eProcessViewport", trackId: "eProcessTrack" },
    ];

    const isMobile = () => window.innerWidth <= 768;
    const noMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    configs.forEach(({ viewportId, trackId }) => {
      const vpEl = document.getElementById(viewportId);
      const trackEl = document.getElementById(trackId);
      if (!vpEl || !trackEl) return;

      if (isMobile() || noMotion) {
        trackEl.style.cssText =
          "position:static;height:auto;overflow-x:auto;transform:none!important;" +
          "scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;";
        vpEl.style.height = "auto";
        trackEl
          .querySelectorAll(
            ".process-card,.coffee-process__card,.w-process__card,.e-process__card,.process-step",
          )
          .forEach((c) => {
            c.style.scrollSnapAlign = "start";
          });
        return;
      }

      let raf;
      function update() {
        const rect = vpEl.getBoundingClientRect();
        const totalDist = vpEl.offsetHeight - window.innerHeight;
        const scrolled = Math.max(0, -rect.top);
        const progress =
          totalDist > 0 ? Math.min(1, scrolled / totalDist) : 0;
        const pad =
          parseFloat(getComputedStyle(trackEl).paddingLeft) || 80;
        const maxT = Math.max(
          0,
          trackEl.scrollWidth - (window.innerWidth - pad * 2),
        );
        trackEl.style.transform = `translateX(${-progress * maxT}px)`;
      }

      function onScroll() {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(update);
      }

      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", update);
      update();
    });
  })();

  /* Избранное — см. wishlist.js (window.PalomaWishlist) */

  /* Активный пункт меню */
  (function markActiveNav() {
    const path = window.location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".site-header__link[href]").forEach((link) => {
      if (
        link.classList.contains("site-header__link--has-dropdown")
      ) {
        return;
      }
      const raw = link.getAttribute("href") || "";
      const href = raw.split("?")[0].split("/").pop();
      if (!href || href.startsWith("#")) return;
      link.classList.toggle("is-active", href === path);
    });
  })();

  /* Кофейное меню: add-to-cart через делегирование */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add-to-cart]");
    if (!btn || btn.id === "modalAddToCart") return;
    const menuItem = btn.closest(".menu-item");
    if (!menuItem || !window.PalomaCart) return;
    e.preventDefault();
    e.stopPropagation();
    const idBase = menuItem.dataset.id || "item";
    const price =
      parseInt(String(menuItem.dataset.price || "0").replace(/\D/g, ""), 10) ||
      0;
    const name = menuItem.dataset.name || "PALOMA Coffee";
    window.PalomaCart.add({
      id: `cafe-${idBase}`,
      name,
      price,
      qty: 1,
      bg:
        menuItem.dataset.photoBg ||
        "linear-gradient(135deg, #5c3d28, #8a6248)",
      category: menuItem.dataset.menuCategory || "coffee",
      size: "—",
      addons: [],
    });
  });

  /* Escape: модалка → корзина → выпадающие шапки (≤1024) → меню */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    const modalEl = document.getElementById("productModal");
    if (modalEl?.classList.contains("is-open")) {
      modalEl.classList.remove("is-open");
      modalEl.setAttribute("aria-hidden", "true");
      syncBodyOverflow();
      return;
    }

    const drawerEl = document.getElementById("cartDrawer");
    if (drawerEl?.classList.contains("is-open")) {
      window.PalomaCart?.closeDrawer?.() || window.PalomaCart?.close?.();
      return;
    }

    const openWraps = document.querySelectorAll(
      ".site-header__dropdown-wrap.is-open"
    );
    if (openWraps.length > 0) {
      openWraps.forEach((w) => {
        w.classList.remove("is-open");
        const t = w.querySelector(".site-header__link--has-dropdown");
        if (t) {
          const exp = t.getAttribute("aria-expanded");
          if (exp !== null)
            t.setAttribute("aria-expanded", "false");
        }
      });
      return;
    }

    if (document.body.classList.contains("is-nav-open")) {
      document.getElementById("menuToggle")?.click();
    }
  });

  syncBodyOverflow();
})();

/* Subscription + categories reveal — см. initHomeEditorialSectionsReveal() */

/* Split hero — load animations handled in CSS (.paloma-hero) */
function initHero() {}

/* ═══════════════════════════════════════════════════════
   SHOWCASE — онлайн-витрина главной страницы
   ═══════════════════════════════════════════════════════ */
(function initShowcase() {
  "use strict";

  const showcaseGrid = document.getElementById("showcaseGrid");
  if (!showcaseGrid) return;

  const products = window.PALOMA_CATALOG?.getAll?.() || [];
  if (!products.length) return;

  const onlineProducts = products.filter((p) =>
    p.categories?.includes("online"),
  );
  const showcaseProducts = (
    onlineProducts.length >= 4 ? onlineProducts : products
  ).slice(0, 8);

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function getBadgeLabel(product) {
    const raw = (window.PALOMA_PRODUCTS || []).find((p) => p.id === product.id);
    return raw?.badge || null;
  }

  function renderCard(product, wishIds) {
    const isWished = wishIds.includes(String(product.id));
    const slug = product.slug || product.id;
    const badgeLabel = getBadgeLabel(product);
    const hoverBg = product.placeholderBgHover || product.placeholderBg;

    let badgeHtml = "";
    if (badgeLabel) {
      badgeHtml = `<span class="product-card__badge ${badgeClass(badgeLabel)}"
                        aria-label="${esc(badgeLabel)}">
                     ${esc(badgeLabel)}
                   </span>`;
    }

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
    article.dataset.productName = product.name;
    article.dataset.productPrice = String(product.price);
    article.dataset.productBg = product.placeholderBg || "";
    article.dataset.productImage = product.image || "";
    article.dataset.productCat = product.category || product.categories?.[0] || "";

    article.innerHTML = `
      <div class="product-card__media">
        ${mediaContent}
        <a href="product.html?slug=${encodeURIComponent(slug)}"
           class="product-card__media-link"
           aria-label="Перейти на страницу ${esc(product.name)}"
           tabindex="-1"
           aria-hidden="true"></a>
        ${badgeHtml}
        <button
          class="product-card__wishlist${isWished ? " is-active" : ""}"
          data-product-id="${esc(String(product.id))}"
          data-wishlist-btn="${esc(String(product.id))}"
          aria-label="${isWished ? "Убрать из избранного" : "Добавить в избранное"}"
          aria-pressed="${isWished}"
          type="button">
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
        <p class="product-card__price">
          ${Number(product.price).toLocaleString("ru-RU")} ₽
        </p>
        <div class="product-card__btns">
          <a href="product.html?slug=${encodeURIComponent(slug)}"
             class="product-card__btn product-card__btn--detail"
             aria-label="Подробнее о ${esc(product.name)}">
            Подробнее
          </a>
          <button
            class="product-card__btn product-card__btn--cart"
            data-add-to-cart
            type="button"
            aria-label="Добавить ${esc(product.name)} в корзину">
            В корзину
          </button>
        </div>
      </div>
    `;

    return article;
  }

  function initReveal(container) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      container.querySelectorAll(".product-card").forEach((c) => {
        c.classList.add("is-visible", "is-revealed");
        c.style.transitionDelay = "0ms";
      });
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible", "is-revealed");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -32px 0px" },
    );

    container.querySelectorAll(".product-card").forEach((el) => {
      io.observe(el);
    });
  }

  function fillGrid(grid, list) {
    const wishIds = window.PalomaWishlist?.load?.() || [];
    const fragment = document.createDocumentFragment();

    list.forEach((product, i) => {
      const card = renderCard(product, wishIds);
      card.style.transitionDelay = `${Math.min(i * 60, 480)}ms`;
      fragment.appendChild(card);
    });
    grid.appendChild(fragment);
    initReveal(grid);
  }

  function bindCartClicks(grid) {
    grid.addEventListener("click", (e) => {
      const cartBtn = e.target.closest("[data-add-to-cart]");
      if (!cartBtn) return;

      e.preventDefault();
      e.stopPropagation();

      const card = cartBtn.closest("[data-product-id]");
      if (!card) return;

      const bgEl = card.querySelector(".product-card__ph");
      const bg = bgEl ? getComputedStyle(bgEl).background : "";

      const item = {
        id: `${card.dataset.productId}-quick-m-${card.dataset.productPrice || "0"}`,
        name: card.dataset.productName || "Товар",
        price: parseInt(card.dataset.productPrice, 10) || 0,
        qty: 1,
        bg,
        image: card.dataset.productImage || "",
        category: card.dataset.productCat || "",
        size: "M",
        addons: [],
      };

      window.PalomaCart?.add(item);

      const orig = cartBtn.textContent;
      cartBtn.textContent = "✓";
      cartBtn.classList.add("is-added");
      cartBtn.disabled = true;
      window.setTimeout(() => {
        cartBtn.textContent = orig;
        cartBtn.classList.remove("is-added");
        cartBtn.disabled = false;
      }, 1400);
    });
  }

  fillGrid(showcaseGrid, showcaseProducts);
  bindCartClicks(showcaseGrid);

  window.PalomaWishlist?.syncButtons?.();
  window.palomaRebindCursorHovers?.();
})();

/* ════════════════════════════════════════════════════════
   ГОРИЗОНТАЛЬНЫЙ ПРОЦЕСС — исправленная механика
   ════════════════════════════════════════════════════════ */
(function initProcessScroll() {
  "use strict";

  const viewport = document.getElementById("processViewport");
  const track = document.getElementById("processTrack");
  if (!viewport || !track) return;

  const isMobile = () => window.innerWidth <= 768;
  const noMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (isMobile() || noMotion) {
    viewport.style.height = "auto";
    return;
  }

  let raf;
  let lastProgress = -1;

  function setup() {
    if (isMobile() || noMotion) return;

    requestAnimationFrame(() => {
      const trackW = track.scrollWidth;
      const visibleW = window.innerWidth;
      const maxT = Math.max(0, trackW - visibleW);

      if (maxT === 0) {
        viewport.style.height = "100vh";
        viewport.dataset.maxT = "0";
        return;
      }

      const viewportH = maxT + window.innerHeight;
      viewport.style.height = viewportH + "px";
      viewport.dataset.maxT = String(maxT);
      lastProgress = -1;
    });
  }

  function update() {
    if (isMobile() || noMotion) {
      track.style.transform = "";
      return;
    }

    const maxT = parseFloat(viewport.dataset.maxT) || 0;
    if (maxT === 0) return;

    const rect = viewport.getBoundingClientRect();
    const dist = viewport.offsetHeight - window.innerHeight;
    if (dist <= 0) return;

    const scrolled = Math.max(0, -rect.top);
    const progress = Math.min(1, scrolled / dist);

    if (Math.abs(progress - lastProgress) < 0.0002) {
      raf = requestAnimationFrame(update);
      return;
    }
    lastProgress = progress;

    track.style.transform = `translateX(${-(progress * maxT)}px)`;
  }

  let resizeTimer;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (isMobile() || noMotion) {
        viewport.style.height = "auto";
        track.style.transform = "";
        if (raf) cancelAnimationFrame(raf);
        raf = null;
        return;
      }
      lastProgress = -1;
      setup();
    }, 120);
  }

  function startLoop() {
    if (raf) cancelAnimationFrame(raf);
    function loop() {
      update();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
  }

  setup();
  startLoop();
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("beforeunload", () => {
    if (raf) cancelAnimationFrame(raf);
  });
})();

/* ═══════════════════════════════════════════════════════
   CURTAIN BLOCKS — reveal карточек + parallax фона
   ═══════════════════════════════════════════════════════ */
(function initCurtainBlocks() {
  "use strict";

  const curtains = document.querySelectorAll(".curtain");
  if (!curtains.length) return;

  const noMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (!noMotion) {
    const style = document.createElement("style");
    style.textContent = `
      .curtain__card {
        opacity: 0;
        transform: translateX(20px);
        transition:
          opacity 0.65s cubic-bezier(0.22, 1, 0.36, 1),
          transform 0.65s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .curtain__card.is-revealed {
        opacity: 1;
        transform: translateX(0);
      }
      @media (max-width: 768px) {
        .curtain__card {
          transform: translateY(16px);
        }
        .curtain__card.is-revealed {
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(style);

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const card = entry.target.querySelector(".curtain__card");
          if (!card) return;

          if (entry.isIntersecting) {
            window.setTimeout(() => {
              card.classList.add("is-revealed");
            }, 80);
          } else {
            const rect = entry.target.getBoundingClientRect();
            if (rect.top > 0) {
              card.classList.remove("is-revealed");
            }
          }
        });
      },
      {
        threshold: 0.15,
        rootMargin: "0px 0px -10% 0px",
      },
    );

    curtains.forEach((curtain) => io.observe(curtain));
  }

  if (noMotion) return;

  let raf = null;
  const activeBlocks = new Set();

  const bgObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          activeBlocks.add(entry.target);
          if (!raf) startBgLoop();
        } else {
          activeBlocks.delete(entry.target);
          if (activeBlocks.size === 0 && raf) {
            cancelAnimationFrame(raf);
            raf = null;
          }
        }
      });
    },
    { threshold: 0, rootMargin: "10% 0px 10% 0px" },
  );

  curtains.forEach((c) => bgObserver.observe(c));

  function startBgLoop() {
    function loop() {
      activeBlocks.forEach((curtain) => {
        const bg = curtain.querySelector(".curtain__bg");
        if (!bg) return;

        const rect = curtain.getBoundingClientRect();
        const h = curtain.offsetHeight;
        const vh = window.innerHeight;
        const progress = 1 - rect.bottom / (h + vh);
        const clamped = Math.max(0, Math.min(1, progress));
        const scale = 1 + clamped * 0.06;
        bg.style.transform = `scale(${scale})`;
      });
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
  }

  window.addEventListener("beforeunload", () => {
    if (raf) cancelAnimationFrame(raf);
  });
})();

/* ═══════════════════════════════════════════════════════
   HOME REDESIGN — reveal, about scroll
   ═══════════════════════════════════════════════════════ */
function initHomeReveal() {
  "use strict";

  if (!document.body.classList.contains("is-home")) return;

  const nodes = document.querySelectorAll(".home-reveal");
  if (!nodes.length) return;

  const noMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (noMotion || typeof IntersectionObserver !== "function") {
    nodes.forEach((el) => el.classList.add("is-revealed"));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        io.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
  );

  nodes.forEach((el) => io.observe(el));
}

function initHomeAboutHorizontalScroll() {
  "use strict";

  const section = document.getElementById("homeAboutScroll");
  const track = document.getElementById("homeAboutTrack");

  if (!section || !track) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const mobileQuery = window.matchMedia("(max-width: 768px)");

  let raf = null;
  let maxTranslate = 0;
  let sectionTop = 0;
  let scrollDistance = 0;
  let enabled = false;

  function measure() {
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    if (!enabled || reduceMotion || mobileQuery.matches) {
      section.style.height = "auto";
      track.style.transform = "none";
      scrollDistance = 0;
      return;
    }

    section.style.height = `${viewportH}px`;

    requestAnimationFrame(() => {
      const trackW = track.scrollWidth;
      maxTranslate = Math.max(0, trackW - viewportW);
      scrollDistance = maxTranslate;
      section.style.height = `${viewportH + scrollDistance}px`;
      sectionTop = section.offsetTop;
      update();
    });
  }

  function update() {
    if (!enabled || reduceMotion || mobileQuery.matches) return;

    const rect = section.getBoundingClientRect();
    const scrolled = Math.max(0, Math.min(scrollDistance, -rect.top));

    track.style.transform = `translate3d(${-scrolled}px, 0, 0)`;
    raf = null;
  }

  function requestUpdate() {
    if (raf) return;
    raf = window.requestAnimationFrame(update);
  }

  function enableDesktop() {
    enabled = !reduceMotion && !mobileQuery.matches;

    if (!enabled) {
      section.style.height = "auto";
      track.style.transform = "none";
      return;
    }

    measure();
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", measure);

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", enableDesktop);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(enableDesktop);
  }

  enableDesktop();
}

function initHomeAboutScroll() {
  initHomeAboutHorizontalScroll();
}

function initHomeEditorialSectionsReveal() {
  "use strict";

  const sections = document.querySelectorAll(
    ".home-subscription, .home-categories",
  );
  if (!sections.length) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (reduceMotion) {
    sections.forEach((section) => section.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.16,
      rootMargin: "0px 0px -8% 0px",
    },
  );

  sections.forEach((section) => observer.observe(section));
}

function initProductCarousels() {
  "use strict";

  const carousels = document.querySelectorAll("[data-product-carousel]");
  if (!carousels.length) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  carousels.forEach((section) => {
    const viewport = section.querySelector("[data-carousel-viewport]");
    const track = section.querySelector("[data-carousel-track]");
    const prevBtn = section.querySelector("[data-carousel-prev]");
    const nextBtn = section.querySelector("[data-carousel-next]");
    const progress = section.querySelector("[data-carousel-progress]");

    if (!viewport || !track) return;

    let raf = null;

    function getScrollStep() {
      const firstCard = track.querySelector(".home-product-card");
      if (!firstCard) return viewport.clientWidth;

      const cardRect = firstCard.getBoundingClientRect();
      const styles = window.getComputedStyle(track);
      const gap = parseFloat(styles.columnGap || styles.gap || "0") || 0;

      return cardRect.width + gap;
    }

    function updateState() {
      const maxScroll = viewport.scrollWidth - viewport.clientWidth;
      const current = viewport.scrollLeft;
      const progressValue = maxScroll > 0 ? (current / maxScroll) * 100 : 100;

      if (progress) {
        progress.style.width = `${Math.max(0, Math.min(100, progressValue))}%`;
      }

      if (prevBtn) {
        prevBtn.classList.toggle("is-disabled", current <= 2);
      }

      if (nextBtn) {
        nextBtn.classList.toggle("is-disabled", current >= maxScroll - 2);
      }

      raf = null;
    }

    function requestUpdate() {
      if (raf) return;
      raf = window.requestAnimationFrame(updateState);
    }

    function scrollByCards(direction) {
      viewport.scrollBy({
        left: getScrollStep() * direction,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", () => scrollByCards(-1));
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", () => scrollByCards(1));
    }

    viewport.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    updateState();
  });
}

function initEvProcess() {
  "use strict";

  const viewport = document.getElementById("evProcessViewport");
  const track = document.getElementById("evProcessTrack");
  const progressFill = document.getElementById("evProgressFill");

  if (!viewport || !track) return;

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const mobileQuery = window.matchMedia("(max-width: 768px)");

  let raf = null;
  let scrollDistance = 0;
  let enabled = false;

  function measure() {
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    if (!enabled || reduceMotion || mobileQuery.matches) {
      viewport.style.height = "auto";
      track.style.transform = "none";
      scrollDistance = 0;
      if (progressFill) progressFill.style.width = "0%";
      return;
    }

    viewport.style.height = `${viewportH}px`;

    requestAnimationFrame(() => {
      const trackW = track.scrollWidth;
      const maxTranslate = Math.max(0, trackW - viewportW);
      scrollDistance = maxTranslate;
      viewport.style.height = `${viewportH + scrollDistance}px`;
      update();
    });
  }

  function update() {
    if (!enabled || reduceMotion || mobileQuery.matches) return;

    const rect = viewport.getBoundingClientRect();
    const scrolled = Math.max(0, Math.min(scrollDistance, -rect.top));
    const progress = scrollDistance > 0 ? scrolled / scrollDistance : 0;

    track.style.transform = `translate3d(${-scrolled}px, 0, 0)`;

    if (progressFill) {
      progressFill.style.width = `${(progress * 100).toFixed(2)}%`;
    }

    raf = null;
  }

  function requestUpdate() {
    if (raf) return;
    raf = window.requestAnimationFrame(update);
  }

  function enableDesktop() {
    enabled = !reduceMotion && !mobileQuery.matches;

    if (!enabled) {
      viewport.style.height = "auto";
      track.style.transform = "none";
      return;
    }

    measure();
  }

  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", measure);

  if (typeof mobileQuery.addEventListener === "function") {
    mobileQuery.addEventListener("change", enableDesktop);
  } else if (typeof mobileQuery.addListener === "function") {
    mobileQuery.addListener(enableDesktop);
  }

  enableDesktop();
}

function initHomeShowcaseCarousel() {
  initProductCarousels();
}

if (document.body.classList.contains("is-home")) {
  initHero();
  initHomeReveal();
  initProductCarousels();
  initHomeAboutScroll();
  initHomeEditorialSectionsReveal();
}

if (document.body.classList.contains("event-decoration-page")) {
  initEvProcess();
}

/* ── Маска телефона в подвале (.sf2-input): +7 (___) ___-__-__ ── */
(function(){
  "use strict";
  var TPL_SLOTS = [4,5,6,9,10,11,13,14,16,17]; // позиции цифр в "+7 (___) ___-__-__"
  function digitsFrom(str){
    var d = (str||"").replace(/\D/g,"");
    if (d[0] === "7" || d[0] === "8") d = d.slice(1);
    return d.slice(0,10);
  }
  function format(d){
    return "+7 (" +
      (d.slice(0,3)+"___").slice(0,3) + ") " +
      (d.slice(3,6)+"___").slice(0,3) + "-" +
      (d.slice(6,8)+"__").slice(0,2) + "-" +
      (d.slice(8,10)+"__").slice(0,2);
  }
  function caretPos(n){ return n === 0 ? 4 : TPL_SLOTS[Math.min(n,10)-1] + 1; }
  function setCaret(input,pos){ try{ input.setSelectionRange(pos,pos); }catch(e){} }

  function attach(input){
    if (input.dataset.phoneMask) return;
    input.dataset.phoneMask = "1";
    input.addEventListener("focus", function(){
      if (!input.value){ input.value = format(""); requestAnimationFrame(function(){ setCaret(input,4); }); }
    });
    input.addEventListener("blur", function(){
      if (digitsFrom(input.value).length === 0) input.value = "";
    });
    input.addEventListener("input", function(){
      var d = digitsFrom(input.value);
      input.value = format(d);
      setCaret(input, caretPos(d.length));
    });
    input.addEventListener("click", function(){
      var d = digitsFrom(input.value);
      setCaret(input, caretPos(d.length));
    });
  }
  var SEL = 'input[type="tel"]:not([data-nomask]), input[inputmode="tel"]:not([data-nomask]), .sf2-input';
  function init(){
    document.querySelectorAll(SEL).forEach(attach);
    /* делегирование: поля из попапов/модалок, добавленные позже, тоже получают маску */
    document.addEventListener("focusin", function(e){
      var t = e.target;
      if (t && t.matches && t.matches(SEL)){
        var isNew = !t.dataset.phoneMask;
        attach(t);
        if (isNew && !t.value){ t.value = format(""); requestAnimationFrame(function(){ setCaret(t,4); }); }
      }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

/* ── Подписка в подвале (.sf2-form): валидация + подтверждение ── */
(function(){
  "use strict";
  function onlyDigits(v){ return (v||"").replace(/\D/g,"").replace(/^[78]/,"").slice(0,10); }
  function flash(el,cls){ if(!el)return; el.classList.add(cls); setTimeout(function(){el.classList.remove(cls);},700); }
  function init(){
    document.querySelectorAll(".sf2-form").forEach(function(form){
      if (form.dataset.sf2bound) return;
      form.dataset.sf2bound = "1";
      form.addEventListener("submit", function(e){
        e.preventDefault();
        var box = form.closest(".sf2-sub") || form.parentElement;
        var input = form.querySelector(".sf2-input");
        var consent = box ? box.querySelector('.sf2-consent input[type="checkbox"]') : null;
        if (onlyDigits(input && input.value).length < 10){ if(input)input.focus(); flash(form,"sf2-form--err"); return; }
        if (consent && !consent.checked){ flash(box.querySelector(".sf2-consent"),"sf2-consent--err"); return; }
        if (form) form.style.display = "none";
        var c = box.querySelector(".sf2-consent"); if (c) c.style.display = "none";
        if (!box.querySelector(".sf2-ok")){
          var ok = document.createElement("p");
          ok.className = "sf2-ok";
          ok.textContent = "Спасибо! Мы свяжемся с вами в ближайшее время.";
          box.appendChild(ok);
        }
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
