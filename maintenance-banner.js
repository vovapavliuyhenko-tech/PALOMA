/* ════════════════════════════════════════════════════════
   maintenance-banner.js — плашка «Ведутся технические работы»
   Самодостаточный модуль: сам добавляет стили и элемент.
   Чтобы ВЫКЛЮЧИТЬ плашку на всём сайте — поставь ENABLED = false
   (и подними ?v= у подключений, чтобы обновился кэш).
   ════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ───── ВКЛ/ВЫКЛ плашки ───── */
  var ENABLED = false;

  /* Текст плашки */
  var TEXT = "На сайте идут технические работы — возможны кратковременные сбои. Приносим извинения за неудобства.";

  if (!ENABLED) return;

  /* Разрешаем скрыть на время вкладки, чтобы не мешала листать */
  var HIDE_KEY = "paloma-maint-hidden";
  try {
    if (sessionStorage.getItem(HIDE_KEY) === "1") return;
  } catch (e) {
    /* хранилище недоступно — просто показываем */
  }

  function init() {
    if (document.getElementById("palomaMaint")) return;

    /* ── стили ── */
    var css =
      ".paloma-maint{position:fixed;top:0;left:0;right:0;z-index:70;" +
      "display:flex;align-items:center;justify-content:center;gap:10px;" +
      "padding:9px 44px 9px 18px;box-sizing:border-box;text-align:center;" +
      "font-family:inherit;font-size:13.5px;line-height:1.35;font-weight:500;" +
      "letter-spacing:.01em;color:#5c2b1e;" +
      "background:linear-gradient(90deg,#f8e6d8,#f9dbe4 55%,#f6e3d9);" +
      "border-bottom:1px solid rgba(140,60,40,.14);" +
      "box-shadow:0 6px 22px rgba(120,60,40,.12);" +
      "transform:translateY(-100%);transition:transform .5s cubic-bezier(.22,1,.36,1)}" +
      ".paloma-maint.is-shown{transform:translateY(0)}" +
      ".paloma-maint__dot{flex:none;width:8px;height:8px;border-radius:50%;" +
      "background:#e0567f;box-shadow:0 0 0 0 rgba(224,86,127,.5);" +
      "animation:palomaMaintPulse 1.8s ease-out infinite}" +
      "@keyframes palomaMaintPulse{0%{box-shadow:0 0 0 0 rgba(224,86,127,.5)}" +
      "70%{box-shadow:0 0 0 8px rgba(224,86,127,0)}100%{box-shadow:0 0 0 0 rgba(224,86,127,0)}}" +
      ".paloma-maint__text{max-width:900px}" +
      ".paloma-maint__close{position:absolute;top:50%;right:12px;transform:translateY(-50%);" +
      "width:26px;height:26px;border:0;border-radius:50%;cursor:pointer;background:transparent;" +
      "color:#7a3a28;font-size:17px;line-height:1;display:flex;align-items:center;" +
      "justify-content:center;transition:background .2s ease}" +
      ".paloma-maint__close:hover{background:rgba(140,60,40,.12)}" +
      "body.has-maint .site-top{top:var(--maint-h,42px)}" +
      "body.has-maint{padding-top:var(--maint-h,42px)}" +
      "@media(max-width:640px){.paloma-maint{font-size:12.5px;padding:8px 40px 8px 12px}}";

    var style = document.createElement("style");
    style.id = "palomaMaintStyle";
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);

    /* ── плашка ── */
    var bar = document.createElement("div");
    bar.className = "paloma-maint";
    bar.id = "palomaMaint";
    bar.setAttribute("role", "status");
    bar.setAttribute("aria-live", "polite");
    bar.innerHTML =
      '<span class="paloma-maint__dot" aria-hidden="true"></span>' +
      '<span class="paloma-maint__text">' + TEXT + "</span>" +
      '<button type="button" class="paloma-maint__close" id="palomaMaintClose" ' +
      'aria-label="Скрыть уведомление" data-cursor="hover">&times;</button>';
    document.body.insertBefore(bar, document.body.firstChild);

    function applyHeight() {
      var h = bar.offsetHeight || 42;
      document.documentElement.style.setProperty("--maint-h", h + "px");
    }
    applyHeight();
    document.body.classList.add("has-maint");

    function reveal() {
      bar.classList.add("is-shown");
      applyHeight();
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(reveal);
    });
    /* запасной путь: если вкладка неактивна и rAF придушен — покажем по таймеру */
    window.setTimeout(reveal, 250);

    window.addEventListener("resize", applyHeight, { passive: true });

    document.getElementById("palomaMaintClose").addEventListener("click", function () {
      try {
        sessionStorage.setItem(HIDE_KEY, "1");
      } catch (e) {
        /* no-op */
      }
      bar.classList.remove("is-shown");
      document.body.classList.remove("has-maint");
      document.documentElement.style.removeProperty("--maint-h");
      window.setTimeout(function () {
        if (bar.parentNode) bar.parentNode.removeChild(bar);
      }, 500);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
