import { useEffect, useState } from 'react';
import { ApiError, adminApi, adminToken } from './api';

/**
 * Admin panelga kirish.
 *
 * Parol yo'q — kirish faqat Telegram orqali: bot faqat admin ro'yxatidagi
 * foydalanuvchiga bir martalik kod yuboradi. Kod 10 daqiqa yashaydi va
 * bir marta ishlatiladi.
 */
export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Havolada ?code=... bo'lsa avtomatik kiramiz
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('code');
    if (fromUrl) {
      setCode(fromUrl);
      void submit(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(value?: string) {
    const raw = (value ?? code).trim().toUpperCase();
    if (raw.length < 6) {
      setError('Kodni to‘liq kiriting.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi.login(raw);
      adminToken.set(result.token);
      // Kodni manzil satridan olib tashlaymiz
      window.history.replaceState({}, '', window.location.pathname);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kirib bo‘lmadi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-[420px] flex-col justify-center px-5">
      <div className="card p-6">
        <div className="mb-1 text-center text-4xl">🛠</div>
        <h1 className="text-center text-[20px] font-bold">NAVBAT admin</h1>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-tg-hint">
          Telegramda botga <code className="text-tg-text">/admin</code> buyrug‘ini yuboring —
          bir martalik kod keladi.
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-[13px] text-danger-600">
            {error}
          </div>
        ) : null}

        <label className="label mt-5">Kirish kodi</label>
        <input
          className="input text-center text-[18px] font-semibold tracking-[0.2em]"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
          placeholder="XXXXXXXX"
          autoFocus
          maxLength={16}
        />

        <button
          type="button"
          className="btn btn-primary mt-4 w-full py-3.5"
          onClick={() => void submit()}
          disabled={busy}
        >
          {busy ? 'Tekshirilmoqda…' : 'Kirish'}
        </button>
      </div>
    </div>
  );
}
