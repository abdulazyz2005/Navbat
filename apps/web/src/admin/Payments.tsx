import { useCallback, useEffect, useState } from 'react';
import { money, timeAgo } from '../lib/format';
import { ApiError, adminApi, type AdminIntentRow } from './api';

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: 'Tekshirish kerak',
  AWAITING_TRANSFER: 'Pul kutilmoqda',
  CONFIRMED: 'Tasdiqlangan',
  REJECTED: 'Rad etilgan',
  EXPIRED: 'Muddati o‘tgan',
  ALL: 'Hammasi',
};

const FILTERS = ['PENDING_REVIEW', 'AWAITING_TRANSFER', 'CONFIRMED', 'REJECTED', 'ALL'];

/**
 * KELGAN TO'LOVLARNI TEKSHIRISH.
 *
 * Har bir qatorda: kim, qancha yuborishi kerak edi, cheki va tugmalar.
 * Tasdiqlash — pulni foydalanuvchi balansiga qo'shadi va (buyurtma uchun bo'lsa)
 * buyurtmani avtomatik e'lon qiladi.
 */
export function Payments({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState('PENDING_REVIEW');
  const [rows, setRows] = useState<AdminIntentRow[] | null>(null);
  const [receipts, setReceipts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await adminApi.intents(status);
      setRows(result.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yuklab bo‘lmadi');
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  // Cheklar tokenli so'rov bilan olinadi (rasm URL'i ochiq turmaydi)
  useEffect(() => {
    if (!rows) return;
    let cancelled = false;
    const urls: string[] = [];
    void (async () => {
      for (const row of rows) {
        if (!row.hasReceipt || receipts[row.id]) continue;
        try {
          const url = await adminApi.fetchReceipt(row.id);
          urls.push(url);
          if (cancelled) return;
          setReceipts((prev) => ({ ...prev, [row.id]: url }));
        } catch {
          /* chek Telegramda bo'lishi mumkin — botda ko'riladi */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  async function confirm(row: AdminIntentRow) {
    if (!window.confirm(`${money(row.expectedAmount)} kelganini tasdiqlaysizmi?`)) return;
    setBusyId(row.id);
    try {
      const result = await adminApi.confirmIntent(row.id);
      await load();
      onChanged();
      if (result.publishedOrderId) {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tasdiqlab bo‘lmadi');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(row: AdminIntentRow) {
    const reason = window.prompt('Rad etish sababi (foydalanuvchiga yuboriladi):', 'Pul kelmadi');
    if (!reason) return;
    setBusyId(row.id);
    try {
      await adminApi.rejectIntent(row.id, reason);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Rad etib bo‘lmadi');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatus(key)}
            className={`btn px-3 py-1.5 text-[12px] ${status === key ? 'bg-brand-500 text-white' : 'btn-ghost'}`}
          >
            {STATUS_LABELS[key] ?? key}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-[13px] text-danger-600">
          {error}
        </div>
      ) : null}

      {rows === null ? (
        <div className="text-[13px] text-tg-hint">Yuklanmoqda…</div>
      ) : rows.length === 0 ? (
        <div className="card p-8 text-center text-[13px] text-tg-hint">
          Bu bo‘limda hozircha hech nima yo‘q.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-[220px]">
                  <div className="text-[15px] font-semibold">
                    {row.user.firstName}
                    {row.user.username ? (
                      <a
                        className="ml-2 text-[13px] font-normal text-brand-600"
                        href={`https://t.me/${row.user.username}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        @{row.user.username}
                      </a>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-[12px] text-tg-hint">
                    ID {row.user.telegramId} · {timeAgo(row.createdAt)}
                    {row.orderId ? ' · buyurtma uchun' : ' · balansni to‘ldirish'}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[12px] text-tg-hint">Kelishi kerak</div>
                  <div className="text-[22px] font-bold leading-tight">
                    {money(row.expectedAmount)}
                  </div>
                  <div className="text-[12px] text-tg-hint">
                    asosiy summa: {money(row.amount)}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-start gap-4">
                {receipts[row.id] ? (
                  <button type="button" onClick={() => setZoom(receipts[row.id])}>
                    <img
                      src={receipts[row.id]}
                      alt="Chek"
                      className="h-40 w-auto rounded-lg border border-tg-border object-cover"
                    />
                  </button>
                ) : (
                  <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-dashed border-tg-border text-[12px] text-tg-hint">
                    {row.hasReceipt ? 'Chek Telegramda' : 'Chek yo‘q'}
                  </div>
                )}

                <div className="flex-1 space-y-2 text-[13px]">
                  <div className="text-tg-hint">
                    Holat: <span className="text-tg-text">{STATUS_LABELS[row.status] ?? row.status}</span>
                  </div>
                  {row.rejectReason ? (
                    <div className="text-danger-600">Sabab: {row.rejectReason}</div>
                  ) : null}

                  {row.status === 'PENDING_REVIEW' || row.status === 'AWAITING_TRANSFER' ? (
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        className="btn bg-money-500 px-4 py-2.5 text-white"
                        onClick={() => void confirm(row)}
                        disabled={busyId === row.id}
                      >
                        ✅ Pul keldi — tasdiqlash
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost px-4 py-2.5"
                        onClick={() => void reject(row)}
                        disabled={busyId === row.id}
                      >
                        ❌ Rad etish
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {zoom ? (
        <button
          type="button"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setZoom(null)}
        >
          <img src={zoom} alt="Chek" className="max-h-full max-w-full rounded-lg" />
        </button>
      ) : null}
    </div>
  );
}
