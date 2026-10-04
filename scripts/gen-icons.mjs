#!/usr/bin/env node
/**
 * Генератор иконок приложения: PNG + ICO без единой внешней зависимости.
 *
 * Зачем свой код: electron-builder требует assets/icon.ico, Capacitor/Android —
 * набор mipmap-*.png. Обычно это делают Figma/iloveimg, но тогда иконка
 * невоспроизводима и «теряется» вместе с исходником. Здесь она рисуется
 * процедурно из того же логотипа, что и в интерфейсе.
 *
 * Форматы:
 *   PNG — zlib- Deflate + CRC32 (RFC 1950/1951), только truecolor+alpha.
 *   ICO — контейнер с внедрёнными PNG (Vista+), electron-builder его понимает.
 *
 * Запуск: node scripts/gen-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

/* ---------------------------------------------------------------- */
/* PNG                                                               */
/* ---------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** rgba: Uint8Array длиной w*h*4 -> Buffer с сигнатурой PNG. */
function encodePNG(rgba, w, h = w) {
  const stride = w * 4;
  // Каждая строка префиксуется байтом фильтра 0 (None) — проще всего и достаточно.
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------------------------------------------------------- */
/* ICO (внедрённые PNG)                                              */
/* ---------------------------------------------------------------- */

function encodeICO(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const dir = [];
  for (const img of images) {
    const e = Buffer.alloc(16);
    e[0] = img.size >= 256 ? 0 : img.size; // 0 = 256
    e[1] = img.size >= 256 ? 0 : img.size;
    e[2] = 0; // палитра
    e[3] = 0; // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bpp
    e.writeUInt32BE(0, 8);
    e.writeUInt32LE(img.data.length, 8);
    e.writeUInt32LE(offset, 12);
    dir.push(e);
    offset += img.data.length;
  }

  return Buffer.concat([header, ...dir, ...images.map((i) => i.data)]);
}

/* ---------------------------------------------------------------- */
/* Геометрия логотипа (совпадает с components/Logo.tsx)              */
/* ---------------------------------------------------------------- */

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Плавный переход 0..1 по краю шириной 1px экранного пространства. */
const smooth = (edge, px) => clamp01(0.5 - edge / px);

const mix = (a, b, t) => a + (b - a) * t;

function roundedRectSDF(px, py, halfW, halfH, r) {
  const qx = Math.abs(px) - halfW + r;
  const qy = Math.abs(py) - halfH + r;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return outside + Math.min(Math.max(qx, qy), 0) - r;
}

/** Градиент бренда: #7C3AED -> #D946EF -> #06B6D4 по диагонали. */
function gradient(t) {
  const stops = [
    [0.0, [0x7c, 0x3a, 0xed]],
    [0.48, [0xd9, 0x46, 0xef]],
    [1.0, [0x06, 0xb6, 0xd4]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i];
    const [p1, c1] = stops[i + 1];
    if (t >= p0 && t <= p1) {
      const k = (t - p0) / (p1 - p0);
      return [mix(c0[0], c1[0], k), mix(c0[1], c1[1], k), mix(c0[2], c1[2], k)];
    }
  }
  return stops[t < 0 ? 0 : 2][1];
}

/**
 * Рисует иконку в RGBA.
 * @param {number} size сторона в px
 * @param {number} inset 0 = во весь холст, >0 = отступ (для adaptive-иконок Android)
 */
function renderIcon(size, inset = 0) {
  const rgba = new Uint8Array(size * size * 4);
  const S = 512; // рисуем в логических координатах 512, потом сэмплируем
  const scale = size / S;
  const pad = inset * S;

  const half = S / 2 - pad;
  const radius = (S - 2 * pad) * 0.23;
  const cx = S / 2;
  const cy = S / 2;

  // Геометрия треугольника «play» (логические координаты).
  const tri = [
    [212, 176],
    [350, 255],
    [212, 334],
  ];
  // «Пульс» — 4 вертикальных штриха.
  const bars = [
    [118, 260, 118, 300],
    [152, 232, 152, 328],
    [394, 260, 394, 300],
    [360, 232, 360, 328],
  ];
  const BAR_W = 15;
  const TRI_ROUND = 14;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // 2x2 сглаживание: усредняем четыре субпикселя.
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (const [ox, oy] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        const px = (x + ox) / scale;
        const py = (y + oy) / scale;
        const lx = px - cx;
        const ly = py - cy;

        const dRect = roundedRectSDF(lx, ly, half, half, radius);
        const inRect = smooth(dRect, 1.6 / scale);
        if (inRect <= 0.001) continue;

        // Фон: диагональный градиент + верхний блик.
        const t = clamp01((lx + half) / (2 * half) * 0.35 + (ly + half) / (2 * half) * 0.65);
        let [br, bg, bb] = gradient(t);

        const sheen = smooth(lx, 1e9) * 0; // (блик считаем ниже по ly)
        const sheenAmt = clamp01((-ly + half) / (2 * half)) * 0.42;
        br = mix(br, 255, sheenAmt);
        bg = mix(bg, 255, sheenAmt);
        bb = mix(bb, 255, sheenAmt);
        void sheen;

        // Треугольник (сглаженный SDF по трём сторонам).
        let dTri = signedTriangle(lx, ly, tri);
        const inTri = smooth(dTri, TRI_ROUND);

        // Штрихи пульса.
        let inBars = 0;
        for (const [x1, y1, x2, y2] of bars) {
          const d = capsuleSDF(lx, ly, x1 - cx, y1 - cy, x2 - cx, y2 - cy, BAR_W / 2);
          inBars = Math.max(inBars, smooth(d, 1.4 / scale));
        }

        const fg = Math.max(inTri, inBars);
        br = mix(br, 255, fg * 0.97);
        bg = mix(bg, 255, fg * 0.97);
        bb = mix(bb, 255, fg * 0.97);

        r += br * inRect;
        g += bg * inRect;
        b += bb * inRect;
        a += inRect;
      }

      const i = (y * size + x) * 4;
      // a — сумма покрытий 4 субпикселей, т.е. 0..4. Среднее = a/4 в диапазоне 0..1,
      // а в PNG альфа хранится в 0..255 — не забываем масштабировать.
      const coverage = a / 4;
      const n = coverage > 0 ? coverage : 0;
      rgba[i] = n > 0 ? Math.round(r / (4 * n)) : 0;
      rgba[i + 1] = n > 0 ? Math.round(g / (4 * n)) : 0;
      rgba[i + 2] = n > 0 ? Math.round(b / (4 * n)) : 0;
      rgba[i + 3] = Math.round(coverage * 255);
    }
  }

  return rgba;
}

/** Знаковый SDF треугольника (для произвольного треугольника). */
function signedTriangle(px, py, tri) {
  const edges = [];
  for (let i = 0; i < 3; i++) {
    const [x1, y1] = tri[i];
    const [x2, y2] = tri[(i + 1) % 3];
    const ex = x2 - x1;
    const ey = y2 - y1;
    const wx = px - x1;
    const wy = py - y1;
    const len = Math.hypot(ex, ey) || 1;
    // Точка слева от ребра (при обходе против часовой стрелки) -> внутри.
    const side = (ex * wy - ey * wx) / len;
    edges.push({ d: -side, raw: side });
  }
  // Внутри = все стороны одного знака.
  const allNeg = edges.every((e) => e.d <= 0);
  const allPos = edges.every((e) => e.d >= 0);
  if (allNeg || allPos) return -Math.min(...edges.map((e) => Math.abs(e.d)));
  return Math.min(...edges.map((e) => Math.abs(e.d)));
}

/** SDF «капсулы» (отрезок с закруглениями) — используется для штрихов пульса. */
function capsuleSDF(px, py, x1, y1, x2, y2, r) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const wx = px - x1;
  const wy = py - y1;
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(wx - vx * t, wy - vy * t) - r;
}

/* ---------------------------------------------------------------- */
/* Запись файлов                                                     */
/* ---------------------------------------------------------------- */

/* ---------------------------------------------------------------- */
/* Splash-экраны Android                                             */
/* ---------------------------------------------------------------- */

/**
 * Тёмный splash: фирменный фон с мягким свечением и логотипом по центру.
 *
 * Зачем: `npx cap add android` кладёт в res/drawable* сплошной splash
 * с логотипом Capacitor. В релизе это выглядит как чужой бренд, поэтому
 * перерисовываем все стартовые заставки в фирменные.
 */
function renderSplash(w, h) {
  const rgba = new Uint8Array(w * h * 4);
  const logoSize = Math.round(Math.min(w, h) * 0.3);
  const logo = renderIcon(logoSize);
  const lx = Math.round((w - logoSize) / 2);
  const ly = Math.round((h - logoSize) / 2);
  const cx = w / 2;
  const cy = h / 2;
  const glowR = Math.min(w, h) * 0.85;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;

      // Базовый почти-чёрный фон с лёгким подъёмом к низу.
      const t = clamp01((x / w) * 0.4 + (y / h) * 0.6);
      let r = mix(5, 12, t);
      let g = mix(6, 14, t);
      let b = mix(10, 26, t);

      // Свечение бренда за логотипом.
      const d = Math.hypot(x - cx, y - cy) / glowR;
      const glow = Math.pow(clamp01(1 - d), 2.2) * 0.5;
      const [gr, gg, gb] = gradient(clamp01((x / w) * 0.3 + (y / h) * 0.7));
      r = mix(r, gr, glow);
      g = mix(g, gg, glow);
      b = mix(b, gb, glow);

      // Логотип поверх.
      const px = x - lx;
      const py = y - ly;
      if (px >= 0 && px < logoSize && py >= 0 && py < logoSize) {
        const j = (py * logoSize + px) * 4;
        const a = logo[j + 3] / 255;
        if (a > 0) {
          r = mix(r, logo[j], a);
          g = mix(g, logo[j + 1], a);
          b = mix(b, logo[j + 2], a);
        }
      }

      rgba[i] = Math.round(r);
      rgba[i + 1] = Math.round(g);
      rgba[i + 2] = Math.round(b);
      rgba[i + 3] = 255; // splash непрозрачный
    }
  }
  return rgba;
}

function writeSplash(path, w, h) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePNG(renderSplash(w, h), w, h));
  console.log(`  SPL ${path.replace(process.cwd() + '\\', '')}  ${w}x${h}`);
}

function writePng(path, size, inset = 0) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePNG(renderIcon(size, inset), size, size));
  console.log(`  PNG  ${path.replace(process.cwd() + '\\', '')}  ${size}x${size}`);
}

console.log('Генерирую иконки...');

// electron-builder: ICO 16..256
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icoImages = icoSizes.map((s) => ({ size: s, data: encodePNG(renderIcon(s), s, s) }));
mkdirSync('assets', { recursive: true });
writeFileSync('assets/icon.ico', encodeICO(icoImages));
console.log('  ICO  assets\\icon.ico  ' + icoSizes.join(','));

// Крупный PNG — для Linux/ICO-источника и документации.
for (const s of [512, 1024]) writePng(`assets/icon-${s}.png`, s);

// Android mipmap (legacy + round). Ставим только если папка уже создана cap-ом.
const androidRes = join('android', 'app', 'src', 'main', 'res');
if (existsSync(androidRes)) {
  const densities = [
    ['mdpi', 48],
    ['hdpi', 72],
    ['xhdpi', 96],
    ['xxhdpi', 144],
    ['xxxhdpi', 192],
  ];
  for (const [d, px] of densities) {
    writePng(join(androidRes, `mipmap-${d}`, 'ic_launcher.png'), px);
    writePng(join(androidRes, `mipmap-${d}`, 'ic_launcher_round.png'), px);
    writePng(join(androidRes, `mipmap-${d}`, 'ic_launcher_foreground.png'), px * 2, 0.22);
  }
  const dirs = readdirSync(androidRes).filter((d) => d.startsWith('mipmap-'));
  console.log(`  Android: обновлено ${dirs.length} папок mipmap-*`);

  // Adaptive-иконка (Android 8+) состоит из слоя «фон» + слой «передний план».
  // Фон у Capacitor по умолчанию белый — с нашим тёмным логотипом это выглядит
  // как запятка, поэтому перекрашиваем его в фирменный тёмный.
  const bgFile = join(androidRes, 'values', 'ic_launcher_background.xml');
  writeFileSync(
    bgFile,
    '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<resources>\n' +
      '    <color name="ic_launcher_background">#05060A</color>\n' +
      '</resources>\n',
    'utf8',
  );
  console.log(`  Android: фон adaptive-иконки -> ${bgFile.replace(process.cwd() + '\\', '')}`);

  // Splash-экраны: та же логика, что у Capacitor (портрет/ландшафт на 5 density).
  const splashes = [
    ['drawable', 480, 800],
    ['drawable-port-mdpi', 320, 480],
    ['drawable-port-hdpi', 480, 800],
    ['drawable-port-xhdpi', 720, 1280],
    ['drawable-port-xxhdpi', 960, 1600],
    ['drawable-port-xxxhdpi', 1280, 1920],
    ['drawable-land-mdpi', 480, 320],
    ['drawable-land-hdpi', 800, 480],
    ['drawable-land-xhdpi', 1280, 720],
    ['drawable-land-xxhdpi', 1600, 960],
    ['drawable-land-xxxhdpi', 1920, 1280],
  ];
  for (const [dir, w, h] of splashes) {
    writeSplash(join(androidRes, dir, 'splash.png'), w, h);
  }
} else {
  console.log('  Android: папки android/ ещё нет — выполните `npm run android:add` и запустите скрипт снова.');
}

console.log('Готово.');