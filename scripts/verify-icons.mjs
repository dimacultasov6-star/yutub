#!/usr/bin/env node
/**
 * Проверка сгенерированных иконок без просмотра глазами:
 *   - валидность структуры PNG (сигнатура, чанки, длины после inflate);
 *   - что альфа-канал осмысленный (углы прозрачные, центр непрозрачный);
 *   - что в центре есть белый «play» (иначе треугольник не нарисовался);
 *   - что ICO-оглавление согласовано с размерами вложенных PNG.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  OK  ' : ' FAIL'} ${msg}`);
  if (!cond) failures++;
};

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function parsePNG(buf, label) {
  console.log(`\n${label}`);
  ok(buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'сигнатура PNG');

  let off = 8;
  let ihdr = null;
  let idat = [];
  let sawIend = false;
  const types = [];

  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('latin1');
    const data = buf.subarray(off + 8, off + 8 + len);
    const crcStored = buf.readUInt32BE(off + 8 + len);
    types.push(type);

    ok(crc32(buf.subarray(off + 4, off + 8 + len)) === crcStored, `CRC чанка ${type}`);
    if (type === 'IHDR') {
      ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9] };
    }
    if (type === 'IDAT') idat.push(data);
    if (type === 'IEND') sawIend = true;
    off += 12 + len;
  }

  ok(!!ihdr, 'есть IHDR');
  ok(ihdr.depth === 8 && ihdr.color === 6, `битность/тип 8-bit RGBA (получено ${ihdr.depth}/${ihdr.color})`);
  ok(sawIend, 'есть IEND');
  ok(types[0] === 'IHDR' && types[types.length - 1] === 'IEND', 'порядок чанков корректен');

  const raw = inflateSync(Buffer.concat(idat));
  const expected = (ihdr.w * 4 + 1) * ihdr.h;
  ok(raw.length === expected, `растр после inflate = ${raw.length} байт (ожидалось ${expected})`);

  const px = (x, y) => {
    const i = y * (ihdr.w * 4 + 1) + 1 + x * 4;
    return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]];
  };

  ok(px(0, 0)[3] === 0, `левый верхний угол прозрачный (a=${px(0, 0)[3]})`);
  ok(px(ihdr.w - 1, ihdr.h - 1)[3] === 0, `правый нижний угол прозрачный (a=${px(ihdr.w - 1, ihdr.h - 1)[3]})`);
  ok(px(ihdr.w >> 1, ihdr.h >> 1)[3] === 255, `центр непрозрачный (a=${px(ihdr.w >> 1, ihdr.h >> 1)[3]})`);

  // Ищем белый «play»: в центральной трети должен быть пиксель с RGB > 235.
  let white = 0;
  let opaque = 0;
  let hues = new Set();
  for (let y = 0; y < ihdr.h; y++) {
    for (let x = 0; x < ihdr.w; x++) {
      const [r, g, b, a] = px(x, y);
      if (a > 200) {
        opaque++;
        hues.add(`${r >> 5},${g >> 5},${b >> 5}`);
        if (r > 235 && g > 235 && b > 235) white++;
      }
    }
  }
  const coverage = (opaque / (ihdr.w * ihdr.h)) * 100;
  ok(coverage > 80 && coverage < 99.5, `заливка ${coverage.toFixed(1)}% (скруглённый квадрат ~95%, не «кирпич» и не пусто)`);
  ok(white > ihdr.w * ihdr.h * 0.01, `белых пикселей (play-треугольник + пульс) = ${white}`);
  ok(hues.size > 12, `разнообразие цветов градиента: ${hues.size} оттенков`);
  return ihdr;
}

const p512 = parsePNG(readFileSync('assets/icon-512.png'), 'assets/icon-512.png');
parsePNG(readFileSync('assets/icon-1024.png'), 'assets/icon-1024.png');

/* ---------------- ICO ---------------- */
console.log('\nassets/icon.ico');
const ico = readFileSync('assets/icon.ico');
ok(ico.readUInt16LE(0) === 0, 'reserved = 0');
ok(ico.readUInt16LE(2) === 1, 'type = 1 (icon)');
const count = ico.readUInt16LE(4);
ok(count > 0, `записей в оглавлении: ${count}`);

for (let i = 0; i < count; i++) {
  const e = 6 + i * 16;
  const w = ico[e] === 0 ? 256 : ico[e];
  const h = ico[e + 1] === 0 ? 256 : ico[e + 1];
  const bytes = ico.readUInt32LE(e + 8);
  const offset = ico.readUInt32LE(e + 12);
  const slice = ico.subarray(offset, offset + bytes);

  const embeddedOk = slice.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const iw = slice.readUInt32BE(16);
  const ih = slice.readUInt32BE(20);
  ok(embeddedOk && iw === w && ih === h && w === h, `запись ${i}: ${w}x${h}, PNG внутри, ${bytes} байт, смещение ${offset}`);
  ok(offset + bytes <= ico.length, `запись ${i}: данные не выходят за границу файла`);
}

ok(p512.w === 512 && p512.h === 512, 'основной PNG действительно 512x512');

console.log(`\n=== ${failures === 0 ? 'ВСЁ ОК' : failures + ' ОШИБК(И)'} ===`);
process.exit(failures === 0 ? 0 : 1);