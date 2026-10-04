import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Конфигурация Capacitor — обёртка Android (.APK).
 *
 * Важное: webDir указывает на `out`, то есть на тот же статический экспорт,
 * который едет в Vercel и в Electron. Никакого отдельного билда под Android —
 * иначе через месяц веб и .apk разъедутся.
 */
const config: CapacitorConfig = {
  appId: 'com.vibetube.yutub',
  appName: 'Ютуб',
  webDir: 'out',

  android: {
    // Ссылка на видео может прийти с http-источника: запрещаем смешанный контент,
    // валидатор в UI и так требует https — двойная защита.
    allowMixedContent: false,
    backgroundColor: '#05060a',
    // Спрятать системные панели для полноэкранной ленты.
    webContentsDebuggingEnabled: false,
  },

  server: {
    // Нативная схема https -> нормальный origin для localStorage и fetch.
    androidScheme: 'https',
  },

  plugins: {
    SplashScreen: {
      // Управляем скрытием из кода (lib/platform.ts -> initNativeChrome),
      // чтобы сплэш не мигал до первого кадра ленты.
      launchAutoHide: false,
      backgroundColor: '#05060aff',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#00000000',
      overlaysWebView: true,
    },
  },
};

export default config;