import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ORDER_CATEGORY_ICONS,
  ORDER_CATEGORY_LABELS,
  calculatePrice,
  type OrderCategory,
} from '@navbat/shared';
import { ApiError, api } from '../lib/api';
import { money, todayISO } from '../lib/format';
import { hapticResult, requestLocation, showAlert } from '../lib/telegram';
import { ErrorBox, Spinner } from '../components/ui';

const CATEGORIES = Object.keys(ORDER_CATEGORY_LABELS) as OrderCategory[];

/** Toshkent markazi — lokatsiya berilmasa shu ishlatiladi */
const DEFAULT_COORDS = { latitude: 41.2995, longitude: 69.2401 };

export function CreateOrder() {
  const navigate = useNavigate();
  const [feePercent, setFeePercent] = useState(10);
  const [minAmount, setMinAmount] = useState(10000);

  const [category, setCategory] = useState<OrderCategory>('DOCTOR');
  const [categoryOther, setCategoryOther] = useState('');
  const [title, setTitle] = useState('');
  const [locationName, setLocationName] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(DEFAULT_COORDS);
  const [locating, setLocating] = useState(false);
  const [hasLocation, setHasLocation] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState('14:30');
  const [endTime, setEndTime] = useState('16:00');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(50000);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .config()
      .then((c) => {
        setFeePercent(c.platformFeePercent);
        setMinAmount(c.minOrderAmount);
      })
      .catch(() => undefined);
  }, []);

  const price = useMemo(() => {
    try {
      return calculatePrice(Math.max(1, Math.trunc(amount)), feePercent);
    } catch {
      return { offeredAmount: 0, platformFee: 0, workerAmount: 0, totalAmount: 0, feePercent };
    }
  }, [amount, feePercent]);

  async function useMyLocation() {
    setLocating(true);
    const position = await requestLocation();
    setLocating(false);
    if (!position) {
      showAlert(
        'Joylashuvni olish imkoni bo‘lmadi. Manzilni qo‘lda kiriting — bu majburiy emas.',
      );
      return;
    }
    setCoords(position);
    setHasLocation(true);
    hapticResult('success');
  }

  async function submit() {
    setError(null);

    if (title.trim().length < 3) return setError('Sarlavhani kiriting (kamida 3 belgi).');
    if (locationName.trim().length < 2) return setError('Muassasa nomini kiriting.');
    if (address.trim().length < 2) return setError('Manzilni kiriting.');
    if (amount < minAmount) return setError(`Minimal summa: ${money(minAmount)}`);

    setSubmitting(true);
    try {
      const order = await api.createOrder({
        category,
        categoryOther: category === 'OTHER' ? categoryOther.trim() : undefined,
        title: title.trim(),
        description: description.trim() || undefined,
        locationName: locationName.trim(),
        address: address.trim(),
        latitude: coords.latitude,
        longitude: coords.longitude,
        date,
        startTime,
        endTime,
        offeredAmount: Math.trunc(amount),
      });

      /**
       * To'lov balansdan yechiladi. Balans yetmasa — karta orqali to'lash
       * sahifasiga o'tamiz: u yerda karta raqami va aynan yuborilishi kerak
       * bo'lgan summa ko'rsatiladi.
       */
      try {
        await api.payOrder(order.id);
        hapticResult('success');
        navigate(`/orders/${order.id}`, { replace: true });
      } catch (payError) {
        if (payError instanceof ApiError && payError.code === 'INSUFFICIENT_BALANCE') {
          const details = payError.details as { shortfall?: number } | undefined;
          const shortfall = details?.shortfall ?? Math.trunc(amount);
          navigate(`/pay/${order.id}?amount=${shortfall}`, { replace: true });
          return;
        }
        throw payError;
      }
    } catch (err) {
      hapticResult('error');
      setError(err instanceof ApiError ? err.message : 'Xatolik yuz berdi');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="text-[20px] font-bold">Navbat kerak</h1>

      {error ? <ErrorBox message={error} /> : null}

      <div>
        <label className="label">Xizmat turi</label>
        <div className="grid grid-cols-2 gap-2">
          {CATEGORIES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium transition ${
                category === key
                  ? 'border-brand-500 bg-brand-500/8 text-brand-600'
                  : 'border-tg-border bg-tg-card'
              }`}
            >
              <span>{ORDER_CATEGORY_ICONS[key]}</span>
              <span className="truncate">{ORDER_CATEGORY_LABELS[key]}</span>
            </button>
          ))}
        </div>
        {category === 'OTHER' ? (
          <input
            className="field mt-2"
            placeholder="Qanday xizmat?"
            value={categoryOther}
            onChange={(e) => setCategoryOther(e.target.value)}
            maxLength={60}
          />
        ) : null}
      </div>

      <div>
        <label className="label">Sarlavha</label>
        <input
          className="field"
          placeholder="Masalan: Kardiolog navbati"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
        />
      </div>

      <div className="space-y-3">
        <div>
          <label className="label">Muassasa nomi</label>
          <input
            className="field"
            placeholder="Chilonzor poliklinikasi"
            value={locationName}
            onChange={(e) => setLocationName(e.target.value)}
            maxLength={120}
          />
        </div>
        <div>
          <label className="label">Manzil</label>
          <input
            className="field"
            placeholder="Chilonzor tumani, Bunyodkor ko‘chasi 12"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            maxLength={200}
          />
        </div>
        <button type="button" className="btn-ghost w-full" onClick={useMyLocation} disabled={locating}>
          {locating ? <Spinner /> : hasLocation ? '📍 Joylashuv belgilandi' : '📍 Joylashuvimni ishlatish'}
        </button>
        <p className="text-[12px] leading-relaxed text-tg-hint">
          Joylashuv faqat sizga yaqin navbatchilarni topish uchun ishlatiladi. Ruxsat bermasangiz
          ham buyurtma yaratishingiz mumkin.
        </p>
      </div>

      <div>
        <label className="label">Sana</label>
        <input
          type="date"
          className="field"
          value={date}
          min={todayISO()}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Boshlanish vaqti</label>
          <input
            type="time"
            className="field"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Tugash vaqti</label>
          <input
            type="time"
            className="field"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="label">Izoh</label>
        <textarea
          className="field min-h-[90px] resize-none"
          placeholder="Qaysi oynaga borish kerak, qaysi hujjat kerak..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
        />
      </div>

      <div>
        <label className="label">Taklif qilinayotgan haq</label>
        <div className="relative">
          <input
            type="number"
            inputMode="numeric"
            className="field pr-16"
            value={amount}
            min={minAmount}
            step={5000}
            onChange={(e) => setAmount(Number.parseInt(e.target.value, 10) || 0)}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[13px] text-tg-hint">
            so‘m
          </span>
        </div>
        <div className="mt-2 flex gap-2">
          {[30000, 50000, 70000, 100000].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAmount(value)}
              className="chip flex-1 justify-center border border-tg-border bg-tg-card text-tg-hint"
            >
              {value / 1000}k
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-tg-hint">
          Siz aynan shu summani to‘laysiz. Navbatchiga xizmat haqi ushlangandan keyingi
          summa o‘tkaziladi.
        </p>
      </div>

      <div className="card space-y-2 p-4">
        <Row label="Siz to‘laysiz" value={money(price.totalAmount)} bold />
        <Row label={`Xizmat haqi (${feePercent}%)`} value={`− ${money(price.platformFee)}`} />
        <div className="border-t border-tg-border pt-2">
          <Row label="Navbatchi oladi" value={money(price.workerAmount)} bold />
        </div>
      </div>

      <button type="button" className="btn-primary w-full" onClick={submit} disabled={submitting}>
        {submitting ? <Spinner /> : `To‘lash va e’lon qilish · ${money(price.totalAmount)}`}
      </button>
      <p className="pb-2 text-center text-[12px] leading-relaxed text-tg-hint">
        Pul platformada saqlanadi va navbatchi ishni yakunlab, siz tasdiqlaganingizdan keyin
        unga o‘tkaziladi.
      </p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-[14px] ${bold ? 'font-semibold' : 'text-tg-hint'}`}>{label}</span>
      <span className={`text-[14px] ${bold ? 'text-[16px] font-bold' : 'font-medium'}`}>{value}</span>
    </div>
  );
}
