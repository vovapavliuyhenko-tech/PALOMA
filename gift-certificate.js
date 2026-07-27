/* ════════════════════════════════════════════════════════
   gift-certificate.js — конфигуратор подарочного сертификата PALOMA

   Клиент заполняет форму → «Оформить и оплатить» сразу ведёт на онлайн-оплату
   картой (palomaPayOnline). Другого способа оплатить сертификат нет.
   После оплаты — thank-you.html, где клиент отправляет заказ менеджеру
   в удобном мессенджере.
   ════════════════════════════════════════════════════════ */
(function GiftCertificate() {
  "use strict";

  function init() {
    var page = document.getElementById("giftCertPage");
    if (!page) return;

    var form = document.getElementById("gcForm");
    if (!form) return;

    var amountsWrap = page.querySelector("[data-gc-amounts]");
    var amountBtns = amountsWrap
      ? Array.prototype.slice.call(amountsWrap.querySelectorAll("button"))
      : [];
    var customToggle = page.querySelector("[data-gc-custom-toggle]");
    var customInput = page.querySelector("[data-gc-custom-input]");
    var formatsWrap = page.querySelector("[data-gc-formats]");
    var formatBtns = formatsWrap
      ? Array.prototype.slice.call(formatsWrap.querySelectorAll("[data-format]"))
      : [];
    var recipientInput = page.querySelector("[data-gc-recipient]");
    var emailField = page.querySelector("[data-gc-email-field]");
    var emailInput = page.querySelector("[data-gc-email]");
    var addressField = page.querySelector("[data-gc-address-field]");
    var addressInput = page.querySelector("[data-gc-address]");
    var messageInput = page.querySelector("[data-gc-message]");

    var out = {
      format: page.querySelector("[data-gc-sum-format]"),
      recipient: page.querySelector("[data-gc-sum-recipient]"),
      message: page.querySelector("[data-gc-sum-message]"),
      messageRow: page.querySelector("[data-gc-message-row]"),
      total: page.querySelector("[data-gc-sum-total]"),
      btn: page.querySelector("[data-gc-sum-btn]"),
    };

    var state = { amount: 5000, custom: false, format: "electronic" };

    var fmt = function (n) {
      return Number(n || 0).toLocaleString("ru-RU") + " ₽";
    };

    function setActive(btn) {
      amountBtns.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    function recalc() {
      var amt = state.amount > 0 ? state.amount : 0;
      if (out.total) out.total.textContent = amt ? fmt(amt) : "—";
      if (out.btn) out.btn.textContent = amt ? fmt(amt) : "—";
      if (out.format) {
        out.format.textContent =
          state.format === "pickup"
            ? "Бумажный · самовывоз"
            : state.format === "delivery"
              ? "Бумажный · доставка"
              : "Электронный";
      }
      var recipient = (recipientInput && recipientInput.value.trim()) || "";
      if (out.recipient) out.recipient.textContent = recipient || "—";
      var message = (messageInput && messageInput.value.trim()) || "";
      if (out.messageRow) out.messageRow.hidden = !message;
      if (out.message) {
        out.message.textContent = message
          ? message.length > 40
            ? message.slice(0, 40) + "…"
            : message
          : "—";
      }
    }

    /* email — только для электронного, адрес — только для доставки */
    function updateConditionalFields() {
      var isElectronic = state.format === "electronic";
      var isDelivery = state.format === "delivery";
      if (emailField) {
        emailField.hidden = !isElectronic;
        if (!isElectronic && emailInput) emailInput.classList.remove("wpb-err");
      }
      if (addressField) {
        addressField.hidden = !isDelivery;
        if (!isDelivery && addressInput) addressInput.classList.remove("wpb-err");
      }
    }

    /* пресеты суммы */
    amountBtns.forEach(function (btn) {
      btn.setAttribute(
        "aria-pressed",
        btn.classList.contains("is-active") ? "true" : "false"
      );
      btn.addEventListener("click", function () {
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
      customToggle.addEventListener("click", function () {
        state.custom = true;
        setActive(null);
        customToggle.classList.add("is-active");
        customInput.hidden = false;
        customInput.focus();
        state.amount = parseInt(customInput.value, 10) || 0;
        recalc();
      });
      customInput.addEventListener("input", function () {
        state.amount = parseInt(customInput.value, 10) || 0;
        recalc();
      });
    }

    /* формат */
    formatBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.format = btn.dataset.format || "electronic";
        formatBtns.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle("is-active", on);
          b.setAttribute("aria-checked", on ? "true" : "false");
        });
        updateConditionalFields();
        recalc();
      });
    });

    if (recipientInput) recipientInput.addEventListener("input", recalc);
    if (messageInput) messageInput.addEventListener("input", recalc);

    /* Кнопка неактивна, пока не отмечено согласие */
    var gcConsent = page.querySelector("[data-gc-consent]");
    var gcSubmit = page.querySelector("[data-gc-submit]");
    function gcSyncConsent() {
      if (!gcSubmit) return;
      var on = !!gcConsent && gcConsent.checked;
      gcSubmit.disabled = !on;
      gcSubmit.classList.toggle("is-disabled", !on);
    }
    if (gcConsent) gcConsent.addEventListener("change", gcSyncConsent);
    gcSyncConsent();

    function flash(el) {
      if (!el) return;
      el.classList.add("wpb-err");
      setTimeout(function () {
        el.classList.remove("wpb-err");
      }, 1200);
    }

    function validEmail(v) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      if (gcConsent && !gcConsent.checked) return;

      if (!state.amount || state.amount < 1000) {
        flash(state.custom ? customInput : amountsWrap);
        return;
      }
      var recipient = (recipientInput && recipientInput.value.trim()) || "";
      if (!recipient) {
        flash(recipientInput);
        recipientInput && recipientInput.focus();
        return;
      }
      var email = (emailInput && emailInput.value.trim()) || "";
      if (state.format === "electronic" && !validEmail(email)) {
        flash(emailInput);
        emailInput && emailInput.focus();
        return;
      }
      var address = (addressInput && addressInput.value.trim()) || "";
      if (state.format === "delivery" && address.length < 5) {
        flash(addressInput);
        addressInput && addressInput.focus();
        return;
      }
      /* Способ связи обязателен — без него менеджеру некому подтвердить заказ */
      var contact = window.PalomaContact
        ? window.PalomaContact.collect()
        : { ok: true, summary: "" };
      if (!contact.ok) return;

      var message = (messageInput && messageInput.value.trim()) || "";

      var formatText =
        state.format === "pickup"
          ? "бумажный (самовывоз в студии)"
          : state.format === "delivery"
            ? "бумажный (с доставкой)"
            : "электронный (на email)";

      var lines = [
        "Здравствуйте! Оформил(а) подарочный сертификат PALOMA.",
        "",
        "Сумма: " + fmt(state.amount),
        "Формат: " + formatText,
        "Получатель: " + recipient,
      ];
      if (state.format === "electronic") lines.push("Email для отправки: " + email);
      if (state.format === "delivery") lines.push("Адрес доставки: " + address);
      if (message) lines.push("Поздравление: " + message);
      if (contact.summary) lines.push("Связь для подтверждения: " + contact.summary);

      window.palomaPayOnline({
        id: "gift-certificate",
        name: "Подарочный сертификат",
        total: state.amount,
        details: lines.join("\n"),
        button: gcSubmit,
      });
    });

    updateConditionalFields();
    recalc();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
