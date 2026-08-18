import { useCallback, useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import {
  DISPUTE_REASON_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  formatRating,
  type AdminStats,
  type DisputeDTO,
  type OrderDTO,
} from '@navbat/shared';
import {
  api,
  type AdminPaymentRow,
  type AdminUserRow,
  type AdminWithdrawalRow,
} from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { money, timeAgo } from '../lib/format';
import { hapticResult, showConfirm } from '../lib/telegram';
import { EmptyState, PageLoader, Section, SkeletonList, StatTile } from '../components/ui';

const TABS = [
  { key: 'stats', label: 'Statistika' },
  { key: 'orders', label: 'Buyurtmalar' },
  { key: 'payments', label: 'To‘lovlar' },
  { key: 'disputes', label: 'Nizolar' },
  { key: 'withdrawals', label: 'Pul yechish' },
  { key: 'users', label: 'Foydalanuvchilar' },
] as const;

export function Admin() {
  const { me, loading } = useAuth();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('stats');

  if (loading) return <PageLoader />;
  if (!me?.isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4">
      <h1 className="text-[20px] font-bold">Admin panel</h1>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTab(option.key)}
            className={`chip shrink-0 border ${
              tab === option.key
                ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                : 'border-tg-border bg-tg-card text-tg-hint'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === 'stats' ? <StatsTab /> : null}
      {tab === 'orders' ? <OrdersTab /> : null}
      {tab === 'payments' ? <PaymentsTab /> : null}
      {tab === 'disputes' ? <DisputesTab /> : null}
      {tab === 'withdrawals' ? <WithdrawalsTab /> : null}
      {tab === 'users' ? <UsersTab /> : null}
    </div>
  );
}

function StatsTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    api
      .admin.stats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  if (!stats) return <SkeletonList count={3} />;

  return (
    <div className="space-y-5">
      <Section title="Foydalanuvchilar">
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Jami" value={String(stats.totalUsers)} accent="brand" />
          <StatTile label="Faol (30 kun)" value={String(stats.activeUsers)} />
        </div>
      </Section>

      <Section title="Buyurtmalar">
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Bugun" value={String(stats.ordersToday)} />
          <StatTile label="Shu hafta" value={String(stats.ordersThisWeek)} />
          <StatTile label="Tugallangan" value={String(stats.completedOrders)} accent="money" />
          <StatTile label="Bekor qilish darajasi" value={`${stats.cancellationRate}%`} />
        </div>
      </Section>

      <Section title="Moliya">
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="GMV" value={money(stats.gmv).replace(' so‘m', '')} accent="money" />
          <StatTile
            label="Platforma daromadi"
            value={money(stats.platformRevenue).replace(' so‘m', '')}
            accent="money"
          />
          <StatTile
            label="Escrowda (HELD)"
            value={money(stats.heldPayments).replace(' so‘m', '')}
          />
          <StatTile
            label="Qaytarilgan"
            value={money(stats.refundedPayments).replace(' so‘m', '')}
          />
          <StatTile
            label="O‘rtacha buyurtma"
            value={money(stats.averageOrderValue).replace(' so‘m', '')}
          />
          <StatTile label="O‘rtacha reyting" value={formatRating(stats.averageWorkerRating)} />
        </div>
      </Section>

      <Section title="Operatsion">
        <div className="grid grid-cols-2 gap-2">
          <StatTile label="Ochiq nizolar" value={String(stats.openDisputes)} />
          <StatTile label="Kutayotgan yechimlar" value={String(stats.pendingWithdrawals)} />
          <StatTile
            label="O‘rtacha bajarish (daq)"
            value={String(stats.averageCompletionMinutes)}
          />
        </div>
      </Section>
    </div>
  );
}

function OrdersTab() {
  const [items, setItems] = useState<OrderDTO[] | null>(null);
  const [status, setStatus] = useState('ALL');

  useEffect(() => {
    setItems(null);
    api
      .admin.orders(status)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, [status]);

  return (
    <div className="space-y-3">
      <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="ALL">Barchasi</option>
        {Object.entries(ORDER_STATUS_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>

      {items === null ? (
        <SkeletonList count={3} />
      ) : items.length === 0 ? (
        <EmptyState icon="📋" title="Buyurtma yo‘q" description="Bu filtr bo‘yicha natija yo‘q." />
      ) : (
        items.map((order) => (
          <Link key={order.id} to={`/orders/${order.id}`} className="card block p-3.5">
            <div className="flex items-center justify-between">
              <span className="truncate text-[14px] font-semibold">{order.title}</span>
              <span className="chip bg-tg-border text-tg-hint">
                {ORDER_STATUS_LABELS[order.status]}
              </span>
            </div>
            <div className="mt-1 text-[12px] text-tg-hint">
              {order.buyer.firstName} → {order.worker?.firstName ?? '—'} · {money(order.offeredAmount)}
            </div>
            <div className="text-[11px] text-tg-hint">{timeAgo(order.createdAt)}</div>
          </Link>
        ))
      )}
    </div>
  );
}

function PaymentsTab() {
  const [items, setItems] = useState<AdminPaymentRow[] | null>(null);
  const [status, setStatus] = useState('ALL');

  useEffect(() => {
    setItems(null);
    api
      .admin.payments(status)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, [status]);

  return (
    <div className="space-y-3">
      <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="ALL">Barchasi</option>
        {Object.entries(PAYMENT_STATUS_LABELS).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>

      {items === null ? (
        <SkeletonList count={3} />
      ) : (
        items.map((payment) => (
          <div key={payment.id} className="card p-3.5">
            <div className="flex items-center justify-between">
              <span className="truncate text-[14px] font-semibold">{payment.orderTitle}</span>
              <span className="chip bg-tg-border text-tg-hint">
                {PAYMENT_STATUS_LABELS[payment.status as keyof typeof PAYMENT_STATUS_LABELS]}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-3 gap-1 text-[12px] text-tg-hint">
              <span>Jami: {money(payment.grossAmount)}</span>
              <span>Komissiya: {money(payment.platformFee)}</span>
              <span>Navbatchiga: {money(payment.workerAmount)}</span>
            </div>
            <div className="mt-1 text-[11px] text-tg-hint">
              {payment.payer} → {payment.receiver ?? '—'} · {payment.provider} ·{' '}
              {payment.transactionId ?? '—'}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function DisputesTab() {
  const [items, setItems] = useState<DisputeDTO[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(null);
    api
      .admin.disputes('ALL')
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, []);

  useEffect(load, [load]);

  async function resolve(id: string, winner: 'BUYER' | 'WORKER') {
    const ok = await showConfirm(
      winner === 'WORKER'
        ? 'To‘lov navbatchiga chiqarilsinmi?'
        : 'To‘lov buyurtmachiga qaytarilsinmi?',
    );
    if (!ok) return;
    setBusy(id);
    try {
      await api.admin.resolveDispute(
        id,
        winner,
        winner === 'WORKER' ? 'Navbatchi foydasiga hal qilindi' : 'Buyurtmachi foydasiga hal qilindi',
      );
      hapticResult('success');
      load();
    } finally {
      setBusy(null);
    }
  }

  if (items === null) return <SkeletonList count={2} />;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <EmptyState icon="⚖️" title="Nizo yo‘q" description="Hozircha nizolar mavjud emas." />
      ) : (
        items.map((dispute) => (
          <div key={dispute.id} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="truncate text-[14px] font-semibold">
                {dispute.order?.title ?? 'Buyurtma'}
              </span>
              <span className="chip bg-tg-border text-tg-hint">{dispute.status}</span>
            </div>
            <p className="mt-1 text-[13px] text-tg-hint">
              {DISPUTE_REASON_LABELS[dispute.reason]} · {dispute.openedBy.firstName}
            </p>
            {dispute.description ? (
              <p className="mt-1 text-[13px]">{dispute.description}</p>
            ) : null}
            {dispute.order ? (
              <p className="mt-1 text-[12px] text-tg-hint">
                {money(dispute.order.offeredAmount)} · {dispute.order.buyer.firstName} →{' '}
                {dispute.order.worker?.firstName ?? '—'}
              </p>
            ) : null}

            {dispute.status === 'OPEN' || dispute.status === 'UNDER_REVIEW' ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="btn-success flex-1 py-2.5 text-[13px]"
                  disabled={busy === dispute.id}
                  onClick={() => void resolve(dispute.id, 'WORKER')}
                >
                  Navbatchi foydasiga
                </button>
                <button
                  type="button"
                  className="btn-danger flex-1 py-2.5 text-[13px]"
                  disabled={busy === dispute.id}
                  onClick={() => void resolve(dispute.id, 'BUYER')}
                >
                  Buyurtmachi foydasiga
                </button>
              </div>
            ) : dispute.resolution ? (
              <p className="mt-2 text-[12px] text-tg-hint">Qaror: {dispute.resolution}</p>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

function WithdrawalsTab() {
  const [items, setItems] = useState<AdminWithdrawalRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(null);
    api
      .admin.withdrawals('ALL')
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, []);

  useEffect(load, [load]);

  async function decide(id: string, decision: 'PROCESSING' | 'COMPLETED' | 'REJECTED') {
    setBusy(id);
    try {
      await api.admin.decideWithdrawal(id, decision);
      hapticResult('success');
      load();
    } finally {
      setBusy(null);
    }
  }

  if (items === null) return <SkeletonList count={2} />;

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <EmptyState icon="🏦" title="So‘rov yo‘q" description="Pul yechish so‘rovlari mavjud emas." />
      ) : (
        items.map((w) => (
          <div key={w.id} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-bold">{money(w.amount)}</span>
              <span className="chip bg-tg-border text-tg-hint">{w.status}</span>
            </div>
            <p className="mt-1 text-[13px] text-tg-hint">
              {w.worker.firstName} · {w.method} · {w.account}
            </p>
            <p className="text-[11px] text-tg-hint">{timeAgo(w.createdAt)}</p>
            {w.status === 'PENDING' || w.status === 'PROCESSING' ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="btn-success flex-1 py-2.5 text-[13px]"
                  disabled={busy === w.id}
                  onClick={() => void decide(w.id, 'COMPLETED')}
                >
                  To‘landi
                </button>
                <button
                  type="button"
                  className="btn-danger flex-1 py-2.5 text-[13px]"
                  disabled={busy === w.id}
                  onClick={() => void decide(w.id, 'REJECTED')}
                >
                  Rad etish
                </button>
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

function UsersTab() {
  const [items, setItems] = useState<AdminUserRow[] | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback((q: string) => {
    api
      .admin.users(q)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(query), 300);
    return () => clearTimeout(timer);
  }, [query, load]);

  return (
    <div className="space-y-3">
      <input
        className="field"
        placeholder="Ism yoki username bo‘yicha qidirish"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {items === null ? (
        <SkeletonList count={3} />
      ) : (
        items.map((user) => (
          <div key={user.id} className="card p-3.5">
            <div className="flex items-center justify-between">
              <span className="truncate text-[14px] font-semibold">
                {user.firstName} {user.lastName ?? ''}
                {user.isAdmin ? ' 🛠' : ''}
              </span>
              {user.isBanned ? (
                <span className="chip bg-red-500/12 text-red-600">Bloklangan</span>
              ) : (
                <span className="chip bg-money-500/12 text-money-600">Faol</span>
              )}
            </div>
            <div className="mt-1 text-[12px] text-tg-hint">
              {user.username ? `@${user.username} · ` : ''}
              {user.roleMode} · ★ {formatRating(user.rating)} · {user.successRate}%
            </div>
            <div className="text-[12px] text-tg-hint">
              {user.completedOrders} tugallangan · {user.cancelledOrders} bekor ·{' '}
              {money(user.availableBalance)}
            </div>
            <button
              type="button"
              className={`mt-2 text-[12px] font-semibold ${
                user.isBanned ? 'text-money-600' : 'text-red-600'
              }`}
              onClick={async () => {
                const ok = await showConfirm(
                  user.isBanned ? 'Blokdan chiqarilsinmi?' : 'Foydalanuvchi bloklansinmi?',
                );
                if (!ok) return;
                await api.admin.banUser(user.id, !user.isBanned);
                load(query);
              }}
            >
              {user.isBanned ? 'Blokdan chiqarish' : 'Bloklash'}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
