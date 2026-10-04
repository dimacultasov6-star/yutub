#!/usr/bin/env node
/**
 * Публикация сайта на GitHub Pages.
 *
 * Что делает:
 *   1) собирает статический экспорт с basePath (по умолчанию /yutub);
 *   2) проверяет результат scripts/verify-export.mjs;
 *   3) заливает содержимое out/ в ветку gh-pages отдельной «чистой» сборкой;
 *   4) включает Pages в репозитории (если доступен gh CLI).
 *
 * Почему отдельная ветка, а не папка docs/ или корень main:
 *   исходники и собранная статика — разные вещи. В main остаётся код,
 *   gh-pages содержит только готовый сайт. Заодно не нужно коммитить
 *   артефакты сборки в основную историю.
 *
 * КРИТИЧНО — файл .nojekyll:
 *   GitHub Pages по умолчанию прогоняет сайт через Jekyll, а Jekyll
 *   выбрасывает всё, что начинается с подчёркивания. Наш каталог ассетов
 *   называется /_next/ — без .nojekyll он был бы удалён при сборке и сайт
 *   отдал бы белый экран с 404 на каждом ассете.
 *
 * Использование:
 *   node scripts/deploy-pages.mjs                  # basePath из названия репозитория
 *   node scripts/deploy-pages.mjs /yutub
 *   node scripts/deploy-pages.mjs /yutub --no-build   # передеплоить готовый out/
 */
import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  statSync,
  copyFileSync,
} from 'node:fs';
import { join, resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const TMP = join(ROOT, '.pages-staging');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const args = process.argv.slice(2);
const skipBuild = args.includes('--no-build');
const explicitBase = args.find((a) => !a.startsWith('--'));

// 1. Имя репозитория -> basePath.
function repoName() {
  try {
    return execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .trim()
      .replace(/\.git$/, '')
      .split(/[/:]/)
      .pop();
  } catch {
    return null;
  }
}

const basePath = (explicitBase ?? `/${repoName() ?? 'yutub'}`).replace(/\/+$/, '');
const OUT = join(ROOT, 'out');

const log = (m) => console.log(m);
const fail = (m) => {
  console.error(`\nОШИБКА: ${m}\n`);
  process.exit(1);
};

/** Рекурсивно копирует каталог. */
function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src)) {
    const s = join(src, entry);
    const d = join(dst, entry);
    if (statSync(s).isDirectory()) copyDir(s, d);
    else copyFileSync(s, d);
  }
}

log('=== Публикация на GitHub Pages ===\n');
log(`basePath: ${basePath}`);

/* --- 1. сборка --- */

if (!skipBuild) {
  log('\n[1/4] Сборка статического экспорта...');
  const build = spawnSync(NPM, ['run', 'build'], {
    cwd: ROOT,
    // Важно: переменная ставится здесь, а не через cross-env в scripts,
    // потому что npm выполняет prebuild как отдельный процесс — и
    // gen-manifest.mjs тоже должен увидеть basePath.
    env: { ...process.env, NEXT_PUBLIC_BASE_PATH: basePath },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (build.status !== 0) fail(`Сборка не удалась (код ${build.status})`);
} else {
  log('\n[1/4] Сборка пропущена (--no-build), используется текущий out/');
}

if (!existsSync(join(OUT, 'index.html'))) fail('В out/ нет index.html');

/* --- 2. проверка сборки --- */

log('\n[2/4] Проверка соответствия basePath...');
const verify = spawnSync(process.execPath, ['scripts/verify-export.mjs', basePath], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (verify.status !== 0) {
  fail(
    'Проверка экспорта не прошла. Публиковать нечего: сайт был бы сломан.\n' +
      '       Частая причина — забыли NEXT_PUBLIC_BASE_PATH при сборке.',
  );
}

/* --- 3. подготовка ветки gh-pages --- */

log('\n[3/4] Подготовка ветки gh-pages...');

const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
  cwd: ROOT,
  encoding: 'utf8',
}).trim();

if (existsSync(TMP)) execFileSync('git', ['-C', TMP, 'rm', '-rf', '.'], { stdio: 'ignore' });
else mkdirSync(TMP, { recursive: true });

copyDir(OUT, TMP);

// Без этого файла Jekyll удалит каталог /_next/ при сборке Pages.
writeFileSync(join(TMP, '.nojekyll'), '', 'utf8');
// Страница 404, чтобы битые ссылки не показывали серверную заглушку GitHub.
if (existsSync(join(OUT, '404.html'))) copyFileSync(join(OUT, '404.html'), join(TMP, '404.html'));

const count = readdirSync(TMP, { recursive: true }).length;
log(`  в staging: ${count} записей + .nojekyll`);

const git = (...a) => execFileSync('git', a, { cwd: TMP, encoding: 'utf8' });
try {
  git('init', '-q', '-b', 'gh-pages');
  git('config', 'user.name', process.env.GIT_AUTHOR_NAME || 'dima');
  git('config', 'user.email', process.env.GIT_AUTHOR_EMAIL || 'dima@users.noreply.github.com');
  git('add', '-A');
  git('commit', '-q', '-m', `Сборка GitHub Pages (basePath=${basePath})`);
  git('remote', 'add', 'origin', remote);
  git('push', '--force', '-u', 'origin', 'gh-pages');
  log(`  отправлено в ${remote} (gh-pages)`);
} finally {
  execFileSync('git', ['-C', TMP, 'rm', '-rf', '.'], { stdio: 'ignore' });
  spawnSync('cmd', ['/c', 'rmdir', '/s', '/q', TMP], { stdio: 'ignore' });
}

/* --- 4. включение Pages --- */

log('\n[4/4] Включение GitHub Pages...');
// Для REST API нужен slug «owner/repo». Если оставить в нём префикс
// github.com/, запрос уйдёт в 404 — это выглядит как «нет прав»,
// хотя на самом деле просто неверный адрес.
const slug = (remote.replace(/\.git$/, '').match(/(?:github\.com[/:])([^/]+\/[^/]+?)$/) || [])[1];
if (!slug) fail(`Не удалось определить owner/repo из ${remote}`);

// Сначала GET: если Pages уже включён, POST вернёт 409 и скрипт
// напечатает пугающее «ошибка», хотя всё на самом деле в порядке.
const existing = spawnSync('gh', ['api', `repos/${slug}/pages`], { encoding: 'utf8' });

if (existing.status === 0) {
  const cfg = JSON.parse(existing.stdout);
  log(`  Pages уже включён: ${cfg.html_url} (ветка ${cfg.source?.branch}, build_type=${cfg.build_type})`);
  if (cfg.source?.branch !== 'gh-pages' || cfg.source?.path !== '/') {
    log(`  ВНИМАНИЕ: источник Pages — ${cfg.source?.branch}/${cfg.source?.path}, а не gh-pages / (root).`);
    log('  Исправьте вручную: Settings -> Pages -> Source.');
  }
} else {
  const created = spawnSync(
    'gh',
    [
      'api',
      '--method',
      'POST',
      `repos/${slug}/pages`,
      '-f',
      'source[branch]=gh-pages',
      '-f',
      'source[path]=/',
    ],
    { encoding: 'utf8' },
  );

  if (created.status === 0) {
    try {
      log(`  Pages включён: ${JSON.parse(created.stdout).html_url}`);
    } catch {
      log('  Pages включён.');
    }
  } else {
    log(
      `  не удалось включить Pages автоматически:\n${(created.stderr || '').trim()}\n` +
        '  Включите вручную: Settings -> Pages -> Source: gh-pages / (root)',
    );
  }
}

log(`\nГотово. Сайт: https://${slug.replace(/^([^/]+)\/([^/]+)$/, '$1.github.io/$2')}/`);
log('Сборка Pages занимает 1–2 минуты, потом ещё минута на распространение по CDN.');
log('Проверить живой сайт: node scripts/verify-live.mjs https://' + slug.replace(/^([^/]+)\/([^/]+)$/, '$1.github.io/$2') + '/');
process.exitCode = 0;
