/* PALOMA — Свадебная копилка (wedding-piggy-bank.html)
   Гость выбирает сумму сертификата (пресет или своя), указывает пару
   и кладёт взнос в корзину → оформление как заказ. */
(function () {
  "use strict";

  function init() {
    const page = document.getElementById("weddingPiggyPage");
    if (!page) return;
    const form = document.getElementById("wpbForm");
    if (!form) return;

    const PIGGY_PREFIX = "paloma-wedding-piggy";
    const PIGGY_BG =
      "linear-gradient(135deg, #FBF6E8 0%, #E7385A 60%, #C82847 100%)";

    const amountsWrap = page.querySelector("[data-wpb-amounts]");
    const amountBtns = amountsWrap
      ? Array.from(amountsWrap.querySelectorAll("button"))
      : [];
    const customToggle = page.querySelector("[data-wpb-custom-toggle]");
    const customInput = page.querySelector("[data-wpb-custom-input]");
    const coupleInput = page.querySelector("[data-wpb-couple]");
    const wishInput = page.querySelector("[data-wpb-wish]");
    const consent = page.querySelector("[data-wpb-consent]");
    const submitBtn = page.querySelector("[data-wpb-submit]");

    const out = {
      couple: page.querySelector("[data-wpb-sum-couple]"),
      amount: page.querySelector("[data-wpb-sum-amount]"),
      total: page.querySelector("[data-wpb-sum-total]"),
      btn: page.querySelector("[data-wpb-sum-btn]"),
      wish: page.querySelector("[data-wpb-sum-wish]"),
      wishRow: page.querySelector("[data-wpb-wish-row]"),
    };

    const state = { amount: 5000, custom: false };

    const fmt = (n) => Number(n || 0).toLocaleString("ru-RU") + " ₽";

    function setActive(btn) {
      amountBtns.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    function recalc() {
      const couple = (coupleInput && coupleInput.value.trim()) || "";
      if (out.couple) out.couple.textContent = couple || "—";
      const amt = state.amount > 0 ? state.amount : 0;
      if (out.amount) out.amount.textContent = amt ? fmt(amt) : "—";
      if (out.total) out.total.textContent = amt ? fmt(amt) : "—";
      if (out.btn) out.btn.textContent = amt ? fmt(amt) : "—";
      const wish = (wishInput && wishInput.value.trim()) || "";
      if (out.wishRow) out.wishRow.hidden = !wish;
      if (out.wish) {
        out.wish.textContent = wish
          ? (wish.length > 40 ? wish.slice(0, 40) + "…" : wish)
          : "—";
      }
    }

    /* пресеты */
    amountBtns.forEach((btn) => {
      btn.setAttribute(
        "aria-pressed",
        btn.classList.contains("is-active") ? "true" : "false",
      );
      btn.addEventListener("click", () => {
        state.custom = false;
        state.amount = parseInt(btn.dataset.amount, 10) || 0;
        setActive(btn);
        if (customToggle) customToggle.classList.remove("is-active");
        if (customInput) {
          customInput.hidden = true;
          customInput.value = "";
        }
        recalc();
      });
    });

    /* своя сумма */
    if (customToggle && customInput) {
      customToggle.addEventListener("click", () => {
        state.custom = true;
        setActive(null);
        customToggle.classList.add("is-active");
        customInput.hidden = false;
        customInput.focus();
        state.amount = parseInt(customInput.value, 10) || 0;
        recalc();
      });
      customInput.addEventListener("input", () => {
        state.amount = parseInt(customInput.value, 10) || 0;
        recalc();
      });
    }

    if (coupleInput) coupleInput.addEventListener("input", recalc);
    if (wishInput) wishInput.addEventListener("input", recalc);

    /* согласие: без галочки кнопка недоступна */
    function syncConsent() {
      if (!submitBtn) return;
      const on = !!consent && consent.checked;
      submitBtn.disabled = !on;
      submitBtn.classList.toggle("is-disabled", !on);
    }
    if (consent) consent.addEventListener("change", syncConsent);
    syncConsent();

    function flash(el) {
      if (!el) return;
      el.classList.add("wpb-err");
      setTimeout(() => el.classList.remove("wpb-err"), 1200);
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      if (consent && !consent.checked) {
        flash(consent.closest(".sub-consent") || consent);
        return;
      }

      const couple = (coupleInput && coupleInput.value.trim()) || "";
      if (!couple) {
        flash(coupleInput);
        coupleInput && coupleInput.focus();
        return;
      }
      if (!state.amount || state.amount < 500) {
        flash(state.custom ? customInput : amountsWrap);
        return;
      }

      /* Способ связи обязателен — без него менеджеру некому подтвердить заказ */
      const contact = window.PalomaContact
        ? window.PalomaContact.collect()
        : { ok: true, summary: "" };
      if (!contact.ok) return;

      const wish = (wishInput && wishInput.value.trim()) || "";

      /* оплата только онлайн картой → thank-you, где клиент выберет мессенджер */
      const fmt = (n) => Number(n || 0).toLocaleString("ru-RU") + " ₽";
      const lines = [
        "Здравствуйте! Пополнил(а) свадебную копилку PALOMA.",
        "",
        "Кому: " + couple,
        "Сумма сертификата: " + fmt(state.amount),
      ];
      if (wish) lines.push("Пожелание для открытки: " + wish);
      if (contact.summary) lines.push("Связь для подтверждения: " + contact.summary);

      window.palomaPayOnline({
        id: "wedding-piggy",
        name: "Свадебная копилка",
        total: state.amount,
        details: lines.join("\n"),
        button: submitBtn,
        /* Имя пары отдельным полем: по нему CRM считает,
           сколько всего накопила конкретная свадьба. */
        meta: {
          /* Имени гостя форма не спрашивает — есть только контакт для связи.
             Если это телефон, кладём его в phone: по нему CRM ищет. */
          phone: /^[+\d][\d\s()-]{9,}$/.test(contact.value || "") ? contact.value : "",
          messengerContact: contact.summary || "",
          deliveryInfo: { couple: couple, card: wish || "", eventType: "свадебная копилка" },
        },
      });
    });

    /* ── Личная ссылка пары ─────────────────────────────────────────
       ?p=<имена> — страница открывается с уже заполненным «Кому».
       Гость не набирает имена руками и не может в них ошибиться,
       а взнос гарантированно попадает в нужную копилку.            */
    function coupleFromUrl() {
      try {
        var p = new URLSearchParams(location.search).get("p");
        return p ? p.trim().slice(0, 60) : "";
      } catch (e) {
        return "";
      }
    }

    var fixedCouple = coupleFromUrl();
    if (fixedCouple && coupleInput) {
      coupleInput.value = fixedCouple;
      coupleInput.readOnly = true;
      coupleInput.classList.add("is-locked");
      var fs_ = coupleInput.closest("fieldset");
      var legend = fs_ && fs_.querySelector("legend");
      if (legend) legend.textContent = "Копилка пары";
    }

    /* ── Ссылка и QR для пригласительных ── */
    var qrNames = document.getElementById("wpbQrNames");
    var qrMake = document.getElementById("wpbQrMake");
    var qrResult = document.getElementById("wpbQrResult");
    var qrCode = document.getElementById("wpbQrCode");
    var qrLink = document.getElementById("wpbQrLink");
    var qrCopy = document.getElementById("wpbQrCopy");
    var qrDownload = document.getElementById("wpbQrDownload");
    var qrCanvas = null;

    function buildLink(names) {
      var base = location.origin + location.pathname;
      return base + "?p=" + encodeURIComponent(names);
    }

    function makeQr() {
      var names = (qrNames && qrNames.value.trim()) || "";
      if (!names) { flash(qrNames); qrNames && qrNames.focus(); return; }
      if (!window.palomaQRCanvas) return;

      var url = buildLink(names);
      try {
        qrCanvas = window.palomaQRCanvas(url, { scale: 8, quiet: 4 });
      } catch (e) {
        /* Длинные имена не помещаются в код — просим сократить,
           а не показываем пустое место. */
        flash(qrNames);
        alert("Слишком длинные имена для QR-кода. Попробуйте покороче — например, «Иван и Мария».");
        return;
      }
      /* Заявка менеджеру: пара открывает копилку прямо здесь, а не только
         через WhatsApp. Ссылку кладём в текст — менеджеру не нужно её
         восстанавливать, чтобы отправить паре повторно. */
      if (window.palomaSendLead && !qrNames.dataset.notified) {
        qrNames.dataset.notified = "1";
        window.palomaSendLead({
          name: names,
          phone: "",
          comment: "Пара открыла свадебную копилку на сайте.\nЛичная ссылка: " + url,
          page: "wedding-piggy",
        });
      }

      qrCanvas.style.width = "100%";
      qrCanvas.style.height = "auto";
      qrCanvas.style.imageRendering = "pixelated";   /* без размытия при печати */
      if (qrCode) { qrCode.innerHTML = ""; qrCode.appendChild(qrCanvas); }
      if (qrLink) qrLink.value = url;
      if (qrResult) qrResult.hidden = false;
    }

    /* Счётчик символов: в QR помещается ограниченное число букв, и лучше
       показать это заранее, чем выдать ошибку после нажатия. */
    var qrCounter = document.getElementById("wpbQrCounter");
    function syncCounter() {
      if (!qrCounter || !qrNames) return;
      var left = 27 - qrNames.value.length;
      qrCounter.textContent = left > 0
        ? "Осталось символов: " + left
        : "Достигнут предел — длиннее не поместится в код";
    }
    if (qrNames) qrNames.addEventListener("input", syncCounter);
    syncCounter();

    if (qrMake) qrMake.addEventListener("click", makeQr);
    if (qrNames) qrNames.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); makeQr(); }
    });

    if (qrCopy) qrCopy.addEventListener("click", function () {
      if (!qrLink || !qrLink.value) return;
      var done = function () {
        var was = qrCopy.textContent;
        qrCopy.textContent = "Скопировано ✓";
        setTimeout(function () { qrCopy.textContent = was; }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(qrLink.value).then(done, function () {
          qrLink.select(); document.execCommand("copy"); done();
        });
      } else {
        qrLink.select(); document.execCommand("copy"); done();
      }
    });

    if (qrDownload) qrDownload.addEventListener("click", function () {
      if (!qrCanvas) return;
      var names = (qrNames && qrNames.value.trim()) || "kopilka";
      var safe = names.replace(/[^\wа-яА-ЯёЁ -]+/g, "").replace(/\s+/g, "-").slice(0, 40);
      var a = document.createElement("a");
      a.href = qrCanvas.toDataURL("image/png");
      a.download = "PALOMA-kopilka-" + (safe || "qr") + ".png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    recalc();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
