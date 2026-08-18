import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ACTIVE_ORDER_STATUSES, type OrderDTO } from '@navbat/shared';
import { api } from '../lib/api';
import { useViewMode } from '../hooks/useAuth';
import { OrderCard } from '../components/OrderCard';
import { EmptyState, SkeletonList } from '../components/ui';

const TABS = [
  { key: 'ACTIVE', label: 'Faol' },
  { key: 'COMPLETED', label: 'Tugallangan' },
  { key: 'ALL', label: 'Barchasi' },
] as const;

export function MyOrders() {
  const navigate = useNavigate();
  const [mode] = useViewMode();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('ACTIVE');
  const [items, setItems] = useState<OrderDTO[] | null>(null);

  const role = mode === 'WORKER' ? 'worker' : 'buyer';

  useEffect(() => {
    setItems(null);
    api
      .myOrders(role, tab)
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, [role, tab]);

  const visible = (items ?? []).filter((order) => {
    if (tab === 'ACTIVE') return (ACTIVE_ORDER_STATUSES as readonly string[]).includes(order.status);
    if (tab === 'COMPLETED') return order.status === 'COMPLETED';
    return true;
  });

  return (
    <div className="space-y-4">
      <h1 className="text-[20px] font-bold">
        {mode === 'WORKER' ? 'Mening topshiriqlarim' : 'Mening buyurtmalarim'}
      </h1>

      <div className="flex gap-2">
        {TABS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTab(option.key)}
            className={`flex-1 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
              tab === option.key
                ? 'bg-brand-500 text-white'
                : 'border border-tg-border bg-tg-card text-tg-hint'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {items === null ? (
        <SkeletonList count={3} />
      ) : visible.length === 0 ? (
        mode === 'WORKER' ? (
          <EmptyState
            icon="📋"
            title="Topshiriq yo‘q"
            description="Hali topshiriq qabul qilmagansiz. Mos topshiriqlarni ko‘rish uchun bo‘sh vaqtingizni belgilang."
            action={
              <button type="button" className="btn-primary w-full" onClick={() => navigate('/feed')}>
                Topshiriqlarni ko‘rish
              </button>
            }
          />
        ) : (
          <EmptyState
            icon="📭"
            title="Buyurtma yo‘q"
            description="Hali buyurtma yaratmagansiz."
            action={
              <button type="button" className="btn-primary w-full" onClick={() => navigate('/create')}>
                + Navbat kerak
              </button>
            }
          />
        )
      ) : (
        <div className="space-y-3">
          {visible.map((order) => (
            <OrderCard key={order.id} order={order} variant={mode === 'WORKER' ? 'worker' : 'mine'} />
          ))}
        </div>
      )}
    </div>
  );
}
