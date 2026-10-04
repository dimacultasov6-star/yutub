import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Клиент Supabase создаётся ТОЛЬКО если заданы переменные окружения.
 * Это ключевое проектное решение: приложение обязано работать сразу после
 * `npm run build`, без единого ключа — просто на локальном seed-наборе.
 * Как только ключи появились — прозрачно переключаемся на сеть.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** Ключи вшиваются на этапе сборки (output: 'export'), поэтому проверка статическая. */
export const isSupabaseConfigured = /^https?:\/\//.test(url) && anonKey.length > 20;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        headers: {
          // Эти заголовки нужны политикам RLS, чтобы аноним знал свой device_id.
          'x-device-id': typeof window !== 'undefined' ? safeDeviceId() : '',
        },
      },
    })
  : null;

export const SUPABASE_URL = url;

/**
 * Идентификатор устройства. Создаётся один раз и живёт в localStorage.
 * Не PII: это просто случайный UUID, чтобы считать «один лайк с одного устройства».
 */
export function safeDeviceId(): string {
  if (typeof window === 'undefined') return '00000000-0000-0000-0000-000000000000';
  const KEY = 'vt.device_id';
  try {
    const existing = window.localStorage.getItem(KEY);
    if (existing) return existing;
    const fresh =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          });
    window.localStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Приватный режим / отключённое хранилище — не падаем.
    return '00000000-0000-0000-0000-000000000000';
  }
}