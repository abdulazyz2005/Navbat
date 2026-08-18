import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DISPUTE_REASON_LABELS,
  type DisputeDTO,
  type NotificationDTO,
} from '@navbat/shared';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { timeAgo } from '../lib/format';
import { EmptyState, SkeletonList } from '../components/ui';

const ICONS: Record<string, string> = {
  ORDER_CREATED: '📝',
  WORKER_FOUND: '🎉',
  WORKER_STARTED: '🏃',
  WORKER_COMPLETED: '🏁',
  PAYMENT_RELEASED: '💰',
  DISPUTE_OPENED: '⚠️',
  DISPUTE_RESOLVED: '⚖️',
  NEW_MATCHING_ORDER: '🔔',
  ORDER_ACCEPTED: '✅',
  ORDER_CANCELLED: '❌',
  CHECKIN_REMINDER: '📍',
  RATING_RECEIVED: '⭐',
  WITHDRAWAL_UPDATE: '🏦',
  NEW_MESSAGE: '💬',
};

export function Notifications() {
  const { refresh } = useAuth();
  const [items, setItems] = useState<NotificationDTO[] | null>(null);

  useEffect(() => {
    api
      .notifications()
      .then(async (res) => {
        setItems(res.items);
        if (res.items.some((n) => !n.read)) {
          await api.markNotificationsRead();
          await refresh();
        }
      })
      .catch(() => setItems([]));
  }, [refresh]);

  if (items === null) return <SkeletonList count={4} />;

  return (
    <div className="space-y-4">
      <h1 className="text-[20px] font-bold">Bildirishnomalar</h1>
      {items.length === 0 ? (
        <EmptyState
          icon="🔔"
          title="Bildirishnoma yo‘q"
          description="Buyurtma va topshiriqlaringiz bo‘yicha yangiliklar shu yerda ko‘rinadi."
        />
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const content = (
              <div className={`card flex gap-3 p-3.5 ${n.read ? '' : 'border-brand-500/35'}`}>
                <span className="text-xl">{ICONS[n.type] ?? '🔔'}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">{n.title}</div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-tg-hint">
                    {n.body}
                  </p>
                  <div className="mt-1 text-[11px] text-tg-hint">{timeAgo(n.createdAt)}</div>
                </div>
              </div>
            );
            return n.orderId ? (
              <Link key={n.id} to={`/orders/${n.orderId}`}>
                {content}
              </Link>
            ) : (
              <div key={n.id}>{content}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MyDisputes() {
  const [items, setItems] = useState<DisputeDTO[] | null>(null);

  useEffect(() => {
    api
      .disputes()
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, []);

  if (items === null) return <SkeletonList count={2} />;

  return (
    <div className="space-y-4">
      <h1 className="text-[20px] font-bold">Nizolarim</h1>
      {items.length === 0 ? (
        <EmptyState icon="⚖️" title="Nizo yo‘q" description="Sizda ochilgan nizolar mavjud emas." />
      ) : (
        <div className="space-y-2">
          {items.map((dispute) => (
            <Link key={dispute.id} to={`/orders/${dispute.orderId}`} className="card block p-4">
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold">
                  {dispute.order?.title ?? 'Buyurtma'}
                </span>
                <span
                  className={`chip ${
                    dispute.status === 'OPEN' || dispute.status === 'UNDER_REVIEW'
                      ? 'bg-amber-500/12 text-amber-600'
                      : 'bg-money-500/12 text-money-600'
                  }`}
                >
                  {dispute.status === 'OPEN'
                    ? 'Ochiq'
                    : dispute.status === 'UNDER_REVIEW'
                      ? 'Ko‘rilmoqda'
                      : 'Hal qilindi'}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-tg-hint">
                {DISPUTE_REASON_LABELS[dispute.reason]}
              </p>
              {dispute.resolution ? (
                <p className="mt-1.5 text-[12px] text-tg-hint">Qaror: {dispute.resolution}</p>
              ) : null}
              <div className="mt-1 text-[11px] text-tg-hint">{timeAgo(dispute.createdAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
