'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Video } from '@/lib/types';
import { ShortCard } from './ShortCard';

/**
 * Контейнер вертикальной ленты.
 *
 * Механика:
 *  - CSS scroll-snap делает 90% работы (свайп на телефоне, колесо на десктопе);
 *  - IntersectionObserver определяет активную карточку -> включает её плеер;
 *  - клавиатура (стрелки/пробел/PageUp/PageDown/Home/End) прокручивает по карточке,
 *    это то, чего scroll-snap сам по себе не умеет.
 */
export function Feed({
  videos,
  soundOn,
  onToggleSound,
  likedIds,
  likeCounts,
  onToggleLike,
  onShare,
  onOpenComments,
}: {
  videos: Video[];
  soundOn: boolean;
  onToggleSound: () => void;
  likedIds: Set<string>;
  likeCounts: Record<string, number>;
  onToggleLike: (video: Video) => void;
  onShare: (video: Video) => void;
  onOpenComments: (video: Video) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const viewedRef = useRef<Set<string>>(new Set());

  /* --- Определяем активную карточку ------------------------------------ */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || videos.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) setActiveIndex(idx);
          }
        }
      },
      // 60% видимости = «этот ролик сейчас на экране».
      { root: scroller, threshold: [0.6] },
    );

    cardRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [videos.length]);

  /* --- Счётчик просмотров: один раз на ролик за сессию ------------------ */
  useEffect(() => {
    const video = videos[activeIndex];
    if (!video || viewedRef.current.has(video.id)) return;
    viewedRef.current.add(video.id);
    void import('@/lib/videos').then((m) => m.bumpView(video.id));
  }, [activeIndex, videos]);

  /* --- Навигация с клавиатуры ----------------------------------------- */
  const goTo = useCallback((index: number) => {
    const el = cardRefs.current[index];
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Не перехватываем ввод в текстовых полях (модалка комментариев/добавления).
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      let next: number | null = null;
      switch (e.key) {
        case 'ArrowDown':
        case 'PageDown':
        case 'j':
          next = Math.min(videos.length - 1, activeIndex + 1);
          break;
        case 'ArrowUp':
        case 'PageUp':
        case 'k':
          next = Math.max(0, activeIndex - 1);
          break;
        case ' ':
          next = Math.min(videos.length - 1, activeIndex + 1);
          break;
        case 'Home':
          next = 0;
          break;
        case 'End':
          next = videos.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      goTo(next);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, goTo, videos.length]);

  return (
    <div
      ref={scrollerRef}
      className="vt-scroll h-dvh w-full snap-y snap-mandatory overflow-y-scroll overscroll-contain"
      style={{ height: '100dvh', scrollSnapType: 'y mandatory', scrollBehavior: 'smooth' }}
    >
      {videos.map((video, i) => (
        <div
          key={video.id}
          data-index={i}
          ref={(el) => {
            cardRefs.current[i] = el;
          }}
          className="h-full w-full snap-start snap-always"
          style={{ height: '100dvh', scrollSnapAlign: 'start' }}
        >
          <ShortCard
            video={video}
            active={i === activeIndex}
            soundOn={soundOn}
            onToggleSound={onToggleSound}
            liked={likedIds.has(video.id)}
            likedCount={likeCounts[video.id] ?? video.likes_count}
            onToggleLike={onToggleLike}
            onShare={onShare}
            onOpenComments={onOpenComments}
          />
        </div>
      ))}
    </div>
  );
}