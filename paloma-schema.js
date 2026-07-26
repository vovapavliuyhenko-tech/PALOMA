/* ════════════════════════════════════════════════════════════════
   paloma-schema.js — единый источник Schema.org (JSON-LD) для PALOMA.
   ЗАЧЕМ: NAP (название, адрес, телефон, часы) описан ЗДЕСЬ один раз и
   совпадает «до символа» на всех страницах. Совпадает с инлайн-блоком
   на index.html (@id "#business"). Google и Яндекс исполняют JS и читают
   внедрённый JSON-LD.

   Экспорт:
     window.PALOMA_BIZ            — объект бизнеса (для seller/publisher и т.п.)
     window.palomaInjectJsonLd(o) — внедрить произвольный JSON-LD в <head>
   ════════════════════════════════════════════════════════════════ */
(function palomaSchema() {
  "use strict";

  var SITE = "https://paloma.website";

  /* ── Единый NAP: источник правды. Идентичен index.html ── */
  var BUSINESS = {
    "@type": ["Florist", "CafeOrCoffeeShop"],
    "@id": SITE + "/#business",
    name: "Студия цветов и кофе PALOMA",
    url: SITE + "/",
    image: SITE + "/images/paloma/hero/hero-main.jpg",
    logo: SITE + "/images/paloma/logo/paloma-wordmark.png",
    telephone: "+79897707000",
    priceRange: "₽₽",
    description:
      "PALOMA — студия цветов, specialty-кофе и подарков в Новороссийске: " +
      "букеты с фото перед отправкой, доставка день-в-день, самовывоз на " +
      "Энгельса, 74/82. Доставка: Новороссийск, Геленджик, Анапа.",
    address: {
      "@type": "PostalAddress",
      streetAddress: "ул. Энгельса, 74/82",
      addressLocality: "Новороссийск",
      addressRegion: "Краснодарский край",
      addressCountry: "RU",
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ],
        opens: "07:30",
        closes: "22:00",
      },
    ],
    areaServed: [
      { "@type": "City", name: "Новороссийск" },
      { "@type": "City", name: "Геленджик" },
      { "@type": "City", name: "Анапа" },
    ],
    sameAs: [
      "https://t.me/+79897707000",
      "https://wa.me/79897707000",
      "https://www.instagram.com/paloma.nvrsk",
    ],
  };

  window.PALOMA_BIZ = BUSINESS;
  window.PALOMA_SITE = SITE;

  /* Внедрить JSON-LD объект в <head>. Возвращает вставленный <script>. */
  function injectJsonLd(obj, marker) {
    try {
      var s = document.createElement("script");
      s.type = "application/ld+json";
      if (marker) s.setAttribute("data-paloma-schema", marker);
      s.textContent = JSON.stringify(obj);
      (document.head || document.documentElement).appendChild(s);
      return s;
    } catch (e) {
      return null;
    }
  }
  window.palomaInjectJsonLd = injectJsonLd;

  /* Есть ли уже узел #business на странице (инлайн на index/contacts)?
     Если да — базовый блок не дублируем. */
  function hasInlineBusiness() {
    var nodes = document.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || "").indexOf('"' + SITE + '/#business"') > -1) {
        return true;
      }
    }
    return false;
  }

  if (!hasInlineBusiness()) {
    injectJsonLd(
      {
        "@context": "https://schema.org",
        "@graph": [
          BUSINESS,
          {
            "@type": "WebSite",
            "@id": SITE + "/#website",
            name: "PALOMA",
            url: SITE + "/",
            inLanguage: "ru-RU",
            publisher: { "@id": SITE + "/#business" },
          },
        ],
      },
      "business",
    );
  }
})();
