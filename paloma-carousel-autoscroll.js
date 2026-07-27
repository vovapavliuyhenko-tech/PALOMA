/* =====================================================
   PALOMA — auto-scroll product carousels
   Continuous infinite scroll, pauses on hover/touch.
   Style: skladcvetov73.ru — slow, smooth, seamless loop.
   ===================================================== */

(function () {
  'use strict';

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  /* На телефонах и планшетах авто-прокрутку каруселей выключаем: непрерывный
     requestAnimationFrame, пишущий scrollLeft каждый кадр, грузит основной поток
     и «дерётся» с пальцем пользователя — прокрутка ощущается негладкой. Карусели
     остаются листаемыми свайпом и стрелками. Десктоп не трогаем. */
  if (window.matchMedia('(max-width: 1024px)').matches) return;

  function init() {
    var carousels = document.querySelectorAll('[data-product-carousel]');
    if (!carousels.length) return;

    carousels.forEach(function (section) {
      var viewport = section.querySelector('[data-carousel-viewport]');
      var track    = section.querySelector('[data-carousel-track]');
      if (!viewport || !track) return;

      /* ── Пропускаем пустые (ещё не отрисованные) и уже инициализированные ── */
      if (!track.children.length) return;
      if (section.dataset.autoscrollInit === '1') return;
      section.dataset.autoscrollInit = '1';

      /* ── Clone cards for seamless infinite loop ── */
      var origCards = Array.prototype.slice.call(track.children);
      origCards.forEach(function (card) {
        var clone = card.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.removeAttribute('id');
        /* strip event-listener hooks to avoid duplicates */
        clone.querySelectorAll('[id]').forEach(function (el) {
          el.removeAttribute('id');
        });
        /* remove clones from tab order / a11y tree (duplicate links) */
        clone.querySelectorAll('a, button, [tabindex]').forEach(function (el) {
          el.setAttribute('tabindex', '-1');
        });
        track.appendChild(clone);
      });

      /* ── State ───────────────────────────────────── */
      var paused  = false;
      var rafId   = null;
      var speed   = 2.2;   /* px per frame ≈ 132 px/s at 60fps */

      /* half = width of the original (non-cloned) content */
      var halfWidth = viewport.scrollWidth / 2;

      function tick() {
        if (!paused) {
          viewport.scrollLeft += speed;
          /* seamless jump: once past original content, reset */
          if (viewport.scrollLeft >= halfWidth) {
            viewport.scrollLeft -= halfWidth;
          }
        }
        rafId = requestAnimationFrame(tick);
      }

      /* ── Pause on hover ──────────────────────────── */
      section.addEventListener('mouseenter', function () { paused = true;  });
      section.addEventListener('mouseleave', function () { paused = false; });

      /* ── Pause on touch, resume 2s after release ─── */
      section.addEventListener('touchstart', function () {
        paused = true;
      }, { passive: true });

      section.addEventListener('touchend', function () {
        setTimeout(function () { paused = false; }, 2000);
      }, { passive: true });

      /* ── Keep prev/next buttons working ─────────── */
      /* (they call viewport.scrollBy which still works fine) */

      /* ── Recalc halfWidth on resize ──────────────── */
      var resizeTimer;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          halfWidth = viewport.scrollWidth / 2;
        }, 200);
      });

      /* ── Start after page reveal animations ─────── */
      setTimeout(function () {
        halfWidth = viewport.scrollWidth / 2; /* recalc after fonts/images */
        rafId = requestAnimationFrame(tick);
      }, 1800);
    });
  }

  /* Доступно для повторного вызова после динамической отрисовки карточек
     (например, блок «С этим часто покупают» на странице товара). */
  window.initPalomaAutoScroll = init;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
