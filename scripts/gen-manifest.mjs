#!/usr/bin/env node
/**
 * Генерация PWA-манифеста с учётом basePath.
 *
 * Почему нельзя просто держать готовый файл в public/:
 *   манифест лежит в static-хостинге как есть, Next его не переписывает.
 *   В нём start_url и scope жёстко заданы как "/", а на GitHub Pages сайт
 *   живёт по адресу /yutub/. Установка PWA уводила бы на корень домена
 *   github.io — то есть на чужой сайт.
 *
 * Что делаем: генерируем манифест из шаблона при каждой сборке, подставляя
 * NEXT_PUBLIC_BASE_PATH. Файл перезаписывается целиком, поэтому «залипнуть»
 * в нём префикс от прошлой сборки не может.
 *
 * Запуск (автоматически через prebuild):
 *   node scripts/gen-manifest.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');

/** Собирает URL с префиксом: join('/yutub', '/icon.svg') -> '/yutub/icon.svg'. */
const withBase = (p) => `${basePath}${p.startsWith('/') ? p : `/${p}`}`;

const manifest = {
  name: 'Ютуб — вертикальная лента',
  short_name: 'Ютуб',
  description:
    'Бесплатный агрегатор вертикальных видео: лента, лайки, комментарии. Один код — веб, Android и Windows.',
  lang: 'ru',
  start_url: withBase('/'),
  scope: withBase('/'),
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#05060a',
  theme_color: '#05060a',
  categories: ['entertainment', 'social'],
  icons: [{ src: withBase('/icon.svg'), sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
};

const out = join(process.cwd(), 'public', 'manifest.webmanifest');
mkdirSync(join(process.cwd(), 'public'), { recursive: true });
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(
  `manifest.webmanifest: start_url=${manifest.start_url} scope=${manifest.scope}` +
    `${basePath ? `  (basePath=${basePath})` : '  (корень — Electron/Android/Vercel)'}`,
);
