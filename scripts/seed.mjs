#!/usr/bin/env node
/**
 * Загрузка сид-данных в Supabase.
 *
 * Ключевая особенность: скрипт НЕ грузит видео. Он кладёт в БД только
 * метаданные и прямую ссылку на .mp4/.webm во внешнем хранилище.
 *
 * Использование:
 *   1) Выполнить supabase/schema.sql в SQL Editor.
 *   2) Положить ключи в .env.local (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)
 *      и в .env для этого скрипта (S3 — см. .env.example).
 *   3) npm run seed
 *
 * ВАЖНО: для записи используется SERVICE_ROLE ключ, если он задан, иначе —
 * anon-ключ. Service role нужен потому, что политика RLS разрешает анонимам
 * INSERT, но для идемпотентного upsert по id всё равно проще иметь полный доступ.
 * service_role никогда не попадает в клиентский бандл — скрипт работает в Node.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ---------------------------------------------------------------- */
/* .env-загрузка (без зависимостей)                                   */
/* ---------------------------------------------------------------- */

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Не перетираем уже заданные переменные окружения.
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(join(ROOT, '.env.local'));
loadEnvFile(join(ROOT, '.env'));

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !ANON) {
  console.error(
    '\n Не заданы NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.\n' +
      ' Скопируйте .env.example в .env.local и впишите значения из\n' +
      ' Supabase Dashboard -> Project Settings -> API.\n',
  );
  process.exit(1);
}

const KEY = SERVICE || ANON;
if (!SERVICE) {
  console.warn('\n  ВНИМАНИЕ: SUPABASE_SERVICE_ROLE_KEY не задан — используется anon-ключ.');
  console.warn('  Это работает, если политика RLS разрешает INSERT для anon.\n');
}

/* ---------------------------------------------------------------- */
/* Данные                                                             */
/* ---------------------------------------------------------------- */

const seed = JSON.parse(readFileSync(join(ROOT, 'lib', 'seed.json'), 'utf8'));

/** created_at детерминирован и убывает: лента в Supabase будет в том же порядке, что и локальная. */
const rows = seed.videos.map((v, i) => ({
  id: v.id,
  title: v.title,
  description: v.description,
  author_name: v.author_name,
  direct_video_url: v.direct_video_url,
  poster_url: v.poster_url ?? null,
  likes_count: v.likes_count,
  views_count: v.views_count,
  tags: v.tags,
  aspect: v.aspect,
  duration_sec: v.duration_sec,
  is_published: true,
  created_at: new Date(Date.UTC(2026, 0, 1, 12, 0, 0) - i * 60_000).toISOString(),
}));

/* ---------------------------------------------------------------- */
/* Загрузка                                                           */
/* ---------------------------------------------------------------- */

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

console.log(`\nПроект: ${URL}`);
console.log(`Ключ:   ${SERVICE ? 'service_role' : 'anon'}`);
console.log(`Записей: ${rows.length}\n`);

const { data, error } = await supabase
  .from('videos')
  .upsert(rows, { onConflict: 'id', ignoreDuplicates: false })
  .select('id, title');

if (error) {
  console.error('ОШИБКА загрузки:', error.message);
  console.error('\nЧаще всего это означает, что схема не создана. Выполните:');
  console.error('  supabase/schema.sql  в Supabase Dashboard -> SQL Editor\n');
  process.exit(1);
}

console.log(`Загружено/обновлено: ${data?.length ?? rows.length}`);
for (const row of data ?? []) {
  console.log(`  • ${row.title}`);
}

// Контрольная проверка: читаем обратно тем же ключом, которым пишем.
const { data: check, error: checkErr } = await supabase
  .from('videos')
  .select('id, title, aspect, likes_count')
  .eq('is_published', true)
  .order('created_at', { ascending: false });

if (checkErr) {
  console.error('\nПроверка чтения не удалась:', checkErr.message);
  console.error('Похоже, политика RLS videos_select_anon не создана или требует is_published = true.');
  process.exit(1);
}

console.log(`\nПроверка чтения: видно ${check?.length ?? 0} роликов в ленте.`);
console.log('\nГотово. Запустите приложение: npm run dev\n');
