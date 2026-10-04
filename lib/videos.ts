import { isSupabaseConfigured, safeDeviceId, supabase } from './supabase';
import { LOCAL_SEED } from './seed';
import type { Aspect, Comment, LikeResult, Video, VideoDraft } from './types';

/**
 * Единая точка доступа к данным.
 *
 * Два режима:
 *   1) Supabase сконфигурирован  -> сеть, общий доступ между устройствами;
 *   2) Supabase не задан         -> локальный сид + localStorage (лайки, комментарии).
 *
 * Оба режима возвращают одинаковый тип Video, поэтому UI ничего не знает
 * о том, откуда пришли данные. Это и делает «запуск без ключей» рабочим.
 */

/* ------------------------------------------------------------------ */
/* Локальное хранилище (фолбэк-режим)                                   */
/* ------------------------------------------------------------------ */

const LS_LIKES = 'vt.likes';
const LS_COMMENTS = 'vt.comments';
const LS_CUSTOM = 'vt.custom_videos';

const readJson = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const rawv = window.localStorage.getItem(key);
    return rawv ? (JSON.parse(rawv) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* квота/приватный режим — молча игнорируем */
  }
};

type LikeMap = Record<string, boolean>;
type CommentMap = Record<string, Comment[]>;

/* ------------------------------------------------------------------ */
/* Лента                                                               */
/* ------------------------------------------------------------------ */

export interface FeedResult {
  videos: Video[];
  /** Откуда пришли данные — показываем бейдж в интерфейсе. */
  source: 'supabase' | 'local';
  error?: string;
}

/**
 * Загрузка ленты. Кол-во не ограничиваем: клиент всё равно держит только
 * активный <video> playing, а превью берутся лениво.
 */
export async function fetchFeed(limit = 60): Promise<FeedResult> {
  if (!supabase) {
    return { videos: [...localCustomVideos(), ...LOCAL_SEED], source: 'local' };
  }

  const { data, error } = await supabase
    .from('videos')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data || data.length === 0) {
    // Сеть есть, но таблицы ещё нет или пусто — не показываем пользователю
    // пустоту, а откатываемся на сид. Это типичная ситуация первого запуска.
    return {
      videos: [...LOCAL_SEED],
      source: 'local',
      error: error?.message,
    };
  }

  const videos = data as Video[];
  // Дополняем счётчики комментариев локальным кэшем, пока нет вьюхи feed_videos.
  const comments = readJson<CommentMap>(LS_COMMENTS, {});
  return {
    videos: videos.map((v) => ({
      ...v,
      tags: v.tags ?? [],
      comments_count: comments[v.id]?.length ?? 0,
    })),
    source: 'supabase',
  };
}

function localCustomVideos(): Video[] {
  return readJson<Video[]>(LS_CUSTOM, []);
}

/* ------------------------------------------------------------------ */
/* Лайки                                                               */
/* ------------------------------------------------------------------ */

/** Какие ролики уже лайкнуло это устройство (для восстановления при перезапуске). */
export async function fetchMyLikes(videoIds: string[]): Promise<Set<string>> {
  const liked = new Set<string>();

  if (supabase) {
    const { data } = await supabase.rpc('my_likes', { p_device_id: safeDeviceId() });
    ((data ?? []) as string[]).forEach((id) => liked.add(String(id)));
    return liked;
  }

  const map = readJson<LikeMap>(LS_LIKES, {});
  videoIds.forEach((id) => {
    if (map[id]) liked.add(id);
  });
  return liked;
}

/**
 * Переключить лайк. Счётчик приходит с сервера уже пересчитанным
 * (RPC toggle_like), поэтому клиент не занимается оптимистичной математикой
 * «+1/-1», которая разъезжается с реальностью.
 */
export async function toggleLike(video: Video): Promise<LikeResult> {
  const deviceId = safeDeviceId();

  if (supabase) {
    const { data, error } = await supabase.rpc('toggle_like', {
      p_video_id: video.id,
      p_device_id: deviceId,
    });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as LikeResult | null;
    if (!row) throw new Error('toggle_like вернул пустой результат');
    return row;
  }

  const map = readJson<LikeMap>(LS_LIKES, {});
  const isLiked = !map[video.id];
  if (isLiked) map[video.id] = true;
  else delete map[video.id];
  writeJson(LS_LIKES, map);

  return { likes_count: Math.max(0, video.likes_count + (isLiked ? 1 : -1)), is_liked: isLiked };
}

/* ------------------------------------------------------------------ */
/* Просмотры                                                           */
/* ------------------------------------------------------------------ */

export async function bumpView(videoId: string): Promise<void> {
  if (supabase) {
    await supabase.rpc('bump_view', { p_video_id: videoId });
    return;
  }
  // В локальном режиме счётчик живёт в состоянии компонента и на диск не пишется.
}

/* ------------------------------------------------------------------ */
/* Комментарии                                                         */
/* ------------------------------------------------------------------ */

export async function fetchComments(videoId: string): Promise<Comment[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('video_comments')
      .select('*')
      .eq('video_id', videoId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as Comment[];
  }

  const map = readJson<CommentMap>(LS_COMMENTS, {});
  return map[videoId] ?? [];
}

export async function addComment(
  videoId: string,
  body: string,
  authorName: string,
): Promise<Comment> {
  const text = body.trim();
  const comment: Comment = {
    id: crypto.randomUUID(),
    video_id: videoId,
    author_name: authorName.trim() || 'anon',
    body: text,
    created_at: new Date().toISOString(),
  };

  if (supabase) {
    const { data, error } = await supabase
      .from('video_comments')
      .insert({
        video_id: videoId,
        device_id: safeDeviceId(),
        author_name: comment.author_name,
        body: comment.body,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as Comment;
  }

  const map = readJson<CommentMap>(LS_COMMENTS, {});
  map[videoId] = [comment, ...(map[videoId] ?? [])];
  writeJson(LS_COMMENTS, map);
  return comment;
}

/* ------------------------------------------------------------------ */
/* Добавление ролика                                                   */
/* ------------------------------------------------------------------ */

export interface AddResult {
  ok: boolean;
  video?: Video;
  error?: string;
}

/**
 * Добавление ролика. Сервер не загружает файл — мы сохраняем только
 * метаданные и прямую ссылку, ровно как и задумано архитектурой агрегатора.
 */
export async function addVideo(draft: VideoDraft): Promise<AddResult> {
  const payload = {
    direct_video_url: draft.direct_video_url.trim(),
    poster_url: draft.poster_url?.trim() || null,
    title: draft.title.trim(),
    description: draft.description.trim(),
    author_name: draft.author_name.trim() || 'anon',
    tags: draft.tags,
    aspect: draft.aspect satisfies Aspect,
  };

  if (supabase) {
    const { data, error } = await supabase.from('videos').insert(payload).select('*').single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, video: data as Video };
  }

  const video: Video = {
    id: crypto.randomUUID(),
    ...payload,
    likes_count: 0,
    views_count: 0,
    comments_count: 0,
    duration_sec: null,
    created_at: new Date().toISOString(),
  };
  const custom = localCustomVideos();
  writeJson(LS_CUSTOM, [video, ...custom]);
  return { ok: true, video };
}

export { isSupabaseConfigured };