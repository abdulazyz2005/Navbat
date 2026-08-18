import type { ReactNode } from 'react';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@navbat/shared';
import { formatRating } from '../lib/format';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-label="Yuklanmoqda"
    />
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-tg-hint">
      <Spinner />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card space-y-3 p-4">
      <div className="skeleton h-4 w-2/3" />
      <div className="skeleton h-3 w-1/2" />
      <div className="skeleton h-3 w-1/3" />
      <div className="skeleton h-9 w-full" />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 text-4xl">{icon}</div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-tg-hint">{description}</p>
      {action ? <div className="mt-5 w-full max-w-[240px]">{action}</div> : null}
    </div>
  );
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  DRAFT: 'bg-tg-border text-tg-hint',
  PUBLISHED: 'bg-amber-500/12 text-amber-600',
  MATCHED: 'bg-brand-500/12 text-brand-600',
  IN_PROGRESS: 'bg-brand-500/12 text-brand-600',
  COMPLETION_PENDING: 'bg-purple-500/12 text-purple-600',
  COMPLETED: 'bg-money-500/12 text-money-600',
  CANCELLED: 'bg-tg-border text-tg-hint',
  DISPUTED: 'bg-red-500/12 text-red-600',
  REFUNDED: 'bg-tg-border text-tg-hint',
  EXPIRED: 'bg-tg-border text-tg-hint',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`chip ${STATUS_STYLES[status]}`}>{ORDER_STATUS_LABELS[status]}</span>;
}

export function Stars({ rating, count }: { rating: number; count?: number }) {
  if (rating <= 0) {
    return <span className="text-[13px] text-tg-hint">Yangi</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-[13px] font-medium">
      <span className="text-amber-500">★</span>
      {formatRating(rating)}
      {count !== undefined && count > 0 ? (
        <span className="text-tg-hint">({count})</span>
      ) : null}
    </span>
  );
}

export function Avatar({
  src,
  name,
  size = 40,
}: {
  src?: string | null;
  name: string;
  size?: number;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-brand-500/15 font-semibold text-brand-600"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Yopish"
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div className="relative w-full rounded-t-3xl bg-tg-card p-5 safe-bottom">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-tg-border" />
        <h2 className="mb-4 text-[17px] font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card border-red-500/25 bg-red-500/5 p-4">
      <p className="text-[14px] text-red-600">{message}</p>
      {onRetry ? (
        <button type="button" className="mt-3 text-[13px] font-semibold text-brand-600" onClick={onRetry}>
          Qayta urinish
        </button>
      ) : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: 'money' | 'brand';
}) {
  const color =
    accent === 'money' ? 'text-money-600' : accent === 'brand' ? 'text-brand-600' : 'text-tg-text';
  return (
    <div className="card px-3 py-3">
      <div className={`text-[17px] font-bold leading-tight ${color}`}>{value}</div>
      <div className="mt-0.5 text-[11px] leading-tight text-tg-hint">{label}</div>
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
