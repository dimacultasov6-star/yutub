'use client';

import { useEffect } from 'react';
import type { Platform } from './types';

/**
 * Абстракция над Capacitor: на вебе и в Electron нативные плагины не
 * подключены, поэтому каждый вызов обязан быть безопасным «здесь и сейчас».
 * Никаких статических импортов @capacitor/* в этом файле намеренно нет —
 * иначе бандл для веба потянет лишнее (см. динамические импорты ниже).
 */

let cached: Platform | null = null;

export function detectPlatform(): Platform {
  if (cached) return cached;

  if (typeof window === 'undefined') return 'web';

  const cap = (window as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
  const p = cap?.getPlatform?.();

  if (p === 'android' || p === 'ios') cached = 'android';
  else if (p === 'desktop' || p === 'windows' || p === 'mac' || p === 'linux') cached = 'desktop';
  else cached = 'web';

  return cached;
}

export function isNative(): boolean {
  return detectPlatform() !== 'web';
}

/** Тактильный отклик. На вебе — no-op, в APK — реальная вибрация. */
export async function haptic(style: 'light' | 'medium' | 'heavy' | 'success' = 'light') {
  if (detectPlatform() !== 'android') return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    if (style === 'success') {
      await Haptics.notification({ type: NotificationType.Success });
      return;
    }
    const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy } as const;
    await Haptics.impact({ style: map[style] });
  } catch {
    /* плагин недоступен — не критично */
  }
}

/** Прозрачный статус-бар + скрытие системного UI при полноэкранном видео. */
export async function initNativeChrome() {
  if (detectPlatform() !== 'android') return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#00000000' });
  } catch {
    /* ignore */
  }
  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide({ fadeOutDuration: 250 });
  } catch {
    /* ignore */
  }
}

/** Копирование в буфер обмена. В WebView navigator.clipboard может быть недоступен
 *  без secure context — поэтому есть запасной путь через textarea + execCommand. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* пробуем запасной путь */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Реакция на аппаратные кнопки «назад» в Android (чтобы шторка закрывалась, а не вылетало из приложения). */
export function useAndroidBackHandler(enabled: boolean, onBack: () => void) {
  useEffect(() => {
    if (!enabled || detectPlatform() !== 'android') return;
    let dispose: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const listener = await App.addListener('backButton', () => onBack());
        if (cancelled) listener.remove();
        else dispose = () => void listener.remove();
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [enabled, onBack]);
}

/** Скрытие системной клавиатуры (Android) — вызывается перед открытием модалок. */
export async function hideKeyboard() {
  if (detectPlatform() !== 'android') return;
  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    await Keyboard.hide();
  } catch {
    /* ignore */
  }
}