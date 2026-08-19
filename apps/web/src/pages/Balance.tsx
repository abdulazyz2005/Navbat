import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TRANSACTION_TYPE_LABELS,
  WITHDRAWAL_METHOD_LABELS,
  type BalanceDTO,
  type TransactionDTO,
  type WithdrawalDTO,
  type WithdrawalMethod,
} from '@navbat/shared';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { money, timeAgo } from '../lib/format';
import { hapticResult, showConfirm } from '../lib/telegram';
import { EmptyState, ErrorBox, Section, Sheet, SkeletonList, Spinner, StatTile } from '../components/ui';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Kutilmoqda',
  PROCESSING: 'Ko‘rib chiqilmoqda',
  COMPLETED: 'To‘landi',
  REJECTED: 'Rad etildi',
};

export function Balance() {
  const navigate = useNavigate();
  const { me, refresh } = useAuth();
  const [balance, setBalance] = useState<BalanceDTO | null>(null);
  const [topUp, setTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState(50000);
  const [transactions, setTransactions] = useState<TransactionDTO[] | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalDTO[]>([]);
  const [minWithdrawal, setMinWithdrawal] = useState(50000);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<WithdrawalMethod>('CARD');
  const [account, setAccount] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, t, w] = await Promise.all([api.balance(), api.transactions(), api.withdrawals()]);
      setBalance(b);
      setTransactions(t.items);
      setWithdrawals(w.items);
      setAmount(b.availableBalance);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yuklab bo‘lmadi');
    }
  }, []);

  useEffect(() => {
    if (me?.profile.cardNumber && !account) setAccount(me.profile.cardNumber);
  }, [me, account]);

  useEffect(() => {
    void load();
    api
      .config()
      .then((c) => setMinWithdrawal(c.minWithdrawalAmount))
      .catch(() => undefined);
  }, [load]);

  async function submit() {
    setError(null);
    const digits = account.replace(/\D/g, '');
    if (method === 'CARD' && digits.length !== 16) {
      setError('Karta raqami 16 ta raqamdan iborat bo‘lishi kerak.');
      return;
    }
    if (account.trim().length < 4) {
      setError('Hisob raqami yoki telefon raqamini kiriting.');
      return;
    }
    setSaving(true);
    try {
      await api.createWithdrawal({ amount: Math.trunc(amount), method, account: account.trim() });
      // Kartani profilda saqlaymiz — keyingi safar qayta kiritish shart emas
      if (method === 'CARD') {
        await api
          .updateMe({ cardNumber: account.replace(/\D/g, ''), cardHolder: me?.firstName ?? '' })
          .then(() => refresh())
          .catch(() => undefined);
      }
      hapticResult('success');
      setOpen(false);
      await load();
    } catch (err) {
      hapticResult('error');
      setError(err instanceof ApiError ? err.message : 'Yuborib bo‘lmadi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-[20px] font-bold">Balans</h1>
      {error ? <ErrorBox message={error} /> : null}

      <div className="card bg-gradient-to-br from-money-500 to-money-600 p-5 text-white border-transparent">
        <div className="text-[13px] opacity-90">Mavjud balans</div>
        <div className="mt-1 text-[30px] font-bold leading-tight">
          {money(balance?.availableBalance ?? 0)}
        </div>
        <div className="mt-3 text-[13px] opacity-90">
          Kutilmoqda (escrowda): {money(balance?.pendingBalance ?? 0)}
        </div>
        <button
          type="button"
          className="btn mt-4 w-full bg-white px-5 py-3.5 text-[15px] text-money-600"
          onClick={() => setOpen(true)}
          disabled={!balance || balance.availableBalance < minWithdrawal}
        >
          Pul yechish
        </button>
        {balance && balance.availableBalance < minWithdrawal ? (
          <p className="mt-2 text-center text-[12px] opacity-85">
            Minimal yechish summasi: {money(minWithdrawal)}
          </p>
        ) : null}
      </div>

      <div className="card p-4">
        <div className="text-[15px] font-semibold">Hisobni to‘ldirish</div>
        <p className="mt-1 text-[12px] leading-relaxed text-tg-hint">
          Kartadan kartaga o‘tkazma. Tizim sizga aynan yuboriladigan summani beradi, chekni
          yuklaysiz va tasdiqlangach pul balansga tushadi.
        </p>
        {topUp ? (
          <div className="mt-3 space-y-2">
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={topUpAmount || ''}
              onChange={(event) => setTopUpAmount(Number.parseInt(event.target.value || '0', 10))}
              placeholder="Summa"
            />
            <div className="flex gap-2">
              {[50000, 100000, 200000].map((value) => (
                <button
                  key={value}
                  type="button"
                  className="chip flex-1 justify-center border border-tg-border bg-tg-card text-tg-hint"
                  onClick={() => setTopUpAmount(value)}
                >
                  {value / 1000}k
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary w-full py-3"
              disabled={topUpAmount < 1000}
              onClick={() => navigate(`/topup?amount=${Math.trunc(topUpAmount)}`)}
            >
              Davom etish
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost mt-3 w-full py-3" onClick={() => setTopUp(true)}>
            + To‘ldirish
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Jami ishlangan"
          value={money(balance?.totalEarned ?? 0).replace(' so‘m', '')}
          accent="money"
        />
        <StatTile
          label="Jami sarflangan"
          value={money(balance?.totalSpent ?? 0).replace(' so‘m', '')}
        />
      </div>

      {withdrawals.length > 0 ? (
        <Section title="Pul yechish so‘rovlari">
          <div className="space-y-2">
            {withdrawals.map((w) => (
              <div key={w.id} className="card flex items-center justify-between p-3.5">
                <div>
                  <div className="text-[14px] font-semibold">{money(w.amount)}</div>
                  <div className="text-[12px] text-tg-hint">
                    {WITHDRAWAL_METHOD_LABELS[w.method]} · {w.account}
                  </div>
                  <div className="text-[11px] text-tg-hint">{timeAgo(w.createdAt)}</div>
                </div>
                <div className="text-right">
                  <span
                    className={`chip ${
                      w.status === 'COMPLETED'
                        ? 'bg-money-500/12 text-money-600'
                        : w.status === 'REJECTED'
                          ? 'bg-red-500/12 text-red-600'
                          : 'bg-amber-500/12 text-amber-600'
                    }`}
                  >
                    {STATUS_LABELS[w.status]}
                  </span>
                  {w.status === 'PENDING' ? (
                    <button
                      type="button"
                      className="mt-1 block w-full text-[11px] text-red-600"
                      onClick={async () => {
                        if (await showConfirm('So‘rovni bekor qilasizmi?')) {
                          await api.cancelWithdrawal(w.id);
                          await load();
                        }
                      }}
                    >
                      Bekor qilish
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Tranzaksiyalar">
        {transactions === null ? (
          <SkeletonList count={3} />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon="💸"
            title="Hali daromad yo‘q"
            description="Birinchi topshiriqni bajaring — daromadingiz shu yerda ko‘rinadi."
          />
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="card flex items-center justify-between p-3.5">
                <div className="min-w-0">
                  <div className="text-[14px] font-medium">{TRANSACTION_TYPE_LABELS[tx.type]}</div>
                  {tx.note ? (
                    <div className="truncate text-[12px] text-tg-hint">{tx.note}</div>
                  ) : null}
                  <div className="text-[11px] text-tg-hint">{timeAgo(tx.createdAt)}</div>
                </div>
                <div
                  className={`shrink-0 text-[15px] font-bold ${
                    tx.amount >= 0 ? 'text-money-600' : 'text-tg-text'
                  }`}
                >
                  {tx.amount >= 0 ? '+' : ''}
                  {money(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Sheet open={open} onClose={() => setOpen(false)} title="Pul yechish">
        <div>
          <label className="label">Summa</label>
          <input
            type="number"
            inputMode="numeric"
            className="field"
            value={amount}
            max={balance?.availableBalance ?? 0}
            step={10000}
            onChange={(e) => setAmount(Number.parseInt(e.target.value, 10) || 0)}
          />
          <p className="mt-1 text-[12px] text-tg-hint">
            Mavjud: {money(balance?.availableBalance ?? 0)} · Minimal: {money(minWithdrawal)}
          </p>
        </div>

        <div className="mt-4">
          <label className="label">To‘lov usuli</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(WITHDRAWAL_METHOD_LABELS) as WithdrawalMethod[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMethod(key)}
                className={`rounded-xl border px-3 py-2.5 text-[13px] font-medium ${
                  method === key
                    ? 'border-brand-500 bg-brand-500/8 text-brand-600'
                    : 'border-tg-border bg-tg-card text-tg-hint'
                }`}
              >
                {WITHDRAWAL_METHOD_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="label">
            {method === 'CARD' ? 'Karta raqami' : method === 'CASH' ? 'Aloqa uchun' : 'Telefon raqami'}
          </label>
          <input
            className="field"
            placeholder={method === 'CARD' ? '8600 0000 0000 0000' : '+998 90 123 45 67'}
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            maxLength={60}
          />
        </div>

        <button type="button" className="btn-primary mt-5 w-full" onClick={submit} disabled={saving}>
          {saving ? <Spinner /> : 'So‘rov yuborish'}
        </button>
        <p className="mt-2 text-center text-[12px] leading-relaxed text-tg-hint">
          So‘rov administrator tomonidan ko‘rib chiqiladi. Summa balansingizdan darhol bloklanadi.
        </p>
      </Sheet>
    </div>
  );
}
