'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Video } from '@/lib/types';
import { addComment, fetchComments } from '@/lib/videos';
import { timeAgo } from '@/lib/validation';
import { useStoredText } from '@/lib/useStoredText';
import { haptic, useAndroidBackHandler } from '@/lib/platform';
import { IconClose, IconSpinner } from './Icons';

interface Props {
  video: Video;
  onClose: () => void;
}

/**
 * Шторка комментариев снизу. На Android перехватываем аппаратную кнопку «Назад».
 *
 * Компонент рассчитан на один ролик: смена видео делается ремонтом через `key`
 * в page.tsx, поэтому здесь не нужно «сбрасывать» состояние в эффекте.
 */
export function CommentsSheet({ video, onClose }: Props) {
  const [comments, setComments] = useState<{ id: string; author_name: string; body: string; created_at: string }[] | null>(
    null,
  );
  const [text, setText] = useState('');
  const [name, setName] = useStoredText('vt.author_name');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useAndroidBackHandler(true, onClose);

  // Первичная загрузка. setState происходит в промис-колбэке — это не каскадный рендер.
  useEffect(() => {
    let alive = true;
    fetchComments(video.id)
      .then((list) => {
        if (alive) setComments(list);
      })
      .catch(() => {
        if (alive) setComments([]);
      });
    return () => {
      alive = false;
    };
  }, [video.id]);

  const submit = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await addComment(video.id, body, name);
      setComments((prev) => [created, ...(prev ?? [])]);
      setText('');
      void haptic('success');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  }, [name, sending, text, video.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Закрыть комментарии"
        onClick={onClose}
        className="vt-fade absolute inset-0 bg-black/65 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Комментарии"
        className="vt-glass-strong vt-sheet relative flex max-h-[76vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl"
        style={{ paddingBottom: 'var(--vt-safe-bottom)' }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3.5">
          <h3 className="text-sm font-bold">
            Комментарии <span className="text-white/45">· {comments?.length ?? 0}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="vt-glass vt-focus grid h-8 w-8 place-items-center rounded-full text-white/75 active:scale-95"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>

        <div className="vt-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {comments === null ? (
            <div className="flex items-center justify-center gap-2 py-10 text-white/50">
              <IconSpinner className="h-5 w-5 vt-spin" />
              <span className="text-xs">Загружаем…</span>
            </div>
          ) : comments.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-white/70">Пока нет комментариев</p>
              <p className="mt-1 text-xs text-white/40">Будьте первым</p>
            </div>
          ) : (
            <ul className="space-y-3.5">
              {comments.map((c) => (
                <li key={c.id} className="vt-rise">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-aqua-400">@{c.author_name}</span>
                    <span className="text-[10.5px] text-white/35">{timeAgo(c.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-[13.5px] leading-snug text-white/85">{c.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="shrink-0 px-4 pb-1 text-[11px] text-punch-400">{error}</p>}

        <footer className="shrink-0 border-t border-white/10 px-4 py-3">
          <div className="mb-2 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 40))}
              placeholder="имя"
              aria-label="Имя автора комментария"
              className="vt-glass vt-focus w-28 shrink-0 rounded-full px-3 py-2 text-[13px] outline-none placeholder:text-white/35"
            />
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 500))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
              placeholder="Ваш комментарий…"
              aria-label="Текст комментария"
              className="vt-glass vt-focus min-w-0 flex-1 rounded-full px-4 py-2 text-[13px] outline-none placeholder:text-white/35"
            />
          </div>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!text.trim() || sending}
            className="vt-cta vt-focus w-full rounded-full py-2.5 text-[13px] font-bold"
          >
            {sending ? 'Отправляем…' : 'Отправить'}
          </button>
        </footer>
      </div>
    </div>
  );
}