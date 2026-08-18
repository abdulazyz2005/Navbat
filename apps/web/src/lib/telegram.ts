/**
 * Telegram WebApp SDK ustidan yupqa qatlam.
 * Brauzerda (Telegramdan tashqarida) ishlaganda xavfsiz fallback beradi.
 */

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
    };
    start_param?: string;
  };
  colorScheme: 'light' | 'dark';
  themeParams: Record<string, string>;
  ready(): void;
  expand(): void;
  close(): void;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
  MainButton: {
    text: string;
    show(): void;
    hide(): void;
    setText(text: string): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  BackButton: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  showAlert?(message: string, cb?: () => void): void;
  showConfirm?(message: string, cb?: (ok: boolean) => void): void;
  LocationManager?: {
    init(cb?: () => void): void;
    getLocation(cb: (data: { latitude: number; longitude: number } | null) => void): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

export const isTelegram = Boolean(tg?.initData);

export function initTelegram(): void {
  if (!tg) return;
  tg.ready();
  tg.expand();
  document.documentElement.dataset.theme = tg.colorScheme === 'dark' ? 'dark' : 'light';

  // Telegram mavzusidan ranglarni olish
  const p = tg.themeParams;
  const root = document.documentElement.style;
  if (p.bg_color) root.setProperty('--tg-bg', p.secondary_bg_color ?? p.bg_color);
  if (p.bg_color) root.setProperty('--tg-card', p.bg_color);
  if (p.text_color) root.setProperty('--tg-text', p.text_color);
  if (p.hint_color) root.setProperty('--tg-hint', p.hint_color);
  if (p.link_color) root.setProperty('--tg-link', p.link_color);
}

/**
 * Backendga yuboriladigan initData.
 * Telegramdan tashqarida (lokal dev) `dev:` prefiksli soxta ma'lumot ishlatiladi —
 * bu faqat API'da ALLOW_INSECURE_AUTH=true bo'lganda qabul qilinadi.
 */
export function getInitData(): string {
  if (tg?.initData) return tg.initData;

  const devId = import.meta.env.VITE_DEV_TELEGRAM_ID;
  const devName = import.meta.env.VITE_DEV_TELEGRAM_NAME ?? 'Dev Foydalanuvchi';
  if (devId) {
    return `dev:${JSON.stringify({ id: Number(devId), first_name: devName, username: 'dev_user' })}`;
  }
  return '';
}

export function haptic(type: 'light' | 'medium' | 'heavy' = 'light'): void {
  tg?.HapticFeedback?.impactOccurred(type);
}

export function hapticResult(type: 'success' | 'error' | 'warning'): void {
  tg?.HapticFeedback?.notificationOccurred(type);
}

export function showAlert(message: string): void {
  if (tg?.showAlert) tg.showAlert(message);
  else window.alert(message);
}

export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (tg?.showConfirm) tg.showConfirm(message, (ok) => resolve(ok));
    else resolve(window.confirm(message));
  });
}

/** Foydalanuvchi ruxsati bilan joylashuvni oladi. Ruxsat bo'lmasa null. */
export function requestLocation(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (tg?.LocationManager) {
      try {
        tg.LocationManager.init(() => {
          tg.LocationManager!.getLocation((data) => resolve(data));
        });
        return;
      } catch {
        /* pastdagi brauzer API'siga o'tamiz */
      }
    }
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, enableHighAccuracy: true },
    );
  });
}
