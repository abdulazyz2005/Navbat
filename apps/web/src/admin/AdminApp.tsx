import { useCallback, useEffect, useState } from 'react';
import type { AdminStats } from '@navbat/shared';
import { money, timeAgo } from '../lib/format';
import { ApiError, adminApi, adminToken } from './api';
import { Login } from './Login';
import { Payments } from './Payments';
import { Payouts } from './Payouts';
import { Overview } from './Overview';
import { Users } from './Users';
import { Disputes } from './Disputes';
import { Settings } from './Settings';

export type Tab = 'overview' | 'payments' | 'payouts' | 'users' | 'disputes' | 'settings';

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Umumiy', icon: '📊' },
  { key: 'payments', label: 'To‘lovlar', icon: '🧾' },
  { key: 'payouts', label: 'Pul chiqarish', icon: '💸' },
  { key: 'users', label: 'Foydalanuvchilar', icon: '👥' },
  { key: 'disputes', label: 'Nizolar', icon: '⚖️' },
  { key: 'settings', label: 'Sozlamalar', icon: '⚙️' },
];

export function AdminApp() {
  const [authed, setAuthed] = useState(Boolean(adminToken.get()));
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [payoutCount, setPayoutCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const refreshBadges = useCallback(async () => {
    if (!adminToken.get()) return;
    try {
      const [s, intents, withdrawals] = await Promise.all([
        adminApi.stats(),
        adminApi.intents('PENDING_REVIEW'),
        adminApi.withdrawals('PENDING'),
      ]);
      setStats(s);
      setPendingCount(intents.items.length);
      setPayoutCount(withdrawals.items.length);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        adminToken.set(null);
        setAuthed(false);
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Yuklab bo‘lmadi');
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    void refreshBadges();
    // Yangi to'lovlar kelganini ko'rish uchun har 20 soniyada yangilanadi
    const timer = setInterval(() => void refreshBadges(), 20_000);
    return () => clearInterval(timer);
  }, [authed, refreshBadges]);

  if (!authed) {
    return <Login onSuccess={() => setAuthed(true)} />;
  }

  return (
    <div className="admin-shell">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold">NAVBAT — admin panel</h1>
          <p className="text-[13px] text-tg-hint">
            Foydalanuvchi ilovasidan alohida. Sessiya 12 soatdan keyin tugaydi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost px-3 py-2 text-[13px]" onClick={() => void refreshBadges()}>
            ↻ Yangilash
          </button>
          <button
            type="button"
            className="btn btn-ghost px-3 py-2 text-[13px]"
            onClick={() => {
              adminToken.set(null);
              setAuthed(false);
            }}
          >
            Chiqish
          </button>
        </div>
      </header>

      {error ? (
        <div className="mb-4 rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-[13px] text-danger-600">
          {error}
        </div>
      ) : null}

      <nav className="mb-5 flex flex-wrap gap-2">
        {TABS.map((item) => {
          const badge =
            item.key === 'payments' ? pendingCount : item.key === 'payouts' ? payoutCount : 0;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`btn px-3.5 py-2 text-[13px] ${
                tab === item.key ? 'bg-brand-500 text-white' : 'btn-ghost'
              }`}
            >
              <span className="mr-1.5">{item.icon}</span>
              {item.label}
              {badge > 0 ? (
                <span className="ml-2 rounded-full bg-danger-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {tab === 'overview' ? <Overview stats={stats} /> : null}
      {tab === 'payments' ? <Payments onChanged={refreshBadges} /> : null}
      {tab === 'payouts' ? <Payouts onChanged={refreshBadges} /> : null}
      {tab === 'users' ? <Users /> : null}
      {tab === 'disputes' ? <Disputes /> : null}
      {tab === 'settings' ? <Settings /> : null}

      <footer className="mt-10 text-center text-[12px] text-tg-hint">
        {stats ? `GMV: ${money(stats.gmv)} · yangilandi ${timeAgo(new Date().toISOString())}` : null}
      </footer>
    </div>
  );
}
