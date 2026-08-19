import { useCallback, useEffect, useState } from 'react';
import { money, timeAgo } from '../lib/format';
import { ApiError, adminApi, type AdminWithdrawalRow } from './api';

const FILTERS = ['PENDING', 'PROCESSING', 'COMPLETED', 'REJECTED', 'ALL'];
const LABELS: Record<string, string> = {
  PENDING: 'Yangi so‘rovlar',
  PROCESSING: 'Jarayonda',
  COMPLETED: 'To‘langan',
  REJECTED: 'Rad etilgan',
  ALL: 'Hammasi',
};

function formatCard(card: string | null): string {
  if (!card) return '—';
  return card.replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
}

/**
 * PUL CHIQARISH NAVBATI.
 *
 * Summa allaqachon xizmat haqi ushlangan holda hisoblangan — bu yerda ko'rsatilgan
 * summani navbatchining kartasiga o'tkazasiz va "To'landi" tugmasini bosasiz.
 */
export function Payouts({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState('PENDING');
  const [rows, setRows] = useState<AdminWithdrawalRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await adminApi.withdrawals(status);
      setRows(result.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yuklab bo‘lmadi');
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(row: AdminWithdrawalRow, decision: 'COMPLETED' | 'REJECTED' | 'PROCESSING') {
    let note: string | undefined;
    if (decision === 'REJECTED') {
      const reason = window.prompt('Rad etish sababi:', 'Karta raqami noto‘g‘ri');
      if (!reason) return;
      note = reason;
    }
    if (decision === 'COMPLETED' && !window.confirm(`${money(row.amount)} o‘tkazilganini tasdiqlaysizmi?`)) {
      return;
    }
    setBusyId(row.id);
    try {
      await adminApi.decideWithdrawal(row.id, decision, note);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bajarib bo‘lmadi');
    } finally {
      setBusyId(null);
    }
  }

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard bo'lmasa qo'lda nusxalanadi */
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
            {LABELS[key] ?? key}
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
        <div className="card p-8 text-center text-[13px] text-tg-hint">So‘rov yo‘q.</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Kim</th>
                <th>Karta</th>
                <th>Summa</th>
                <th>So‘ralgan</th>
                <th>Holat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const card = row.worker.cardNumber ?? row.account;
                return (
                  <tr key={row.id}>
                    <td>
                      <div className="font-medium">{row.worker.firstName}</div>
                      <div className="text-[12px] text-tg-hint">
                        {row.worker.username ? `@${row.worker.username}` : `ID ${row.worker.telegramId}`}
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-left font-mono text-[13px] text-brand-600"
                        onClick={() => void copy(card.replace(/\D/g, ''), `card-${row.id}`)}
                        title="Nusxalash"
                      >
                        {formatCard(card)}
                        {copied === `card-${row.id}` ? ' ✓' : ''}
                      </button>
                      <div className="text-[12px] text-tg-hint">
                        {row.worker.cardHolder ?? row.worker.firstName}
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="font-semibold text-brand-600"
                        onClick={() => void copy(String(row.amount), `amt-${row.id}`)}
                        title="Nusxalash"
                      >
                        {money(row.amount)}
                        {copied === `amt-${row.id}` ? ' ✓' : ''}
                      </button>
                    </td>
                    <td className="text-[12px] text-tg-hint">{timeAgo(row.createdAt)}</td>
                    <td className="text-[12px]">{LABELS[row.status] ?? row.status}</td>
                    <td>
                      {row.status === 'PENDING' || row.status === 'PROCESSING' ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="btn bg-money-500 px-3 py-2 text-[12px] text-white"
                            onClick={() => void decide(row, 'COMPLETED')}
                            disabled={busyId === row.id}
                          >
                            ✅ To‘landi
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost px-3 py-2 text-[12px]"
                            onClick={() => void decide(row, 'REJECTED')}
                            disabled={busyId === row.id}
                          >
                            Rad etish
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
