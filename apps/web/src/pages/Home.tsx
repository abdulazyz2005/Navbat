import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ACTIVE_ORDER_STATUSES, type AvailabilityDTO, type OrderDTO } from '@navbat/shared';
import { api } from '../lib/api';
import { useAuth, useViewMode } from '../hooks/useAuth';
import { money, relativeDate } from '../lib/format';
import { OrderCard } from '../components/OrderCard';
import { EmptyState, Section, SkeletonList, StatTile } from '../components/ui';

export function Home() {
  const [mode] = useViewMode();
  return mode === 'WORKER' ? <WorkerHome /> : <BuyerHome />;
}

/* ------------------------------------------------------------ buyurtmachi */

function BuyerHome() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);

  useEffect(() => {
    api
      .myOrders('buyer')
      .then((res) => setOrders(res.items))
      .catch(() => setOrders([]));
  }, []);

  const active = (orders ?? []).filter((o) =>
    (ACTIVE_ORDER_STATUSES as readonly string[]).includes(o.status),
  );
  const completed = (orders ?? []).filter((o) => o.status === 'COMPLETED');

  return (
    <div className="space-y-6">
      <div className="card bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white border-transparent">
        <h1 className="text-[20px] font-bold">Navbat kerakmi?</h1>
        <p className="mt-1 text-[13px] leading-relaxed opacity-90">
          O‘rningizga navbatda kutadigan odam topamiz.
        </p>
        <button
          type="button"
          onClick={() => navigate('/create')}
          className="btn mt-4 w-full bg-white px-5 py-3.5 text-[15px] text-brand-600"
        >
          ➕ Navbat topish
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Faol buyurtmalar" value={String(active.length)} accent="brand" />
        <StatTile label="Tugallangan" value={String(completed.length)} />
        <StatTile
          label="Jami sarflangan"
          value={money(me?.profile.totalSpent ?? 0).replace(' so‘m', '')}
        />
      </div>

      <Section
        title="Faol buyurtmalar"
        action={
          <Link to="/orders" className="text-[13px] font-semibold text-brand-600">
            Barchasi
          </Link>
        }
      >
        {orders === null ? (
          <SkeletonList count={2} />
        ) : active.length === 0 ? (
          <EmptyState
            icon="📭"
            title="Hali buyurtma yaratmagansiz"
            description="Navbat kerak bo‘lganda buyurtma yarating — sizga mos navbatchi topiladi."
            action={
              <button type="button" className="btn-primary w-full" onClick={() => navigate('/create')}>
                + Navbat kerak
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {active.slice(0, 5).map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* -------------------------------------------------------------- navbatchi */

function WorkerHome() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [availability, setAvailability] = useState<AvailabilityDTO[] | null>(null);
  const [matching, setMatching] = useState<OrderDTO[] | null>(null);
  const [active, setActive] = useState<OrderDTO[] | null>(null);

  useEffect(() => {
    api
      .availability()
      .then((res) => setAvailability(res.items))
      .catch(() => setAvailability([]));
    api
      .feed({ limit: 5 })
      .then((res) => setMatching(res.items))
      .catch(() => setMatching([]));
    api
      .myOrders('worker', 'ACTIVE')
      .then((res) => setActive(res.items))
      .catch(() => setActive([]));
  }, []);

  const hasAvailability = (availability ?? []).length > 0;

  return (
    <div className="space-y-6">
      <div className="card bg-gradient-to-br from-money-500 to-money-600 p-5 text-white border-transparent">
        <h1 className="text-[20px] font-bold">Bugun bo‘shmisiz?</h1>
        <p className="mt-1 text-[13px] leading-relaxed opacity-90">
          Bo‘sh vaqtingizni belgilang — sizga mos topshiriqlar chiqadi.
        </p>
        <button
          type="button"
          onClick={() => navigate('/availability')}
          className="btn mt-4 w-full bg-white px-5 py-3.5 text-[15px] text-money-600"
        >
          🟢 Bo‘sh vaqtimni ko‘rsatish
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="Reyting"
          value={me && me.profile.rating > 0 ? `★ ${(me.profile.rating / 100).toFixed(1)}` : '—'}
          accent="brand"
        />
        <StatTile label="Topshiriqlar" value={String(me?.profile.completedOrders ?? 0)} />
        <StatTile
          label="Ishlab topilgan"
          value={money(me?.profile.totalEarned ?? 0).replace(' so‘m', '')}
          accent="money"
        />
      </div>

      {active && active.length > 0 ? (
        <Section title="Faol topshiriqlaringiz">
          <div className="space-y-3">
            {active.map((order) => (
              <OrderCard key={order.id} order={order} variant="worker" />
            ))}
          </div>
        </Section>
      ) : null}

      {hasAvailability ? (
        <Section
          title="Bo‘sh vaqtlaringiz"
          action={
            <Link to="/availability" className="text-[13px] font-semibold text-brand-600">
              Boshqarish
            </Link>
          }
        >
          <div className="space-y-2">
            {(availability ?? []).slice(0, 3).map((a) => (
              <div key={a.id} className="card flex items-center justify-between p-3.5">
                <div>
                  <div className="text-[14px] font-semibold">
                    {relativeDate(a.date)} · {a.startTime}–{a.endTime}
                  </div>
                  <div className="mt-0.5 text-[12px] text-tg-hint">
                    {a.locationName} · {a.radiusKm} km · min {money(a.minimumAmount)}
                  </div>
                </div>
                <span className="chip bg-brand-500/12 text-brand-600">
                  {a.matchingOrders ?? 0} mos
                </span>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        title="Sizga mos topshiriqlar"
        action={
          <Link to="/feed" className="text-[13px] font-semibold text-brand-600">
            Barchasi
          </Link>
        }
      >
        {matching === null ? (
          <SkeletonList count={2} />
        ) : matching.length === 0 ? (
          <EmptyState
            icon="🔍"
            title="Hozircha mos topshiriqlar topilmadi"
            description={
              hasAvailability
                ? 'Bo‘sh vaqtingizni kengaytirib ko‘ring yoki radiusni oshiring.'
                : 'Avval bo‘sh vaqtingizni belgilang — shundan keyin mos topshiriqlar chiqadi.'
            }
            action={
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => navigate(hasAvailability ? '/feed' : '/availability')}
              >
                {hasAvailability ? 'Barcha topshiriqlar' : 'Bo‘sh vaqtimni belgilash'}
              </button>
            }
          />
        ) : (
          <div className="space-y-3">
            {matching.map((order) => (
              <OrderCard key={order.id} order={order} variant="feed" />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
