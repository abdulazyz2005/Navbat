import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DISPUTE_REASON_LABELS,
  ORDER_CATEGORY_ICONS,
  ORDER_CATEGORY_LABELS,
  PAYMENT_STATUS_LABELS,
  type CheckInDTO,
  type DisputeReason,
  type OrderDTO,
} from '@navbat/shared';
import { ApiError, api } from '../lib/api';
import { clockTime, longDate, money } from '../lib/format';
import { hapticResult, requestLocation, showConfirm } from '../lib/telegram';
import { Avatar, ErrorBox, PageLoader, Sheet, Spinner, Stars, StatusBadge } from '../components/ui';

export function OrderDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [checkIns, setCheckIns] = useState<CheckInDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState<DisputeReason>('WORKER_NO_SHOW');
  const [disputeText, setDisputeText] = useState('');

  const [rateOpen, setRateOpen] = useState(false);
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');

  const [raiseOpen, setRaiseOpen] = useState(false);
  const [newAmount, setNewAmount] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await api.order(id);
      setOrder(data);
      setNewAmount(data.offeredAmount + 10000);
      setError(null);
      if (data.myRole) {
        try {
          setCheckIns((await api.checkIns(id)).items);
        } catch {
          setCheckIns([]);
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yuklab bo‘lmadi');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      hapticResult('success');
      await load();
    } catch (err) {
      hapticResult('error');
      setError(err instanceof ApiError ? err.message : 'Amalni bajarib bo‘lmadi');
    } finally {
      setBusy(false);
    }
  }

  if (error && !order) return <ErrorBox message={error} onRetry={() => void load()} />;
  if (!order) return <PageLoader />;

  const isBuyer = order.myRole === 'BUYER';
  const isWorker = order.myRole === 'WORKER';
  const canAccept = !order.myRole && order.status === 'PUBLISHED';

  return (
    <div className="space-y-4">
      {error ? <ErrorBox message={error} /> : null}

      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12px] text-tg-hint">
              <span>{ORDER_CATEGORY_ICONS[order.category]}</span>
              <span>{order.categoryOther ?? ORDER_CATEGORY_LABELS[order.category]}</span>
            </div>
            <h1 className="mt-1 text-[19px] font-bold leading-tight">{order.title}</h1>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div className="mt-4 space-y-2.5 text-[14px]">
          <Row icon="🏢" label={order.locationName} sub={order.address} />
          <Row icon="📅" label={longDate(order.date)} />
          <Row icon="🕒" label={`${order.startTime} — ${order.endTime}`} />
          {order.description ? <Row icon="📝" label={order.description} /> : null}
        </div>

        <div className="mt-4 rounded-xl bg-money-500/8 p-3.5">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-tg-hint">Navbatchiga</span>
            <span className="text-[19px] font-bold text-money-600">{money(order.offeredAmount)}</span>
          </div>
          {isBuyer ? (
            <>
              <div className="mt-1.5 flex items-center justify-between text-[13px] text-tg-hint">
                <span>Platforma komissiyasi</span>
                <span>{money(order.platformFee)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between border-t border-money-500/20 pt-1.5 text-[14px] font-semibold">
                <span>Jami to‘lov</span>
                <span>{money(order.totalAmount)}</span>
              </div>
            </>
          ) : null}
          {order.payment ? (
            <div className="mt-2 text-[12px] text-tg-hint">
              To‘lov holati: {PAYMENT_STATUS_LABELS[order.payment.status]}
              {order.payment.status === 'HELD' ? ' (platformada saqlanmoqda)' : ''}
            </div>
          ) : null}
        </div>
      </div>

      {/* Ishtirokchilar */}
      <div className="card space-y-3 p-4">
        <Participant
          title="Buyurtmachi"
          name={order.buyer.firstName}
          photo={order.buyer.photoUrl}
          rating={order.buyer.rating}
          ratingCount={order.buyer.ratingCount}
          successRate={order.buyer.successRate}
        />
        {order.worker ? (
          <Participant
            title="Navbatchi"
            name={order.worker.firstName}
            photo={order.worker.photoUrl}
            rating={order.worker.rating}
            ratingCount={order.worker.ratingCount}
            successRate={order.worker.successRate}
          />
        ) : null}
        {order.assignment && order.assignment.matchScore > 0 ? (
          <div className="text-[12px] text-tg-hint">Moslik: {order.assignment.matchScore}%</div>
        ) : null}
      </div>

      {/* Check-in tarixi */}
      {checkIns.length > 0 ? (
        <div className="card p-4">
          <h2 className="mb-2.5 text-[14px] font-semibold">Tasdiqlashlar</h2>
          <div className="space-y-2">
            {checkIns.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-[13px]">
                <span className="text-tg-hint">
                  {c.type === 'ARRIVAL' ? '📍 Yetib keldi' : c.type === 'PERIODIC' ? '✅ Navbatda' : '🏁 Yakunladi'}
                </span>
                <span className="text-tg-hint">
                  {clockTime(c.createdAt)}
                  {c.distanceM !== null ? ` · ${c.distanceM} m` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Amallar */}
      <div className="space-y-2.5">
        {canAccept ? (
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy}
            onClick={async () => {
              const ok = await showConfirm(
                `Ushbu topshiriqni qabul qilasizmi?\n\n${longDate(order.date)}\n${order.startTime}–${order.endTime}\n${money(order.offeredAmount)}`,
              );
              if (ok) void run(() => api.acceptOrder(order.id));
            }}
          >
            {busy ? <Spinner /> : 'Qabul qilish'}
          </button>
        ) : null}

        {isWorker && order.status === 'MATCHED' ? (
          <button
            type="button"
            className="btn-primary w-full"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const location = await requestLocation();
                return api.startOrder(order.id, location ?? undefined);
              })
            }
          >
            {busy ? <Spinner /> : 'Ishni boshlash'}
          </button>
        ) : null}

        {isWorker && order.status === 'IN_PROGRESS' ? (
          <>
            <button
              type="button"
              className="btn-ghost w-full"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const location = await requestLocation();
                  return api.checkIn(order.id, location ?? undefined);
                })
              }
            >
              Hali ham navbatdaman — tasdiqlash
            </button>
            <button
              type="button"
              className="btn-success w-full"
              disabled={busy}
              onClick={() => void run(() => api.completeOrder(order.id))}
            >
              {busy ? <Spinner /> : 'Navbatni topshirdim'}
            </button>
          </>
        ) : null}

        {isBuyer && order.status === 'COMPLETION_PENDING' ? (
          <>
            <div className="card border-purple-500/25 bg-purple-500/5 p-4 text-[13px] leading-relaxed">
              Navbatchi topshiriqni yakunlaganini bildirdi. Tasdiqlaysizmi? Tasdiqlaganingizdan keyin
              to‘lov navbatchiga o‘tkaziladi.
            </div>
            <button
              type="button"
              className="btn-success w-full"
              disabled={busy}
              onClick={() => void run(() => api.confirmOrder(order.id))}
            >
              {busy ? <Spinner /> : 'Tasdiqlash'}
            </button>
            <button
              type="button"
              className="btn-danger w-full"
              onClick={() => setDisputeOpen(true)}
            >
              Muammo bor
            </button>
          </>
        ) : null}

        {isBuyer && order.status === 'PUBLISHED' ? (
          <>
            <div className="card p-4 text-[13px] leading-relaxed text-tg-hint">
              Hozircha navbatchi topilmadi. Taklifingizni oshirsangiz, topshiriq tezroq qabul
              qilinishi mumkin.
            </div>
            <button type="button" className="btn-ghost w-full" onClick={() => setRaiseOpen(true)}>
              Taklifni oshirish
            </button>
          </>
        ) : null}

        {(isBuyer && ['DRAFT', 'PUBLISHED', 'MATCHED'].includes(order.status)) ||
        (isWorker && ['MATCHED', 'IN_PROGRESS'].includes(order.status)) ? (
          <button
            type="button"
            className="btn-danger w-full"
            disabled={busy}
            onClick={async () => {
              const ok = await showConfirm(
                isWorker
                  ? 'Topshiriqdan voz kechasizmi? Bu bekor qilish ko‘rsatkichingizga ta’sir qiladi.'
                  : 'Buyurtmani bekor qilasizmi? To‘lov balansingizga qaytariladi.',
              );
              if (ok) void run(() => api.cancelOrder(order.id));
            }}
          >
            Bekor qilish
          </button>
        ) : null}

        {isBuyer && ['MATCHED', 'IN_PROGRESS'].includes(order.status) ? (
          <button type="button" className="btn-ghost w-full" onClick={() => setDisputeOpen(true)}>
            Muammo bor
          </button>
        ) : null}

        {order.status === 'COMPLETED' && order.myRole && !order.hasRated ? (
          <button type="button" className="btn-primary w-full" onClick={() => setRateOpen(true)}>
            Baholash
          </button>
        ) : null}

        {order.worker && order.myRole ? (
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => navigate(`/chat/${order.id}`)}
          >
            💬 Chat
          </button>
        ) : null}
      </div>

      {order.dispute ? (
        <div className="card border-red-500/25 bg-red-500/5 p-4">
          <div className="text-[14px] font-semibold text-red-600">Nizo ochilgan</div>
          <p className="mt-1 text-[13px] text-tg-hint">
            Sabab: {DISPUTE_REASON_LABELS[order.dispute.reason]}. Administrator ko‘rib chiqmoqda,
            to‘lov shu vaqtgacha saqlanib turadi.
          </p>
        </div>
      ) : null}

      {/* Nizo oynasi */}
      <Sheet open={disputeOpen} onClose={() => setDisputeOpen(false)} title="Muammo bor">
        <div className="space-y-2">
          {(Object.keys(DISPUTE_REASON_LABELS) as DisputeReason[]).map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => setDisputeReason(reason)}
              className={`w-full rounded-xl border px-4 py-3 text-left text-[14px] ${
                disputeReason === reason
                  ? 'border-brand-500 bg-brand-500/8 text-brand-600'
                  : 'border-tg-border'
              }`}
            >
              {DISPUTE_REASON_LABELS[reason]}
            </button>
          ))}
        </div>
        <textarea
          className="field mt-3 min-h-[80px] resize-none"
          placeholder="Qisqacha tushuntiring..."
          value={disputeText}
          onChange={(e) => setDisputeText(e.target.value)}
          maxLength={1000}
        />
        <button
          type="button"
          className="btn-danger mt-3 w-full"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api.openDispute(order.id, disputeReason, disputeText.trim() || undefined);
              setDisputeOpen(false);
            })
          }
        >
          {busy ? <Spinner /> : 'Nizo ochish'}
        </button>
      </Sheet>

      {/* Baholash oynasi */}
      <Sheet open={rateOpen} onClose={() => setRateOpen(false)} title="Baholang">
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStars(value)}
              className={`text-4xl transition ${value <= stars ? 'text-amber-500' : 'text-tg-border'}`}
              aria-label={`${value} yulduz`}
            >
              ★
            </button>
          ))}
        </div>
        <textarea
          className="field mt-4 min-h-[80px] resize-none"
          placeholder="Izoh (ixtiyoriy)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
        />
        <button
          type="button"
          className="btn-primary mt-3 w-full"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api.rateOrder(order.id, stars, comment.trim() || undefined);
              setRateOpen(false);
            })
          }
        >
          {busy ? <Spinner /> : 'Yuborish'}
        </button>
      </Sheet>

      {/* Taklifni oshirish */}
      <Sheet open={raiseOpen} onClose={() => setRaiseOpen(false)} title="Taklifni oshirish">
        <p className="mb-3 text-[13px] leading-relaxed text-tg-hint">
          Hozirgi taklif: {money(order.offeredAmount)}. Yangi summa yuqoriroq bo‘lishi kerak.
        </p>
        <input
          type="number"
          inputMode="numeric"
          className="field"
          value={newAmount}
          step={5000}
          onChange={(e) => setNewAmount(Number.parseInt(e.target.value, 10) || 0)}
        />
        <div className="mt-2 flex gap-2">
          {[10000, 20000, 30000].map((delta) => (
            <button
              key={delta}
              type="button"
              className="chip flex-1 justify-center border border-tg-border text-tg-hint"
              onClick={() => setNewAmount(order.offeredAmount + delta)}
            >
              +{delta / 1000}k
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn-primary mt-4 w-full"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await api.raisePrice(order.id, newAmount);
              setRaiseOpen(false);
            })
          }
        >
          {busy ? <Spinner /> : 'Tasdiqlash'}
        </button>
      </Sheet>
    </div>
  );
}

function Row({ icon, label, sub }: { icon: string; label: string; sub?: string }) {
  return (
    <div className="flex gap-2.5">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="leading-snug">{label}</div>
        {sub ? <div className="mt-0.5 text-[13px] text-tg-hint">{sub}</div> : null}
      </div>
    </div>
  );
}

function Participant({
  title,
  name,
  photo,
  rating,
  ratingCount,
  successRate,
}: {
  title: string;
  name: string;
  photo: string | null;
  rating: number;
  ratingCount: number;
  successRate: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar src={photo} name={name} size={40} />
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-tg-hint">{title}</div>
        <div className="truncate text-[14px] font-semibold">{name}</div>
      </div>
      <div className="text-right">
        <Stars rating={rating} count={ratingCount} />
        <div className="text-[11px] text-tg-hint">{successRate}% muvaffaqiyat</div>
      </div>
    </div>
  );
}
