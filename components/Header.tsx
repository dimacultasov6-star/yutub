'use client';

import { Logo } from './Logo';
import { IconPlus, IconVolumeOff, IconVolumeOn } from './Icons';

interface Props {
  soundOn: boolean;
  onToggleSound: () => void;
  onOpenAdd: () => void;
  /** Бейдж источника данных: local | supabase. */
  source: 'supabase' | 'local';
  count: number;
}

export function Header({ soundOn, onToggleSound, onOpenAdd, source, count }: Props) {
  return (
    <header
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center gap-3 px-3 py-2.5"
      style={{
        paddingTop: 'calc(0.625rem + var(--vt-safe-top))',
        background:
          'linear-gradient(180deg, rgba(5,6,10,0.86) 0%, rgba(5,6,10,0.42) 62%, transparent 100%)',
      }}
    >
      <div className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2.5">
        <Logo size={32} />
      </div>

      <div className="pointer-events-auto flex shrink-0 items-center gap-2">
        {/* Индикатор режима данных — полезно при отладке «почему локальная лента». */}
        <span
          title={
            source === 'supabase'
              ? 'Данные из Supabase'
              : 'Локальный режим: добавьте ключи Supabase, чтобы данные были общими'
          }
          className="hidden items-center gap-1 rounded-full bg-white/8 px-2 py-1 text-[10px] font-semibold text-white/55 sm:inline-flex"
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: source === 'supabase' ? '#22c55e' : '#f59e0b' }}
          />
          {source === 'supabase' ? 'cloud' : 'local'} · {count}
        </span>

        <button
          type="button"
          onClick={onToggleSound}
          aria-label={soundOn ? 'Выключить звук' : 'Включить звук'}
          title={soundOn ? 'Выключить звук' : 'Включить звук'}
          className="vt-glass vt-focus grid h-10 w-10 place-items-center rounded-full text-white/85 active:scale-95"
        >
          {soundOn ? <IconVolumeOn /> : <IconVolumeOff />}
        </button>

        <button
          type="button"
          onClick={onOpenAdd}
          className="vt-cta vt-focus inline-flex h-10 items-center gap-1.5 rounded-full pl-3 pr-4 text-[13px] font-bold"
        >
          <IconPlus className="h-4 w-4" />
          <span className="hidden sm:inline">Ролик</span>
        </button>
      </div>
    </header>
  );
}