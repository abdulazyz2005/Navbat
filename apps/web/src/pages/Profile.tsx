import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { RatingDTO } from '@navbat/shared';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { formatRating, money, timeAgo } from '../lib/format';
import { Avatar, ErrorBox, Section, Spinner, StatTile } from '../components/ui';
import { haptic, hapticResult } from '../lib/telegram';

const ROLE_LABELS: Record<string, string> = {
  BUYER: 'Buyurtmachi',
  WORKER: 'Navbat kutuvchi',
  BOTH: 'Ikkalasi ham',
};

export function Profile() {
  const { me, setRoleMode, refresh } = useAuth();
  const navigate = useNavigate();
  const [ratings, setRatings] = useState<RatingDTO[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!me) return;
    api
      .userRatings(me.id)
      .then((res) => setRatings(res.items))
      .catch(() => setRatings([]));
  }, [me]);

  if (!me) return <Spinner />;

  const p = me.profile;

  return (
    <div className="space-y-6">
      <div className="card flex items-center gap-4 p-5">
        <Avatar src={me.photoUrl} name={me.firstName} size={64} />
        <div className="min-w-0">
          <div className="truncate text-[18px] font-bold">
            {me.firstName} {me.lastName ?? ''}
          </div>
          {me.username ? <div className="text-[13px] text-tg-hint">@{me.username}</div> : null}
          <div className="mt-1 text-[14px]">
            <span className="text-amber-500">★</span> {formatRating(p.rating)}
            <span className="ml-1 text-[12px] text-tg-hint">({p.ratingCount} baho)</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatTile label="Tugallangan" value={String(p.completedOrders)} accent="brand" />
        <StatTile label="Bekor qilingan" value={String(p.cancelledOrders)} />
        <StatTile label="Muvaffaqiyat" value={`${p.successRate}%`} accent="money" />
        <StatTile label="Ishlab topilgan" value={money(p.totalEarned).replace(' so‘m', '')} accent="money" />
      </div>

      <Section title="Rejim">
        <div className="space-y-2">
          {(['BUYER', 'WORKER', 'BOTH'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={saving}
              onClick={async () => {
                haptic();
                setSaving(true);
                try {
                  await setRoleMode(mode);
                } finally {
                  setSaving(false);
                }
              }}
              className={`w-full rounded-xl border px-4 py-3 text-left text-[14px] font-medium ${
                p.roleMode === mode
                  ? 'border-brand-500 bg-brand-500/8 text-brand-600'
                  : 'border-tg-border bg-tg-card'
              }`}
            >
              {ROLE_LABELS[mode]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Pul olish uchun karta">
        <CardSettings />
      </Section>

      <Section title="Hisob">
        <div className="space-y-2">
          <MenuItem label="💰 Balans va to‘lovlar" onClick={() => navigate('/balance')} />
          <MenuItem label="🔔 Bildirishnomalar" onClick={() => navigate('/notifications')} />
          <MenuItem label="⚖️ Nizolarim" onClick={() => navigate('/disputes')} />
          <MenuItem label="🔄 Yangilash" onClick={() => void refresh()} />
        </div>
      </Section>

      {ratings.length > 0 ? (
        <Section title="Sizga berilgan baholar">
          <div className="space-y-2">
            {ratings.slice(0, 10).map((rating) => (
              <div key={rating.id} className="card p-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Avatar src={rating.fromUser.photoUrl} name={rating.fromUser.firstName} size={28} />
                    <span className="text-[13px] font-medium">{rating.fromUser.firstName}</span>
                  </div>
                  <div className="text-[13px]">
                    <span className="text-amber-500">{'★'.repeat(rating.rating)}</span>
                    <span className="text-tg-border">{'★'.repeat(5 - rating.rating)}</span>
                  </div>
                </div>
                {rating.comment ? (
                  <p className="mt-2 text-[13px] leading-relaxed text-tg-hint">{rating.comment}</p>
                ) : null}
                <div className="mt-1.5 text-[11px] text-tg-hint">{timeAgo(rating.createdAt)}</div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <p className="pb-4 text-center text-[11px] leading-relaxed text-tg-hint">
        NAVBAT — fuqarolar o‘rtasidagi qonuniy xizmat kelishuvi platformasi.
        <br />
        Rasmiy davlat navbat tizimlari o‘rnini bosmaydi.
        <br />
        <Link to="/legal" className="text-brand-600">
          Batafsil
        </Link>
      </p>
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card flex w-full items-center justify-between p-4 text-left text-[14px] font-medium"
    >
      {label}
      <span className="text-tg-hint">›</span>
    </button>
  );
}

export function Legal() {
  return (
    <div className="space-y-4">
      <h1 className="text-[20px] font-bold">Platforma haqida</h1>
      <div className="card space-y-3 p-4 text-[14px] leading-relaxed">
        <p>
          NAVBAT — bu ikki fuqaro o‘rtasidagi qonuniy xizmat kelishuvini tashkil qiluvchi platforma:
          buyurtmachi va navbat kutuvchi.
        </p>
        <p className="font-semibold">Platforma quyidagilarni qilmaydi:</p>
        <ul className="list-inside list-disc space-y-1.5 text-tg-hint">
          <li>Davlatning rasmiy navbat tizimini almashtirmaydi</li>
          <li>Rasmiy elektron talonni boshqa shaxsga o‘tkazishni avtomatlashtirmaydi</li>
          <li>Davlat tizimlariga avtomatlashtirilgan kirish qilmaydi</li>
          <li>Login/parol yoki shaxsiy tibbiy ma’lumotlarni so‘ramaydi</li>
        </ul>
        <p>
          Platforma faqat qonuniy tarzda bajarilishi mumkin bo‘lgan jismoniy kutish va yordam
          xizmatlarini bir-biriga moslashtiradi.
        </p>
        <p className="font-semibold">Joylashuv ma’lumotlari</p>
        <p className="text-tg-hint">
          Joylashuv faqat sizning ruxsatingiz bilan olinadi va faqat ikki maqsadda ishlatiladi:
          mos topshiriqlarni topish va topshiriq bajarilganini tasdiqlash (check-in).
        </p>
      </div>
    </div>
  );
}

/**
 * Navbatchi ishlagan pulini shu kartaga oladi.
 * Karta faqat egasiga va to'lovni amalga oshiruvchi adminga ko'rinadi.
 */
function CardSettings() {
  const { me, refresh } = useAuth();
  const [card, setCard] = useState(me?.profile.cardNumber ?? '');
  const [holder, setHolder] = useState(me?.profile.cardHolder ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    const digits = card.replace(/\D/g, '');
    if (digits.length !== 16) {
      setError('Karta raqami 16 ta raqamdan iborat bo‘lishi kerak.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateMe({ cardNumber: digits, cardHolder: holder.trim() });
      await refresh();
      setSaved(true);
      hapticResult('success');
    } catch (err) {
      hapticResult('error');
      setError(err instanceof ApiError ? err.message : 'Saqlab bo‘lmadi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card space-y-2 p-4">
      {error ? <ErrorBox message={error} /> : null}
      <label className="label">Karta raqami</label>
      <input
        className="input font-mono"
        value={card}
        onChange={(event) => setCard(event.target.value)}
        placeholder="8600 1234 5678 9012"
        inputMode="numeric"
      />
      <label className="label">Karta egasi</label>
      <input
        className="input"
        value={holder}
        onChange={(event) => setHolder(event.target.value)}
        placeholder="ISM FAMILIYA"
      />
      <button type="button" className="btn btn-primary w-full py-3" onClick={() => void save()} disabled={saving}>
        {saving ? 'Saqlanmoqda…' : 'Saqlash'}
      </button>
      {saved ? <div className="text-center text-[13px] text-money-600">Saqlandi ✓</div> : null}
      <p className="text-[12px] leading-relaxed text-tg-hint">
        Pul yechish so‘rovi yuborganingizda summa shu kartaga o‘tkaziladi.
      </p>
    </div>
  );
}
