/* ═══════════════════════════════════════════════════════════════════
   PALOMA Coffee — интерактив страницы кофейни (.coffee-ea)
   Меню (фильтр + фото при наведении + попап-карточка + корзина),
   горизонтальные этапы, reveal по скроллу.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();

  var inited = false;
  function init() {
    if (inited) return;
    inited = true;

    /* ── reveal по скроллу ── */
    var io = new IntersectionObserver(
      function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    document
      .querySelectorAll(".ea-page [data-reveal]")
      .forEach(function (el) {
        io.observe(el);
      });

    /* ── МЕНЮ (карточки как в каталоге) ── */
    var MENU = window.PALOMA_COFFEE_MENU || [];
    var catLabels = {
      all: "Всё меню",
      classic: "Классика",
      cacaoraf: "Какао и раф",
      smoothie: "Смузи",
      milkshake: "Коктейли",
      tea: "Чай",
      cold: "Холодные",
      lemonade: "Лимонады Лапочка",
      juice: "Соки",
      corpus: "Корпусные",
      dessert: "Десерты",
      chokome: "ChokoMe",
    };
    /* «сладкие» разделы: оранжевый акцент и попап без добавок к напитку */
    var SWEET_CATS = { dessert: 1, corpus: 1, chokome: 1 };
    /* фото по разделам — доступные кадры кофейни */
    var imgByCat = {
      classic: "images/paloma/coffee/cup-classic.jpg",
      cacaoraf: "images/paloma/coffee/cup-raf.jpg",
      smoothie: "images/paloma/coffee/cup-smoothie.jpg",
      milkshake: "images/paloma/coffee/cup-milkshake.jpg",
      tea: "images/paloma/coffee/cup-tea.jpg",
      cold: "images/paloma/coffee/cup-cold.jpg",
    };
    function itemImg(it) {
      return it.image || imgByCat[it.category] || "";
    }

    var filtersBox = document.getElementById("cfMenuFilters");
    var grid = document.getElementById("cfMenuGrid");
    var countBox = document.getElementById("cfMenuCount");
    var active = null;

    /* скрипт-надписи категорий (как эйбрау «our menu») */
    var catEyebrow = {
      classic: "coffee classics",
      cacaoraf: "cocoa & raf",
      smoothie: "smoothie bar",
      milkshake: "shakes & cocktails",
      tea: "tea ceremony",
      cold: "cold & fresh",
      lemonade: "sweet lemonades",
      juice: "fresh juices",
      corpus: "signature cakes",
      dessert: "sweet & art",
      chokome: "chocolate bar",
    };
    /* порядок категорий — как встречаются в данных */
    var catOrder = MENU.map(function (i) { return i.category; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; });

    /* разбор объёмов/цен: «250 / 350 / 450 мл» + «220 / 270 / 300 ₽» → размеры */
    function parseSizes(it) {
      var vols = String(it.volumes || "").split("/").map(function (s) { return s.trim(); }).filter(Boolean);
      var prices = String(it.priceLabel || "").split("/").map(function (s) { return s.trim(); }).filter(Boolean);
      var nums = prices.map(function (s) { return parseInt(String(s).replace(/[^0-9]/g, ""), 10) || 0; });
      if (nums.length > 1 && (vols.length === nums.length || vols.length === 0)) {
        var unit = (String(it.volumes || "").match(/[^\d\s/]+\s*$/) || [""])[0].trim();
        return nums.map(function (pr, i) {
          var v = vols[i] || "";
          if (v && /^\d+$/.test(v) && unit) v = v + " " + unit;
          return { label: v, price: pr, priceText: pr.toLocaleString("ru-RU") + " ₽", suffix: "-" + (i + 1) };
        });
      }
      var base = Number(it.price) || nums[0] || 0;
      return [{ label: vols[0] || "", price: base, priceText: it.priceLabel || base + " ₽", suffix: "" }];
    }
    /* компактная цена строки: «150–180 ₽» для мультиразмерных, иначе как есть */
    function priceRange(sizes, it) {
      if (sizes.length > 1) {
        var lo = sizes[0].price, hi = sizes[sizes.length - 1].price;
        return lo.toLocaleString("ru-RU") + "–" + hi.toLocaleString("ru-RU") + " ₽";
      }
      return it.priceLabel || sizes[0].price + " ₽";
    }

    function plural(n) {
      var m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return n + " позиция";
      if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return n + " позиции";
      return n + " позиций";
    }

    var rowIO = new IntersectionObserver(
      function (es) {
        es.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("is-in"); rowIO.unobserve(e.target); }
        });
      },
      { threshold: 0.05, rootMargin: "0px 0px -30px 0px" }
    );

    function setActiveChip(c) {
      if (!filtersBox) return;
      [].forEach.call(filtersBox.children, function (x) {
        var on = x.getAttribute("data-cat") === c;
        x.classList.toggle("is-active", on);
        x.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    if (filtersBox && grid && MENU.length) {
      catOrder.forEach(function (c) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "catalog-filter-btn";
        b.setAttribute("data-cat", c);
        b.setAttribute("aria-pressed", "false");
        b.setAttribute("data-cursor", "hover");
        b.textContent = catLabels[c] || c;
        b.addEventListener("click", function () {
          if (active === c) return;
          active = c;
          setActiveChip(c);
          render();
        });
        filtersBox.appendChild(b);
      });
      active = catOrder[0];
      setActiveChip(active);
      render();

      /* кнопки-«переходы» на конкретную категорию меню (напр. «Выбрать напиток»
         из блока лимонадов → сразу «Холодные») */
      [].forEach.call(document.querySelectorAll("[data-cat-jump]"), function (link) {
        link.addEventListener("click", function (e) {
          var cat = link.getAttribute("data-cat-jump");
          if (catOrder.indexOf(cat) === -1) return; /* нет такой категории — обычный переход */
          e.preventDefault();
          if (active !== cat) { active = cat; setActiveChip(cat); render(); }
          var menu = document.getElementById("cf-menu");
          if (menu) {
            var y = menu.getBoundingClientRect().top + window.pageYOffset - 80;
            window.scrollTo({ top: y < 0 ? 0 : y, behavior: "smooth" });
          }
        });
      });
    }

    function render() {
      if (!grid) return;
      grid.innerHTML = "";
      var cats = active ? [active] : catOrder;
      var total = 0;
      var frag = document.createDocumentFragment();
      cats.forEach(function (cat) {
        var items = MENU.filter(function (it) { return it.category === cat; });
        if (!items.length) return;
        total += items.length;
        var block = document.createElement("div");
        block.className = "cfm-cat";
        block.setAttribute("data-cat", cat);
        /* заголовок категории убран — раздел уже выбран фильтром сверху */
        var head = "";
        var rows = items.map(function (it, i) {
          var sizes = parseSizes(it);
          return (
            '<div class="cfm-row" data-id="' + esc(it.id) + '"' +
              ' style="transition-delay:' + Math.min(i * 45, 320) + 'ms">' +
              '<span class="cfm-name">' + esc(it.title) + "</span>" +
              '<span class="cfm-vol">' + esc(it.volumes || "") + "</span>" +
              '<span class="cfm-price">' + esc(priceRange(sizes, it)) + "</span>" +
              '<button type="button" class="cfm-add" data-cursor="hover"' +
                ' aria-label="Добавить в корзину: ' + esc(it.title) + '"></button>' +
            "</div>"
          );
        }).join("");
        block.innerHTML = head + rows;
        var rowEls = block.querySelectorAll(".cfm-row");
        items.forEach(function (it, idx) {
          if (rowEls[idx]) { rowEls[idx]._item = it; rowEls[idx]._sizes = parseSizes(it); }
        });
        frag.appendChild(block);
      });
      grid.appendChild(frag);
      if (countBox) countBox.textContent = plural(total);
      revealRows();
      window.palomaRebindCursorHovers && window.palomaRebindCursorHovers();
    }

    function revealRows() {
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      grid.querySelectorAll(".cfm-cat, .cfm-row").forEach(function (el) {
        if (reduce) el.classList.add("is-in");
        else rowIO.observe(el);
      });
    }

    function addToCart(it, size, btn) {
      if (window.PalomaCart && window.PalomaCart.add) {
        /* фото в корзине для позиций кофейни пока не ставим — нейтральный фон */
        window.PalomaCart.add({
          id: it.id + (size.suffix || ""),
          name: it.title + (size.label ? " · " + size.label : ""),
          price: Number(size.price) || 0,
          qty: 1,
          category: "coffee",
        });
      }
      if (btn) {
        btn.classList.add("is-done");
        setTimeout(function () { btn.classList.remove("is-done"); }, 1100);
      }
    }

    function toggleTray(row, it, sizes) {
      var next = row.nextElementSibling;
      if (next && next.classList.contains("cfm-tray")) {
        next.classList.remove("open");
        setTimeout(function () { if (next.parentNode) next.remove(); }, 340);
        return;
      }
      var tray = document.createElement("div");
      tray.className = "cfm-tray";
      tray.innerHTML = sizes.map(function (s) {
        return '<button type="button" class="cfm-chip" data-cursor="hover">' +
          "<b>" + esc(s.label) + "</b><span>" + esc(s.priceText) + "</span></button>";
      }).join("");
      row.after(tray);
      Array.prototype.forEach.call(tray.querySelectorAll(".cfm-chip"), function (chip, i) {
        chip.addEventListener("click", function (e) {
          e.stopPropagation();
          addToCart(it, sizes[i], row.querySelector(".cfm-add"));
          tray.classList.remove("open");
          setTimeout(function () { if (tray.parentNode) tray.remove(); }, 340);
        });
      });
      requestAnimationFrame(function () { tray.classList.add("open"); });
      window.palomaRebindCursorHovers && window.palomaRebindCursorHovers();
    }

    if (grid) {
      grid.addEventListener("click", function (e) {
        var row = e.target.closest(".cfm-row");
        if (!row || !row._item) return;
        /* любая позиция меню открывает попап-конструктор */
        openModal(row._item);
      });
    }

    /* ══ КОНСТРУКТОР ХОЛОДНЫХ НАПИТКОВ (Вариант 1) ══
       Общие группы доп-ингредиентов + состав по каждому напитку.
       Молоко/Лёд — один выбор (single), Сироп/Кофе — можно несколько (multi). */
    var COLD_ADDONS = {
      milk:  { label: "Молоко", multi: false, opts: [
        { n: "Обычное", p: 0 }, { n: "Альтернативное", p: 0 } ] },
      syrup: { label: "Сироп", multi: true, opts: [ { n: "Сироп", p: 60 } ] },
      extra: { label: "Топпинг", multi: true, opts: [ { n: "Сахар", p: 0 }, { n: "Корица", p: 0 } ] },
      ice:   { label: "Лёд", multi: false, opts: [ { n: "Обычный", p: 0 }, { n: "Больше льда", p: 0 } ] },
      color: { label: "Цвет матчи", multi: false, opts: [ { n: "Зелёная", p: 0 }, { n: "Голубая", p: 0 }, { n: "Розовая", p: 0 } ] },
    };
    /* состав + какие группы предлагать: milk (молочный), cof (есть кофе) */
    var COLD = {
      "menu-cold-36": { c: "Эспрессо · молоко · лёд", milk: 1, cof: 1 },
      "menu-cold-37": { c: "Эспрессо · апельсиновый сок · лёд", cof: 1 },
      "menu-cold-38": { c: "Эспрессо · апельсин · вишнёвый сироп · лёд", cof: 1 },
      "menu-cold-39": { c: "Эспрессо · тоник · лёд", cof: 1 },
      "menu-cold-40": { c: "Эспрессо · молоко · розовый сироп · лёд", milk: 1, cof: 1 },
      "menu-cold-41": { c: "Эспрессо · молоко · шоколад · мята · лёд", milk: 1, cof: 1 },
      "menu-cold-42": { c: "Эспрессо · молоко · банан · карамель · лёд", milk: 1, cof: 1 },
      "menu-cold-43": { c: "Эспрессо · молоко · черника · лёд", milk: 1, cof: 1 },
      "menu-cold-44": { c: "Эспрессо · лимонад · лёд", cof: 1 },
      "menu-cold-45": { c: "Матча · тропический тоник · лёд" },
      "menu-cold-46": { c: "Апельсин · маракуйя · лёд" },
      "menu-cold-47": { c: "Виноград · киви · лёд" },
      "menu-cold-48": { c: "Манго · дыня · лёд" },
      "menu-cold-49": { c: "Яблоко · тархун · лёд" },
      "menu-cold-50": { c: "Огурец · мята · лёд" },
      "menu-cold-51": { c: "Вишня · лимонад · лёд" },
      "menu-cold-52": { c: "Лайм · мята · содовая · лёд" },
      "menu-cold-53": { c: "Малина · апельсин · лёд" },
      "menu-cold-54": { c: "Чёрный чай · малина · мята · лёд" },
      "menu-cold-55": { c: "Каркаде · персик · лёд" },
      "menu-cold-56": { c: "Тархун · маракуйя · лёд" },
      "menu-cold-57": { c: "Матча · молоко · лёд", g: ["color", "milk", "syrup", "ice"] },
      "menu-cacaoraf-10": { c: "Какао · сливки · вишня", g: ["milk", "syrup"] },
      "menu-cacaoraf-13": { c: "Какао · молоко · мята · лёд", g: ["milk", "syrup", "ice"] },
      "menu-cacaoraf-14": { c: "Эспрессо · сливки · фисташка · малина", g: ["milk", "syrup"] },
      "menu-cacaoraf-15": { c: "Эспрессо · сливки · солёная карамель", g: ["milk", "syrup"] },
      "menu-cacaoraf-18": { c: "Эспрессо · сливки · цветочный сироп", g: ["milk", "syrup"] },
    };
    /* составы из техкарт (файл «составы») — id → состав; имеет приоритет над COLD.c */
    var COMPOS = {
      "menu-classic-7": "Шоколад · молоко",
      "menu-cacaoraf-13": "Молоко · какао · мята · лёд",
      "menu-smoothie-20": "Банан · клубника · сок мультифрукт · лёд",
      "menu-smoothie-21": "Банан · киви · сок мультифрукт · лёд",
      "menu-smoothie-22": "Ягоды микс · вишнёвый сок · лёд",
      "menu-milkshake-23": "Банан · клубника · мороженое · молоко",
      "menu-milkshake-24": "Ягоды микс · мороженое · молоко",
      "menu-milkshake-25": "Мороженое · молоко · шоколад · какао",
      "menu-cold-40": "Эспрессо · молоко · малина · взбитые сливки · лёд",
      "menu-cold-41": "Эспрессо · молоко · какао · мята · шоколад · лёд",
      "menu-cold-42": "Эспрессо · банановое молоко · карамель · сгущёнка · лёд",
      "menu-cold-43": "Эспрессо · молоко · черника · лёд",
      "menu-cold-44": "Эспрессо · лимон · лемонграсс · мята · спрайт · лёд",
      "menu-cold-45": "Матча · тоник · маракуйя · сироп дыня · лёд",
      "menu-cold-46": "Маракуйя · апельсин · лимон · тоник · лёд",
      "menu-cold-47": "Киви · виноград · тоник · лёд",
      "menu-cold-48": "Апельсин · манго · дыня · тоник · лёд",
      "menu-cold-49": "Тархун · яблоко · лимон · газированная вода · лёд",
      "menu-cold-50": "Огурец · мята · лимон · спрайт · лёд",
      "menu-cold-51": "Вишнёвый сок · мята · лимон · спрайт · лёд",
      "menu-cold-52": "Лайм · мята · спрайт · лёд",
      "menu-cold-53": "Апельсин · малина · лайм · гренадин · спрайт · лёд",
      "menu-cold-54": "Чёрный чай · малина · мята · лёд",
      "menu-cold-55": "Каркаде · персик · лёд",
      "menu-cold-56": "Жасминовый чай · маракуйя · мята · лимон · лёд",
    };
    function coldGroups(it) {
      if (SWEET_CATS[it.category]) return null; /* десерты, корпусные, ChokoMe — без добавок */
      if (it.category === "lemonade" || it.category === "juice") return null; /* готовые напитки — без добавок */
      var x = COLD[it.id];
      if (x) {
        var g;
        if (x.g) { g = x.g.slice(); }
        else {
          g = [];
          if (x.milk) g.push("milk");
          g.push("syrup");
          g.push("ice");
        }
        if (g.indexOf("extra") === -1) g.push("extra");
        return { ex: x, groups: g };
      }
      /* остальные позиции меню — группы подбираем по типу напитка */
      var t = it.title || "";
      var isMilk = it.category === "cacaoraf" || /латте|капучино|раф|как[аи]о|мокк|фл[эе]т|молоч|сливоч/i.test(t);
      var isIce = it.category === "cold" || it.category === "tea" || /айс|л[её]д|холод/i.test(t);
      var gg = [];
      if (isMilk) gg.push("milk");
      gg.push("syrup");
      if (isIce) gg.push("ice");
      gg.push("extra");
      return { ex: { c: "" }, groups: gg };
    }

    /* ── МОДАЛКА-КОНСТРУКТОР позиции меню ── */
    var modal = document.getElementById("cfModal");
    function $(s) {
      return modal.querySelector(s);
    }
    var bstate = { it: null, sizes: [], sizeIdx: 0, sel: {} };

    function calcTotal() {
      var t = bstate.sizes.length ? bstate.sizes[bstate.sizeIdx].price : (Number(bstate.it && bstate.it.price) || 0);
      Object.keys(bstate.sel).forEach(function (gk) {
        var G = COLD_ADDONS[gk];
        if (!G) return;
        if (G.multi) Object.keys(bstate.sel[gk]).forEach(function (oi) { t += G.opts[+oi].p || 0; });
        else t += G.opts[bstate.sel[gk]].p || 0;
      });
      return t;
    }
    function updTotal() {
      $("#cfModalAdd").textContent = "В корзину · " + calcTotal().toLocaleString("ru-RU") + " ₽";
    }
    function setOne(row, chip) {
      [].forEach.call(row.querySelectorAll(".cf-bld__chip"), function (c) { c.classList.remove("is-on"); });
      chip.classList.add("is-on");
    }
    function segGroup(label, grp, opts, sizeMode, defIdx) {
      defIdx = defIdx || 0;
      var h = '<div class="cf-bld__g"><span class="cf-bld__l">' + esc(label) + '</span><div class="cf-seg" data-grp="' + grp + '">';
      opts.forEach(function (o, i) {
        h += '<button type="button" class="cf-seg__b' + (i === defIdx ? " is-on" : "") + '" data-' + (sizeMode ? "si" : "oi") + '="' + i + '">' +
          "<b>" + esc(o.n) + "</b>" + (o.sub ? "<span>" + esc(o.sub) + "</span>" : "") + "</button>";
      });
      return h + "</div></div>";
    }
    function renderBuilder(it) {
      var build = $("#cfModalBuild");
      var cg = coldGroups(it);
      bstate = { it: it, sizes: parseSizes(it), sizeIdx: 0, sel: {} };
      var singles = "", addons = "";
      if (bstate.sizes.length > 1) {
        singles += segGroup("Объём", "size", bstate.sizes.map(function (s) {
          return { n: s.label, sub: s.priceText };
        }), true);
      }
      if (cg) {
        cg.groups.forEach(function (gk) {
          var G = COLD_ADDONS[gk];
          bstate.sel[gk] = G.multi ? {} : 0;
          if (G.multi) {
            G.opts.forEach(function (o, i) {
              addons += '<button type="button" class="cf-add" data-grp="' + gk + '" data-oi="' + i + '">' +
                '<span class="cf-add__n">' + esc(o.n) + "</span>" +
                '<span class="cf-add__p">' + (o.p ? "+" + o.p + " ₽" : "") + "</span></button>";
            });
          } else {
            var defIdx = 0;
            if (gk === "ice" && it.category === "tea") {
              G.opts.forEach(function (o, i) { if (/без\s*льда/i.test(o.n)) defIdx = i; });
              bstate.sel[gk] = defIdx; /* чай — по умолчанию без льда */
            }
            singles += segGroup(G.label, gk, G.opts.map(function (o) {
              return { n: o.n, sub: o.p ? "+" + o.p + " ₽" : "" };
            }), false, defIdx);
          }
        });
      }
      var html = singles;
      if (addons) html += '<div class="cf-bld__sec"><span class="cf-bld__l">Добавки</span><div class="cf-add-grid">' + addons + "</div></div>";
      build.innerHTML = html;
      [].forEach.call(build.querySelectorAll(".cf-seg"), function (row) {
        var grp = row.getAttribute("data-grp");
        [].forEach.call(row.querySelectorAll(".cf-seg__b"), function (chip) {
          chip.addEventListener("click", function () {
            if (grp === "size") bstate.sizeIdx = +chip.getAttribute("data-si");
            else bstate.sel[grp] = +chip.getAttribute("data-oi");
            [].forEach.call(row.querySelectorAll(".cf-seg__b"), function (c) { c.classList.remove("is-on"); });
            chip.classList.add("is-on");
            updTotal();
          });
        });
      });
      [].forEach.call(build.querySelectorAll(".cf-add"), function (chip) {
        var grp = chip.getAttribute("data-grp"), oi = +chip.getAttribute("data-oi");
        chip.addEventListener("click", function () {
          chip.classList.toggle("is-on");
          if (bstate.sel[grp][oi]) delete bstate.sel[grp][oi]; else bstate.sel[grp][oi] = true;
          updTotal();
        });
      });
      updTotal();
    }
    function openModal(it) {
      if (!modal) return;
      var img = it.image || "";
      var imgEl = $("#cfModalImg");
      var panel = modal.querySelector(".cf-modal__panel");
      imgEl.style.background = "";
      if (img) {
        imgEl.style.backgroundImage = 'url("' + img + '")';
        imgEl.style.display = "";
        panel.classList.remove("cf-modal__panel--noimg");
      } else {
        /* нет своего фото — без фото-колонки (не показываем градиент-заглушку) */
        imgEl.style.display = "none";
        panel.classList.add("cf-modal__panel--noimg");
      }
      modal.classList.toggle("cf-modal--sweet", !!SWEET_CATS[it.category]);
      $("#cfModalCat").textContent = catLabels[it.category] || it.category || "Меню";
      $("#cfModalTitle").textContent = it.title;
      $("#cfModalDesc").hidden = false;
      $("#cfModalDesc").textContent = it.desc || "";
      var cg = coldGroups(it);
      var comp = $("#cfModalComp");
      var compText = COMPOS[it.id] || (cg && cg.ex.c) || "";
      comp.classList.remove("cf-modal__comp--fold");
      if (compText) {
        comp.innerHTML = "<b>Состав</b>" + esc(compText);
        comp.hidden = false;
      } else { comp.hidden = true; }
      var meta = $("#cfModalVol").parentNode;
      if (cg) {
        meta.style.display = "none";
        renderBuilder(it);
      } else {
        /* десерты: без конструктора; цена — только на кнопке; БЖУ — отдельным блоком */
        meta.style.display = "none";
        bstate = { it: it, sizes: [], sizeIdx: 0, sel: {} };
        var full = it.desc || "";
        var m = full.match(/Б\s*([\d.,]+)\s*·\s*Ж\s*([\d.,]+)\s*·\s*У\s*([\d.,]+)\s*·\s*([\d.,]+)\s*ккал/i);
        var descOnly = full, buildHtml = "";
        if (m) {
          descOnly = full.slice(0, m.index).trim();
          var cells = [[m[1], "белки, г"], [m[2], "жиры, г"], [m[3], "углеводы, г"], [m[4], "ккал"]];
          var per100 = it.category === "lemonade" || it.category === "juice";
          var weight = per100
            ? '<div class="cf-nutri__weight">Пищевая ценность на 100 мл · объём ' + esc(it.volumes) + "</div>"
            : (it.volumes ? '<div class="cf-nutri__weight">Вес · ' + esc(it.volumes) + "</div>" : "");
          buildHtml = weight + '<div class="cf-nutri">' + cells.map(function (c) {
            return '<div class="cf-nutri__cell"><span class="cf-nutri__v">' + esc(c[0]) + '</span><span class="cf-nutri__k">' + esc(c[1]) + "</span></div>";
          }).join("") + "</div>";
        }
        /* длинный состав прячем в раскрывающийся блок «Состав» — чтобы попап
           не превращался в простыню текста */
        if (descOnly.length > 170) {
          $("#cfModalDesc").hidden = true;
          $("#cfModalDesc").textContent = "";
          comp.innerHTML = '<details class="cf-comp"><summary class="cf-comp__sum">Состав</summary>' +
            '<div class="cf-comp__body">' + esc(descOnly) + "</div></details>";
          comp.hidden = false;
          comp.classList.add("cf-modal__comp--fold");
        } else {
          $("#cfModalDesc").textContent = descOnly;
          comp.hidden = true;
          comp.classList.remove("cf-modal__comp--fold");
        }
        $("#cfModalBuild").innerHTML = buildHtml;
        $("#cfModalAdd").textContent = "В корзину · " + (it.priceLabel || it.price + " ₽");
      }
      $("#cfModalAdded").classList.remove("is-on");
      modal._item = it;
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("cf-modal-open");
    }
    function closeModal() {
      if (!modal) return;
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("cf-modal-open");
    }
    if (modal) {
      $("#cfModalClose").addEventListener("click", closeModal);
      modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal();
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && modal.classList.contains("is-open")) closeModal();
      });
      $("#cfModalAdd").addEventListener("click", function () {
        var it = modal._item;
        if (!it) return;
        var size = bstate.sizes.length ? bstate.sizes[bstate.sizeIdx] : { label: "", price: Number(it.price) || 0, suffix: "" };
        var parts = [], idkey = "";
        Object.keys(bstate.sel).forEach(function (gk) {
          var G = COLD_ADDONS[gk];
          if (G.multi) {
            Object.keys(bstate.sel[gk]).forEach(function (oi) { parts.push(G.opts[+oi].n.toLowerCase()); idkey += "-" + gk + oi; });
          } else {
            var oi = bstate.sel[gk];
            if (G.opts[oi].p > 0 || oi > 0) parts.push(G.opts[oi].n.toLowerCase());
            idkey += "-" + gk + oi;
          }
        });
        var name = it.title + (size.label ? " · " + size.label : "") + (parts.length ? " (" + parts.join(", ") + ")" : "");
        if (window.PalomaCart && window.PalomaCart.add) {
          window.PalomaCart.add({
            id: it.id + (size.suffix || "") + idkey,
            name: name,
            price: calcTotal(),
            category: "coffee",
            qty: 1,
          });
        }
        $("#cfModalAdded").classList.add("is-on");
      });
    }

    /* ── ЭТАПЫ — горизонтальная прокрутка скроллом ── */
    (function () {
      var sec = document.getElementById("cf-steps");
      var track = document.getElementById("cfStepsTrack");
      var bar = document.getElementById("cfStepsBar");
      if (!sec || !track) return;
      /* Горизонтальный скролл-джек одинаково на ПК и на телефоне: двигаем трек
         по горизонтали по мере вертикального скролла (мобильной вёрстки нет —
         используется тот же ПК-макет). */
      function update() {
        var rect = sec.getBoundingClientRect();
        var dist = sec.offsetHeight - window.innerHeight;
        if (dist <= 0) return;
        var p = Math.min(1, Math.max(0, -rect.top / dist));
        var max = track.scrollWidth - window.innerWidth;
        if (max < 0) max = 0;
        track.style.transform = "translateX(-" + (p * max).toFixed(2) + "px)";
        if (bar) bar.style.width = (p * 100).toFixed(1) + "%";
      }
      window.addEventListener("scroll", update, { passive: true });
      window.addEventListener("resize", update);
      update();
    })();

    /* ── FILM STRIP — 3D-изогнутая лента карточек, скользит через центр ── */
    (function () {
      var strip = document.getElementById("cf-strip");
      var stage = document.getElementById("cfStripStage");
      var band = document.getElementById("cfStripBand");
      if (!strip || !stage || !band) return;
      var cards = [].slice.call(band.querySelectorAll(".cf-strip__card"));
      var N = cards.length;
      if (!N) return;
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      var pos = 0;        /* текущий «центр» (дробный индекс) */
      var target = 0;     /* к чему стремимся (drag/wheel) */
      var vel = 0;        /* инерция */
      var dragging = false, lastX = 0, moved = 0, cardW = 300;

      function measure() {
        cardW = cards[0].getBoundingClientRect().width || 300;
      }
      function wrap(d) {
        d = ((d % N) + N) % N;
        if (d > N / 2) d -= N;
        return d;
      }
      /* Карточки лежат на цилиндре: ровный ряд с небольшим зазором, мягкий
         изгиб к краям (как в референсе), без наложения друг на друга. */
      var STEP_DEG = 15;               /* угол между соседними карточками */
      function layout() {
        var radius = cardW * 3.7;      /* радиус → шаг по дуге ≈ ширина + зазор */
        var stepRad = STEP_DEG * Math.PI / 180;
        for (var i = 0; i < N; i++) {
          var d = wrap(i - pos);
          var ad = Math.abs(d);
          var th = d * stepRad;
          var x = radius * Math.sin(th);
          var z = radius * Math.cos(th) - radius;   /* центр в 0, края уходят вглубь */
          var ry = -d * STEP_DEG;
          var c = cards[i];
          c.style.transform =
            "translate(-50%,-50%) translateX(" + x.toFixed(1) + "px) translateZ(" +
            z.toFixed(1) + "px) rotateY(" + ry.toFixed(1) + "deg)";
          c.style.zIndex = String(1000 - Math.round(ad * 10));
          c.style.opacity = ad > N / 2 - 0.55 ? "0" : (ad > 3.4 ? "0.4" : "1");
        }
      }
      function frame() {
        if (!dragging) {
          if (Math.abs(vel) > 0.0002) { target += vel; vel *= 0.92; }
          else { target += reduce ? 0 : 0.0035; }   /* авто-скольжение */
        }
        pos += (target - pos) * 0.12;                /* плавное догоняние */
        layout();
        requestAnimationFrame(frame);
      }

      /* drag / swipe */
      stage.addEventListener("pointerdown", function (e) {
        dragging = true; lastX = e.clientX; moved = 0; vel = 0;
        stage.classList.add("is-drag");
        stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
      });
      stage.addEventListener("pointermove", function (e) {
        if (!dragging) return;
        var dx = e.clientX - lastX; lastX = e.clientX; moved += Math.abs(dx);
        var d = dx / (cardW * 0.97);
        target -= d; pos -= d; vel = -d * 0.6;
      });
      function endDrag(e) {
        if (!dragging) return;
        dragging = false; stage.classList.remove("is-drag");
        if (e && e.pointerId != null && stage.releasePointerCapture)
          try { stage.releasePointerCapture(e.pointerId); } catch (x) {}
      }
      stage.addEventListener("pointerup", endDrag);
      stage.addEventListener("pointercancel", endDrag);
      stage.addEventListener("pointerleave", endDrag);
      /* колесо — горизонтальный скролл ленты */
      stage.addEventListener("wheel", function (e) {
        var d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY);
        if (!d) return;
        e.preventDefault();
        target += d / 260; vel = d / 2600;
      }, { passive: false });
      /* клавиатура */
      stage.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") { target += 1; vel = 0; }
        else if (e.key === "ArrowLeft") { target -= 1; vel = 0; }
      });

      window.addEventListener("resize", measure);
      measure();
      strip.classList.add("is-ready");
      requestAnimationFrame(frame);
    })();

    /* ── FAQ-аккордеон (как на главной и «Оформлении») ── */
    (function () {
      var items = [].slice.call(document.querySelectorAll(".ea-faq__item"));
      if (!items.length) return;
      items.forEach(function (item) {
        var q = item.querySelector(".ea-faq__q");
        var a = item.querySelector(".ea-faq__a");
        if (!q || !a) return;
        q.addEventListener("click", function () {
          var open = item.classList.contains("is-open");
          items.forEach(function (i) {
            i.classList.remove("is-open");
            var ia = i.querySelector(".ea-faq__a");
            if (ia) ia.style.maxHeight = null;
          });
          if (!open) { item.classList.add("is-open"); a.style.maxHeight = a.scrollHeight + "px"; }
        });
      });
    })();
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
})();
