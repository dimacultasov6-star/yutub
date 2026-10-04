import type { Aspect, VideoDraft } from './types';

/**
 * Валидация прямой ссылки на видео.
 *
 * Ключевой момент: полноценная проверка «это вообще видео» делается НЕ здесь,
 * а в браузере через <video>.loadedmetadata (см. AddVideoModal). Здесь только
 * синтаксическая валидация, потому что fetch() к чужому CDN упирается в CORS
 * и не даёт достоверного ответа.
 */

/** Основной формат агрегатора — mp4 (Telegram/VK). Остальные — для совместимости. */
export const ALLOWED_EXT = ['.mp4', '.m4v', '.webm', '.mov'] as const;

export interface UrlCheck {
  ok: boolean;
  /** Техническое сообщение для разработчика. */
  reason?: string;
  /** Сообщение для пользователя. */
  message?: string;
  ext?: string;
  host?: string;
}

export function validateVideoUrl(input: string): UrlCheck {
  const value = input.trim();

  if (!value) return { ok: false, message: 'Вставьте прямую ссылку на видео.' };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, message: 'Это не похоже на ссылку. Нужен адрес вида https://…/video.mp4' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, message: `Протокол ${url.protocol} не поддерживается. Нужен http(s).` };
  }

  if (url.protocol === 'http:') {
    // В .APK Android с 9-й версии блокирует cleartext — предупреждаем заранее.
    return {
      ok: false,
      message: 'Нужна https-ссылка: Android и Electron режут незашифрованный http.',
    };
  }

  const host = url.hostname.toLowerCase();
  const path = decodeURIComponent(url.pathname).toLowerCase();

  const ext = ALLOWED_EXT.find((e) => path.endsWith(e));
  if (!ext) {
    return {
      ok: false,
      ext: undefined,
      host,
      message:
        'Ссылка должна вести прямо на файл: расширение .mp4 (или .m4v/.webm/.mov). ' +
        'Страницу с роликом сначала нужно превратить в прямую ссылку.',
    };
  }

  return { ok: true, ext, host };
}

/** Оценка длины/соотношения сторон -> значение для нашего CHECK-констрейнта. */
export function aspectFromSize(width: number, height: number): Aspect {
  if (!width || !height) return '9:16';
  const ratio = width / height;
  if (ratio > 1.2) return '16:9';
  if (ratio > 0.85) return '1:1';
  return '9:16';
}

export function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,#\s]+/)
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ),
  ).slice(0, 10);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '—';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function compactNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace('.0', '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ч`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} дн`;
  return new Date(iso).toLocaleDateString('ru-RU');
}

/** Клиентская валидация черновика перед отправкой. */
export function validateDraft(draft: VideoDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  const urlCheck = validateVideoUrl(draft.direct_video_url);
  if (!urlCheck.ok) errors.direct_video_url = urlCheck.message ?? 'Некорректная ссылка';
  if (!draft.title.trim()) errors.title = 'Нужно название';
  else if (draft.title.trim().length > 140) errors.title = 'Максимум 140 символов';
  if (!draft.author_name.trim()) errors.author_name = 'Нужно имя автора';
  if (draft.description.length > 2000) errors.description = 'Максимум 2000 символов';
  return errors;
}