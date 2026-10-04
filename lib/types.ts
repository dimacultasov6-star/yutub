/** Типы, общие для клиента, сид-скрипта и схемы БД. */

export type Aspect = '9:16' | '1:1' | '16:9';

/** Ролик. В БД хранятся только метаданные — сам файл лежит по direct_video_url. */
export interface Video {
  id: string;
  title: string;
  description: string;
  author_name: string;
  direct_video_url: string;
  poster_url: string | null;
  likes_count: number;
  views_count: number;
  tags: string[];
  aspect: Aspect;
  duration_sec: number | null;
  created_at: string;
  comments_count?: number;
}

/** Черновик нового ролика из модального окна «Добавить ролик». */
export interface VideoDraft {
  direct_video_url: string;
  title: string;
  description: string;
  author_name: string;
  tags: string[];
  aspect: Aspect;
  poster_url?: string | null;
}

export interface Comment {
  id: string;
  video_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

/** Что вернул RPC toggle_like. */
export interface LikeResult {
  likes_count: number;
  is_liked: boolean;
}

/** Где мы работаем: web / android / desktop. */
export type Platform = 'web' | 'android' | 'desktop';