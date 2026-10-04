'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AddVideoModal } from '@/components/AddVideoModal';
import { CommentsSheet } from '@/components/CommentsSheet';
import { Feed } from '@/components/Feed';
import { Header } from '@/components/Header';
import { IconAlert } from '@/components/Icons';
import { Logo } from '@/components/Logo';
import { fetchFeed, fetchMyLikes, isSupabaseConfigured, toggleLike } from '@/lib/videos';
import { copyToClipboard, initNativeChrome, isNative } from '@/lib/platform';
import type { Video } from '@/lib/types';

/**
 * Главный экран-оркестратор: держит состояние ленты и модальных окон.
 * Вся бизнес-логика — в lib/videos.ts, вся разметка — в components/.
 */
export default function Page() {
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [source, setSource] = useState<'supabase' | 'local'>('local');
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [soundOn, setSoundOn] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [commentsFor, setCommentsFor] = useState<Video | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /* --- Нативная обвязка (статус-бар, сплэш) -------------------------- */
  useEffect(() => {
    if (isNative()) void initNativeChrome();
  }, []);

  /* --- Загрузка ленты ------------------------------------------------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetchFeed();
      if (!alive) return;
      setVideos(res.videos);
      setSource(res.source);
      setLoadError(res.error ?? null);
      const liked = await fetchMyLikes(res.videos.map((v) => v.id));
      if (alive) setLikedIds(liked);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* --- Тост живёт 2.4 секунды ---------------------------------------- */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const handleToggleLike = useCallback(
    async (video: Video) => {
      // Оптимистичное обновление — интерфейс откликается мгновенно,
      // а серверный счётчик потом перезапишет значение (он пересчитывает сам).
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (next.has(video.id)) next.delete(video.id);
        else next.add(video.id);
        return next;
      });
      setLikeCounts((prev) => ({
        ...prev,
        [video.id]: Math.max(0, (prev[video.id] ?? video.likes_count) + (likedIds.has(video.id) ? -1 : 1)),
      }));

      try {
        const res = await toggleLike(video);
        setLikeCounts((prev) => ({ ...prev, [video.id]: res.likes_count }));
      } catch {
        setToast('Не удалось сохранить лайк');
      }
    },
    [likedIds],
  );

  const handleShare = useCallback(async (video: Video) => {
    const url = `${window.location.origin}/?v=${encodeURIComponent(video.id)}`;
    const copied = await copyToClipboard(url);
    setToast(copied ? 'Ссылка скопирована' : 'Не удалось скопировать ссылку');
  }, []);

  const handleAdded = useCallback((video: Video) => {
    setVideos((prev) => [video, ...(prev ?? [])]);
    setAddOpen(false);
    setToast('Ролик опубликован');
  }, []);

  const emptyState = useMemo(() => videos?.length === 0, [videos]);

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ink-950">
      {/* Фоновая градиентная «подложка» на время загрузки/пустоты */}
      {(!videos || emptyState) && (
        <div className="absolute inset-0 grid place-items-center px-8">
          <div className="text-center">
            <div className="mb-5 flex justify-center">
              <Logo size={64} withWordmark={false} />
            </div>
            {videos === null ? (
              <>
                <div className="mx-auto h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full w-1/3 animate-[vt-shimmer_1.4s_ease-in-out_infinite] rounded-full bg-white/60" />
                </div>
                <p className="mt-4 text-xs text-white/45">Загружаем ленту…</p>
              </>
            ) : (
              <>
                <p className="text-base font-bold">Лента пуста</p>
                <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-white/50">
                  Добавьте первый ролик — нужна только прямая ссылка на .mp4.
                </p>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="vt-cta mt-5 rounded-full px-6 py-2.5 text-sm font-bold"
                >
                  Добавить ролик
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {videos && videos.length > 0 && (
        <Feed
          videos={videos}
          soundOn={soundOn}
          onToggleSound={() => setSoundOn((s) => !s)}
          likedIds={likedIds}
          likeCounts={likeCounts}
          onToggleLike={(v) => void handleToggleLike(v)}
          onShare={(v) => void handleShare(v)}
          onOpenComments={setCommentsFor}
        />
      )}

      <Header
        soundOn={soundOn}
        onToggleSound={() => setSoundOn((s) => !s)}
        onOpenAdd={() => setAddOpen(true)}
        source={source}
        count={videos?.length ?? 0}
      />

      {/* Подсказка про Supabase, когда ключей нет. */}
      {!isSupabaseConfigured && videos && (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-4">
          <p className="vt-glass pointer-events-auto max-w-md rounded-full px-3.5 py-2 text-center text-[10.5px] leading-tight text-white/60">
            Локальный режим — данные только на этом устройстве.{' '}
            <span className="font-semibold text-aqua-400">Добавьте ключи Supabase</span> для общего доступа.
          </p>
        </div>
      )}

      {loadError && (
        <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex justify-center px-4">
          <p className="vt-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[10.5px] text-amber-300">
            <IconAlert className="h-3.5 w-3.5" />
            Supabase недоступен, показан локальный набор: {loadError.slice(0, 60)}
          </p>
        </div>
      )}

      {addOpen && <AddVideoModal onClose={() => setAddOpen(false)} onAdded={handleAdded} />}
      {/* key по id — ремонт шторки при смене ролика вместо сброса состояния в эффекте */}
      {commentsFor && (
        <CommentsSheet key={commentsFor.id} video={commentsFor} onClose={() => setCommentsFor(null)} />
      )}

      {toast && (
        <div
          role="status"
          className="vt-glass-strong vt-rise pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
          style={{ bottom: 'calc(5.5rem + var(--vt-safe-bottom))' }}
        >
          <span className="rounded-full px-4 py-2.5 text-[12.5px] font-semibold text-white/90 shadow-lg">
            {toast}
          </span>
        </div>
      )}
    </main>
  );
}