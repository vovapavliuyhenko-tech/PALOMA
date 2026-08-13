/* ════════════════════════════════════════════════════════
   lead-send.js — отправка заявок с форм «Оформление» и «События»

   До этого обе формы складывали заявку только в localStorage браузера
   клиента и показывали «Спасибо» — до студии заявка не доходила вообще.
   Здесь отправляем её в ту же облачную функцию, что принимает заказы:
   она пишет заявку в базу (CRM) и шлёт менеджеру в Telegram.

   Приём на сервере: ?a=notify с kind: "event_lead" — обработчик уже есть.
   ════════════════════════════════════════════════════════ */
(function PalomaLeadSend() {
  "use strict";

  /* Номер заявки в том же формате, что у заказов: сервер проверяет
     ^[A-Za-z0-9-]{6,64}$ и по нему же заявка ложится в CRM. */
  function makeLeadId() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const stamp =
      String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) +
      p(d.getHours()) + p(d.getMinutes());
    const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
    return "LEAD-" + stamp + "-" + rnd;
  }

  const PAGE_TITLE = {
    events: "🎉 ЗАЯВКА — оформление события",
    "event-decoration": "🎉 ЗАЯВКА — оформление мероприятия",
  };

  const EVENT_TYPE = {
    wedding: "свадьба",
    birthday: "день рождения",
    corporate: "корпоратив",
    anniversary: "юбилей",
    other: "другое",
  };

  function buildText(p) {
    const lines = [PAGE_TITLE[p.page] || "🎉 ЗАЯВКА с сайта"];
    lines.push("Имя: " + (p.name || "—"));
    lines.push("Телефон: " + (p.phone || "—"));
    if (p.messenger) lines.push("Связь: " + p.messenger);
    if (p.eventType) lines.push("Повод: " + (EVENT_TYPE[p.eventType] || p.eventType));
    if (p.date) lines.push("Дата события: " + p.date);
    if (p.comment) lines.push("\nКомментарий:\n" + p.comment);
    return lines.join("\n");
  }

  /* Возвращает промис, который НИКОГДА не отклоняется: форма должна
     показать «Спасибо» даже если сеть подвела — заявка при этом
     останется в localStorage, как и раньше. */
  window.palomaSendLead = function (payload) {
    const endpoint = ((window.PALOMA_PAYMENT_CONFIG || {}).PAYMENT_ENDPOINT || "").trim();
    if (!endpoint) return Promise.resolve({ ok: false, reason: "no-endpoint" });

    const orderId = makeLeadId();
    const send = fetch(endpoint + "?a=notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        orderId: orderId,
        kind: "event_lead",
        managerText: buildText(payload),
        clientName: payload.name || "",
        phone: payload.phone || "",
        messengerContact: payload.messenger || "",
        deliveryInfo: {
          date: payload.date || "",
          eventType: payload.eventType || "",
          comment: payload.comment || "",
          page: payload.page || "",
        },
      }),
    })
      .then(function (r) { return { ok: r.ok, orderId: orderId }; })
      .catch(function () { return { ok: false, orderId: orderId }; });

    /* Не держим пользователя дольше 6 секунд: форма всё равно покажет
       «Спасибо», а запрос уйдёт в фоне (keepalive). */
    return Promise.race([
      send,
      new Promise(function (resolve) {
        window.setTimeout(function () { resolve({ ok: false, orderId: orderId, slow: true }); }, 6000);
      }),
    ]);
  };
})();
