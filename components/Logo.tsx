/**
 * Логотип VibeTube — инлайновый SVG (без сетевых запросов, масштабируется без
 * потерь, и его же можно вынести в public/logo.svg для favicon/PWA).
 * Внутреннее имя бренда — VibeTube, рабочее имя приложения — «Ютуб».
 */
export function Logo({ size = 34, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  const gid = 'vtLogoGrad';
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 512 512"
        role="img"
        aria-label="VibeTube"
        className="shrink-0 drop-shadow-[0_6px_18px_rgba(217,70,239,0.45)]"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="48%" stopColor="#D946EF" />
            <stop offset="100%" stopColor="#06B6D4" />
          </linearGradient>
          <linearGradient id="vtLogoSheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
            <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* скруглённый квадрат */}
        <rect x="16" y="16" width="480" height="480" rx="118" fill={`url(#${gid})`} />
        <rect x="16" y="16" width="480" height="240" rx="118" fill="url(#vtLogoSheen)" />

        {/* видеотреугольник */}
        <path
          d="M212 176c0-15 13-24 26-17l112 78c13 8 13 26 0 34l-112 78c-13 8-26-2-26-17z"
          fill="#fff"
          fillOpacity="0.97"
        />

        {/* «пульс» — намёк на ленту/звук */}
        <g stroke="#fff" strokeOpacity="0.9" strokeWidth="15" strokeLinecap="round">
          <path d="M118 300v-40" />
          <path d="M152 328v-96" />
          <path d="M394 300v-40" />
          <path d="M360 328v-96" />
        </g>
      </svg>

      {withWordmark && (
        <span className="leading-none">
          <span className="block text-[17px] font-extrabold tracking-tight vt-gradient-text">VibeTube</span>
          <span className="block text-[9px] font-semibold uppercase tracking-[0.22em] text-white/45">
            shorts feed
          </span>
        </span>
      )}
    </span>
  );
}