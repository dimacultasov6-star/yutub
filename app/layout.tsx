import type { Metadata, Viewport } from 'next';
import './globals.css';

/**
 * Префикс пути. На GitHub Pages сайт живётся по /yutub/, поэтому статика
 * собирается с NEXT_PUBLIC_BASE_PATH=/yutub (см. next.config.mjs).
 *
 * Важно: Next подставляет basePath в пути ассетов сборки (/_next/...) сам,
 * но НЕ подставляет его в metadata-URL — manifest и icons. Их префиксуем
 * вручную, иначе манифест и иконка уедут в корень домена github.io, где
 * их нет (это ловит scripts/verify-export.mjs).
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/+$/, '');

/** '/icon.svg' -> '/yutub/icon.svg' при basePath='/yutub'. */
const withBase = (p: string) => `${basePath}${p.startsWith('/') ? p : `/${p}`}`;

/**
 * Внутреннее имя бренда — VibeTube. Рабочее имя приложения/пакета — «Ютуб».
 * title в манифесте и сборке намеренно разные: бренд для человека,
 * «Ютуб» для ярлыка на рабочем столе и в списке установленных APK.
 */
export const metadata: Metadata = {
  title: 'Ютуб — вертикальная лента',
  description:
    'Бесплатный агрегатор вертикальных видео: лента, лайки, комментарии. Один код — веб, Android и Windows.',
  applicationName: 'Ютуб',
  // Next 16 принимает здесь только URL, поэтому сам манифест генерируется
  // скриптом scripts/gen-manifest.mjs (он подставляет basePath в start_url,
  // scope и иконки — иначе на GitHub Pages PWA уводил бы на корень домена).
  manifest: withBase('/manifest.webmanifest'),
  icons: {
    icon: [{ url: withBase('/icon.svg'), type: 'image/svg+xml' }],
    apple: [{ url: withBase('/icon.svg') }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Ютуб',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#05060a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}