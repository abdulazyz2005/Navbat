import { useCallback, useEffect, useState } from 'react';
import { DISPUTE_REASON_LABELS, type DisputeDTO } from '@navbat/shared';
import { money, timeAgo } from '../lib/format';
import { ApiError, adminApi } from './api';

const FILTERS = ['OPEN', 'UNDER_REVIEW', 'RESOLVED_BUYER', 'RESOLVED_WORKER', 'ALL'];

export function Disputes() {
  const [status, setStatus] = useState('OPEN');
  const [items, setItems] = useState<DisputeDTO[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await adminApi.disputes(status);
      setItems(result.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yuklab bo‘lmadi');
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(dispute: DisputeDTO, winner: 'BUYER' | 'WORKER') {
    const resolution = window.prompt(
      winner === 'BUYER'
        ? 'Buyurtmachi foydasiga yechim (pul qaytariladi). Izoh:'
        : 'Navbatchi foydasiga yechim (pul chiqariladi). Izoh:',
      '',
    );
    if (!resolution) return;
    setBusyId(dispute.id);
    try {
      await adminApi.resolveDispute(dispute.id, winner, resolution);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bajarib bo‘lmadi');
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
            {key}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-[13px] text-danger-600">
          {error}
        </div>
      ) : null}

      {items === null ? (
        <div className="text-[13px] text-tg-hint">Yuklanmoqda…</div>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center text-[13px] text-tg-hint">Nizo yo‘q.</div>
      ) : (
        <div className="space-y-3">
          {items.map((dispute) => (
            <div key={dispute.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-semibold">
                    {dispute.order?.title ?? 'Buyurtma'}
                  </div>
                  <div className="mt-0.5 text-[12px] text-tg-hint">
                    {DISPUTE_REASON_LABELS[dispute.reason]} · {dispute.openedBy.firstName} ochgan ·{' '}
                    {timeAgo(dispute.createdAt)}
                  </div>
                </div>
                {dispute.order ? (
                  <div className="text-right text-[13px]">
                    <div className="font-semibold">{money(dispute.order.offeredAmount)}</div>
                    <div className="text-[12px] text-tg-hint">
                      navbatchiga: {money(dispute.order.workerAmount)}
                    </div>
                  </div>
                ) : null}
              </div>

              {dispute.description ? (
                <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed">
                  {dispute.description}
                </p>
              ) : null}

              {dispute.resolution ? (
                <div className="mt-2 rounded-xl bg-tg-bg p-3 text-[13px]">
                  Yechim: {dispute.resolution}
                </div>
              ) : null}

              {dispute.status === 'OPEN' || dispute.status === 'UNDER_REVIEW' ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost px-4 py-2.5 text-[13px]"
                    onClick={() => void resolve(dispute, 'BUYER')}
                    disabled={busyId === dispute.id}
                  >
                    Buyurtmachi haq — pulni qaytarish
                  </button>
                  <button
                    type="button"
                    className="btn bg-money-500 px-4 py-2.5 text-[13px] text-white"
                    onClick={() => void resolve(dispute, 'WORKER')}
                    disabled={busyId === dispute.id}
                  >
                    Navbatchi haq — pulni chiqarish
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
