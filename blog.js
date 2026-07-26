(function PalomaBlog() {
  "use strict";

  const articles = window.PALOMA_BLOG || [];
  const tag = "div";

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name) || "";
  }

  function cardHtml(art, large) {
    const largeClass = large ? " blog-card--large" : "";
    const bgStyle = art.image
      ? `background-image: url('${escHtml(art.image)}'); background-color: #efe6da;`
      : `background: ${escHtml(art.bg)};`;
    return (
      `<article class="blog-card${largeClass}">` +
      `<a class="blog-card__image" href="blog-article.html?id=${escHtml(art.id)}"` +
      ` aria-label="${escHtml(art.title)}" style="${bgStyle}" data-cursor="hover">` +
      `<span class="blog-card__cat">${escHtml(art.categoryLabel)}</span></a>` +
      `<${tag} class="blog-card__body">` +
      `<h3 class="blog-card__title"><a href="blog-article.html?id=${escHtml(art.id)}">${escHtml(art.title)}</a></h3>` +
      `<p class="blog-card__excerpt">${escHtml(art.excerpt)}</p>` +
      `<${tag} class="blog-card__meta"><span class="blog-card__author">Флорист PALOMA</span>` +
      `<time datetime="${escHtml(art.date)}">Обновлено: сегодня</time>` +
      `<span>${escHtml(art.readTime)}</span></${tag}>` +
      `<a class="blog-card__link" href="blog-article.html?id=${escHtml(art.id)}" data-cursor="hover">Читать</a>` +
      `</${tag}></article>`
    );
  }

  function initBlogPage() {
    const gridEl = document.getElementById("blogGrid");
    const filters = document.querySelectorAll("[data-blog-cat]");
    if (!gridEl) return;

    function renderGrid(cat) {
      const list =
        cat === "all"
          ? [...articles]
          : articles.filter((a) => a.category === cat);

      if (!list.length) {
        gridEl.innerHTML =
          `<${tag} class="blog-empty"><p>В этой рубрике пока нет статей.</p>` +
          `<button type="button" class="btn btn--outline" data-blog-cat="all">Все материалы</button></${tag}>`;
        gridEl
          .querySelector('[data-blog-cat="all"]')
          ?.addEventListener("click", () => setFilter("all"));
        return;
      }

      gridEl.innerHTML = list
        .map((art, i) => cardHtml(art, i === 0))
        .join("");

      window.palomaRebindCursorHovers?.();
    }

    function setFilter(cat) {
      filters.forEach((f) =>
        f.classList.toggle("is-active", f.dataset.blogCat === cat),
      );
      renderGrid(cat);
    }

    filters.forEach((f) =>
      f.addEventListener("click", () => setFilter(f.dataset.blogCat || "all")),
    );

    renderGrid("all");
  }

  function initArticlePage() {
    const contentEl = document.getElementById("articleContent");
    const notFoundEl = document.getElementById("articleNotFound");
    if (!contentEl) return;

    const id = getParam("id");
    const art = articles.find((a) => a.id === id);

    if (!art) {
      if (notFoundEl) notFoundEl.hidden = false;
      return;
    }

    document.title = `${art.title} — Блог PALOMA`;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", art.excerpt);

    /* ── SEO: canonical + Open Graph per article ── */
    (function injectArticleSeo() {
      var SITE = "https://paloma.website";
      var url = SITE + "/blog-article.html?id=" + encodeURIComponent(art.id);
      var img = art.image ? (art.image.indexOf("http") === 0 ? art.image : SITE + "/" + art.image) : SITE + "/images/paloma/hero/hero-main.jpg";
      function setMeta(attr, key, val) {
        var el = document.head.querySelector("[" + attr + '="' + key + '"]');
        if (!el) { el = document.createElement("meta"); el.setAttribute(attr, key); document.head.appendChild(el); }
        el.setAttribute("content", val);
      }
      var link = document.head.querySelector('link[rel="canonical"]');
      if (!link) { link = document.createElement("link"); link.setAttribute("rel", "canonical"); document.head.appendChild(link); }
      link.setAttribute("href", url);
      setMeta("property", "og:type", "article");
      setMeta("property", "og:site_name", "PALOMA");
      setMeta("property", "og:locale", "ru_RU");
      setMeta("property", "og:url", url);
      setMeta("property", "og:title", art.title + " — Блог PALOMA");
      setMeta("property", "og:description", art.excerpt);
      setMeta("property", "og:image", img);
      setMeta("name", "twitter:card", "summary_large_image");
      setMeta("name", "twitter:title", art.title + " — Блог PALOMA");
      setMeta("name", "twitter:description", art.excerpt);
      setMeta("name", "twitter:image", img);

      /* ── Schema.org: Article + BreadcrumbList ── */
      var graph = {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Article",
            headline: art.title,
            description: art.excerpt,
            image: img,
            datePublished: art.date || undefined,
            dateModified: art.date || undefined,
            inLanguage: "ru-RU",
            mainEntityOfPage: url,
            author: { "@id": SITE + "/#business" },
            publisher: { "@id": SITE + "/#business" },
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Главная", item: SITE + "/" },
              { "@type": "ListItem", position: 2, name: "Блог", item: SITE + "/blog.html" },
              { "@type": "ListItem", position: 3, name: art.title, item: url },
            ],
          },
        ],
      };
      var old = document.getElementById("article-seo-jsonld");
      if (old) old.remove();
      var sc = document.createElement("script");
      sc.type = "application/ld+json";
      sc.id = "article-seo-jsonld";
      sc.textContent = JSON.stringify(graph);
      document.head.appendChild(sc);
    })();

    const breadTitle = document.getElementById("articleBreadcrumbTitle");
    if (breadTitle) breadTitle.textContent = art.title;

    const related = articles.filter((a) => a.id !== art.id).slice(0, 3);

    const heroStyle = art.image
      ? `background-image: url('${escHtml(art.image)}'); background-color: #efe6da;`
      : `background: ${escHtml(art.bg)};`;

    const galleryHtml =
      art.gallery && art.gallery.length
        ? `<section class="article-gallery" aria-label="Фотографии PALOMA">
            <${tag} class="article-gallery__grid">` +
          art.gallery
            .map(
              (src) =>
                `<${tag} class="article-gallery__item" style="background-image: url('${escHtml(src)}');" role="img" aria-label="${escHtml(art.title)}"></${tag}>`,
            )
            .join("") +
          `</${tag}></section>`
        : "";

    const relatedHtml = related.length
      ? `<section class="article-related" aria-labelledby="article-related-heading">
          <${tag} class="article-related__inner">
            <h2 class="article-related__title" id="article-related-heading">Читайте также</h2>
            <${tag} class="article-related__grid">${related.map((r) => cardHtml(r, false)).join("")}</${tag}>
          </${tag}>
        </section>`
      : "";

    contentEl.innerHTML =
      `<section class="article-hero">
        <${tag} class="article-hero__inner">
          <span class="article-hero__cat">${escHtml(art.categoryLabel)}</span>
          <h1 class="article-hero__title">${escHtml(art.title)}</h1>
          <${tag} class="article-hero__meta">
            <span class="article-hero__author">Автор: Флорист PALOMA</span>
            <time datetime="${escHtml(art.date)}">Обновлено: сегодня</time>
            <span>${escHtml(art.readTime)} чтения</span>
          </${tag}>
        </${tag}>
        <${tag} class="article-hero__image" style="${heroStyle}"
             role="img" aria-label="${escHtml(art.alt || art.title)}"></${tag}>
      </section>
      <${tag} class="article-body"><${tag} class="article-body__inner">${art.content}</${tag}></${tag}>
      ${galleryHtml}
      ${relatedHtml}
      <section class="article-cta">
        <${tag} class="article-cta__inner">
          <h2 class="article-cta__title">Выбрать букет</h2>
          <p class="article-cta__text">Загляните в каталог или напишите нам — поможем с выбором.</p>
          <${tag} class="article-cta__actions">
            <a href="catalog.html" class="btn btn--dark" data-cursor="hover">В каталог</a>
            <a href="https://wa.me/79897707000" target="_blank" rel="noopener" class="btn btn--outline" data-cursor="hover">Задать вопрос</a>
          </${tag}>
        </${tag}>
      </section>`;

    window.palomaRebindCursorHovers?.();
  }

  initBlogPage();
  initArticlePage();
})();
