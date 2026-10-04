#!/usr/bin/env node
/**
 * Проверка статического экспорта: действительно ли out/ собран под тот
 * basePath, который мы ожидаем.
 *
 * Зачем это нужно. Статический экспорт Next.js по умолчанию пишет абсолютные
 * пути (/_next/...). На GitHub Pages сайт лежит по адресу /yutub/, и если
 * префикс не проставлен, страница молча отдаёт белый экран: браузер ищет
 * github.io/_next/... и не находит. Такую ошибку очень легко пропустить —
 * HTML валидный, сборка «успешна», тесты зелёные.
 *
 * Запуск:
 *   node scripts/verify-export.mjs              # ожидаем корень (Electron/Android/Vercel)
 *   node scripts/verify-export.mjs /yutub       # ожидаем префикс /yutub (GitHub Pages)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const expected = (process.argv[2] ?? '').replace(/\/+$/, '');
const OUT = join(process.cwd(), 'out');

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  OK  ' : ' FAIL'} ${msg}`);
  if (!cond) failures++;
};

if (!existsSync(join(OUT, 'index.html'))) {
  console.error('\nПапка out/ отсутствует. Выполните `npm run build`.\n');
  process.exit(1);
}

const html = readFileSync(join(OUT, 'index.html'), 'utf8');
const prefix = expected ? `${expected}/` : '/';

console.log(`Проверяю out/ на соответствие basePath = "${expected || '(корень)'}"`);
console.log('-'.repeat(64));

// 1. Никаких ссылок на ассеты вне префикса.
//
// Важно: ищем именно с префиксом (`/yutub/_next/...`), а не «начинается с
// /_next/». Иначе при basePath список оказывается пустым и проверка проходит
// вхолостую — то есть не проверяет ничего.
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
const interesting = [
  `${prefix}_next/`,
  `${prefix}icon.svg`,
  `${prefix}manifest.webmanifest`,
];
const assetRefs = refs.filter((r) => interesting.some((p) => r.startsWith(p)));

ok(assetRefs.length > 0, `найдено ссылок на ассеты с префиксом ${prefix}: ${assetRefs.length}`);

// Ссылки на те же ресурсы, но БЕЗ префикса, — это и есть поломка.
// Проверка осмысленна только когда префикс задан: в корневой сборке
// (Electron / Android / Vercel) все пути и должны начинаться с "/_next/".
if (expected) {
  const unprefixed = [
    '/_next/',
    '/icon.svg',
    '/manifest.webmanifest',
  ].filter((p) => refs.some((r) => r.startsWith(p)));
  ok(
    unprefixed.length === 0,
    `нет ссылок на ассеты без префикса${unprefixed.length ? `: ${unprefixed.join(', ')}` : ''}`,
  );
}

// 2. Префикс должен реально встречаться в собранном HTML.
if (expected) {
  ok(html.includes(`${prefix}_next/`), `HTML ссылается на ${prefix}_next/`);
}

// 3. Ассеты из HTML физически существуют в out/ (без префикса).
const missing = [];
for (const r of assetRefs) {
  const p = join(OUT, expected ? r.slice(expected.length + 1) : r.slice(1));
  if (!existsSync(p)) missing.push(r);
}
ok(assetRefs.length > 0 && missing.length === 0, `все ассеты из HTML присутствуют в out/ (проверено ${assetRefs.length})`);
for (const m of missing.slice(0, 5)) console.log(`         отсутствует: ${m}`);

// 4. Манифест: start_url/scope должны учитывать префикс.
const mfPath = join(OUT, 'manifest.webmanifest');
if (existsSync(mfPath)) {
  const mf = JSON.parse(readFileSync(mfPath, 'utf8'));
  const want = `${prefix}`;
  ok(mf.start_url === want, `manifest.start_url = ${mf.start_url} (ожидалось ${want})`);
  ok(mf.scope === want, `manifest.scope = ${mf.scope} (ожидалось ${want})`);
  ok(
    mf.icons.every((i) => i.src.startsWith(prefix)),
    `иконки манифеста с префиксом: ${mf.icons.map((i) => i.src).join(', ')}`,
  );
} else {
  ok(false, 'out/manifest.webmanifest не найден');
}

// 5. Ссылка на манифест в HTML тоже с префиксом.
const mfHref = refs.find((r) => r.endsWith('manifest.webmanifest'));
ok(
  !!mfHref && mfHref.startsWith(prefix),
  `в HTML манифест подключён как ${mfHref ?? '(нет)'}`,
);

// 6. Никаких серверных роутов (приложение статическое).
ok(!existsSync(join(OUT, '.next')), 'нет серверных артефактов .next в out/');

console.log('-'.repeat(64));
console.log(`\n=== ${failures === 0 ? 'ВСЁ ОК' : failures + ' ОШИБК(И)'} ===`);
process.exitCode = failures === 0 ? 0 : 1;
