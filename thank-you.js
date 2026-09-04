/* ════════════════════════════════════════════════════════
   thank-you.js — страница «Заявка создана» PALOMA
   Читает заказ из localStorage (paloma_last_order, формат checkout.js).
   Заказ уже создан на этапе checkout — здесь ничего не создаётся,
   поэтому обновление/повторное открытие безопасно.
   ════════════════════════════════════════════════════════ */
(function initThankYou() {
  "use strict";
  if (!document.body.classList.contains("thank-you-page")) return;

  const STORAGE_ORDER = "paloma_last_order";
  const M = window.PALOMA_MANAGER || {};
  const PICKUP_ADDR = "ул. Энгельса, 74/82";
  const PAID_NOTE =
    "\n\nЗаказ оплачен онлайн картой ✓. Прошу подтвердить и согласовать детали (дату, время, доставку).";

  const order = loadOrder();
  const emptyEl = document.getElementById("tyEmpty");
  const contentEl = document.getElementById("tyContent");

  if (!order || !Array.isArray(order.items) || !order.items.length) {
    if (emptyEl) emptyEl.hidden = false;
    if (contentEl) contentEl.hidden = true;
    return;
  }
  if (emptyEl) emptyEl.hidden = true;
  if (contentEl) contentEl.hidden = false;

  /* Яндекс Пэй вернул покупателя после успешной оплаты (?paid=1):
     только здесь корзина считается отработанной и очищается. */
  if (new URLSearchParams(location.search).get("paid") === "1" && !order.paid) {
    order.paid = true;
    order.status = "paid_awaiting_manager";
    try {
      localStorage.setItem(STORAGE_ORDER, JSON.stringify(order));
    } catch {
      /* ignore */
    }
    if (window.PalomaCart?.emptyCart) window.PalomaCart.emptyCart();
    else localStorage.removeItem("paloma_cart_v3");
  }

  /* Цель: успешная покупка. Онлайн — только после подтверждённой оплаты
     (возврат с ?paid=1 → order.paid). «Оплата при получении» — заказ оформлен.
     Флаг goalPurchaseSent в заказе защищает от повтора при обновлении страницы. */
  if (
    !order.goalPurchaseSent &&
    (order.paid || order.payment === "payment_on_receipt")
  ) {
    if (window.palomaGoal) window.palomaGoal("purchase");
    if (window.palomaEcommerce && window.palomaEcomProduct) {
      window.palomaEcommerce(
        "purchase",
        order.items.map(function (i) {
          return window.palomaEcomProduct(i, { quantity: i.qty || 1 });
        }),
        {
          id: order.id || "ORD-" + Date.now(),
          revenue: Number(order.total) || undefined,
        }
      );
    }
    order.goalPurchaseSent = true;
    try {
      localStorage.setItem(STORAGE_ORDER, JSON.stringify(order));
    } catch {
      /* ignore */
    }
  }

  const f = order.form || {};
  renderSummary(order, f);
  if (order.paid) applyPaidCopy();

  /* Онлайн-заказ уходит менеджеру в бот/группу ТОЛЬКО после оплаты — отсюда,
     когда PayKeeper вернул клиента с подтверждённой оплатой (order.paid).
     Флаг managerNotified защищает от повтора при обновлении страницы. */
  if (order.paid && !order.managerNotified) {
    notifyGroupPaid(order, f);
    order.managerNotified = true;
    try {
      localStorage.setItem(STORAGE_ORDER, JSON.stringify(order));
    } catch {
      /* ignore */
    }
  }

  /* Спец-заказ со свободной суммой (подписка/сертификат/копилка) приносит
     готовый текст в order.message — показываем его как есть, дописав про
     оплату. Обычный заказ из корзины собираем из полей формы. */
  const message = order.custom
    ? String(order.message || "").trim() + (order.paid ? PAID_NOTE : "")
    : buildMessage(order, f);
  const messageBox = document.getElementById("tyMessage");
  if (messageBox) messageBox.value = message;

  markRecommended(order.messenger);

  const encoded = encodeURIComponent(message);

  /* WhatsApp — официальный wa.me с prefill (digits only) */
  on("tyBtnWa", () => {
    const phone = String(M.whatsappPhone || "").replace(/\D/g, "");
    if (!phone) return copyFallback("Не задан номер WhatsApp. Скопируйте сообщение вручную.");
    openExternal(`https://wa.me/${phone}?text=${encoded}`);
  });

  /* Telegram — prefill в личный чат Telegram не поддерживает.
     Копируем текст (синхронно, в момент клика) и открываем чат менеджера,
     чтобы клиенту оставалось только вставить сообщение.
     ВАЖНО: copyMessage без await — иначе window.open теряет
     «пользовательский жест» и браузер блокирует открытие вкладки. */
  on("tyBtnTg", () => {
    copyMessage(message);
    toast("Сообщение скопировано — вставьте его в чат менеджера (долгое нажатие → «Вставить»).");
    if (M.telegramUrl) openExternal(M.telegramUrl);
  });

  /* MAX — публичной ссылки-по-номеру и prefill нет: копируем текст.
     Если задан персональный max.ru/u/... — дополнительно откроем профиль */
  on("tyBtnMax", () => {
    copyMessage(message);
    if (M.maxProfileUrl) {
      toast("Сообщение скопировано — вставьте его в чат менеджера в MAX.");
      openExternal(M.maxProfileUrl);
    } else {
      toast(
        `Сообщение скопировано — откройте MAX, найдите менеджера по номеру ${M.maxPhone || ""} и вставьте (долгое нажатие → «Вставить»).`,
      );
    }
  });

  /* Явная кнопка копирования */
  on("tyBtnCopy", async () => {
    const ok = await copyMessage(message);
    toast(ok ? "Сообщение скопировано." : "Не удалось скопировать — выделите текст и скопируйте вручную.");
    if (!ok && messageBox) {
      messageBox.focus();
      messageBox.select();
    }
  });

  /* ── helpers ── */

  /* Отправка оплаченного заказа менеджеру в бот/группу через облачную функцию.
     Для спец-заказов (подписка/сертификат/копилка) готовый текст лежит в
     order.message; для обычной корзины берём order.managerText (собран в
     checkout.js) или строим тем же шаблоном. payment:"online_paid" → функция
     ставит в шапку «✅ ОПЛАЧЕН». keepalive — на случай быстрого ухода со страницы. */
  function notifyGroupPaid(order, f) {
    const ep = (window.PALOMA_PAYMENT_CONFIG?.PAYMENT_ENDPOINT || "").trim();
    if (!ep) return;
    const managerText = order.custom
      ? String(order.message || "").trim()
      : order.managerText || buildMessage(order, f);
    fetch(ep + "?a=notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        orderId: order.id,
        payment: "online_paid",
        items: (order.items || []).map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price,
          qty: i.qty || 1,
        })),
        delivery: order.delivery || 0,
        clientName: f.name || order.clientName || "",
        phone: f.phone || "",
        managerText: managerText,
      }),
    }).catch(() => {});
  }

  function loadOrder() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_ORDER) || "null");
    } catch {
      return null;
    }
  }

  function on(id, fn) {
    document.getElementById(id)?.addEventListener("click", fn);
  }

  function money(n) {
    return (Number(n) || 0).toLocaleString("ru-RU") + " ₽";
  }

  function itemOptions(i) {
    const parts = [];
    if (i.size && i.size !== "—" && i.category !== "coffee") parts.push(i.size);
    if (Array.isArray(i.addons)) parts.push(...i.addons.filter(Boolean));
    return parts.length ? " (" + parts.join(", ") + ")" : "";
  }

  function fulfillment(f) {
    if (f.delivery_type === "pickup") return `Самовывоз — ${PICKUP_ADDR}`;
    if (f.delivery_type === "ask_recipient") return "Доставка — адрес уточнить у получателя";
    if (f.delivery_type === "courier") return "Доставка курьером";
    return "—";
  }

  function timeStr(f) {
    /* Читаем ровно тот режим, который выбран в форме. Раньше exact_time
       проверялся первым, без оглядки на time_type: если в форме оставалось
       значение от другого режима, покупатель видел одно время, а менеджеру
       уходило другое. time_type может не быть у старых заказов — для них
       остаётся прежний порядок. */
    if (f.time_type === "exact") return f.exact_time || "—";
    if (f.time_type === "interval") {
      return f.time_from || f.time_to ? `${f.time_from || "…"}–${f.time_to || "…"}` : "—";
    }
    if (f.exact_time) return f.exact_time;
    if (f.time_from || f.time_to) return `${f.time_from || "…"}–${f.time_to || "…"}`;
    return "—";
  }

  function dateRu(iso) {
    if (!iso) return "—";
    const p = String(iso).split("-");
    return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : iso;
  }

  function paymentText(p) {
    if (order.paid) return "Оплачено онлайн картой.";
    return p === "online"
      ? "Онлайн-оплата картой."
      : "Оплата при получении — наличными курьеру или любым удобным способом в студии.";
  }

  function messengerLabel(m) {
    return { call: "звонок", telegram: "Telegram", whatsapp: "WhatsApp", max: "MAX" }[m] || m || "—";
  }

  function renderSummary(o, f) {
    setText("tyOrderId", "№ " + (o.id || "—"));
    const itemsEl = document.getElementById("tyOrderItems");
    if (itemsEl) {
      itemsEl.innerHTML = o.items
        .map((i) => {
          const qty = i.qty || 1;
          return `<div class="ty-order-summary__item"><span>${esc(i.name)}${esc(itemOptions(i))} × ${qty}</span><span>${money(i.price * qty)}</span></div>`;
        })
        .join("");
    }
    setText("tyOrderCount", String(o.items.reduce((s, i) => s + (i.qty || 1), 0)));
    setText("tyOrderTotal", money(o.total));
    setText("tyMetaFulfil", fulfillment(f));
    setText(
      "tyMetaPayment",
      o.paid
        ? "Оплачено картой"
        : o.payment === "online"
          ? "Онлайн-оплата картой"
          : "Оплата при получении",
    );
  }

  /* Оплаченный заказ: заменяем «предварительные» надписи на «оплачено»,
     чтобы страница не просила клиента ждать подтверждения суммы. */
  function applyPaidCopy() {
    setText(
      "tyNotice",
      "Заказ оплачен онлайн картой ✓ Остался один шаг — отправьте сообщение менеджеру, чтобы согласовать детали.",
    );
    setText("tyStep1Sub", "Состав заказа и оплаченная сумма");
    setText("tyTotalLabel", "Оплачено");
    setText("tyOrderHint", "Заказ оплачен онлайн картой.");
  }

  /* Сообщение менеджеру — по шаблону ТЗ, без HTML */
  function buildMessage(o, f) {
    const items = o.items
      .map((i, idx) => `${idx + 1}. ${i.name}${itemOptions(i)} — ${i.qty || 1} шт. — ${money(i.price * (i.qty || 1))}`)
      .join("\n");

    const paid = !!o.paid;
    const lines = [
      paid
        ? "Здравствуйте! Я оформил(а) и оплатил(а) заказ на сайте картой."
        : "Здравствуйте! Я оформил(а) заказ на сайте.",
      "",
      `Номер заказа: №${o.id || "—"}`,
      "",
      "Состав заказа:",
      "",
      items || "—",
      "",
      paid
        ? `Сумма (оплачено онлайн картой): ${money(o.total)}`
        : `Предварительная сумма: ${money(o.total)}`,
      "",
      `Способ получения: ${fulfillment(f)}`,
    ];

    if (f.delivery_type === "courier") {
      const addr = [f.city, f.address, f.apt ? "кв. " + f.apt : ""]
        .filter(Boolean)
        .join(", ");
      if (addr) lines.push("", `Адрес доставки: ${addr}`);
    }

    /* «Узнать у получателя» — дату и время выясняет менеджер, поля на
       оформлении скрыты. Показывать их значения по умолчанию нельзя:
       клиент решит, что заказал доставку на 09:00–22:00. */
    if (f.delivery_type === "ask_recipient") {
      lines.push("", "Дату и время уточним у получателя");
    } else {
      lines.push("", `Желаемая дата: ${dateRu(f.delivery_date)}`);
      lines.push(`Желаемое время: ${timeStr(f)}`);
    }

    if (f.recipient_type === "other") {
      lines.push("", `Получатель: ${f.recipient_name || "—"}`);
      lines.push(`Телефон получателя: ${f.recipient_phone || "—"}`);
    } else {
      lines.push("", "Получатель: я (покупатель)");
    }

    lines.push("", `Ваш телефон: ${f.phone || "—"}`);
    /* «Связь через звонок» звучит коряво — у звонка своя формулировка. */
    lines.push(
      o.messenger === "call"
        ? `Связь: позвоним на ${o.messengerContact || f.phone || "—"}`
        : `Связь через ${messengerLabel(o.messenger)}: ${o.messengerContact || "—"}`,
    );

    lines.push("", `Комментарий к заказу: ${f.comment ? f.comment : "—"}`);
    lines.push("", `Способ оплаты: ${paymentText(o.payment)}`);
    lines.push(
      "",
      paid
        ? "Заказ оплачен онлайн картой ✓. Прошу подтвердить получение и согласовать детали (дату, время, доставку)."
        : "Прошу подтвердить наличие товаров, возможность выполнения заказа и итоговую стоимость.",
    );

    return lines.join("\n");
  }

  function markRecommended(m) {
    const map = { telegram: "tyBtnTg", whatsapp: "tyBtnWa", max: "tyBtnMax" };
    const id = map[m];
    if (!id) return;
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.add("ty-btn--recommended");
    const badge = document.createElement("span");
    badge.className = "ty-btn__badge";
    badge.textContent = "Вы выбрали этот способ";
    btn.appendChild(badge);
  }

  async function copyMessage(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      /* fall through */
    }
    /* fallback без Clipboard API */
    try {
      const ta = document.getElementById("tyMessage") || document.createElement("textarea");
      ta.value = text;
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      return !!ok;
    } catch {
      return false;
    }
  }

  function copyFallback(msg) {
    copyMessage(document.getElementById("tyMessage")?.value || "");
    toast(msg);
  }

  function openExternal(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  let toastTimer;
  function toast(msg) {
    let el = document.getElementById("tyToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "tyToast";
      el.className = "ty-toast";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 4000);
  }

  function setText(id, v) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* экспорт для теста генерации сообщения */
  window.__tyBuildMessage = buildMessage;
})();
