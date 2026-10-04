#!/usr/bin/env node
/**
 * Сквозная проверка собранного .exe:
 *   запускаем win-unpacked\Ютуб.exe -> находим его слушающий порт ->
 *   скачиваем / -> проверяем, что отдался НАШ html (а не пустота).
 *
 * Запуск: node scripts/smoke-exe.mjs
 */
import { spawn, execSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const EXE = 'release/win-unpacked';
const candidates = readdirSync(EXE).filter((f) => f.toLowerCase().endsWith('.exe'));
if (candidates.length === 0) {
  console.error('\nНет .exe в ' + EXE + '. Выполните: npm run build:exe\n');
  process.exit(1);
}
const exePath = join(EXE, candidates[0]);
console.log('Запускаю:', exePath);

const child = spawn(exePath, { stdio: 'ignore', detached: false });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanup = () => {
  try {
    child.kill();
  } catch {
    /* ignore */
  }
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /F /IM "${candidates[0]}" /T`, { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  }
};

let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '  OK  ' : ' FAIL'} ${msg}`);
  if (!cond) failures++;
};

try {
  await sleep(9000);

  ok(child.exitCode === null, `процесс жив (код выхода: ${child.exitCode})`);

  // Слушающие порты процесса.
  const netstat = execSync('netstat -ano', { encoding: 'utf8' });
  const rows = netstat
    .split(/\r?\n/)
    .filter((l) => l.includes('LISTENING') && l.trim().split(/\s+/).pop() === String(child.pid));

  ok(rows.length > 0, `слушающих портов у процесса: ${rows.length}`);

  const port = rows
    .map((l) => l.trim().split(/\s+/)[1])
    .filter((addr) => addr?.startsWith('127.0.0.1:'))
    .map((addr) => addr.split(':')[1])[0];

  if (!port) {
    ok(false, 'не найден порт на 127.0.0.1 — статический сервер не поднялся');
  } else {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`\nЗапрашиваю ${url}`);
    const res = await fetch(url);
    const html = await res.text();

    ok(res.status === 200, `GET / -> ${res.status}`);
    ok(res.headers.get('content-type')?.startsWith('text/html'), `Content-Type: ${res.headers.get('content-type')}`);
    ok(html.includes('<title>'), 'есть <title>');
    ok(/Ютуб/i.test(html), 'заголовок содержит «Ютуб» (рабочее имя приложения)');
    ok(html.includes('_next/static'), 'подключены ассеты Next.js');
  }
} finally {
  cleanup();
}

console.log(`\n=== ${failures === 0 ? 'ВСЁ ОК' : failures + ' ОШИБК(И)'} ===`);
// Не process.exit(): сокеты fetch ещё живы, и принудительное завершение
// приводит к assertion от libuv. Даём event-loop опустеть.
process.exitCode = failures === 0 ? 0 : 1;