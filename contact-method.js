/* ════════════════════════════════════════════════════════
   contact-method.js — общий блок «Удобный способ связи»
   для страниц подписки, подарочного сертификата и свадебной копилки.

   Собирает мессенджер + контакт покупателя, чтобы менеджер мог связаться
   (эти позиции оплачиваются онлайн, и без контакта в уведомлении менеджеру
   не с кем подтвердить наличие/состав/сумму). Блок обязателен: пока не выбран
   мессенджер и не заполнен контакт — collect() возвращает ok:false и не даёт
   странице уйти на оплату.

   API: window.PalomaContact.collect()
        -> { ok, messenger, value, summary }   // summary для текста заказа
   ════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var LABELS = {
    telegram: {
      name: "Telegram",
      label: "Ваш Telegram",
      ph: "@username или +7 999 000-00-00",
      err: "Укажите @username или телефон в Telegram.",
    },
    whatsapp: {
      name: "WhatsApp",
      label: "Ваш WhatsApp",
      ph: "+7 999 000-00-00",
      err: "Укажите номер WhatsApp (не меньше 10 цифр).",
    },
    max: {
      name: "MAX",
      label: "Ваш контакт в MAX",
      ph: "Телефон или @username в MAX",
      err: "Укажите телефон или username в MAX.",
    },
  };

  var root, field, input, label, errEl, optionsWrap;

  function selected() {
    var r = root && root.querySelector("[data-pcm-radio]:checked");
    return r ? r.value : "";
  }

  function flash(el) {
    if (!el) return;
    el.classList.add("pcm-err");
    setTimeout(function () {
      el.classList.remove("pcm-err");
    }, 1200);
  }

  function setError(msg) {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function clearError() {
    if (errEl) errEl.hidden = true;
    if (optionsWrap) optionsWrap.classList.remove("pcm-err");
  }

  function onSelect() {
    var m = selected();
    if (!m || !LABELS[m]) {
      if (field) field.hidden = true;
      return;
    }
    clearError();
    if (field) field.hidden = false;
    if (label) label.textContent = LABELS[m].label;
    if (input) {
      input.placeholder = LABELS[m].ph;
      input.setAttribute("inputmode", m === "whatsapp" ? "tel" : "text");
      input.focus();
    }
  }

  function validValue(m, v) {
    if (!v) return false;
    if (m === "whatsapp") return v.replace(/\D/g, "").length >= 10;
    return v.length >= 3;
  }

  /* Проверяет и собирает контакт. Если блока на странице нет — не мешаем
     (возвращаем ok:true с пустой строкой), чтобы не ломать сабмит. */
  function collect() {
    if (!root) return { ok: true, summary: "" };

    var m = selected();
    if (!m) {
      setError("Выберите мессенджер для связи.");
      if (optionsWrap) flash(optionsWrap);
      root.scrollIntoView({ behavior: "smooth", block: "center" });
      return { ok: false };
    }

    var v = input ? input.value.trim() : "";
    if (!validValue(m, v)) {
      setError(LABELS[m].err);
      flash(input);
      if (input) input.focus();
      return { ok: false };
    }

    return {
      ok: true,
      messenger: m,
      value: v,
      summary: LABELS[m].name + " — " + v,
    };
  }

  function init() {
    root = document.querySelector("[data-contact-method]");
    if (!root) return;
    field = root.querySelector("[data-pcm-field]");
    input = root.querySelector("[data-pcm-input]");
    label = root.querySelector("[data-pcm-label]");
    errEl = root.querySelector("[data-pcm-error]");
    optionsWrap = root.querySelector(".pcm__options");

    var radios = root.querySelectorAll("[data-pcm-radio]");
    for (var i = 0; i < radios.length; i++) {
      radios[i].addEventListener("change", onSelect);
    }
    if (input) input.addEventListener("input", clearError);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.PalomaContact = { collect: collect };
})();
