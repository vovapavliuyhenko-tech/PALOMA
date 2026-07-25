/* ════════════════════════════════════════════════════════
   cursor.js — кастомный курсор PALOMA
   База: «чернильный/жидкий» курсор (как на doka.digital) —
   цепочка из 20 точек, слипающихся в каплю через SVG goo-фильтр.
   Поверх — наше поведение: при наведении на кнопки/фото капля
   уходит, появляется увеличенный кружок со словом «смотреть».
   ════════════════════════════════════════════════════════ */
(function initPalomaCursor() {
  "use strict";

  const isTouch =
    window.matchMedia("(hover: none)").matches ||
    window.matchMedia("(pointer: coarse)").matches ||
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0;

  if (isTouch) return;
  if (document.getElementById("inkCursor")) return;

  const noMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.body.classList.add("paloma-cursor-active");

  /* ── SVG goo-фильтр (слипание точек в чернильную каплю) ── */
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "ink-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<defs><filter id="palomaGoo">' +
    '<feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>' +
    '<feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 35 -15" result="goo"/>' +
    '<feComposite in="SourceGraphic" in2="goo" operator="atop"/>' +
    "</filter></defs>";
  document.body.appendChild(svg);

  /* ── Контейнер капли + точки ── */
  const cursor = document.createElement("div");
  cursor.className = "ink-cursor";
  cursor.id = "inkCursor";
  cursor.setAttribute("aria-hidden", "true");
  document.body.appendChild(cursor);

  /* ── Кружок «смотреть» (наше поведение при наведении) ── */
  const look = document.createElement("div");
  look.className = "ink-look";
  look.id = "inkLook";
  look.setAttribute("aria-hidden", "true");
  look.innerHTML = '<span class="ink-look__label">смотреть</span>';
  document.body.appendChild(look);

  /* ── Параметры (как на doka.digital) ── */
  const amount = 20;
  const sineDots = Math.floor(amount * 0.3);
  const width = 26;
  const idleTimeout = 150;
  const TRAIL = 0.35;

  let mousePosition = { x: -100, y: -100 };
  let lookX = -100, lookY = -100;
  const dots = [];
  let timeoutID;
  let idle = false;
  let visible = false;
  let isHovering = false;
  let isTextField = false;
  let raf;

  const HOVER_SELECTOR = [
    "a", "button", "[role='button']",
    "input[type='submit']", "input[type='button']",
    "label[for]", "select",
    ".product-card", ".product-card__media", ".product-card__wishlist",
    ".product-card__btn", ".catalog-filter-btn", ".filter-chip", ".filter-btn",
    ".site-header__icon", ".site-header__cart",
    ".reviews-arrow", ".cart-qty-btn", ".pdp-size-btn",
    ".checkout-delivery-card", ".checkout-payment-card",
    ".checkout-interval-btn", ".checkout-toggle-btn",
    "[data-add-to-cart]", "[data-wishlist-btn]", "[data-cursor='hover']",
    ".curtain__card-btn", ".process-step__cta", ".paloma-hero__cta",
    ".client-nav-card", ".hscroll-card", ".menu-item", ".cof-menu__item",
    /* фото */
    ".ea-proj", ".ea-proc__ph", ".home-article-card", ".home-article-card__media",
    ".gallery img", "[data-lightbox]", ".sf2-soc",
  ].join(", ");

  const TEXT_SELECTOR =
    'input[type="text"],input[type="tel"],input[type="email"],input[type="date"],input[type="number"],input[type="search"],textarea';

  /* Тёмные секции — кружок «смотреть» становится розовым */
  const DARK_SELECTOR = ".site-footer, [data-cursor-dark]";

  /* Элементы, где большой кружок «смотреть» НЕ нужен: он перекрывает
     маленькие кнопки — иконки в шапке (избранное, корзина), кнопку отправки
     формы в подвале и круглые соцсети. Чернильная капля остаётся. */
  const NO_LOOK_SELECTOR = ".site-header__icon, .site-header__cart, .sf2-send, .sf2-soc";

  /* ── Точка цепочки ── */
  class Dot {
    constructor(index) {
      this.index = index;
      this.anglespeed = 0.05;
      this.x = 0;
      this.y = 0;
      this.scale = 1 - 0.05 * index;
      this.range = width / 2 - (width / 2) * this.scale + 2;
      this.angleX = 0;
      this.angleY = 0;
      this.lockX = 0;
      this.lockY = 0;
      this.el = document.createElement("span");
      this.el.style.transform = `scale(${this.scale})`;
      cursor.appendChild(this.el);
    }
    lock() {
      this.lockX = this.x;
      this.lockY = this.y;
      this.angleX = Math.PI * 2 * Math.random();
      this.angleY = Math.PI * 2 * Math.random();
    }
    draw() {
      if (!idle || this.index <= sineDots) {
        this._set(this.x, this.y);
      } else {
        this.angleX += this.anglespeed;
        this.angleY += this.anglespeed;
        this.y = this.lockY + Math.sin(this.angleY) * this.range;
        this.x = this.lockX + Math.sin(this.angleX) * this.range;
        this._set(this.x, this.y);
      }
    }
    _set(x, y) {
      this.el.style.transform =
        `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${this.scale})`;
    }
  }

  for (let i = 0; i < amount; i++) dots.push(new Dot(i));

  /* ── Idle (капля расплывается, как на doka) ── */
  function startIdleTimer() {
    timeoutID = window.setTimeout(goInactive, idleTimeout);
    idle = false;
  }
  function resetIdleTimer() {
    clearTimeout(timeoutID);
    startIdleTimer();
  }
  function goInactive() {
    idle = true;
    for (const dot of dots) dot.lock();
  }

  /* ── Наведение / текстовые поля ── */
  function setHover(on) {
    if (isTextField) return;
    isHovering = on;
    cursor.classList.toggle("is-hidden", on);   // капля прячется
    if (on) {
      /* мгновенно ставим кружок под курсор — без «магнитного» подлёта из угла */
      look.style.transform =
        `translate(${lookX}px, ${lookY}px) translate(-50%, -50%)`;
    }
    look.classList.toggle("is-on", on);          // кружок «смотреть» появляется
  }
  function setTextMode(on) {
    isTextField = on;
    if (on) {
      isHovering = false;
      look.classList.remove("is-on");
      cursor.classList.add("is-text");
    } else {
      cursor.classList.remove("is-text");
    }
  }

  /* ── События ── */
  window.addEventListener(
    "mousemove",
    (e) => {
      mousePosition.x = e.clientX - width / 2;
      mousePosition.y = e.clientY - width / 2;
      lookX = e.clientX;
      lookY = e.clientY;
      if (!visible) {
        visible = true;
        cursor.classList.add("is-visible");
      }
      resetIdleTimer();
    },
    { passive: true },
  );

  document.addEventListener("mouseleave", () => {
    cursor.classList.remove("is-visible");
    look.classList.remove("is-on");
    visible = false;
  });
  document.addEventListener("mouseenter", () => {
    if (mousePosition.x > -100) {
      cursor.classList.add("is-visible");
      visible = true;
    }
  });

  document.addEventListener(
    "mouseover",
    (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      const onDark = !!el.closest(DARK_SELECTOR);
      look.classList.toggle("on-dark", onDark);
      cursor.classList.toggle("on-dark", onDark);
      if (el.matches(TEXT_SELECTOR)) {
        setTextMode(true);
        return;
      }
      if (el.closest(HOVER_SELECTOR) && !el.closest(NO_LOOK_SELECTOR)) setHover(true);
    },
    { passive: true },
  );
  document.addEventListener(
    "mouseout",
    (e) => {
      const el = e.target;
      if (!(el instanceof Element)) return;
      if (el.matches(TEXT_SELECTOR)) {
        setTextMode(false);
        return;
      }
      const rel = e.relatedTarget;
      if (
        !(rel instanceof Element) ||
        !rel.closest(HOVER_SELECTOR) ||
        rel.closest(NO_LOOK_SELECTOR)
      )
        setHover(false);
    },
    { passive: true },
  );

  let isPressing = false;
  document.addEventListener("mousedown", () => { isPressing = true; look.classList.add("is-pressing"); }, { passive: true });
  document.addEventListener("mouseup", () => { isPressing = false; look.classList.remove("is-pressing"); }, { passive: true });

  /* ── Цикл отрисовки (чернильный трейл) ── */
  function render() {
    raf = requestAnimationFrame(render);

    /* кружок «смотреть» плавно следует за курсором; масштаб нажатия —
       в той же transform-строке (как у точек капли), иначе CSS-свойство
       scale умножало translate и кружок смещался при нажатии */
    look.style.transform =
      `translate(${lookX}px, ${lookY}px) translate(-50%, -50%) scale(${isPressing ? 0.9 : 1})`;

    let x = mousePosition.x;
    let y = mousePosition.y;
    dots.forEach((dot, index) => {
      const nextDot = dots[index + 1] || dots[0];
      dot.x = x;
      dot.y = y;
      dot.draw();
      if (!idle || index <= sineDots) {
        x += (nextDot.x - dot.x) * TRAIL;
        y += (nextDot.y - dot.y) * TRAIL;
      }
    });
  }
  render();

  window.addEventListener("beforeunload", () => {
    if (raf) cancelAnimationFrame(raf);
  });

  /* Совместимость со старым API */
  window.PalomaCursor = { setHover, setTextMode, isActive: true };
  window.palomaRebindCursorHovers = function () {};
})();
