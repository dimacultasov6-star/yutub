/**
 * Типы моста Electron -> рендер.
 * Импортируются только в TypeScript-файлах; в рантайме это пустой модуль.
 */
export interface YutubBridge {
  info(): Promise<{ version: string; platform: string; arch: string; packaged: boolean }>;
  platform: string;
  isDesktop: boolean;
}

declare global {
  interface Window {
    yutub?: YutubBridge;
  }
}

export {};
