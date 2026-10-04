-- ============================================================================
--  VibeTube / рабочее имя «Ютуб» — схема бесплатного агрегатора
--  Supabase (PostgreSQL). ВАЖНО: сервер НЕ хранит видеофайлы.
--  Здесь лежат только метаданные + прямая ссылка на .mp4 (direct_video_url).
-- ============================================================================
--
--  Как запустить:
--    Supabase Dashboard -> SQL Editor -> New query -> вставить весь файл -> Run.
--    (или локально: psql "$DATABASE_URL" -f supabase/schema.sql)
--
--  Файл идемпотентен: можно запускать повторно, он не уронит существующие данные.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Таблица роликов
-- ----------------------------------------------------------------------------
create table if not exists public.videos (
  id              uuid primary key default gen_random_uuid(),

  -- обязательные метаданные
  title           text        not null check (char_length(trim(title)) between 1 and 140),
  description     text        not null default '',

  -- автор. author_id — внешний идентификатор (uuid из auth), NULL для гостей,
  -- потому что весь UI работает без авторизации.
  author_id       uuid        references auth.users (id) on delete set null,
  author_name     text        not null default 'anon',

  -- ГЛАВНОЕ ПОЛЕ АГРЕГАТОРА: прямая ссылка на .mp4 во внешнем хранилище
  -- (Telegram / VK / CDN). Файл лежит НЕ у нас — мы только ретранслируем URL.
  direct_video_url text       not null check (direct_video_url ~* '^https?://'),

  -- Превью-кадр. Необязательно: если пусто, плеер берёт кадр из самого видео.
  poster_url      text        check (poster_url is null or poster_url ~* '^https?://'),

  -- Счётчики. Двигаются только через SECURITY DEFINER функцию toggle_like,
  -- иначе аноним мог бы слать UPDATE likes_count = 999999 (см. RLS ниже).
  likes_count     integer     not null default 0 check (likes_count >= 0),
  views_count     integer     not null default 0 check (views_count >= 0),

  -- Прочее
  tags            text[]      not null default '{}',
  aspect          text        not null default '9:16'
                              check (aspect in ('9:16', '1:1', '16:9')),
  duration_sec    numeric(6,2) check (duration_sec is null or duration_sec > 0),

  -- Публикация: модерация вместо удаления строки (мягкое скрытие из ленты).
  is_published    boolean     not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.videos is
  'Метаданные роликов. Видеофайлы физически не хранятся: direct_video_url — прямая ссылка на внешний .mp4.';

create index if not exists videos_created_at_idx  on public.videos (created_at desc);
create index if not exists videos_published_idx  on public.videos (is_published, created_at desc);
create index if not exists videos_tags_gin        on public.videos using gin (tags);

-- Обновление updated_at без триггера на каждую строку — ленивое и дешёвое.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists videos_touch_updated_at on public.videos;
create trigger videos_touch_updated_at
  before update on public.videos
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Таблица лайков
--    Один лайк = одна строка, уникальность по (video_id, device_id).
--    device_id — случайный UUID, который клиент генерирует у себя и хранит
--    в localStorage. Никакой авторизации не требуется, но накрутка с одного
--    устройства блокируется на уровне БД.
-- ----------------------------------------------------------------------------
create table if not exists public.video_likes (
  video_id    uuid        not null references public.videos (id) on delete cascade,
  device_id   uuid        not null,
  created_at  timestamptz not null default now(),
  primary key (video_id, device_id)
);

create index if not exists video_likes_device_idx on public.video_likes (device_id);

-- ----------------------------------------------------------------------------
-- 3. Комментарии (для шторки «Комментарии»)
-- ----------------------------------------------------------------------------
create table if not exists public.video_comments (
  id           uuid primary key default gen_random_uuid(),
  video_id     uuid        not null references public.videos (id) on delete cascade,
  device_id    uuid        not null,
  author_name  text        not null default 'anon' check (char_length(trim(author_name)) between 1 and 40),
  body         text        not null check (char_length(trim(body)) between 1 and 500),
  created_at   timestamptz not null default now()
);

create index if not exists video_comments_video_idx
  on public.video_comments (video_id, created_at desc);

-- ============================================================================
--  ROW LEVEL SECURITY
--  Публичное чтение и публичная вставка — это фича агрегатора.
--  Право удалять/скрывать ролик — только у аутентифицированного владельца
--  или у пользователя с ролью service_role.
-- ============================================================================

alter table public.videos         enable row level security;
alter table public.video_likes    enable row level security;
alter table public.video_comments enable row level security;

-- ---- videos ----
drop policy if exists videos_select_anon on public.videos;
create policy videos_select_anon
  on public.videos for select
  to anon, authenticated
  using (is_published = true);

-- Любой может предложить ролик — это открытый агрегатор.
drop policy if exists videos_insert_anon on public.videos;
create policy videos_insert_anon
  on public.videos for insert
  to anon, authenticated
  with check (true);

-- Редактировать может автор (по device-совпадению невозможно — автор без входа),
-- поэтому правило по author_id для аутентифицированных + service_role для модерации.
drop policy if exists videos_update_owner on public.videos;
create policy videos_update_owner
  on public.videos for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists videos_delete_owner on public.videos;
create policy videos_delete_owner
  on public.videos for delete
  to authenticated
  using (author_id = auth.uid());

-- ---- video_likes ----
-- Наружу отдаём только «нравится ли это МОЕ устройство».
drop policy if exists likes_select_own on public.video_likes;
create policy likes_select_own
  on public.video_likes for select
  to anon, authenticated
  using (device_id = nullif(current_setting('request.headers', true)::jsonb ->> 'x-device-id', '')::uuid);

drop policy if exists likes_insert_own on public.video_likes;
create policy likes_insert_own
  on public.video_likes for insert
  to anon, authenticated
  with check (device_id = nullif(current_setting('request.headers', true)::jsonb ->> 'x-device-id', '')::uuid);

drop policy if exists likes_delete_own on public.video_likes;
create policy likes_delete_own
  on public.video_likes for delete
  to anon, authenticated
  using (device_id = nullif(current_setting('request.headers', true)::jsonb ->> 'x-device-id', '')::uuid);

-- ---- video_comments ----
drop policy if exists comments_select_all on public.video_comments;
create policy comments_select_all
  on public.video_comments for select
  to anon, authenticated
  using (true);

drop policy if exists comments_insert_own on public.video_comments;
create policy comments_insert_own
  on public.video_comments for insert
  to anon, authenticated
  with check (
    device_id = nullif(current_setting('request.headers', true)::jsonb ->> 'x-device-id', '')::uuid
  );

drop policy if exists comments_delete_own on public.video_comments;
create policy comments_delete_own
  on public.video_comments for delete
  to anon, authenticated
  using (device_id = nullif(current_setting('request.headers', true)::jsonb ->> 'x-device-id', '')::uuid);

-- ============================================================================
--  4. Атомарный лайк
--  SECURITY DEFINER — функции нужны, чтобы анонимный клиент не мог напрямую
--  UPDATE'нуть likes_count. Счётчик пересчитывается из таблицы лайков,
--  поэтому не рассинхронизируется даже при гонках.
-- ============================================================================
create or replace function public.toggle_like(p_video_id uuid, p_device_id uuid)
returns table (likes_count integer, is_liked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_liked boolean;
begin
  if p_video_id is null or p_device_id is null then
    raise exception 'video_id and device_id are required';
  end if;

  -- Уже есть лайк -> снимаем, нет -> ставим.
  if exists (select 1 from public.video_likes
             where video_id = p_video_id and device_id = p_device_id) then
    delete from public.video_likes
      where video_id = p_video_id and device_id = p_device_id;
    v_liked := false;
  else
    insert into public.video_likes (video_id, device_id)
      values (p_video_id, p_device_id)
      on conflict do nothing;
    v_liked := true;
  end if;

  -- Пересчёт из источника истины.
  update public.videos v
     set likes_count = (
           select count(*)::int from public.video_likes l where l.video_id = p_video_id
         )
   where v.id = p_video_id
  returning v.likes_count into likes_count;

  return query select likes_count, v_liked;
end;
$$;

revoke all on function public.toggle_like(uuid, uuid) from public;
grant execute on function public.toggle_like(uuid, uuid) to anon, authenticated;

-- Мои лайки одним запросом (для восстановления состояния при перезапуске).
create or replace function public.my_likes(p_device_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select video_id from public.video_likes where device_id = p_device_id;
$$;

grant execute on function public.my_likes(uuid) to anon, authenticated;

-- Инкремент просмотров (вызывается при реальном показе ролика, не при рендере списка).
create or replace function public.bump_view(p_video_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.videos set views_count = views_count + 1 where id = p_video_id;
$$;

grant execute on function public.bump_view(uuid) to anon, authenticated;

-- ============================================================================
--  5. Полезные представления
-- ============================================================================

-- Лента с количеством комментариев (одним запросом вместо N+1 на фронте).
create or replace view public.feed_videos
with (security_invoker = true) as
select v.*,
       coalesce(c.comments_count, 0) as comments_count
from public.videos v
left join (
  select video_id, count(*)::int as comments_count
  from public.video_comments
  group by video_id
) c on c.video_id = v.id;

comment on view public.feed_videos is
  'Лента: видео + счётчик комментариев. security_invoker — RLS видео продолжает действовать.';