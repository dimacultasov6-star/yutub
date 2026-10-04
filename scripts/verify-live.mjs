#!/usr/bin/env node
/**
 * Проверка живого сайта на GitHub Pages.
 *
 * Зачем отдельно от verify-export: локальная проверка смотрит на файлы в out/,
 * а здесь мы убеждаемся, что сайт реально работает по HTTP — то есть прошёл
 * сборку Pages, не потерял каталоги при обработке Jekyll и отдаётся с 200.
 *
 * Особенно важно проверить /_next/: каталог начинается с подчёркивания,
 * и Jekyll по умолчанию такие каталоги выбрасывает. Без .nojekyll главная
 * страница открывается, а каждый ассет отдаёт 404 — классический сценарий
 * «выглядит нормально, но не работает».
 *
 * Запуск:
 *   node scripts/verify-live.mjs https://dimacultasov6-star.github.io/yutub/
 */
const base = (process.argv[2] ?? '').replace(/\/+$/, '');

if (!base) {
  console.error('Укажите адрес сайта: node scripts/verify-live.mjs https://.../yutub/');
  process.exit(1);
}

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  OK  ' : ' FAIL'} ${msg}`);
  if (!cond) failures++;
};

console.log(`Проверяю живой сайт: ${base}`);
console.log('-'.repeat(64));

// Путь сайта внутри домена, например '/yutub'. Нужен, чтобы корректно
// собирать URL: ссылки из HTML УЖЕ содержат этот префикс, и если blindly
// приклеить к ним base, получится '/yutub/yutub/_next/...' и вечная 404.
const { origin, pathname } = new URL(base);
const sitePath = pathname.replace(/\/+$/, '');

/** Собирает абсолютный URL, не дублируя префикс сайта. */
const toUrl = (p) => {
  if (/^https?:/i.test(p)) return p;
  if (sitePath && (p === sitePath || p.startsWith(`${sitePath}/`))) return origin + p;
  return origin + sitePath + (p.startsWith('/') ? p : `/${p}`);
};

const get = async (p) => {
  const res = await fetch(toUrl(p), { redirect: 'follow' });
  const text = await res.text();
  return { status: res.status, type: res.headers.get('content-type'), text, url: res.url };
};

// 1. Главная страница.
const home = await get('/');
ok(home.status === 200, `GET / -> ${home.status}`);
ok(!!home.type?.startsWith('text/html'), `Content-Type: ${home.type}`);
ok(/<title>[^<]*<\/title>/i.test(home.text), 'есть <title>');
ok(/Ютуб/i.test(home.text), 'страница содержит «Ютуб»');

// 2. Никаких ссылок на ассеты вне префикса сайта.
const refs = [...home.text.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
const unprefixed = refs.filter(
  (r) =>
    /^\/_next\//.test(r) ||
    /^\/icon\.svg$/.test(r) ||
    /^\/manifest\.webmanifest$/.test(r) ||
    (sitePath && !r.startsWith(sitePath) && r.startsWith('/') && !r.startsWith('//')),
);
ok(
  unprefixed.length === 0,
  `все ссылки на ассеты с префиксом${unprefixed.length ? `, лишние: ${unprefixed.slice(0, 3).join(', ')}` : ''}`,
);

// 3. Ключевой тест: ассеты из /_next/ должны реально отдаваться (Jekyll их не съел).
const nextRefs = refs.filter((r) => r.includes('/_next/'));
ok(nextRefs.length > 0, `в HTML есть ссылки на /_next/ (${nextRefs.length})`);
for (const r of nextRefs) {
  const a = await get(r);
  ok(a.status === 200, `GET ${r.replace(sitePath, '')} -> ${a.status}`);
}

// 4. Манифест и иконка.
for (const p of ['/manifest.webmanifest', '/icon.svg']) {
  const a = await get(p);
  ok(a.status === 200, `GET ${p} -> ${a.status}`);
}
const mf = await get('/manifest.webmanifest');
try {
  const j = JSON.parse(mf.text);
  ok(
    typeof j.start_url === 'string' && j.start_url.endsWith(`${sitePath}/`),
    `manifest.start_url = ${j.start_url} (ожидался ${sitePath}/)`,
  );
} catch {
  ok(false, 'манифест не разбирается как JSON');
}

// 5. Контент приложения реально приехал (ищем данные seed/фирменные строки).
ok(home.text.includes('/_next/static'), 'подключены бандлы Next.js');

console.log('-'.repeat(64));
console.log(`\n=== ${failures === 0 ? 'ВСЁ ОК' : failures + ' ОШИБК(И)'} ===`);
process.exitCode = failures === 0 ? 0 : 1;
