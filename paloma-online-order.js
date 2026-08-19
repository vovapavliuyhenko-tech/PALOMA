/* ════════════════════════════════════════════════════════
   paloma-online-order.js — онлайн-оплата «свободных сумм»
   (цветочная подписка, подарочный сертификат, свадебная копилка).

   Эти позиции оплачиваются ТОЛЬКО онлайн картой на сайте — другого пути
   нет (ни «пришлём ссылку», ни оплата при получении). Схема: страница
   собирает состав заказа → palomaPayOnline() выставляет счёт в PayKeeper
   через ту же Cloud Function, что и корзина, и перекидывает на оплату
   картой. После успешной оплаты PayKeeper возвращает на thank-you.html?paid=1,
   где клиент выбирает удобный мессенджер и отправляет менеджеру готовый
   текст заказа с пометкой об оплате (см. thank-you.js, ветка order.custom).

   Если счёт не выставился (нет сети / сервис недоступен) — заказ НЕ уводим
   в обход: показываем ошибку и предлагаем повторить оплату на сайте.
   ════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  function makeOrderId() {
    var raw = "ORD-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return raw.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40);
  }

  /* Ненавязчивое сообщение об ошибке внизу экрана (стилей страницы не трогает). */
  var errTimer;
  function showError(msg) {
    var el = document.getElementById("ppoError");
    if (!el) {
      el = document.createElement("div");
      el.id = "ppoError";
      el.setAttribute("role", "alert");
      el.style.cssText =
        "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);" +
        "max-width:min(520px,92vw);background:#E7385A;color:#fff;" +
        "padding:14px 20px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.22);" +
        "font:500 15px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
        "z-index:99999;text-align:center";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(errTimer);
    errTimer = setTimeout(function () {
      el.style.display = "none";
    }, 7000);
  }

  /* opts: { id, name, total, details, button? }
     details — текст с составом заказа, БЕЗ строки про оплату
     (её добавит thank-you после оплаты).
     button  — кнопка сабмита: блокируем её на время запроса, чтобы не было
               двойного клика; при ошибке разблокируем обратно. */
  window.palomaPayOnline = function (opts) {
    var total = Math.round(Number(opts.total) || 0);
    var endpoint = ((window.PALOMA_PAYMENT_CONFIG || {}).PAYMENT_ENDPOINT || "").trim();
    var orderId = makeOrderId();
    var btn = opts.button || null;

    /* заказ для thank-you: message — готовый текст, custom — метка спец-заказа */
    var order = {
      id: orderId,
      items: [{ id: opts.id, name: opts.name, price: total, qty: 1 }],
      total: total,
      form: {},
      messenger: "whatsapp",
      message: opts.details,
      custom: true,
      payment: "online",
      paid: false,
    };
    try {
      localStorage.setItem("paloma_last_order", JSON.stringify(order));
    } catch (e) {
      /* ignore */
    }

    /* Онлайн-оплата — единственный способ. Если она не настроена, не уводим
       в обход, а честно сообщаем, что оплата временно недоступна. */
    if (!endpoint) {
      showError(
        "Онлайн-оплата временно недоступна. Пожалуйста, попробуйте позже или позвоните нам: +7 989 770 70 00.",
      );
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.classList.add("is-loading");
    }
    function release() {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("is-loading");
      }
    }

    fetch(endpoint + "?a=create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: orderId,
        items: [{ id: opts.id, name: opts.name, price: total, qty: 1 }],
        delivery: 0,
        managerText: opts.details,
        /* Поля клиента и детали заказа — чтобы в CRM запись была не
           безымянной, а с телефоном и (для копилки) именем пары. */
        clientName: (opts.meta && opts.meta.clientName) || "",
        phone: (opts.meta && opts.meta.phone) || "",
        email: (opts.meta && opts.meta.email) || "",
        messengerContact: (opts.meta && opts.meta.messengerContact) || "",
        deliveryInfo: (opts.meta && opts.meta.deliveryInfo) || {},
      }),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return {};
        });
      })
      .then(function (d) {
        if (!d || !d.paymentUrl) throw new Error((d && d.error) || "no url");
        window.location.href = d.paymentUrl;
      })
      .catch(function () {
        /* счёт не выставился → остаёмся на сайте, даём повторить оплату */
        release();
        showError(
          "Не удалось перейти к оплате. Проверьте интернет-соединение и попробуйте ещё раз.",
        );
      });
  };
})();
