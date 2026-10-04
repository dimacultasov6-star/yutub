'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Video } from '@/lib/types';
import { compactNumber, formatDuration } from '@/lib/validation';
import { haptic } from '@/lib/platform';
import { ActionRail } from './ActionRail';

interface Props {
  video: Video;
  /** Активен ли ролик (его видно >= 60% viewport). */
  active: boolean;
  /** Глобальный переключатель звука из шапки. Единственный источник истины. */
  soundOn: boolean;
  onToggleSound: () => void;
  liked: boolean;
  likedCount: number;
  onToggleLike: (video: Video) => void;
  onShare: (video: Video) => void;
  onOpenComments: (video: Video) => void;
}

export function ShortCard({
  video,
  active,
  soundOn,
  onToggleSound,
  liked,
  likedCount,
  onToggleLike,
  onShare,
  onOpenComments,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [likeBurst, setLikeBurst] = useState(0);
  const [duration, setDuration] = useState<number | null>(video.duration_sec);
  const [revealed, setRevealed] = useState(false);

  const lastTapRef = useRef(0);

  // Мьют — это просто инверсия soundOn, отдельного состояния не нужно:
  // иначе шапка и карточка рассинхронизируются (два источника истины).
  const muted = !soundOn;

  // Синхронизируем DOM с состоянием (эффект как раз для этого и есть).
  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  }, [muted, active]);

  // Появление карточки с анимацией (после первого рендера, чтобы не мигало).
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 40);
    return () => clearTimeout(t);
  }, []);

  /* --- Управление воспроизведением ------------------------------- */

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (!active) {
      // Неактивный ролик всегда на паузе — иначе десяток видео играет одновременно.
      // Событие onPause само обновит playing, дублировать setState здесь не нужно.
      el.pause();
      return;
    }

    let cancelled = false;
    const attempt = async () => {
      try {
        await el.play();
        if (!cancelled) setPlaying(true);
      } catch {
        // Браузер запретил автозапуск со звуком — честно показываем плей-оверлей.
        if (!cancelled) setPlaying(false);
      }
    };
    void attempt();

    return () => {
      cancelled = true;
    };
  }, [active]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    } else {
      el.pause();
      setPlaying(false);
    }
    void haptic('light');
  }, []);

  /** Один тап — пауза, двойной — лайк (как в TikTok). */
  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 280) {
      lastTapRef.current = 0;
      setLikeBurst((n) => n + 1);
      void haptic('medium');
      if (!liked) onToggleLike(video);
      return;
    }
    lastTapRef.current = now;
    setTimeout(() => {
      // Если второго тапа не было — это одиночный тап.
      if (lastTapRef.current === now) togglePlay();
    }, 290);
  }, [liked, onToggleLike, togglePlay, video]);

  // Переключение звука — делегируем наверх, чтобы шапка и карточка не расходились.
  const handleMuteToggle = useCallback(() => {
    onToggleSound();
    void haptic('light');
  }, [onToggleSound]);

  return (
    <article
      className="vt-card relative h-full w-full snap-start snap-always overflow-hidden bg-black"
      style={{
        opacity: revealed ? 1 : 0,
        transform: revealed ? 'translateY(0)' : 'translateY(18px)',
        transition: 'opacity 380ms ease, transform 380ms cubic-bezier(0.2,0.8,0.2,1)',
      }}
      aria-label={video.title}
    >
      {/* Размытая подложка: прячет чёрные поля у не-9:16 роликов.
          Рендерится ТОЛЬКО когда пропорции не вертикальные — иначе получили бы
          второй <video> с тем же URL и удвоенный трафик. */}
      {!failed && video.aspect !== '9:16' && (
        <video
          src={video.direct_video_url}
          poster={video.poster_url ?? undefined}
          aria-hidden="true"
          tabIndex={-1}
          muted
          loop
          playsInline
          preload="metadata"
          className="vt-backdrop absolute inset-0 h-full w-full"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, rgba(124,58,237,0.22), transparent 60%), linear-gradient(180deg, rgba(5,6,10,0.55), rgba(5,6,10,0.25) 35%, rgba(5,6,10,0.92))',
        }}
      />

      {/* Собственно плеер */}
      {!failed ? (
        <video
          ref={videoRef}
          src={video.direct_video_url}
          poster={video.poster_url ?? undefined}
          className="vt-card-video absolute inset-0"
          loop
          playsInline
          // Лента без звука включается сразу; звук — осознанный выбор пользователя.
          muted={muted}
          preload={active ? 'auto' : 'metadata'}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            setDuration(Number.isFinite(el.duration) ? el.duration : null);
            if (el.videoWidth && el.videoHeight) {
              // Мягко уточняем пропорции: реальный размер — источник истины.
              el.style.objectFit = 'contain';
            }
          }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            setProgress(el.duration ? el.currentTime / el.duration : 0);
          }}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => {
            setWaiting(false);
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onError={() => {
            // Агрегатор живёт на прямых ссылках: битая ссылка — штатная ситуация,
            // поэтому показываем честную заглушку вместо чёрного экрана.
            setFailed(true);
            setPlaying(false);
          }}
          onClick={handleTap}
        />
      ) : (
        <BrokenSourceNotice video={video} />
      )}

      {/* Индикатор загрузки */}
      {active && waiting && !failed && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="vt-glass grid h-16 w-16 place-items-center rounded-full text-white/85">
            <svg viewBox="0 0 24 24" className="vt-spin h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          </div>
        </div>
      )}

      {/* Оверлей play/pause по центру */}
      {!playing && !failed && !waiting && (
        <button
          type="button"
          onClick={handleTap}
          aria-label="Воспроизвести"
          className="vt-glass absolute inset-0 grid cursor-pointer place-items-center"
        >
          <span className="grid h-20 w-20 place-items-center rounded-full bg-black/35 text-white/95 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <svg viewBox="0 0 24 24" className="ml-1 h-10 w-10" fill="currentColor">
              <path d="M8 5.5v13l11-6.5z" />
            </svg>
          </span>
        </button>
      )}

      {/* Анимация двойного тапа */}
      {likeBurst > 0 && (
        <span
          key={likeBurst}
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 vt-burst text-punch-500 drop-shadow-[0_0_28px_rgba(236,72,153,0.85)]"
        >
          <svg viewBox="0 0 24 24" className="h-32 w-32" fill="currentColor">
            <path d="M12 21s-7.5-4.7-9.6-9.1C.9 8.2 2.7 4.5 6.2 4.5c2 0 3.4 1.1 4.3 2.3l1.5 2 1.5-2c.9-1.2 2.3-2.3 4.3-2.3 3.5 0 5.3 3.7 3.8 7.4C19.5 16.3 12 21 12 21z" />
          </svg>
        </span>
      )}

      {/* Метаданные снизу слева */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-4"
        style={{ paddingBottom: 'calc(1rem + var(--vt-safe-bottom))' }}
      >
        <div className="max-w-[78%]">
          <div className="mb-2 flex items-center gap-2">
            <span className="vt-glass rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide text-white/85">
              @{video.author_name}
            </span>
            {video.aspect === '9:16' && (
              <span className="rounded-full bg-aqua-500/20 px-2 py-1 text-[10px] font-bold tracking-wider text-aqua-400">
                9:16
              </span>
            )}
            <span className="text-[11px] font-medium text-white/55">{formatDuration(duration)}</span>
          </div>

          <h2 className="text-[15px] font-semibold leading-snug text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.7)]">
            {video.title}
          </h2>

          {video.description && (
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-white/70">
              {video.description}
            </p>
          )}

          {video.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {video.tags.slice(0, 4).map((tag) => (
                <span key={tag} className="text-[11.5px] font-medium text-aqua-400/90">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-1.5 text-[11px] text-white/45">{compactNumber(video.views_count)} просмотров</div>
        </div>
      </div>

      {/* Прогресс + быстрый звук */}
      <div className="absolute inset-x-0 bottom-0 z-20 h-[3px] bg-white/10">
        <div
          className="h-full origin-left"
          style={{ width: `${Math.min(100, progress * 100)}%`, background: 'var(--vt-grad)' }}
        />
      </div>

      <ActionRail
        video={video}
        liked={liked}
        likedCount={likedCount}
        muted={muted}
        onToggleLike={onToggleLike}
        onShare={onShare}
        onOpenComments={onOpenComments}
        onToggleMute={handleMuteToggle}
      />
    </article>
  );
}

/** Честная заглушка «ссылка не работает» — вместо вечного чёрного экрана. */
function BrokenSourceNotice({ video }: { video: Video }) {
  return (
    <div className="absolute inset-0 grid place-items-center px-8 text-center">
      <div className="vt-glass-strong vt-shadow-lift max-w-sm rounded-3xl px-6 py-7">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-punch-500/15 text-punch-400">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 8v5M12 16.5v.5" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-white">Источник недоступен</p>
        <p className="mt-1.5 text-xs leading-relaxed text-white/55">
          Прямая ссылка не отдала видео — источник удалил ролик или закрыл доступ.
        </p>
        <code className="mt-3 block truncate rounded-lg bg-black/40 px-2.5 py-1.5 text-[10px] text-white/45">
          {video.direct_video_url}
        </code>
      </div>
    </div>
  );
}