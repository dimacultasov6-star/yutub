#!/usr/bin/env node
/**
 * Публикация релизов GitHub с корректными кириллическими именами файлов.
 *
 * Почему нельзя просто `gh release upload release\Ютуб-1.0.0-x64.exe`:
 * PowerShell передаёт аргументы нативному процессу в текущей кодовой
 * странице, и кириллица в имени файла теряется. GitHub при этом
 * совершенно спокойно создаёт asset с именем «-1.0.0-x64.exe» — без
 * ошибки, без предупреждения. Выглядит как «просто так и назвали».
 *
 * Здесь путь и имя файла передаются в GitHub API как UTF-8 через fetch,
 * без участия командной строки, поэтому «Ютуб» сохраняется.
 *
 * Запуск:
 *   node scripts/publish-release.mjs                 # v<version> из package.json
 *   node scripts/publish-release.mjs v1.2.0
 *   node scripts/publish-release.mjs --tag v1.2.0 --notes CHANGELOG.md
 */
import { execFileSync } from 'node:child_process';
import { existsSync, statSync, openAsBlob, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const ROOT = process.cwd();
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const tag = flag('tag', `v${pkg.version}`);
/**
 * Достаёт «owner/repo» из URL удалённого репозитория.
 *
 * Важно: нужен именно slug для REST API (dimacultasov6-star/yutub).
 * Если оставить в нём префикс github.com/, все запросы молча уходят
 * в 404 — и очень похоже на «нет прав», хотя дело в адресе.
 */
function slugFromRemote(url) {
  const m = url
    .trim()
    .replace(/\.git$/, '')
    .match(/(?:github\.com[/:])([^/]+\/[^/]+?)$/);
  return m ? m[1] : null;
}

const repo = slugFromRemote(execFileSync('git', ['config', '--get', 'remote.origin.url'], { encoding: 'utf8' }));
if (!repo) {
  console.error('\nНе удалось определить репозиторий из remote.origin.url\n');
  process.exit(1);
}

const token =
  process.env.GITHUB_TOKEN ||
  execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();

const api = 'https://api.github.com';
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'yutub-publish-release',
};

/** Файлы, которые публикуем. Собираются из имён, а не из вывода shell. */
const assets = [
  join(ROOT, 'release', `Ютуб-${pkg.version}-x64.exe`),
  join(ROOT, 'release', `Ютуб-${pkg.version}-portable.exe`),
  join(ROOT, 'dist', `Ютуб-${pkg.version}-release.apk`),
].filter((p) => existsSync(p));

/*
 * GitHub ВЫРЕЗАЕТ все не-ASCII символы из имени вложения. Проверено:
 *   «тест.txt»            -> «default.txt»
 *   «Ютуб-проба.txt»      -> «-.txt»
 *   «Yutub-proba.txt»     -> без изменений
 *
 * То есть кириллица в имени файла релиза невозможна в принципе: GitHub
 * не ругается, а молча называет файл «-1.0.0-x64.exe», и скачать его
 * по ожидаемому имени невозможно. Поэтому в релизе лежит латиница.
 */
const TRANSLIT = { 'Ютуб': 'Yutub' };

function assetName(file) {
  let n = basename(file);
  for (const [cyr, lat] of Object.entries(TRANSLIT)) n = n.split(cyr).join(lat);
  n = n.replace(/[^\x20-\x7E]/g, ''); // остальное GitHub всё равно вырежет
  return n.replace(/^[.\-\s]+/, '') || 'asset';
}

/** Все варианты имени, под которыми этот файл мог остаться от прошлых запусков. */
const nameAliases = (file) => {
  const base = basename(file);
  const stripped = base.replace(/[^\x20-\x7E]/g, ''); // «Ютуб-1.0.0-x64.exe» -> «-1.0.0-x64.exe»
  return new Set([
    assetName(file),
    stripped,
    stripped.replace(/^[.\-\s]+/, ''),
  ]);
};

if (assets.length === 0) {
  console.error('\nНе найдено ни одного файла сборки. Сначала выполните:');
  console.error('  npm run build:exe   и   npm run build:apk\n');
  process.exit(1);
}

const notesFile = flag('notes', null);
const notes = notesFile && existsSync(notesFile) ? readFileSync(notesFile, 'utf8') : null;

const call = async (method, path, extra = {}) => {
  const res = await fetch(api + path, { method, headers: { ...headers, ...extra.headers }, body: extra.body });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* не JSON — оставим как есть */
  }
  return { status: res.status, json, text };
};

console.log(`=== Публикация релиза ${tag} ===`);
console.log(`репозиторий: ${repo}`);
console.log(`файлов: ${assets.length}\n`);

/* --- 1. найти или создать релиз --- */

let rel = await call('GET', `/repos/${repo}/releases/tags/${tag}`);

if (rel.status === 404) {
  console.log(`Релиз ${tag} не найден — создаю.`);
  rel = await call('POST', `/repos/${repo}/releases`, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: tag,
      name: notes ? `Ютуб ${pkg.version}` : tag,
      body: notes ?? '',
      draft: false,
      prerelease: false,
      make_latest: 'true',
    }),
  });
  if (rel.status >= 300) {
    console.error(`Не удалось создать релиз: ${rel.status} ${rel.text}`);
    process.exit(1);
  }
} else if (rel.status >= 300) {
  console.error(`Не удалось получить релиз: ${rel.status} ${rel.text}`);
  process.exit(1);
}

const releaseId = rel.json.id;
console.log(`release_id: ${releaseId}\n`);

/*
 * Загрузка вложений идёт на ОТДЕЛЬНЫЙ хост — uploads.github.com.
 * На api.github.com тот же путь возвращает 404, хотя релиз существует
 * и права есть. Адрес берём из поля upload_url самого релиза:
 *   .../assets{?name,label}  ->  обрезаем шаблон и подставляем name.
 */
const uploadBase = String(rel.json.upload_url ?? '').split('{')[0];
if (!uploadBase) {
  console.error('В релизе нет поля upload_url — некуда грузить вложения.');
  process.exit(1);
}

/* --- 2. удалить старые вложения (в т.ч. с испорченными именами) --- */

const existing = await call('GET', `/repos/${repo}/releases/${releaseId}/assets?per_page=100`);
const aliases = new Set(assets.flatMap((p) => [...nameAliases(p)]));

for (const a of existing.json ?? []) {
  if (aliases.has(a.name)) {
    const del = await call('DELETE', `/repos/${repo}/releases/assets/${a.id}`);
    console.log(`  удалён прежний asset: ${a.name} (${del.status})`);
  }
}

/* --- 3. загрузить --- */

let failed = 0;
const uploaded = new Set();
for (const p of assets) {
  const name = assetName(p);
  const size = statSync(p).size;
  process.stdout.write(`  загружаю ${name} (${(size / 1048576).toFixed(1)} MB) ... `);

  // openAsBlob отдаёт файл потоком, а не читает 178 MB в память.
  const blob = await openAsBlob(p);
  const uploadUrl = `${uploadBase}?name=${encodeURIComponent(name)}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
    },
    body: blob,
  });
  const text = await res.text();

  if (res.status >= 300) {
    failed++;
    console.log(`ОШИБКА ${res.status}: ${(text || '').slice(0, 300)}`);
  } else {
    uploaded.add(name);
    console.log('OK');
  }
}

/* --- 4. итог --- */

const after = await call('GET', `/repos/${repo}/releases/${releaseId}/assets?per_page=100`);
console.log('\nВложения после загрузки:');
for (const a of after.json ?? []) {
  console.log(`  ${(a.size / 1048576).toFixed(1).padStart(6)} MB  ${a.name}`);
}

const missing = [...uploaded].filter((n) => !(after.json ?? []).some((a) => a.name === n));
if (missing.length) {
  console.error(`\nОШИБКА: не загрузились: ${missing.join(', ')}`);
  failed += missing.length;
}

console.log(`\n${failed === 0 ? 'Готово' : `Провалено: ${failed}`}`);
console.log(`https://github.com/${repo}/releases/tag/${tag}`);
process.exitCode = failed === 0 ? 0 : 1;
