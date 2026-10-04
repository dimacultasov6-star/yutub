'use strict';

/**
 * Preload: единственный мост между рендером и Node.
 *
 * contextIsolation: true + nodeIntegration: false означают, что в приложении
 * нет доступа к fs/net. Всё, что разрешено, перечислено здесь — и это ровно
 * одно read-only действие (app:info). Загрузка файлов, оценка и скачивание
 * в приложение сознательно НЕ выданы.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('yutub', {
  /** Версия и платформа — для «О программе» и отладки. */
  info: () => ipcRenderer.invoke('app:info'),

  platform: process.platform,
  isDesktop: true,
});
