'use client';

import { useCallback, useRef, useState } from 'react';
import type { Aspect, Video } from '@/lib/types';
import { addVideo } from '@/lib/videos';
import { aspectFromSize, formatDuration, parseTags, validateVideoUrl } from '@/lib/validation';
import { useStoredText } from '@/lib/useStoredText';
import { haptic, useAndroidBackHandler } from '@/lib/platform';
import { IconAlert, IconCheck, IconClose, IconLink, IconSpinner } from './Icons';

interface Props {
  onClose: () => void;
  onAdded: (video: Video) => void;
}

type Probe =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; width: number; height: number; duration: number | null; poster: string | null }
  | { state: 'error'; message: string };

const EMPTY_URL = '';

/**
 * Модалка «Добавить ролик».
 *
 * Ключевая деталь архитектуры: загрузки файла нет вообще. Пользователь
 * вставляет ПРЯМУЮ ссылку, мы проверяем её через <video>.loadedmetadata —
 * это единственный способ достоверно убедиться, что ссылка отдаёт видео,
 * не нарушая CORS (fetch() к чужому CDN вернул бы CORS-ошибку).
 */
export function AddVideoModal({ onClose, onAdded }: Props) {
  const [url, setUrl] = useState(EMPTY_URL);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Имя автора живёт в localStorage: заполняем его один раз и больше не спрашиваем.
  const [author, setAuthor] = useStoredText('vt.author_name');
  const [tagsText, setTagsText] = useState('');
  const [aspect, setAspect] = useState<Aspect>('9:16');
  const [probe, setProbe] = useState<Probe>({ state: 'idle' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const probeRef = useRef<HTMLVideoElement | null>(null);

  useAndroidBackHandler(true, onClose);

  // Синтаксическая проверка ссылки — мгновенная, на каждый ввод.
  const urlCheck = validateVideoUrl(url);
  const showUrlError = url.trim().length > 6 && !urlCheck.ok;

  const resetProbe = useCallback(() => setProbe({ state: 'idle' }), []);

  /** Проверка ссылки + извлечение реальных метаданных + превью. */
  const verify = useCallback(() => {
    const check = validateVideoUrl(url);
    if (!check.ok) {
      setProbe({ state: 'error', message: check.message ?? 'Ссылка не прошла проверку' });
      return;
    }

    setProbe({ state: 'checking' });

    // Переиспользуем один элемент: иначе в DOM накапливаются «мёртвые» видео.
    const el = probeRef.current ?? document.createElement('video');
    probeRef.current = el;

    let done = false;
    const cleanup = () => {
      el.removeAttribute('src');
      el.load();
      window.clearTimeout(timer);
    };
    const finish = (p: Probe) => {
      if (done) return;
      done = true;
      setProbe(p);
      cleanup();
    };
    const timer = window.setTimeout(
      () =>
        finish({
          state: 'error',
          message: 'Источник не ответил за 15 секунд. Проверьте, что ссылка ведёт на сам файл.',
        }),
      15000,
    );

    el.muted = true;
    el.playsInline = true;
    el.preload = 'metadata';
    // crossOrigin намеренно НЕ выставляем: чтение videoWidth/duration
    // не требует CORS, а с anonymous-режимом браузер отклоняет любой CDN,
    // который не отдаёт Access-Control-Allow-Origin.

    el.onloadedmetadata = () => {
      const w = el.videoWidth;
      const h = el.videoHeight;
      const detected = aspectFromSize(w, h);
      setAspect(detected);
      finish({
        state: 'ok',
        width: w,
        height: h,
        duration: Number.isFinite(el.duration) ? el.duration : null,
        poster: null,
      });
      void haptic('success');
    };
    el.onerror = () =>
      finish({
        state: 'error',
        message:
          'Браузер не смог прочитать видео. Ссылка может вести на страницу, а не на файл, ' +
          'либо источник запрещает доступ.',
      });

    el.src = url.trim();
    el.load();
  }, [url]);

  const save = useCallback(async () => {
    const draft = {
      direct_video_url: url.trim(),
      title: title.trim(),
      description: description.trim(),
      author_name: author.trim(),
      tags: parseTags(tagsText),
      aspect,
    };

    const nextErrors: Record<string, string> = {};
    const check = validateVideoUrl(draft.direct_video_url);
    if (!check.ok) nextErrors.direct_video_url = check.message ?? 'Некорректная ссылка';
    if (!draft.title) nextErrors.title = 'Нужно название';
    if (!draft.author_name) nextErrors.author_name = 'Нужно имя автора';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Не даём сохранить ролик, который мы даже не открыли — иначе в ленте будет мусор.
    if (probe.state !== 'ok') {
      setErrors({ direct_video_url: 'Сначала проверьте ссылку и посмотрите превью' });
      return;
    }

    setSaving(true);
    try {
      const res = await addVideo(draft);
      if (!res.ok || !res.video) {
        setErrors({ direct_video_url: res.error ?? 'Не удалось сохранить' });
        return;
      }
      setSaved(true);
      void haptic('success');
      onAdded(res.video);
    } finally {
      setSaving(false);
    }
  }, [aspect, author, description, onAdded, probe.state, tagsText, title, url]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Закрыть"
        onClick={onClose}
        className="vt-fade absolute inset-0 bg-black/72 backdrop-blur-[3px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Добавить ролик"
        className="vt-glass-strong vt-rise relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
        style={{ paddingBottom: 'var(--vt-safe-bottom)' }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h3 className="text-[15px] font-bold">Добавить ролик</h3>
            <p className="mt-0.5 text-[11px] text-white/45">
              Нужен прямой URL на .mp4 — файл хранится у вас, у нас только метаданные
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="vt-glass vt-focus grid h-8 w-8 place-items-center rounded-full text-white/75 active:scale-95"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </header>

        <div className="vt-scroll min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* --- Ссылка + проверка --- */}
          <Field label="Прямая ссылка на видео" error={errors.direct_video_url ?? (showUrlError ? urlCheck.message : undefined)}>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  resetProbe();
                  setErrors((p) => ({ ...p, direct_video_url: '' }));
                }}
                placeholder="https://…/video.mp4"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                aria-label="Прямая ссылка на видео"
                className="vt-glass vt-focus min-w-0 flex-1 rounded-xl px-3.5 py-2.5 text-[13px] outline-none placeholder:text-white/30"
              />
              <button
                type="button"
                onClick={verify}
                disabled={!url.trim() || probe.state === 'checking'}
                className="vt-glass vt-focus inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-[12.5px] font-semibold text-white/85 disabled:opacity-40 active:scale-95"
              >
                {probe.state === 'checking' ? <IconSpinner className="h-4 w-4" /> : <IconLink className="h-4 w-4" />}
                Проверить
              </button>
            </div>
          </Field>

          {/* --- Превью --- */}
          {probe.state === 'ok' && (
            <div className="vt-rise">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-aqua-400">
                Превью
              </p>
              <div className="flex gap-3">
                <div
                  className="relative h-40 w-[7.2rem] shrink-0 overflow-hidden rounded-xl bg-black ring-1 ring-white/12"
                >
                  <video
                    src={url.trim()}
                    controls
                    playsInline
                    muted
                    loop
                    preload="metadata"
                    className="h-full w-full object-contain"
                  />
                </div>
                <dl className="grid min-w-0 flex-1 content-start gap-2 text-[12px]">
                  <Meta label="Разрешение" value={`${probe.width}×${probe.height}`} />
                  <Meta label="Длительность" value={formatDuration(probe.duration)} />
                  <Meta label="Формат" value={probe.width && probe.height ? aspect : '—'} />
                  <Meta label="Хост" value={urlCheck.host ?? '—'} />
                </dl>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-emerald-400">
                <IconCheck className="h-4 w-4" />
                Ссылка отдаёт видео — можно сохранять
              </p>
            </div>
          )}

          {probe.state === 'error' && (
            <div className="vt-rise flex items-start gap-2 rounded-xl bg-punch-500/12 px-3.5 py-3 text-[12px] leading-snug text-punch-400">
              <IconAlert className="mt-px h-4 w-4 shrink-0" />
              <span>{probe.message}</span>
            </div>
          )}

          {/* --- Метаданные --- */}
          <Field label="Название" error={errors.title}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 140))}
              placeholder="О чём ролик"
              aria-label="Название ролика"
              className="vt-glass vt-focus w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none placeholder:text-white/30"
            />
          </Field>

          <Field label="Автор">
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value.slice(0, 40))}
              placeholder="никнейм"
              aria-label="Имя автора"
              className="vt-glass vt-focus w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none placeholder:text-white/30"
            />
          </Field>

          <Field label="Описание">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
              rows={2}
              placeholder="Пара слов о ролике"
              aria-label="Описание ролика"
              className="vt-glass vt-focus w-full resize-none rounded-xl px-3.5 py-2.5 text-[13px] outline-none placeholder:text-white/30"
            />
          </Field>

          <Field label="Теги" hint="через запятую, максимум 10">
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="космос, природа"
              aria-label="Теги"
              className="vt-glass vt-focus w-full rounded-xl px-3.5 py-2.5 text-[13px] outline-none placeholder:text-white/30"
            />
          </Field>
        </div>

        <footer className="shrink-0 border-t border-white/10 px-5 py-3.5">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || saved}
            className="vt-cta vt-focus w-full rounded-full py-3 text-[14px] font-bold"
          >
            {saved ? 'Добавлено ✓' : saving ? 'Сохраняем…' : 'Опубликовать в ленту'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2 text-[11.5px] font-semibold uppercase tracking-wider text-white/55">
        {label}
        {hint && <span className="text-[10px] font-normal normal-case tracking-normal text-white/30">{hint}</span>}
      </span>
      {children}
      {error && <span className="mt-1.5 block text-[11.5px] text-punch-400">{error}</span>}
    </label>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-white/40">{label}</dt>
      <dd className="truncate font-semibold text-white/85">{value}</dd>
    </div>
  );
}