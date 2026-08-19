import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { PaymentIntentDTO } from '@navbat/shared';
import { ApiError, api } from '../lib/api';
import { money } from '../lib/format';
import { hapticResult } from '../lib/telegram';
import { ErrorBox, Spinner } from '../components/ui';

/**
 * KARTA ORQALI TO'LOV.
 *
 * Foydalanuvchiga bitta aniq vazifa beriladi: ko'rsatilgan kartaga AYNAN
 * ko'rsatilgan summani yuborish va chekni yuklash. Summaning oxirgi raqamlari
 * har bir to'lovda boshqacha — shu tufayli admin qaysi pul kimdan kelganini
 * xatosiz aniqlaydi.
 */

const POLL_MS = 8000;

/** Chekni yuklashdan oldin brauzerda kichraytiramiz (trafik va baza uchun) */
async function compressImage(file: File, maxSide = 1280, quality = 0.72): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas yo‘q');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function CopyRow({ label, value, display }: { label: string; value: string; display?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-xl bg-tg-bg px-4 py-3 text-left"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* clipboard yo'q bo'lsa qo'lda ko'chiriladi */
        }
        setCopied(true);
        hapticResult('success');
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      <span>
        <span className="block text-[12px] text-tg-hint">{label}</span>
        <span className="block font-mono text-[17px] font-semibold">{display ?? value}</span>
      </span>
      <span className="text-[13px] font-medium text-brand-600">{copied ? 'Nusxalandi ✓' : 'Nusxalash'}</span>
    </button>
  );
}

export function Payment() {
  const { orderId } = useParams<{ orderId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const requestedAmount = Number.parseInt(params.get('amount') ?? '0', 10);
  const [intent, setIntent] = useState<PaymentIntentDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const active = await api.activeIntent();
      if (active && (!orderId || active.orderId === orderId)) {
        setIntent(active);
        return;
      }
      if (!requestedAmount || requestedAmount <= 0) {
        setError('To‘lov summasi ko‘rsatilmagan.');
        return;
      }
      setIntent(await api.createIntent(requestedAmount, orderId));
    } catch (err) {
      /**
       * Boshqa buyurtma uchun tugallanmagan to'lov bor bo'lsa — o'shani ochamiz,
       * chunki bir vaqtda faqat bitta faol to'lov bo'lishi mumkin.
       */
      if (err instanceof ApiError && err.code === 'ACTIVE_INTENT_EXISTS') {
        const details = err.details as { intentId?: string } | undefined;
        if (details?.intentId) {
          try {
            setIntent(await api.intent(details.intentId));
            return;
          } catch {
            /* pastdagi xabar ko'rsatiladi */
          }
        }
      }
      setError(err instanceof ApiError ? err.message : 'To‘lovni boshlab bo‘lmadi');
    } finally {
      setLoading(false);
    }
  }, [orderId, requestedAmount]);

  useEffect(() => {
    void start();
  }, [start]);

  // Admin tasdiqlashini kutamiz — tasdiqlangach avtomatik keyingi ekranga o'tamiz
  useEffect(() => {
    if (!intent || intent.status === 'CONFIRMED' || intent.status === 'REJECTED') return;
    const timer = setInterval(async () => {
      try {
        const fresh = await api.intent(intent.id);
        setIntent(fresh);
        if (fresh.status === 'CONFIRMED') {
          hapticResult('success');
          navigate(fresh.orderId ? `/orders/${fresh.orderId}` : '/balance', { replace: true });
        }
      } catch {
        /* tarmoq uzilsa keyingi urinishda */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [intent, navigate]);

  async function upload(file: File) {
    if (!intent) return;
    setUploading(true);
    setError(null);
    try {
      const image = await compressImage(file);
      setIntent(await api.uploadReceipt(intent.id, image));
      hapticResult('success');
    } catch (err) {
      hapticResult('error');
      setError(err instanceof ApiError ? err.message : 'Chekni yuklab bo‘lmadi');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-tg-hint">
        <Spinner />
      </div>
    );
  }

  if (error && !intent) {
    return (
      <div className="space-y-4">
        <h1 className="text-[20px] font-bold">To‘lov</h1>
        <ErrorBox message={error} onRetry={() => void start()} />
      </div>
    );
  }

  if (!intent) return null;

  const waiting = intent.status === 'PENDING_REVIEW';
  const rejected = intent.status === 'REJECTED';

  return (
    <div className="space-y-5">
      <h1 className="text-[20px] font-bold">Karta orqali to‘lov</h1>

      {error ? <ErrorBox message={error} /> : null}

      {rejected ? (
        <div className="card border-danger-500/40 bg-danger-500/10 p-4 text-[13px]">
          <div className="font-semibold text-danger-600">To‘lov tasdiqlanmadi</div>
          <p className="mt-1 leading-relaxed">{intent.rejectReason}</p>
          <button type="button" className="btn btn-primary mt-3 w-full py-3" onClick={() => void start()}>
            Qaytadan urinish
          </button>
        </div>
      ) : (
        <>
          <div className="card space-y-2.5 p-4">
            <CopyRow
              label="Karta raqami"
              value={intent.cardNumber}
              display={intent.cardNumber.replace(/(\d{4})(?=\d)/g, '$1 ')}
            />
            <div className="px-4 text-[13px] text-tg-hint">Karta egasi: {intent.cardHolder}</div>
            <CopyRow
              label="AYNAN shu summani yuboring"
              value={String(intent.expectedAmount)}
              display={money(intent.expectedAmount)}
            />
          </div>

          <div className="card bg-brand-50 p-4 text-[13px] leading-relaxed text-brand-700">
            Summaning oxirgi raqamlari shu to‘lov uchun maxsus tanlangan — u sizning to‘lovingizni
            aniqlash uchun kerak. Boshqa summa yuborilsa, to‘lov avtomatik topilmaydi.
          </div>

          {waiting ? (
            <div className="card flex items-center gap-3 p-4">
              <Spinner className="text-brand-500" />
              <div className="text-[13px]">
                <div className="font-semibold">Chek yuborildi</div>
                <div className="text-tg-hint">
                  Tekshirilmoqda. Tasdiqlangach bu sahifa o‘zi yangilanadi.
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void upload(file);
                }}
              />
              <button
                type="button"
                className="btn btn-primary w-full py-3.5"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Yuklanmoqda…' : '📷 To‘lov chekini yuklash'}
              </button>
              <p className="px-1 text-[12px] leading-relaxed text-tg-hint">
                Pulni o‘tkazganingizdan keyin bank ilovasidagi chek skrinshotini yuklang.
                Chekni botga rasm sifatida ham yuborishingiz mumkin.
              </p>
            </div>
          )}
        </>
      )}

      <button type="button" className="btn btn-ghost w-full py-3" onClick={() => navigate(-1)}>
        Orqaga
      </button>
    </div>
  );
}
