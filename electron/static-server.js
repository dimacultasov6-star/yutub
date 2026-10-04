'use strict';

/**
 * Мини-сервер для отдачи статического экспорта Next.js.
 * Вынесен из main.js отдельно, чтобы его можно было протестировать без запуска
 * Electron (см. scripts/test-server.mjs).
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Превращает URL-путь в путь внутри root, гарантируя, что мы не выйдем наружу.
 * Возвращает null, если путь небезопасен.
 */
function resolveSafePath(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null; // битый percent-encoding
  }
  if (decoded.includes('\0')) return null;

  const clean = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  const target = path.join(root, clean);
  const rel = path.relative(root, target);

  // Ключевая проверка: итоговый путь обязан остаться внутри root.
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return target;
}

function createStaticServer(root, { verbose = false } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const urlPath = req.url ?? '/';
      const isRoot = urlPath === '/' || urlPath.split('?')[0] === '/';

      let file = isRoot ? path.join(root, 'index.html') : resolveSafePath(root, urlPath);
      if (!file) {
        res.writeHead(403).end('Forbidden');
        if (verbose) console.warn('[403]', urlPath);
        return;
      }

      let stat = await fsp.stat(file).catch(() => null);

      if (stat?.isDirectory()) {
        file = path.join(file, 'index.html');
        stat = await fsp.stat(file).catch(() => null);
      }

      if (!stat?.isFile()) {
        // Неразобранный маршрут -> клиентский роутинг (у нас он один).
        file = path.join(root, 'index.html');
        stat = await fsp.stat(file).catch(() => null);
        if (!stat?.isFile()) {
          res.writeHead(404).end('Not found');
          return;
        }
      }

      const ext = path.extname(file).toLowerCase();
      const isHtml = ext === '.html';

      res.writeHead(200, {
        'Content-Type': MIME[ext] ?? 'application/octet-stream',
        'Content-Length': stat.size,
        // Сборка иммутабельна: ассеты кэшируем навсегда, HTML всегда свежий.
        'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
      });
      fs.createReadStream(file).pipe(res);
    } catch (err) {
      res.writeHead(500).end('Internal error');
      console.error('[server]', err);
    }
  });
}

/** Поднимает сервер на случайном свободном порту (0) и возвращает его URL. */
function startStaticServer(root, opts) {
  return new Promise((resolve, reject) => {
    const server = createStaticServer(root, opts);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}`, port });
    });
    server.on('error', reject);
  });
}

module.exports = { createStaticServer, resolveSafePath, startStaticServer, MIME };
