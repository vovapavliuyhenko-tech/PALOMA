/* PALOMA Events — events.html */
(function () {
  "use strict";

  const d = "div";

  renderGallery();
  renderReviews();
  initEventsForm();
  initEventsReviewsCarousel();
  initDecorPageMotion();

  function renderGallery() {
    const grid = document.getElementById("eGalleryGrid");
    const items = window.PALOMA_EVENTS_GALLERY || [];
    if (!grid || !items.length) return;

    grid.innerHTML = items
      .map(
        (item) => `
      <article class="e-gallery-card" data-cursor="hover">
        <${d} class="e-gallery-card__media" style="background:${item.bg}" role="img" aria-label="${esc(item.caption)}"></${d}>
        <${d} class="e-gallery-card__body">
          <p class="e-gallery-card__meta">
            <span>${esc(item.city)}</span>
            <span class="e-gallery-card__dot" aria-hidden="true">·</span>
            <span>${esc(item.type)}</span>
          </p>
          <p class="e-gallery-card__date">${esc(item.date)}</p>
          <p class="e-gallery-card__caption">${esc(item.caption)}</p>
          <span class="e-gallery-card__brand">PALOMA</span>
        </${d}>
      </article>`,
      )
      .join("");
  }

  function renderReviews() {
    const track = document.getElementById("eventsReviewsTrack");
    const items = window.PALOMA_EVENTS_REVIEWS || [];
    if (!track || !items.length) return;

    track.innerHTML = items
      .map(
        (r) => `
      <article class="review-slide">
        <${d} class="review-slide__photo" aria-hidden="true">
          <${d} class="review-slide__ph" style="background:${r.bg}"></${d}>
        </${d}>
        <${d} class="review-slide__body">
          <blockquote class="review-slide__quote">${esc(r.quote)}</blockquote>
          <p class="review-slide__detail">${esc(r.detail)}</p>
          <p class="review-slide__brand">PALOMA</p>
        </${d}>
      </article>`,
      )
      .join("");
  }

  function initEventsReviewsCarousel() {
    const track = document.getElementById("eventsReviewsTrack");
    const prevBtn = document.getElementById("eventsReviewsPrev");
    const nextBtn = document.getElementById("eventsReviewsNext");
    if (!track) return;

    const slides = track.querySelectorAll(".review-slide");
    const total = slides.length;
    if (!total) return;

    let cur = 0;
    const go = (i) => {
      cur = (i + total) % total;
      track.style.transform = `translateX(${-cur * 100}%)`;
    };

    prevBtn?.addEventListener("click", () => go(cur - 1));
    nextBtn?.addEventListener("click", () => go(cur + 1));

    let sx = 0;
    track.addEventListener(
      "touchstart",
      (e) => {
        sx = e.touches[0].clientX;
      },
      { passive: true },
    );
    track.addEventListener(
      "touchend",
      (e) => {
        const dx = e.changedTouches[0].clientX - sx;
        if (Math.abs(dx) > 50) go(dx < 0 ? cur + 1 : cur - 1);
      },
      { passive: true },
    );
  }

  function initEventsForm() {
    const form = document.getElementById("eventsForm");
    const success = document.getElementById("eFormSuccess");
    if (!form || !success) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = form.querySelector('[name="name"]')?.value?.trim();
      const phone = form.querySelector('[name="phone"]')?.value?.trim();
      if (!name || !phone) {
        form.reportValidity?.();
        return;
      }

      const btn = form.querySelector(".e-form__submit");
      if (btn instanceof HTMLButtonElement) {
        btn.textContent = "Отправляем...";
        btn.disabled = true;
      }

      const payload = {
        name,
        phone,
        messenger: form.querySelector('[name="messenger"]')?.value || "",
        date: form.querySelector('[name="date"]')?.value || "",
        eventType: form.querySelector('[name="eventType"]')?.value || "",
        comment: form.querySelector('[name="comment"]')?.value || "",
        page: "events",
        ts: new Date().toISOString(),
      };

      try {
        const key = "paloma_event_leads";
        const prev = JSON.parse(localStorage.getItem(key) || "[]");
        prev.push(payload);
        localStorage.setItem(key, JSON.stringify(prev));
      } catch {
        /* ignore */
      }

      window.setTimeout(() => {
        form
          .querySelectorAll(".e-form__field")
          .forEach((el) => {
            el.style.display = "none";
          });
        success.hidden = false;
      }, 700);
    });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* =====================================================
     DECOR PAGE — motion hooks
     ===================================================== */
  function initDecorPageMotion() {
    const page = document.querySelector(".decor-page");
    if (!page) return;

    initDecorSectionReveal();
    initDecorHeroMotion();
    initDecorStatementReveal();
    initDecorScaleMotion();
    initDecorTypesReveal();
    initDecorPortfolioReveal();
    initDecorProcessHorizontalScroll();
    initDecorRequestForm();

    /*
      TODO next stage:
      4. Dark section background parallax (scroll-driven or rAF)
      5. Rotating / orbit infographic around stats
    */
  }

  /* ── Generic section reveal on scroll ── */
  function initDecorSectionReveal() {
    var sections = document.querySelectorAll("[data-decor-reveal-section]");
    if (!sections.length) return;

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      sections.forEach(function (section) {
        section.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.12,
        rootMargin: "0px 0px -8% 0px",
      }
    );

    sections.forEach(function (section) {
      observer.observe(section);
    });
  }

  function initDecorScaleMotion() {
    const section = document.getElementById("decorScale");
    if (!section) return;

    const bg = document.getElementById("decorScaleBg");
    const orbit = document.getElementById("decorScaleOrbit");
    const stats = section.querySelectorAll("[data-decor-scale-stat]");

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobileQuery = window.matchMedia("(max-width: 900px)");

    if (reduceMotion) {
      if (bg) bg.style.transform = "none";
      if (orbit) orbit.style.transform = "none";
      stats.forEach(function (stat) { stat.style.transform = "none"; });
      return;
    }

    if (mobileQuery.matches) {
      if (orbit) orbit.style.transform = "none";
      stats.forEach(function (stat) { stat.style.transform = "none"; });
    }

    let raf = null;
    let active = false;

    function update() {
      const rect = section.getBoundingClientRect();
      const viewH = window.innerHeight;
      const sectionH = section.offsetHeight || viewH;

      const progress = 1 - rect.bottom / (sectionH + viewH);
      const clamped = Math.max(0, Math.min(1, progress));

      if (bg) {
        bg.style.transform = "scale(" + (1 + clamped * 0.08).toFixed(4) + ")";
      }

      if (!mobileQuery.matches && orbit) {
        orbit.style.transform = "rotate(" + (-8 + clamped * 16).toFixed(3) + "deg)";
      }

      if (!mobileQuery.matches && stats.length) {
        stats.forEach(function (stat, index) {
          const direction = index % 2 === 0 ? -1 : 1;
          const y = direction * (clamped - 0.5) * 34;
          stat.style.transform = "translate3d(0," + y.toFixed(2) + "px,0)";
        });
      }

      raf = null;
      if (active) {
        raf = window.requestAnimationFrame(update);
      }
    }

    function start() {
      if (active) return;
      active = true;
      raf = window.requestAnimationFrame(update);
    }

    function stop() {
      active = false;
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = null;
      }
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { start(); } else { stop(); }
        });
      },
      { rootMargin: "20% 0px 20% 0px", threshold: 0 }
    );

    observer.observe(section);

    window.addEventListener("resize", function () {
      if (active) update();
    });
  }

  function initDecorTypesReveal() {
    const section = document.getElementById("decorTypes");
    if (!section) return;

    const cards = section.querySelectorAll("[data-decor-type-card]");
    if (!cards.length) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      cards.forEach(function (card) {
        card.classList.add("is-visible");
        card.style.transitionDelay = "0ms";
      });
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          cards.forEach(function (card, index) {
            card.style.transitionDelay = index * 90 + "ms";
            card.classList.add("is-visible");
          });

          observer.unobserve(section);
        });
      },
      { threshold: 0.16, rootMargin: "0px 0px -10% 0px" }
    );

    observer.observe(section);
  }

  function initDecorStatementReveal() {
    const statement = document.getElementById("decorStatement");
    if (!statement) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      statement.classList.add("is-visible");
      return;
    }

    const observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            statement.classList.add("is-visible");
            observer.unobserve(statement);
          }
        });
      },
      {
        threshold: 0.28,
        rootMargin: "0px 0px -8% 0px",
      }
    );

    observer.observe(statement);
  }

  function initDecorHeroMotion() {
    const hero = document.getElementById("decorHero");
    const title = document.getElementById("decorHeroTitle");

    if (!hero || !title) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      title.style.transform = "none";
      return;
    }

    let raf = null;

    function update() {
      const rect = hero.getBoundingClientRect();
      const heroHeight = hero.offsetHeight || window.innerHeight;
      const progress = Math.max(0, Math.min(1, -rect.top / heroHeight));

      /*
        Editorial effect: title moves upward slightly during the first viewport
        scroll. Max 72px lift — keeps readability intact.
      */
      title.style.transform = "translate3d(0," + (-progress * 72) + "px,0)";
      raf = null;
    }

    function requestUpdate() {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    }

    update();

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
  }

  function initDecorRequestForm() {
    var form = document.getElementById("decorRequestForm");
    if (!form) return;

    var status = document.getElementById("decorRequestStatus");
    var whatsappButton = form.querySelector('[data-decor-send="whatsapp"]');
    var telegramButton = form.querySelector('[data-decor-send="telegram"]');

    var WHATSAPP_NUMBER = "79897707000";

    /*
      TODO: заменить Telegram username на реальный username PALOMA.
      Пример: var TELEGRAM_USERNAME = 'paloma_flowers';
    */
    var TELEGRAM_USERNAME = "paloma_placeholder";

    function getValue(name) {
      var field = form.elements[name];
      return field ? String(field.value || "").trim() : "";
    }

    function getMessenger() {
      var checked = form.querySelector('input[name="messenger"]:checked');
      return checked ? checked.value : "Telegram";
    }

    function setFieldError(name, message) {
      var field = form.elements[name];
      var error = form.querySelector('[data-error-for="' + name + '"]');
      if (!field) return;
      var wrapper = field.closest(".decor-request-form__field");
      if (wrapper) {
        wrapper.classList.toggle("has-error", Boolean(message));
      }
      if (error) {
        error.textContent = message || "";
      }
    }

    function clearErrors() {
      ["name", "phone", "type"].forEach(function (name) {
        setFieldError(name, "");
      });
    }

    function validateForm() {
      clearErrors();
      var isValid = true;

      if (!getValue("name")) {
        setFieldError("name", "Укажите имя.");
        isValid = false;
      }

      if (!getValue("phone")) {
        setFieldError("phone", "Укажите телефон.");
        isValid = false;
      }

      if (!getValue("type")) {
        setFieldError("type", "Выберите, что нужно оформить.");
        isValid = false;
      }

      if (!isValid && status) {
        status.textContent = "Пожалуйста, заполните обязательные поля.";
      }

      return isValid;
    }

    function buildRequestText() {
      var name = getValue("name");
      var phone = getValue("phone");
      var messenger = getMessenger();
      var type = getValue("type");
      var date = getValue("date") || "не указана";
      var comment = getValue("comment") || "без комментария";

      return [
        "Заявка на цветочное оформление PALOMA",
        "",
        "Имя: " + name,
        "Телефон: " + phone,
        "Мессенджер для связи: " + messenger,
        "Что нужно оформить: " + type,
        "Дата события: " + date,
        "Комментарий: " + comment,
        "",
        "Город: Новороссийск",
        "Адрес: Энгельса 74",
      ].join("\n");
    }

    function showSuccess() {
      if (!status) return;
      status.textContent =
        "Заявка сформирована. Мы свяжемся с вами, чтобы уточнить детали оформления.";
    }

    /* Заявку сохраняем у себя ДО перехода в мессенджер. Раньше единственным
       следом заявки было сообщение, которое клиент должен был отправить сам:
       передумал или закрыл вкладку — заявки не существовало. */
    function recordLead() {
      if (!window.palomaSendLead) return;
      window.palomaSendLead({
        name: getValue("name"),
        phone: getValue("phone"),
        messenger: getMessenger(),
        eventType: getValue("type"),
        date: getValue("date"),
        comment: getValue("comment"),
        page: "events",
      });
    }

    function openWhatsApp() {
      if (!validateForm()) return;
      recordLead();
      var text = encodeURIComponent(buildRequestText());
      var url = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + text;
      showSuccess();
      window.open(url, "_blank", "noopener");
    }

    function openTelegram() {
      if (!validateForm()) return;
      recordLead();
      var text = encodeURIComponent(buildRequestText());
      /*
        Telegram deep links do not reliably prefill messages to a username
        in all browsers. This link opens the PALOMA chat placeholder.
        TODO: replace TELEGRAM_USERNAME with real PALOMA username.
      */
      var url = "https://t.me/" + TELEGRAM_USERNAME + "?text=" + text;
      showSuccess();
      window.open(url, "_blank", "noopener");
    }

    if (whatsappButton) {
      whatsappButton.addEventListener("click", openWhatsApp);
    }

    if (telegramButton) {
      telegramButton.addEventListener("click", openTelegram);
    }

    form.addEventListener("input", function (event) {
      var target = event.target;
      if (!target || !target.name) return;
      if (["name", "phone", "type"].indexOf(target.name) !== -1) {
        setFieldError(target.name, "");
      }
      if (status) {
        status.textContent = "";
      }
    });
  }

  /* ── Portfolio — card reveal on scroll ── */
  function initDecorPortfolioReveal() {
    var section = document.getElementById("decorPortfolio");
    if (!section) return;

    var cards = section.querySelectorAll("[data-decor-case-card]");
    if (!cards.length) return;

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      cards.forEach(function (card) {
        card.classList.add("is-visible");
        card.style.transitionDelay = "0ms";
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;

          cards.forEach(function (card, index) {
            card.style.transitionDelay = index * 110 + "ms";
            card.classList.add("is-visible");
          });

          observer.unobserve(section);
        });
      },
      {
        threshold: 0.14,
        rootMargin: "0px 0px -10% 0px",
      }
    );

    observer.observe(section);
  }

  /* ── Process — horizontal sticky scroll (desktop only) ── */
  function initDecorProcessHorizontalScroll() {
    var section = document.getElementById("decorProcess");
    var track = document.getElementById("decorProcessTrack");

    if (!section || !track) return;

    var reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    var mobileQuery = window.matchMedia("(max-width: 900px)");

    var raf = null;
    var enabled = false;
    var sectionTop = 0;
    var maxTranslate = 0;
    var viewportH = window.innerHeight;

    function shouldEnable() {
      return !reduceMotionQuery.matches && !mobileQuery.matches;
    }

    function clampVal(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function measure() {
      viewportH = window.innerHeight;
      var viewportW = window.innerWidth;

      enabled = shouldEnable();

      if (!enabled) {
        section.style.height = "";
        track.style.transform = "none";
        return;
      }

      maxTranslate = Math.max(0, track.scrollWidth - viewportW);
      section.style.height = (viewportH + maxTranslate) + "px";

      sectionTop = section.getBoundingClientRect().top + window.scrollY;

      update();
    }

    function update() {
      if (!enabled) return;

      var raw = window.scrollY - sectionTop;
      var x = clampVal(raw, 0, maxTranslate);

      track.style.transform = "translate3d(" + (-x) + "px, 0, 0)";
      raf = null;
    }

    function requestUpdate() {
      if (!enabled || raf) return;
      raf = window.requestAnimationFrame(update);
    }

    function resetAndMeasure() {
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = null;
      }
      track.style.transform = "none";
      window.requestAnimationFrame(measure);
    }

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", resetAndMeasure);

    if (typeof reduceMotionQuery.addEventListener === "function") {
      reduceMotionQuery.addEventListener("change", resetAndMeasure);
      mobileQuery.addEventListener("change", resetAndMeasure);
    }

    measure();
  }
})();
