/** Иконки инлайном: не тянем икон-пакеты и не грузим ничего по сети. */
type P = { className?: string };

export const IconHeart = ({ className = 'w-7 h-7' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M12 21s-7.5-4.7-9.6-9.1C.9 8.2 2.7 4.5 6.2 4.5c2 0 3.4 1.1 4.3 2.3l1.5 2 1.5-2c.9-1.2 2.3-2.3 4.3-2.3 3.5 0 5.3 3.7 3.8 7.4C19.5 16.3 12 21 12 21z" />
  </svg>
);

export const IconComment = ({ className = 'w-7 h-7' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M12 2c5 0 9 3.4 9 7.7 0 4.3-4 7.7-9 7.7-.9 0-1.8-.1-2.6-.3L4 20l1.2-3.6C3.8 14.9 3 12.5 3 9.7 3 5.4 7 2 12 2z" />
  </svg>
);

export const IconShare = ({ className = 'w-7 h-7' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M13.2 4.2 20 10l-6.8 5.8v-3.5c-5 .2-8.3 2.3-9.7 6.6-.6-6.9 3.3-11.2 9.7-11.3z" />
  </svg>
);

export const IconVolumeOn = ({ className = 'w-5 h-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M4 9.5h3.2L12 5.3v13.4L7.2 14.5H4z" />
    <path d="M15.5 8.6a4.6 4.6 0 0 1 0 6.8l1.3 1.3a6.5 6.5 0 0 0 0-9.4z" />
    <path d="M17.9 6.2a7.9 7.9 0 0 1 0 11.6l1.3 1.3a9.8 9.8 0 0 0 0-14.2z" />
  </svg>
);

export const IconVolumeOff = ({ className = 'w-5 h-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M4 9.5h3.2L12 5.3v13.4L7.2 14.5H4z" />
    <path d="m16 9.6 1.3-1.3 2.2 2.2 2.2-2.2 1.3 1.3-2.2 2.2 2.2 2.2-1.3 1.3-2.2-2.2-2.2 2.2-1.3-1.3 2.2-2.2z" />
  </svg>
);

export const IconPlus = ({ className = 'w-5 h-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconClose = ({ className = 'w-5 h-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconChevronDown = ({ className = 'w-5 h-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const IconCheck = ({ className = 'w-5 h-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 13 4 4L19 7" />
  </svg>
);

export const IconLink = ({ className = 'w-5 h-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 1 0-5.7-5.7l-1.2 1.2" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 1 0 11 18.7l1.2-1.2" />
  </svg>
);

export const IconPlay = ({ className = 'w-10 h-10' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

export const IconSpinner = ({ className = 'w-6 h-6 vt-spin' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
    <path d="M12 3a9 9 0 1 0 9 9" />
  </svg>
);

export const IconAlert = ({ className = 'w-5 h-5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 8v5M12 16.5v.5" />
    <circle cx="12" cy="12" r="9" />
  </svg>
);

export const IconBookmark = ({ className = 'w-6 h-6' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1z" />
  </svg>
);

export const IconDatabase = ({ className = 'w-3.5 h-3.5' }: P) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <ellipse cx="12" cy="6" rx="8" ry="3.2" />
    <path d="M4 6v12c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V6" />
    <path d="M4 12c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2" />
  </svg>
);