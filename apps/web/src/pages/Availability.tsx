import { useEffect, useState } from 'react';
import type { AvailabilityDTO } from '@navbat/shared';
import { ApiError, api } from '../lib/api';
import { money, relativeDate, todayISO } from '../lib/format';
import { hapticResult, requestLocation, showAlert, showConfirm } from '../lib/telegram';
import { EmptyState, ErrorBox, SkeletonList, Spinner } from '../components/ui';

const DISTRICTS = [
  { name: 'Chilonzor', latitude: 41.2756, longitude: 69.2034 },
  { name: 'Yunusobod', latitude: 41.3651, longitude: 69.2895 },
  { name: 'Mirzo Ulug‘bek', latitude: 41.3386, longitude: 69.3344 },
  { name: 'Sergeli', latitude: 41.2242, longitude: 69.2202 },
  { name: 'Yakkasaroy', latitude: 41.2856, longitude: 69.2536 },
  { name: 'Shayxontohur', latitude: 41.3244, longitude: 69.2286 },
];

const RADIUS_OPTIONS = [3, 5, 10];

export function Availability() {
  const [items, setItems] = useState<AvailabilityDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState('13:00');
  const [endTime, setEndTime] = useState('18:00');
  const [district, setDistrict] = useState(DISTRICTS[0]);
  const [radiusKm, setRadiusKm] = useState(5);
  const [minimumAmount, setMinimumAmount] = useState(30000);
  const [locating, setLocating] = useState(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  async function load() {
    try {
      setItems((await api.availability()).items);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function useMyLocation() {
    setLocating(true);
    const position = await requestLocation();
    setLocating(false);
    if (!position) {
      showAlert('Joylashuvni olish imkoni bo‘lmadi. Tumanni ro‘yxatdan tanlang.');
      return;
    }
    setCoords(position);
    hapticResult('success');
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.createAvailability({
        date,
        startTime,
        endTime,
        locationName: coords ? 'Mening joylashuvim' : district.name,
        latitude: coords?.latitude ?? district.latitude,
        longitude: coords?.longitude ?? district.longitude,
        radiusKm,
        minimumAmount,
      });
      hapticResult('success');
      await load();
    } catch (err) {
      hapticResult('error');
      setError(err instanceof ApiError ? err.message : 'Saqlab bo‘lmadi');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    const ok = await showConfirm('Bu bo‘sh vaqtni o‘chirasizmi?');
    if (!ok) return;
    await api.deleteAvailability(id);
    await load();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-[20px] font-bold">Bo‘sh vaqtim</h1>
      {error ? <ErrorBox message={error} /> : null}

      <div className="card space-y-4 p-4">
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
            <label className="label">Boshlanish</label>
            <input
              type="time"
              className="field"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Tugash</label>
            <input
              type="time"
              className="field"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label">Hudud</label>
          <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {DISTRICTS.map((option) => (
              <button
                key={option.name}
                type="button"
                onClick={() => {
                  setDistrict(option);
                  setCoords(null);
                }}
                className={`chip shrink-0 border ${
                  !coords && district.name === option.name
                    ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                    : 'border-tg-border bg-tg-card text-tg-hint'
                }`}
              >
                {option.name}
              </button>
            ))}
          </div>
          <button type="button" className="btn-ghost mt-2 w-full" onClick={useMyLocation} disabled={locating}>
            {locating ? <Spinner /> : coords ? '📍 Joylashuv belgilandi' : '📍 Joylashuvimni ishlatish'}
          </button>
        </div>

        <div>
          <label className="label">Radius</label>
          <div className="flex gap-2">
            {RADIUS_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRadiusKm(value)}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-[13px] font-semibold ${
                  radiusKm === value
                    ? 'border-brand-500 bg-brand-500/8 text-brand-600'
                    : 'border-tg-border bg-tg-card text-tg-hint'
                }`}
              >
                {value} km
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Minimal to‘lov</label>
          <input
            type="number"
            inputMode="numeric"
            className="field"
            value={minimumAmount}
            step={5000}
            min={0}
            onChange={(e) => setMinimumAmount(Number.parseInt(e.target.value, 10) || 0)}
          />
        </div>

        <button type="button" className="btn-success w-full" onClick={save} disabled={saving}>
          {saving ? <Spinner /> : '🟢 Bo‘sh vaqtimni saqlash'}
        </button>
        <p className="text-[12px] leading-relaxed text-tg-hint">
          Joylashuv faqat sizga yaqin topshiriqlarni topish uchun ishlatiladi.
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="px-1 text-[15px] font-semibold">Belgilangan vaqtlar</h2>
        {items === null ? (
          <SkeletonList count={2} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="🕒"
            title="Bo‘sh vaqt belgilanmagan"
            description="Bo‘sh vaqtingizni belgilang — sizga mos topshiriqlar avtomatik chiqadi."
          />
        ) : (
          items.map((item) => (
            <div key={item.id} className="card flex items-center justify-between p-4">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold">
                  {relativeDate(item.date)} · {item.startTime}–{item.endTime}
                </div>
                <div className="mt-0.5 truncate text-[12px] text-tg-hint">
                  {item.locationName} · {item.radiusKm} km · min {money(item.minimumAmount)}
                </div>
                <div className="mt-1 text-[12px] font-medium text-brand-600">
                  {item.matchingOrders ?? 0} ta mos topshiriq
                </div>
              </div>
              <button
                type="button"
                onClick={() => void remove(item.id)}
                className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-semibold text-red-600"
              >
                O‘chirish
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
