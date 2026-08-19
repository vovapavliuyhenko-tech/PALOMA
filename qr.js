/* ════════════════════════════════════════════════════════════════════
   qr.js — генератор QR-кодов без внешних сервисов и библиотек.

   ЗАЧЕМ СВОЙ: ссылка на копилку пары уходит в пригласительные. Гонять
   её через чужой онлайн-генератор — значит зависеть от его доступности
   и отдавать данные наружу. Здесь всё считается в браузере.

   Возможности: байтовый режим (UTF-8), уровень коррекции M (~15%),
   версии 1–10 — этого хватает на ссылку до ~270 символов.

   window.palomaQR(text)        -> { size, modules, version }
   window.palomaQRCanvas(text)  -> <canvas>
   ════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* Кодовых слов данных на версию (уровень коррекции M) */
  var DATA_CODEWORDS = [16, 28, 44, 64, 86, 108, 124, 154, 182, 216];
  /* Кодовых слов коррекции в одном блоке (уровень M) */
  var EC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  /* Разбиение на блоки: пары [сколько блоков, размер блока] */
  var BLOCKS = [
    [[1, 16]], [[1, 28]], [[1, 44]], [[2, 32]], [[2, 43]],
    [[4, 27]], [[4, 31]], [[2, 38], [2, 39]], [[3, 36], [2, 37]], [[4, 43], [1, 44]]
  ];
  /* Центры выравнивающих узоров */
  var ALIGN = [
    [], [6, 18], [6, 22], [6, 26], [6, 30],
    [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]
  ];

  /* ── Арифметика поля Галуа GF(256) ── */
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function initGF() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function rsGenerator(n) {
    var poly = [1];
    for (var i = 0; i < n; i++) {
      var next = new Array(poly.length + 1);
      for (var z = 0; z < next.length; z++) next[z] = 0;
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];                       /* умножение на x */
        next[j + 1] ^= gfMul(poly[j], EXP[i]); /* умножение на a^i */
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, ecLen) {
    var gen = rsGenerator(ecLen);
    var res = new Array(ecLen);
    for (var z = 0; z < ecLen; z++) res[z] = 0;
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ res[0];
      res.shift();
      res.push(0);
      for (var j = 0; j < ecLen; j++) res[j] ^= gfMul(gen[j + 1], factor);
    }
    return res;
  }

  function utf8Bytes(str) {
    var enc = new TextEncoder().encode(str), out = [];
    for (var i = 0; i < enc.length; i++) out.push(enc[i]);
    return out;
  }

  /* ── Поток данных: режим, длина, содержимое, добивка ── */
  function buildData(text) {
    var bytes = utf8Bytes(text);
    var version = 0;
    for (var v = 1; v <= 10; v++) {
      var cci = v < 10 ? 8 : 16;
      if (4 + cci + bytes.length * 8 <= DATA_CODEWORDS[v - 1] * 8) { version = v; break; }
    }
    if (!version) throw new Error("Слишком длинная ссылка для QR");

    var cciLen = version < 10 ? 8 : 16;
    var bits = [];
    function push(value, len) {
      for (var i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
    }
    push(4, 4);                       /* режим «байты» */
    push(bytes.length, cciLen);
    for (var i = 0; i < bytes.length; i++) push(bytes[i], 8);

    var capacity = DATA_CODEWORDS[version - 1] * 8;
    push(0, Math.min(4, capacity - bits.length));
    while (bits.length % 8) bits.push(0);

    var codewords = [];
    for (var b = 0; b < bits.length; b += 8) {
      var byte = 0;
      for (var k = 0; k < 8; k++) byte = (byte << 1) | bits[b + k];
      codewords.push(byte);
    }
    var pad = [0xec, 0x11], p = 0;
    while (codewords.length < DATA_CODEWORDS[version - 1]) codewords.push(pad[p++ % 2]);

    return { version: version, codewords: codewords };
  }

  /* ── Чередование блоков данных и коррекции ── */
  function interleave(version, codewords) {
    var ecLen = EC_PER_BLOCK[version - 1];
    var groups = [], at = 0;
    BLOCKS[version - 1].forEach(function (pair) {
      for (var i = 0; i < pair[0]; i++) {
        groups.push(codewords.slice(at, at + pair[1]));
        at += pair[1];
      }
    });
    var ecBlocks = groups.map(function (g) { return rsEncode(g, ecLen); });

    var out = [], maxLen = 0;
    groups.forEach(function (g) { if (g.length > maxLen) maxLen = g.length; });
    for (var i = 0; i < maxLen; i++)
      groups.forEach(function (g) { if (i < g.length) out.push(g[i]); });
    for (var j = 0; j < ecLen; j++)
      ecBlocks.forEach(function (e) { out.push(e[j]); });
    return out;
  }

  /* ── Каркас матрицы: поисковые узоры, синхрополосы, выравнивание ── */
  function makeMatrix(version) {
    var size = version * 4 + 17, m = [], reserved = [], y, x;
    for (y = 0; y < size; y++) {
      m.push(new Array(size));
      reserved.push(new Array(size));
      for (x = 0; x < size; x++) { m[y][x] = false; reserved[y][x] = false; }
    }

    function finder(cx, cy) {
      for (var dy = -1; dy <= 7; dy++)
        for (var dx = -1; dx <= 7; dx++) {
          var px = cx + dx, py = cy + dy;
          if (px < 0 || py < 0 || px >= size || py >= size) continue;
          var inner = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
          m[py][px] = inner &&
            (dx === 0 || dx === 6 || dy === 0 || dy === 6 ||
             (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));
          reserved[py][px] = true;
        }
    }
    finder(0, 0); finder(size - 7, 0); finder(0, size - 7);

    for (var i = 8; i < size - 8; i++) {
      var on = i % 2 === 0;
      if (!reserved[6][i]) { m[6][i] = on; reserved[6][i] = true; }
      if (!reserved[i][6]) { m[i][6] = on; reserved[i][6] = true; }
    }

    var centers = ALIGN[version - 1];
    centers.forEach(function (cy) {
      centers.forEach(function (cx) {
        /* Пропускаем только те, что накрыли бы поисковые узоры. На
           синхрополосы выравнивающий узор по стандарту ложится поверх —
           раньше он тут пропускался, и версии 7+ выходили нечитаемыми. */
        var nearFinder =
          (cx <= 8 && cy <= 8) ||
          (cx >= size - 9 && cy <= 8) ||
          (cx <= 8 && cy >= size - 9);
        if (nearFinder) return;
        for (var dy = -2; dy <= 2; dy++)
          for (var dx = -2; dx <= 2; dx++) {
            var px = cx + dx, py = cy + dy;
            if (px < 0 || py < 0 || px >= size || py >= size) continue;
            m[py][px] = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
            reserved[py][px] = true;
          }
      });
    });

    m[size - 8][8] = true; reserved[size - 8][8] = true;   /* тёмный модуль */

    for (var k = 0; k <= 8; k++) {
      if (k !== 6) { reserved[8][k] = true; reserved[k][8] = true; }
    }
    for (var t = 0; t < 8; t++) {
      reserved[8][size - 1 - t] = true;
      reserved[size - 1 - t][8] = true;
    }
    if (version >= 7) {
      for (var a = 0; a < 6; a++)
        for (var b = 0; b < 3; b++) {
          reserved[size - 11 + b][a] = true;
          reserved[a][size - 11 + b] = true;
        }
    }
    return { size: size, m: m, reserved: reserved };
  }

  /* ── Раскладка потока змейкой снизу вверх ── */
  function placeData(grid, bits) {
    var size = grid.size, idx = 0, up = true;
    for (var right = size - 1; right > 0; right -= 2) {
      if (right === 6) right--;
      for (var step = 0; step < size; step++) {
        var y = up ? size - 1 - step : step;
        for (var c = 0; c < 2; c++) {
          var x = right - c;
          if (grid.reserved[y][x]) continue;
          grid.m[y][x] = idx < bits.length ? bits[idx] === 1 : false;
          idx++;
        }
      }
      up = !up;
    }
  }

  var MASKS = [
    function (y, x) { return (y + x) % 2 === 0; },
    function (y) { return y % 2 === 0; },
    function (y, x) { return x % 3 === 0; },
    function (y, x) { return (y + x) % 3 === 0; },
    function (y, x) { return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0; },
    function (y, x) { return ((y * x) % 2) + ((y * x) % 3) === 0; },
    function (y, x) { return (((y * x) % 2) + ((y * x) % 3)) % 2 === 0; },
    function (y, x) { return (((y + x) % 2) + ((y * x) % 3)) % 2 === 0; }
  ];

  function penalty(m, size) {
    var score = 0, i, j, run, prev;

    for (i = 0; i < size; i++) {
      run = 1; prev = m[i][0];
      for (j = 1; j < size; j++) {
        if (m[i][j] === prev) run++;
        else { if (run >= 5) score += run - 2; run = 1; prev = m[i][j]; }
      }
      if (run >= 5) score += run - 2;
      run = 1; prev = m[0][i];
      for (j = 1; j < size; j++) {
        if (m[j][i] === prev) run++;
        else { if (run >= 5) score += run - 2; run = 1; prev = m[j][i]; }
      }
      if (run >= 5) score += run - 2;
    }

    for (i = 0; i < size - 1; i++)
      for (j = 0; j < size - 1; j++) {
        var v = m[i][j];
        if (v === m[i][j + 1] && v === m[i + 1][j] && v === m[i + 1][j + 1]) score += 3;
      }

    var pat1 = [true, false, true, true, true, false, true, false, false, false, false];
    var pat2 = [false, false, false, false, true, false, true, true, true, false, true];
    function run11(get, at, pat) {
      for (var k = 0; k < 11; k++) if (get(at + k) !== pat[k]) return false;
      return true;
    }
    for (i = 0; i < size; i++) {
      for (j = 0; j <= size - 11; j++) {
        var row = function (k) { return m[i][k]; };
        var col = function (k) { return m[k][i]; };
        if (run11(row, j, pat1) || run11(row, j, pat2)) score += 40;
        if (run11(col, j, pat1) || run11(col, j, pat2)) score += 40;
      }
    }

    var dark = 0;
    for (i = 0; i < size; i++) for (j = 0; j < size; j++) if (m[i][j]) dark++;
    score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
    return score;
  }

  function formatBits(maskIndex) {
    var data = (0 << 3) | maskIndex;          /* 00 — уровень коррекции M */
    var value = data << 10;
    for (var i = 14; i >= 10; i--)
      if ((value >>> i) & 1) value ^= 0x537 << (i - 10);
    return ((data << 10) | value) ^ 0x5412;
  }

  function versionBits(version) {
    var value = version << 12;
    for (var i = 17; i >= 12; i--)
      if ((value >>> i) & 1) value ^= 0x1f25 << (i - 12);
    return (version << 12) | value;
  }

  function applyFormat(grid, maskIndex) {
    var size = grid.size, m = grid.m, bits = formatBits(maskIndex);
    for (var i = 0; i < 15; i++) {
      var on = ((bits >>> i) & 1) === 1;

      /* Копия у левого верхнего угла: младшие биты идут ВНИЗ по столбцу 8,
         старшие — ВЛЕВО по строке 8. Раньше строка и столбец были
         перепутаны местами: код выглядел правильным, но сканер не мог
         определить маску и отказывался его читать. */
      if (i < 6) m[i][8] = on;
      else if (i === 6) m[7][8] = on;
      else if (i === 7) m[8][8] = on;
      else if (i === 8) m[8][7] = on;
      else m[8][14 - i] = on;

      /* Вторая копия: младшие биты — ВПРАВО по строке 8 от правого края,
         старшие — ВВЕРХ по столбцу 8 от нижнего. */
      if (i < 8) m[8][size - 1 - i] = on;
      else m[size - 15 + i][8] = on;
    }
    m[size - 8][8] = true;
  }

  function applyVersion(grid, version) {
    if (version < 7) return;
    var size = grid.size, m = grid.m, bits = versionBits(version);
    for (var i = 0; i < 18; i++) {
      var on = ((bits >>> i) & 1) === 1;
      var a = Math.floor(i / 3), b = i % 3;
      m[size - 11 + b][a] = on;
      m[a][size - 11 + b] = on;
    }
  }

  function generate(text) {
    var built = buildData(String(text == null ? "" : text));
    var stream = interleave(built.version, built.codewords);
    var bits = [];
    stream.forEach(function (byte) {
      for (var i = 7; i >= 0; i--) bits.push((byte >>> i) & 1);
    });

    var best = null;
    for (var mask = 0; mask < 8; mask++) {
      var grid = makeMatrix(built.version);
      placeData(grid, bits);
      for (var y = 0; y < grid.size; y++)
        for (var x = 0; x < grid.size; x++)
          if (!grid.reserved[y][x] && MASKS[mask](y, x)) grid.m[y][x] = !grid.m[y][x];
      applyFormat(grid, mask);
      applyVersion(grid, built.version);
      var score = penalty(grid.m, grid.size);
      if (!best || score < best.score) best = { score: score, grid: grid };
    }
    return { size: best.grid.size, modules: best.grid.m, version: built.version };
  }

  window.palomaQR = generate;

  /* Готовый <canvas>. Поля вокруг кода (4 модуля) обязательны по
     стандарту — без них многие сканеры код не видят. */
  window.palomaQRCanvas = function (text, opts) {
    opts = opts || {};
    var scale = opts.scale || 8;
    var quiet = opts.quiet == null ? 4 : opts.quiet;
    var qr = generate(text);
    var px = (qr.size + quiet * 2) * scale;
    var canvas = document.createElement("canvas");
    canvas.width = px;
    canvas.height = px;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = opts.light || "#FFFFFF";
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = opts.dark || "#1B1A18";
    for (var y = 0; y < qr.size; y++)
      for (var x = 0; x < qr.size; x++)
        if (qr.modules[y][x])
          ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    return canvas;
  };
})();
