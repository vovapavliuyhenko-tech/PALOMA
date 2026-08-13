/* ═══════════════════════════════════════════════════════════════════
   PALOMA Coffee — страница напитка (coffee-item.html?id=...)
   Рендерит позицию меню в layout страницы товара (.pdp), как в каталоге.
   Светлая тема (body.product-page). Выбор объёма + доп. ингредиенты,
   живой пересчёт цены и итога, добавление в корзину.
   Данные: window.PALOMA_COFFEE_MENU (coffee-menu-data.js)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();

  var catLabels = {
    classic: "Классика",
    cacaoraf: "Какао и раф",
    smoothie: "Смузи",
    milkshake: "Молочный коктейль",
    tea: "Чай",
    cold: "Холодные напитки",
    water: "Вода",
  };
  var imgByCat = {
    classic: "images/paloma/coffee/cup-classic.jpg",
    cacaoraf: "images/paloma/coffee/cup-raf.jpg",
    smoothie: "images/paloma/coffee/cup-smoothie.jpg",
    milkshake: "images/paloma/coffee/cup-milkshake.jpg",
    tea: "images/paloma/coffee/cup-tea.jpg",
    cold: "images/paloma/coffee/cup-cold.jpg",
  };

  /* вкусы сиропа — раскрываются при выборе «Сироп на выбор» */
  var SYRUPS = ["Карамель", "Ваниль", "Солёная карамель", "Лесной орех", "Кокос", "Миндаль"];
  var syrup = { id: "syrup", name: "Сироп на выбор", price: 50, syrups: SYRUPS };

  /* ── доп. ингредиенты по разделам меню (по смыслу к напитку) ── */
  var addonsByCat = {
    classic: [
      { id: "milk", name: "Альтернативное молоко", price: 60 },
      { id: "shot", name: "Дополнительный эспрессо", price: 70 },
      syrup,
      { id: "cream", name: "Взбитые сливки", price: 60 },
      { id: "cinnamon", name: "Корица", price: 20 },
    ],
    cacaoraf: [
      syrup,
      { id: "cream", name: "Взбитые сливки", price: 60 },
      { id: "marsh", name: "Маршмеллоу", price: 40 },
      { id: "cinnamon", name: "Корица", price: 20 },
      { id: "milk", name: "Альтернативное молоко", price: 60 },
    ],
    tea: [
      { id: "honey", name: "Мёд", price: 40 },
      { id: "lemon", name: "Лимон", price: 20 },
      { id: "ginger", name: "Имбирь", price: 30 },
      { id: "cinnamon", name: "Корица", price: 20 },
      syrup,
    ],
    smoothie: [
      { id: "protein", name: "Протеин", price: 90 },
      { id: "berries", name: "Дополнительные ягоды", price: 70 },
      { id: "banana", name: "Банан", price: 40 },
      { id: "seeds", name: "Семена чиа", price: 40 },
    ],
    milkshake: [
      { id: "cream", name: "Взбитые сливки", price: 60 },
      { id: "choco", name: "Шоколадная крошка", price: 50 },
      syrup,
      { id: "cinnamon", name: "Корица", price: 20 },
    ],
    cold: [
      { id: "shot", name: "Дополнительный эспрессо", price: 70 },
      syrup,
      { id: "fruit", name: "Свежие фрукты", price: 60 },
      { id: "mint", name: "Мята", price: 20 },
    ],
  };

  function init() {
    var MENU = window.PALOMA_COFFEE_MENU || [];
    var id = new URLSearchParams(location.search).get("id");
    var item = MENU.filter(function (i) { return i.id === id; })[0];

    var notFound = document.getElementById("ciNotFound");
    if (!item) {
      document.title = "Меню — PALOMA Coffee, Новороссийск";
      if (notFound) notFound.hidden = false;
      var layout = document.getElementById("ciLayout");
      if (layout) layout.hidden = true;
      return;
    }

    document.title = item.title + " — PALOMA Coffee";

    /* ── объёмы и цены → размеры ── */
    var vols = parseList(item.volumes);            // ["250","350","450"]
    var prices = parseList(item.priceLabel)        // ["220","270","300"]
      .map(function (s) { return parseInt(s.replace(/\D/g, ""), 10); })
      .filter(function (n) { return !isNaN(n); });
    if (!prices.length) prices = [Number(item.price) || 0];

    var sizes = [];
    for (var i = 0; i < prices.length; i++) {
      sizes.push({
        vol: vols[i] ? vols[i] + " мл" : (item.volumes ? item.volumes + " мл" : ""),
        price: prices[i],
      });
    }
    var current = sizes[0];
    var qty = 1;
    var selected = [];   // выбранные ингредиенты

    /* ── изображение ── */
    var img = item.image || imgByCat[item.category] || "";
    var ph = document.getElementById("pdpMainPh");
    var mainImg = document.getElementById("pdpMainImg");
    if (img && mainImg) {
      mainImg.src = img;
      mainImg.alt = item.title;
      mainImg.style.display = "";
      if (ph) ph.style.background = item.imageBg || "";
    } else {
      if (mainImg) mainImg.style.display = "none";
      if (ph) ph.style.background = item.imageBg || "";
    }

    setText("pdpCat", catLabels[item.category] || "Меню");
    setText("ciCrumbCat", catLabels[item.category] || "Меню");
    setText("pdpName", item.title);
    setText("pdpDesc", item.desc || "");

    /* строка «Объём» показываем только когда один объём (иначе его покажут кнопки) */
    var volRow = document.getElementById("pdpVolRow");
    if (sizes.length > 1) {
      if (volRow) volRow.hidden = true;
    } else if (item.volumes) {
      setText("pdpVol", /мл/i.test(item.volumes) ? item.volumes : item.volumes + " мл");
    } else if (volRow) {
      volRow.hidden = true;
    }

    /* ── кнопки объёма (если их несколько) ── */
    var sizesWrap = document.getElementById("pdpSizes");
    var sizeBtns = document.getElementById("pdpSizeBtns");
    if (sizes.length > 1 && sizesWrap && sizeBtns) {
      sizesWrap.hidden = false;
      sizes.forEach(function (s, idx) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "pdp-size-btn" + (idx === 0 ? " is-active" : "");
        b.textContent = s.vol;
        b.setAttribute("data-cursor", "hover");
        b.addEventListener("click", function () {
          current = s;
          [].forEach.call(sizeBtns.children, function (x) {
            x.classList.toggle("is-active", x === b);
          });
          updatePrice();
        });
        sizeBtns.appendChild(b);
      });
    }

    /* ── доп. ингредиенты ── */
    var addonsWrap = document.getElementById("pdpAddons");
    var addonsList = document.getElementById("pdpAddonsList");
    var addons = addonsByCat[item.category] || [];
    if (addons.length && addonsWrap && addonsList) {
      addonsWrap.hidden = false;
      addons.forEach(function (a) {
        var wrap = document.createElement("div");
        wrap.className = "pdp-addon-item";

        var label = document.createElement("label");
        label.className = "pdp-addon";
        label.setAttribute("data-cursor", "hover");
        label.innerHTML =
          '<input type="checkbox" class="pdp-addon__cb">' +
          '<span class="pdp-addon__name">' + esc(a.name) + "</span>" +
          '<span class="pdp-addon__price">+' + a.price + " ₽</span>";
        wrap.appendChild(label);
        var cb = label.querySelector(".pdp-addon__cb");

        /* подвыбор вкуса сиропа */
        var sub = null;
        if (a.syrups && a.syrups.length) {
          a._flavor = a.syrups[0];
          sub = document.createElement("div");
          sub.className = "pdp-addon__sub";
          sub.hidden = true;
          a.syrups.forEach(function (fl, fi) {
            var chip = document.createElement("button");
            chip.type = "button";
            chip.className = "pdp-syrup" + (fi === 0 ? " is-active" : "");
            chip.textContent = fl;
            chip.setAttribute("data-cursor", "hover");
            chip.addEventListener("click", function () {
              a._flavor = fl;
              [].forEach.call(sub.children, function (x) {
                x.classList.toggle("is-active", x === chip);
              });
            });
            sub.appendChild(chip);
          });
          wrap.appendChild(sub);
        }

        cb.addEventListener("change", function () {
          if (cb.checked) selected.push(a);
          else selected = selected.filter(function (x) { return x.id !== a.id; });
          if (sub) sub.hidden = !cb.checked;
          updatePrice();
        });

        addonsList.appendChild(wrap);
      });
    }

    /* ── пересчёт цены/итога ── */
    function addonsSum() {
      return selected.reduce(function (s, a) { return s + a.price; }, 0);
    }
    function unitPrice() {
      return (current ? current.price : 0) + addonsSum();
    }
    var addBtn = document.getElementById("pdpAddToCart");
    function updatePrice() {
      var unit = unitPrice();
      setText("pdpPrice", unit.toLocaleString("ru-RU") + " ₽");
      if (addBtn) addBtn.textContent = "В корзину · " + (unit * qty).toLocaleString("ru-RU") + " ₽";
    }
    updatePrice();

    /* ── количество ── */
    var qtyVal = document.getElementById("pdpQtyVal");
    var dec = document.getElementById("pdpQtyDec");
    var inc = document.getElementById("pdpQtyInc");
    if (dec) dec.addEventListener("click", function () {
      if (qty > 1) { qty--; qtyVal.textContent = qty; updatePrice(); }
    });
    if (inc) inc.addEventListener("click", function () {
      if (qty < 99) { qty++; qtyVal.textContent = qty; updatePrice(); }
    });

    /* ── в корзину ── */
    var toast = document.getElementById("pdpToast");
    if (addBtn) addBtn.addEventListener("click", function () {
      if (window.PalomaCart && window.PalomaCart.add) {
        var addonIds = selected.map(function (a) {
          return a.id + (a.syrups && a._flavor ? "-" + a._flavor : "");
        }).sort().join("-");
        var addonNames = selected.map(function (a) {
          return a.syrups && a._flavor ? "Сироп: " + a._flavor : a.name;
        });
        window.PalomaCart.add({
          id: item.id +
              (current && current.vol ? "-" + current.vol.replace(/\s/g, "") : "") +
              (addonIds ? "-" + addonIds : ""),
          name: item.title +
                (current && current.vol ? " · " + current.vol : "") +
                (addonNames.length ? " (+ " + addonNames.join(", ") + ")" : ""),
          price: unitPrice(),
          qty: qty,
          category: "coffee",
          bg: img ? "url(" + img + ") center/cover" : item.imageBg || "",
        });
      }
      if (toast) {
        toast.hidden = false;
        clearTimeout(toast._t);
        toast._t = setTimeout(function () { toast.hidden = true; }, 1800);
      }
    });

    window.palomaRebindCursorHovers && window.palomaRebindCursorHovers();
  }

  function parseList(s) {
    if (!s) return [];
    return String(s)
      .replace(/мл|₽/gi, "")
      .split("/")
      .map(function (x) { return x.trim(); })
      .filter(Boolean);
  }
  function setText(id, t) {
    var el = document.getElementById(id);
    if (el) el.textContent = t;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
})();
