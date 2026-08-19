import type { AdminStats } from '@navbat/shared';
import { formatRating, money } from '../lib/format';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[12px] text-tg-hint">{label}</div>
      <div className="mt-1 text-[22px] font-bold leading-tight">{value}</div>
      {hint ? <div className="mt-1 text-[12px] text-tg-hint">{hint}</div> : null}
    </div>
  );
}

export function Overview({ stats }: { stats: AdminStats | null }) {
  if (!stats) return <div className="text-[13px] text-tg-hint">Yuklanmoqda…</div>;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-[15px] font-semibold">Pul</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="GMV (aylanma)" value={money(stats.gmv)} />
          <Tile label="Platforma daromadi" value={money(stats.platformRevenue)} hint="10% xizmat haqi" />
          <Tile label="Escrowda turibdi" value={money(stats.heldPayments)} hint="hali chiqarilmagan" />
          <Tile label="Qaytarilgan" value={money(stats.refundedPayments)} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold">Buyurtmalar</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Bugun" value={String(stats.ordersToday)} />
          <Tile label="Shu hafta" value={String(stats.ordersThisWeek)} />
          <Tile label="Tugallangan" value={String(stats.completedOrders)} />
          <Tile
            label="Bekor qilish darajasi"
            value={`${stats.cancellationRate}%`}
            hint={`${stats.cancelledOrders} ta bekor qilingan`}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold">Odamlar va sifat</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Foydalanuvchilar" value={String(stats.totalUsers)} hint={`${stats.activeUsers} faol (30 kun)`} />
          <Tile label="O‘rtacha reyting" value={formatRating(stats.averageWorkerRating)} />
          <Tile label="Ochiq nizolar" value={String(stats.openDisputes)} />
          <Tile label="Pul chiqarish so‘rovi" value={String(stats.pendingWithdrawals)} />
        </div>
      </section>
    </div>
  );
}
