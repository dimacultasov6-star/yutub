#!/usr/bin/env node
/**
 * Тесты статического сервера Electron-обёртки (electron/static-server.js).
 * Запуск: node scripts/test-server.mjs
 *
 * Проверяем ровно то, что ломается в проде у людей:
 *  - корень отдаёт index.html;
 *  - ассеты из /_next/... отдаются с правильным Content-Type и кэшем;
 *  - path traversal не выпускает нас за пределы out/;
 *  - SPA-фолбэк не отдаёт 404 на неизвестный маршрут.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { resolveSafePath, startStaticServer } = require(join(process.cwd(), 'electron', 'static-server.js'));

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  OK  ' : ' FAIL'} ${msg}`);
  if (!cond) failures++;
};

const ROOT = join(process.cwd(), 'out');
if (!existsSync(join(ROOT, 'index.html'))) {
  console.error('\nПапка out/ отсутствует. Выполните `npm run build`.\n');
  process.exit(1);
}

/* ---------------- чистые проверки resolveSafePath ---------------- */

// Проверяем ИМЕННО инвариант безопасности: результат либо null, либо путь,
// лежащий ВНУТРИ out/. «Вернулось null» — не требование: на Windows
// path.join('C:\\...\\out', '\\Windows\\...') даёт 'C:\\...\\out\\Windows\\...',
// то есть всё равно внутри. Ломается не ссылка, а ожидание в тесте.
console.log('resolveSafePath — ни один путь не выходит за пределы out/');
const attacks = [
  '/../../../../Windows/System32/drivers/etc/hosts',
  '/..%2f..%2f..%2fpackage.json',
  '/%2e%2e%2f%2e%2e%2fpackage.json',
  '/..\\..\\package.json',
  '/%2e%2e%5c%2e%2e%5cpackage.json',
  '/....//....//package.json',
  '/./../../package.json',
  '/subdir/../../package.json',
  '/%2f%2f%2fetc%2fpasswd',
  '/..\\..\\..\\..\\..\\package.json',
  '/\0/../../package.json',
];

for (const input of attacks) {
  const out = resolveSafePath(ROOT, input);
  const contained = out === null || out === ROOT || out.startsWith(ROOT + require('node:path').sep);
  const shown = out === null ? 'null (отклонён)' : JSON.stringify(out.replace(ROOT, '<out>'));
  ok(contained, `${JSON.stringify(input)} -> ${shown}`);
}

// Нормальные пути обязаны разрешаться.
console.log('\nresolveSafePath — обычные пути разрешаются');
for (const input of ['/index.html', '/_next/static/chunks/app.js', '/icon.svg', '/manifest.webmanifest']) {
  const out = resolveSafePath(ROOT, input);
  ok(out !== null && out.startsWith(ROOT), `${JSON.stringify(input)} -> ${out ? JSON.stringify(out.replace(ROOT, '<out>')) : 'null'}`);
}

/* ---------------- интеграционные проверки ---------------- */

const { server, url } = await startStaticServer(ROOT);
console.log(`\nHTTP-проверки на ${url}`);

const get = async (p) => {
  const r = await fetch(url + p, { redirect: 'manual' });
  const text = await r.text();
  return { status: r.status, headers: r.headers, text };
};

const root1 = await get('/');
ok(root1.status === 200, `GET / -> ${root1.status}`);
ok(root1.headers.get('content-type')?.startsWith('text/html'), `Content-Type: ${root1.headers.get('content-type')}`);
ok(root1.headers.get('cache-control') === 'no-cache', `Cache-Control HTML: ${root1.headers.get('cache-control')}`);
ok(/<title>[^<]*<\/title>/i.test(root1.text), 'в ответе есть <title> (страница реально отдалась)');
ok(root1.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff');

// Находим реальный ассет из собранного HTML и проверяем его отдачу.
const assetMatch = root1.text.match(/\/_next\/static\/[^"']+\.(js|css)/);
if (assetMatch) {
  const a = await get(assetMatch[0]);
  ok(a.status === 200, `GET ${assetMatch[0]} -> ${a.status}`);
  ok(
    a.headers.get('content-type')?.includes('javascript') || a.headers.get('content-type')?.includes('css'),
    `Content-Type ассета: ${a.headers.get('content-type')}`,
  );
  ok(
    a.headers.get('cache-control')?.includes('immutable'),
    `Cache-Control ассета: ${a.headers.get('cache-control')}`,
  );
  ok(a.text.length > 500, `размер ассета ${a.text.length} байт (не пустой)`);
} else {
  ok(false, 'в HTML не найдено ни одного ассета /_next/static/...');
}

const svg = await get('/icon.svg');
ok(svg.status === 200 && svg.headers.get('content-type') === 'image/svg+xml', `GET /icon.svg -> ${svg.status} ${svg.headers.get('content-type')}`);

const manifest = await get('/manifest.webmanifest');
ok(manifest.status === 200, `GET /manifest.webmanifest -> ${manifest.status}`);

// SPA-фолбэк: неизвестный маршрут должен отдать index.html, а не 404.
const spa = await get('/some/deep/route');
ok(spa.status === 200 && /<title>/i.test(spa.text), `SPA-фолбэк /some/deep/route -> ${spa.status}`);

// Traversal по сети: должен быть заблокирован ИЛИ упасть в SPA-фолбэк,
// но точно не отдать содержимое файла вне out/.
const traversal = await fetch(url + '/%2e%2e%2f%2e%2e%2fpackage.json', { redirect: 'manual' });
const tText = await traversal.text();
ok(!tText.includes('"vibetube"'), 'traversal по сети не раскрыл package.json');
ok(traversal.status !== 200 || /<title>/i.test(tText), `traversal по сети -> ${traversal.status} (не 200 с чужим содержимым)`);

// Закрываем сервер АККУРАТНО.
//
// server.close() лишь перестаёт принимать соединения, но уже установленные
// keep-alive-сокеты (их держит пул fetch) остаются живыми. Если после этого
// вызвать process.exit(), libuv на Windows аварийно снимает хендлы и печатает
// «Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)». Поэтому рвём
// соединения явно, дожидаемся события close и даём процессу завершиться самому.
await new Promise((resolve) => {
  server.close(resolve);
  server.closeAllConnections?.();
});

console.log(`\n=== ${failures === 0 ? 'ВСЁ ОК' : failures + ' ОШИБК(И)'} ===`);
// Не process.exit(): даём event-loop опустеть естественным образом.
process.exitCode = failures === 0 ? 0 : 1;