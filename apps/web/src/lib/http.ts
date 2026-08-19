import { errorMessage } from '@navbat/shared';

/**
 * Past darajadagi HTTP mijoz — Mini App ham, admin panel ham shuni ishlatadi,
 * lekin HAR BIRI O'Z tokeni bilan (sessiyalar aralashib ketmasligi uchun).
 */

const API_BASE = `${(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')}/api`;

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface TokenStore {
  get(): string | null;
  set(value: string | null): void;
}

export function createTokenStore(key: string, storage: 'session' | 'local'): TokenStore {
  let cached: string | null = null;
  const backend = (): Storage | null => {
    try {
      return storage === 'session' ? window.sessionStorage : window.localStorage;
    } catch {
      return null;
    }
  };
  return {
    get() {
      if (cached) return cached;
      cached = backend()?.getItem(key) ?? null;
      return cached;
    },
    set(value) {
      cached = value;
      const store = backend();
      if (!store) return;
      if (value) store.setItem(key, value);
      else store.removeItem(key);
    },
  };
}

export interface CallOptions {
  method?: string;
  body?: unknown;
  /** 401 kelganda qayta login qilish (Mini App uchun) */
  onUnauthorized?: () => Promise<boolean>;
  raw?: boolean;
}

export function createClient(tokens: TokenStore) {
  async function call<T>(path: string, options: CallOptions = {}, retry = true): Promise<T> {
    const { method = 'GET', body } = options;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const current = tokens.get();
    if (current) headers.Authorization = `Bearer ${current}`;

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 401 && retry && options.onUnauthorized) {
      tokens.set(null);
      const recovered = await options.onUnauthorized();
      if (recovered) return call<T>(path, options, false);
    }

    if (!response.ok) {
      let code = 'INTERNAL_ERROR';
      let details: unknown;
      try {
        const payload = (await response.json()) as {
          error?: { code?: string; message?: string; details?: unknown };
        };
        code = payload.error?.code ?? code;
        details = payload.error?.details;
      } catch {
        /* JSON bo'lmasa standart xabar */
      }
      throw new ApiError(code, errorMessage(code), response.status, details);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return { call, apiBase: API_BASE, tokens };
}
