'use client';

import { useEffect, useRef, useState } from 'react';
import type { Video } from '@/lib/types';
import { compactNumber } from '@/lib/validation';
import { haptic } from '@/lib/platform';
import { IconComment, IconHeart, IconShare, IconVolumeOff, IconVolumeOn } from './Icons';

interface Props {
  video: Video;
  liked: boolean;
  likedCount: number;
  muted: boolean;
  onToggleLike: (video: Video) => void;
  onShare: (video: Video) => void;
  onOpenComments: (video: Video) => void;
  onToggleMute: () => void;
}

/** Боковая панель действий: лайк (с анимацией), комментарии, поделиться, звук. */
export function ActionRail({
  video,
  liked,
  likedCount,
  muted,
  onToggleLike,
  onShare,
  onOpenComments,
  onToggleMute,
}: Props) {
  const [pop, setPop] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!pop) return;
    const t = setTimeout(() => setPop(false), 520);
    return () => clearTimeout(t);
  }, [pop]);

  const like = async () => {
    setPop(true);
    onToggleLike(video);
    void haptic('medium');
  };

  return (
    <div
      ref={railRef}
      className="absolute right-2 bottom-24 z-30 flex flex-col items-center gap-4"
      style={{ bottom: 'calc(6rem + var(--vt-safe-bottom))' }}
    >
      <RailButton label="Нравится" onClick={like} active={liked}>
        <span className={pop ? 'vt-like-pop block' : 'block'}>
          <IconHeart className="h-8 w-8" />
        </span>
        <span className="mt-1 text-[11px] font-semibold tabular-nums text-white/90">
          {compactNumber(likedCount)}
        </span>
      </RailButton>

      <RailButton label="Комментарии" onClick={() => onOpenComments(video)}>
        <IconComment className="h-7 w-7" />
        <span className="mt-1 text-[11px] font-semibold tabular-nums text-white/90">
          {compactNumber(video.comments_count ?? 0)}
        </span>
      </RailButton>

      <RailButton label="Поделиться" onClick={() => onShare(video)}>
        <IconShare className="h-7 w-7" />
      </RailButton>

      <RailButton label={muted ? 'Включить звук' : 'Выключить звук'} onClick={onToggleMute}>
        {muted ? <IconVolumeOff className="h-6 w-6" /> : <IconVolumeOn className="h-6 w-6" />}
      </RailButton>
    </div>
  );
}

function RailButton({
  children,
  label,
  onClick,
  active = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="vt-glass vt-focus group flex flex-col items-center rounded-2xl px-3 py-2.5 text-white/85 transition active:scale-95"
      style={{
        color: active ? '#ff5c8a' : undefined,
        boxShadow: active ? '0 0 26px -4px rgba(255,92,138,0.75)' : undefined,
      }}
    >
      {children}
    </button>
  );
}