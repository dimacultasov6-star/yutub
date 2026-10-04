'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Реактивное чтение localStorage.
 *
 * Зачем, а не useState + useEffect: правило react-hooks/set-state-in-effect
 * (React 19 / Next 16) справедливо ругается на «монтируемся -> setState».
 * useSyncExternalStore — канонический способ подписаться на внешнее хранилище,
 * и заодно он синхронизирует значение между вкладками.
 */

const CHANGE_EVENT = 'vt:store';

export function readStored(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function writeStored(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* приватный режим / переполнение — не критично */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange); // другие вкладки
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/** useState-совместимая пара [value, setValue] поверх localStorage. */
export function useStoredText(key: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    useCallback((cb: () => void) => subscribe(cb), []),
    useCallback(() => readStored(key), [key]),
    () => '',
  );
  const setValue = useCallback((next: string) => writeStored(key, next), [key]);
  return [value, setValue];
}