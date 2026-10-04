import raw from './seed.json';
import type { Video, VideoDraft } from './types';

interface SeedFile {
  _readme: string[];
  videos: (Omit<Video, 'created_at'> & { source?: string })[];
}

const file = raw as unknown as SeedFile;

/**
 * Локальный фолбэк-каталог. Используется, когда Supabase не сконфигурирован,
 * чтобы лента была рабочей с первой секунды после `npm run build`.
 * created_at детерминирован (идёт по порядку), иначе после каждой перезагрузки
 * порядок ленты скакал бы из-за новых timestamp.
 */
export const LOCAL_SEED: Video[] = file.videos.map((v, i) => ({
  ...v,
  tags: v.tags ?? [],
  poster_url: v.poster_url ?? null,
  comments_count: 0,
  created_at: new Date(Date.UTC(2026, 0, 1, 12, 0, 0) - i * 60_000).toISOString(),
}));

/** Один и тот же список использует scripts/seed.mjs — держим JSON как единый источник. */
export const SEED_RAW = file.videos;

export type { VideoDraft };