/**
 * Префикс пути для статики.
 *
 * Нужен только для GitHub Pages, потому что проект лежит не в корне домена,
 * а по адресу https://<user>.github.io/yutub/. Статический экспорт Next.js
 * по умолчанию пишет абсолютные пути (/_next/...), и на подпути такой сайт
 * отдаёт белый экран: ассеты ищутся на github.io/_next/... и не находятся.
 *
 * Поэтому при публикации на Pages сборка идёт с NEXT_PUBLIC_BASE_PATH=/yutub.
 * Сборки для Electron и Android basePath не получают и остаются в корне —
 * там импульсивно ломать пути нельзя.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Статический экспорт: один и тот же `out/` едет и в Vercel, и в Capacitor, и в Electron.
  // Серверных роутов/API нет намеренно — вся логика клиентская (см. README, раздел "Архитектура").
  output: 'export',
  // next/image не работает без сервера оптимизации — весь медиаконтент отдаётся <video>/<img>.
  images: { unoptimized: true },
  // trailingSlash нужен статик-хостингам и Capacitor (android/ корневой index.html)
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  ...(basePath ? { basePath, assetPrefix: `${basePath}/` } : {}),
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  },
};

export default nextConfig;