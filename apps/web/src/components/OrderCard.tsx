import { Link } from 'react-router-dom';
import { ORDER_CATEGORY_ICONS, ORDER_CATEGORY_LABELS, type OrderDTO } from '@navbat/shared';
import { distanceLabel, money, relativeDate } from '../lib/format';
import { StatusBadge, Stars } from './ui';

interface Props {
  order: OrderDTO;
  /** feed: navbatchi ko'rinishi (moslik + masofa), mine: buyurtmachi ko'rinishi */
  variant?: 'feed' | 'mine' | 'worker';
}

export function OrderCard({ order, variant = 'mine' }: Props) {
  const distance = distanceLabel(order.distanceKm);

  return (
    <Link to={`/orders/${order.id}`} className="card block p-4 active:opacity-80">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-tg-hint">
            <span>{ORDER_CATEGORY_ICONS[order.category]}</span>
            <span>{order.categoryOther ?? ORDER_CATEGORY_LABELS[order.category]}</span>
          </div>
          <h3 className="mt-1 truncate text-[15px] font-semibold">{order.title}</h3>
        </div>
        {variant === 'feed' && order.matchScore !== undefined && order.matchScore > 0 ? (
          <span className="chip shrink-0 bg-brand-500/12 text-brand-600">
            Moslik {order.matchScore}%
          </span>
        ) : (
          <StatusBadge status={order.status} />
        )}
      </div>

      <div className="mt-2.5 space-y-1 text-[13px] text-tg-hint">
        <div className="flex items-center gap-1.5">
          <span>📍</span>
          <span className="truncate">{order.locationName}</span>
          {distance ? <span className="shrink-0 text-tg-hint">· {distance}</span> : null}
        </div>
        <div className="flex items-center gap-1.5">
          <span>🕒</span>
          <span>
            {relativeDate(order.date)} · {order.startTime}–{order.endTime}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-tg-border pt-3">
        <div className="text-[17px] font-bold text-money-600">{money(order.offeredAmount)}</div>

        {variant === 'feed' ? (
          <div className="flex items-center gap-1.5 text-[13px] text-tg-hint">
            <span>Buyurtmachi:</span>
            <Stars rating={order.buyer.rating} />
          </div>
        ) : order.worker ? (
          <div className="flex items-center gap-1.5 text-[13px] text-tg-hint">
            <span className="truncate max-w-[110px]">{order.worker.firstName}</span>
            <Stars rating={order.worker.rating} />
          </div>
        ) : null}
      </div>
    </Link>
  );
}
