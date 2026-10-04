'use strict';

/**
 * Electron main process — обёртка десктопной сборки.
 *
 * Ключевое решение: приложение НЕ грузится через file://, а отдаётся
 * крошечным локальным HTTP-сервером на 127.0.0.1 со случайным портом.
 *
 * Почему так:
 *  1) Статический экспорт Next.js собран с абсолютными путями ("/_next/...").
 *     По file:// такие URL ломаются (file:///_next/... не разрешается).
 *  2) Через http:// у приложения нормальный origin — работают localStorage,
 *     navigator.clipboard и fetch к Supabase без CORS-костылей.
 *  3) Поведение в .EXE полностью совпадает с вебом — один код, минимум расхождений.
 */

const { app, BrowserWindow, shell, Menu, dialog, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { startStaticServer } = require('./static-server');

const isDev = process.env.NODE_ENV === 'development';
const START_URL = process.env.NEXT_DEV_URL || 'http://localhost:3000';

let mainWindow = null;
let staticServer = null;

/** Корень контента: в dev — проект, в сборке — распакованный app.asar. */
function resolveContentRoot() {
  const candidates = [
    path.join(__dirname, '..', 'out'), // dev / распакованный asar
    path.join(process.resourcesPath ?? '', 'app.asar.unpacked', 'out'),
    path.join(app.getAppPath(), 'out'),
  ];
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, 'index.html'))) return dir;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Окно                                                                */
/* ------------------------------------------------------------------ */

async function createWindow() {
  const bounds = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(480, bounds.width),
    height: Math.min(900, bounds.height),
    minWidth: 360,
    minHeight: 560,
    // Лента вертикальная — по умолчанию показываем телефоноподобный формат.
    backgroundColor: '#05060a',
    title: 'Ютуб',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  // Показываем окно только после готовности — иначе пользователь видит белый кадр.
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    // В разработке грузим живой dev-сервер Next.js — статический сервер не нужен.
    await mainWindow.loadURL(START_URL);
  } else {
    const root = resolveContentRoot();
    if (!root) {
      throw new Error('Папка out/ не найдена. Сначала выполните: npm run build');
    }

    // Порт 0 -> случайный свободный: не конфликтует с другими приложениями.
    const { server, url } = await startStaticServer(root);
    staticServer = server;
    await mainWindow.loadURL(url);
  }

  // Внешние ссылки (например, на CDN ролика) открываем в системном браузере,
  // а не внутри приложения — иначе пользователь потеряет ленту.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/i.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, target) => {
    const allowed = isDev ? /^https?:\/\/localhost/.test(target) : /^https?:\/\/127\.0\.0\.1/.test(target);
    if (!allowed) {
      event.preventDefault();
      if (/^https?:/i.test(target)) shell.openExternal(target);
    }
  });

  // Никаких devtools-инструментов в релизной сборке.
  if (!isDev) {
    mainWindow.webContents.on('context-menu', (_e, params) => {
      // Меню скрываем полностью: визуально это полноэкранная лента.
      void params;
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/* ------------------------------------------------------------------ */
/* Меню (только в dev — в релизном виде чистый интерфейс)               */
/* ------------------------------------------------------------------ */

function buildMenu() {
  if (!isDev) {
    Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    {
      label: 'Отладка',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ */
/* IPC: единственное разрешённое действие из рендера                    */
/* ------------------------------------------------------------------ */

ipcMain.handle('app:info', () => ({
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  packaged: app.isPackaged,
}));

/* ------------------------------------------------------------------ */
/* Жизненный цикл                                                      */
/* ------------------------------------------------------------------ */

// Второй экземпляр не нужен: фокусируем существующее окно.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    buildMenu();
    try {
      await createWindow();
    } catch (err) {
      dialog.showErrorBox('Не удалось запустить', String(err?.message ?? err));
      app.quit();
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
  });

  app.on('window-all-closed', () => {
    staticServer?.close();
    app.quit();
  });

  app.on('before-quit', () => {
    staticServer?.close();
  });
}
