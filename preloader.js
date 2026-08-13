/* =====================================================
   PALOMA PAGE LOADER — premium curtain transition
   ===================================================== */

(function PalomaPageLoaderModule() {
  "use strict";

  function removeLegacyLoaders() {
    document.querySelectorAll("#palomaLoader, #palomaTransition, .paloma-loader, .paloma-transition").forEach(function (node) {
      node.remove();
    });
    document.body.classList.remove("pl-lock", "loader-lock");
  }

  /* Жираф внизу лоадера: идёт слева направо, пока грузится страница.
     Разметка лоадера прописана прямо в HTML на 25 страницах, поэтому
     жирафа не дублируем в каждой — достраиваем сюда из одного места.
     Картинка та же, что в подвале сайта: браузер качает её один раз. */
  function ensureGiraffe(loader) {
    if (loader.querySelector(".paloma-page-loader__walk")) return;

    const walk = document.createElement("div");
    walk.className = "paloma-page-loader__walk";
    walk.setAttribute("aria-hidden", "true");
    /* Жираф разобран на слои: туловище + четыре ноги. Все PNG в одной
       системе координат 550×784, поэтому лежат друг на друге без сдвигов,
       а каждая нога крутится вокруг своего шарнира (см. CSS). Туловище
       лежит поверх ног и закрывает место стыка. */
    walk.innerHTML = [
      '<div class="paloma-page-loader__giraffe">',
      '  <span class="paloma-page-loader__giraffe-shadow"></span>',
      '  <div class="pl-giraffe-rig">',
      '    <img class="pl-giraffe-part pl-giraffe-leg pl-giraffe-leg--1" src="assets/images/giraffe-walk/giraffe-leg1.png" alt="" decoding="async">',
      '    <img class="pl-giraffe-part pl-giraffe-leg pl-giraffe-leg--2" src="assets/images/giraffe-walk/giraffe-leg2.png" alt="" decoding="async">',
      '    <img class="pl-giraffe-part pl-giraffe-leg pl-giraffe-leg--3" src="assets/images/giraffe-walk/giraffe-leg3.png" alt="" decoding="async">',
      '    <img class="pl-giraffe-part pl-giraffe-leg pl-giraffe-leg--4" src="assets/images/giraffe-walk/giraffe-leg4.png" alt="" decoding="async">',
      '    <img class="pl-giraffe-part pl-giraffe-body" src="assets/images/giraffe-walk/giraffe-body.png" alt="" decoding="async">',
      "  </div>",
      "</div>",
    ].join("");

    loader.appendChild(walk);
  }

  function createPalomaPageLoader() {
    removeLegacyLoaders();

    let loader = document.getElementById("palomaPageLoader");

    if (!loader) {
      loader = document.createElement("div");
      loader.className = "paloma-page-loader";
      loader.id = "palomaPageLoader";
      loader.setAttribute("aria-hidden", "true");
      loader.innerHTML = [
        '<div class="paloma-page-loader__logo" aria-label="PALOMA">',
        '  <span class="paloma-page-loader__logo-base">Paloma</span>',
        '  <span class="paloma-page-loader__logo-fill">Paloma</span>',
        "</div>",
      ].join("");
      document.body.prepend(loader);
    }

    ensureGiraffe(loader);
    return loader;
  }

  function isInternalNavigationLink(link) {
    if (!link) return false;

    const href = (link.getAttribute("href") || "").trim();

    if (!href || href === "#") return false;
    if (href.startsWith("#")) return false;
    if (href.startsWith("tel:")) return false;
    if (href.startsWith("mailto:")) return false;
    if (href.startsWith("javascript:")) return false;
    if (/^(tg:|https?:\/\/(t\.me|wa\.me|api\.whatsapp))/i.test(href)) return false;
    if (link.hasAttribute("download")) return false;
    if (link.hasAttribute("data-no-transition") || link.hasAttribute("data-cart-close")) return false;

    const target = link.getAttribute("target");
    if (target && target !== "_self") return false;

    let nextUrl;

    try {
      nextUrl = new URL(href, window.location.href);
    } catch (error) {
      return false;
    }

    const currentUrl = new URL(window.location.href);

    if (nextUrl.origin !== currentUrl.origin) return false;

    if (/\.(pdf|zip|png|jpg|jpeg|gif|svg|webp|mp4|mp3)$/i.test(nextUrl.pathname)) {
      return false;
    }

    const samePageHashOnly =
      nextUrl.pathname === currentUrl.pathname &&
      nextUrl.search === currentUrl.search &&
      nextUrl.hash;

    if (samePageHashOnly) return false;

    if (nextUrl.href === currentUrl.href) return false;

    return true;
  }

  function initPalomaPageLoader() {
    const loader = createPalomaPageLoader();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let isTransitioning = false;
    let initialDone = false;
    const revealDelay = reduceMotion ? 60 : 80;
    /* Проход жирафа через весь экран; держится в паре с --pl-walk-dur в CSS. */
    const walkDuration = 2600;
    /* Сколько ждём картинку жирафа, прежде чем начать без неё: на медленной
       сети лучше показать шторку с логотипом, чем морозить экран. */
    const giraffeWaitMax = 1200;
    const leaveDelay = reduceMotion ? 200 : walkDuration + 120;
    const cleanupDelay = leaveDelay + (reduceMotion ? 60 : 300);

    function lockScroll() {
      document.body.classList.add("is-paloma-loading");
      document.body.classList.remove("pl-lock", "loader-lock");
    }

    function unlockScroll() {
      document.body.classList.remove("is-paloma-loading", "pl-lock", "loader-lock");
    }

    function resetLoaderVisualState() {
      loader.classList.remove("is-hidden", "is-leaving", "is-ready", "is-walking");
      loader.style.transform = "";
      loader.style.opacity = "";
      loader.style.visibility = "";
    }

    /* Жираф стартует, только когда картинка реально готова — иначе он
       «выпрыгивает» из середины экрана на первой (незакэшированной)
       загрузке. Если картинка не приехала за giraffeWaitMax — идём дальше
       без неё, лоадер не должен зависеть от одного PNG. */
    function whenGiraffeReady(callback) {
      const parts = loader.querySelectorAll(".pl-giraffe-part");
      let done = false;
      function go() {
        if (done) return;
        done = true;
        callback();
      }
      if (reduceMotion || !parts.length) {
        go();
        return;
      }
      /* Ждём ВСЕ слои: если туловище приедет раньше ног, жираф стартует
         без ног. Ноги по 5 КБ, так что ожидание упирается в туловище. */
      let pending = 0;
      parts.forEach(function (img) {
        if (img.complete) return;
        pending += 1;
        function onPart() {
          pending -= 1;
          if (pending === 0) go();
        }
        img.addEventListener("load", onPart, { once: true });
        img.addEventListener("error", onPart, { once: true });
      });
      if (pending === 0) go();
      else window.setTimeout(go, giraffeWaitMax);
    }

    function finishInitialLoader() {
      if (initialDone) return;
      initialDone = true;
      unlockScroll();
      document.body.classList.add("is-paloma-page-visible");
      document.dispatchEvent(new CustomEvent("paloma:loader-done"));
    }

    function showInitialLoader() {
      resetLoaderVisualState();
      lockScroll();

      window.requestAnimationFrame(function () {
        loader.classList.add("is-ready");
      });

      /* Шторка уходит вверх ровно после того, как жираф дошёл до правого
         края, поэтому отсчёт начинаем от старта прохода, а не от DOMReady. */
      whenGiraffeReady(function () {
        loader.classList.add("is-walking");

        window.setTimeout(function () {
          loader.classList.add("is-leaving");
          document.body.classList.add("is-paloma-page-visible");
        }, leaveDelay);

        window.setTimeout(function () {
          loader.classList.add("is-hidden");
          finishInitialLoader();
        }, cleanupDelay);
      });
    }

    function showTransitionAndNavigate(url) {
      if (isTransitioning) return;

      isTransitioning = true;
      lockScroll();

      resetLoaderVisualState();

      window.requestAnimationFrame(function () {
        loader.classList.add("is-ready");
      });

      window.setTimeout(function () {
        window.location.href = url;
      }, reduceMotion ? 100 : 280);
    }

    document.addEventListener(
      "click",
      function (event) {
        const link = event.target.closest("a[href]");

        if (!isInternalNavigationLink(link)) return;
        if (event.defaultPrevented) return;
        if (event.button !== 0) return;
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

        const href = link.getAttribute("href");
        const nextUrl = new URL(href, window.location.href);

        event.preventDefault();
        showTransitionAndNavigate(nextUrl.href);
      },
      false,
    );

    window.addEventListener("pageshow", function (event) {
      isTransitioning = false;

      if (event.persisted) {
        resetLoaderVisualState();
        loader.classList.add("is-hidden");
        finishInitialLoader();
      }
    });

    window.addEventListener("popstate", function () {
      isTransitioning = false;
    });

    window.setTimeout(function () {
      if (!loader.classList.contains("is-hidden") && !initialDone) {
        loader.classList.add("is-leaving", "is-hidden");
        finishInitialLoader();
      }
      /* Страховка: с проходом жирафа штатный сценарий занимает до ~3.5 с
         (ожидание картинки + проход + шторка), запас держим выше него. */
    }, 7000);

    window.setTimeout(showInitialLoader, revealDelay);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPalomaPageLoader, { once: true });
  } else {
    initPalomaPageLoader();
  }
})();
