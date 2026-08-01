/* ════════════════════════════════════════════════════════════════════════
   PALOMA — Telegram-релей (Cloudflare Worker).

   ЗАЧЕМ. Из региона облачной функции (Яндекс, РФ) перестал открываться
   api.telegram.org → уведомления о заказах зависали и не доходили. Этот
   воркер живёт в глобальной сети Cloudflare (не в РФ), поэтому до Telegram
   достаёт свободно. Функция шлёт запросы В воркер, воркер — в Telegram.

   КАК ПОДКЛЮЧИТЬ (≈10 минут, бесплатно):
   1) Зарегистрируйтесь на dash.cloudflare.com (бесплатный аккаунт).
   2) Workers & Pages → Create → Create Worker → задайте имя (напр. paloma-tg)
      → Deploy. Затем «Edit code», вставьте ВЕСЬ этот файл, снова Deploy.
   3) Скопируйте адрес воркера, вида:
        https://paloma-tg.ВАШ-САБДОМЕН.workers.dev
   4) В облачной функции PALOMA добавьте переменную окружения:
        TG_API_BASE = https://paloma-tg.ВАШ-САБДОМЕН.workers.dev
      (без слэша в конце) и сохраните/задеплойте функцию.
   Готово: заказы снова пойдут в Telegram, уже через устойчивый путь.

   БЕЗОПАСНОСТЬ. Воркер — ваш личный, работает по HTTPS и только пересылает
   запросы на официальный api.telegram.org. Токен бота идёт по защищённому
   каналу, как и при прямом обращении к Telegram.
   ════════════════════════════════════════════════════════════════════════ */
export default {
  async fetch(request) {
    const src = new URL(request.url);
    // сохраняем путь (/bot<token>/<method>) и query, меняем только хост
    const target = "https://api.telegram.org" + src.pathname + src.search;
    const init = {
      method: request.method,
      headers: request.headers,
      body: (request.method === "GET" || request.method === "HEAD") ? undefined : request.body,
    };
    return fetch(target, init);
  },
};
