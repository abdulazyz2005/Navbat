import { useEffect, useState } from 'react';
import { ApiError, adminApi, type PlatformCard } from './api';

/**
 * To'lov qabul qilinadigan karta. Foydalanuvchilar shu kartaga pul yuboradi,
 * shuning uchun o'zgartirish darhol kuchga kiradi (deploy kerak emas).
 */
export function Settings() {
  const [card, setCard] = useState<PlatformCard | null>(null);
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [bank, setBank] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const result = await adminApi.settings();
        setCard(result.card);
        if (result.card) {
          setCardNumber(result.card.cardNumber);
          setCardHolder(result.card.cardHolder);
          setBank(result.card.bank ?? '');
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Yuklab bo‘lmadi');
      }
    })();
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await adminApi.saveCard({ cardNumber, cardHolder, bank });
      setCard(result.card);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Saqlab bo‘lmadi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[520px] space-y-4">
      <div className="card p-5">
        <h2 className="text-[16px] font-semibold">To‘lov qabul qilinadigan karta</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-tg-hint">
          Buyurtmachilar shu kartaga pul yuboradi. Har bir to‘lovga tizim unikal summa beradi —
          shu tufayli qaysi pul kimdan kelgani aniq bo‘ladi.
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-[13px] text-danger-600">
            {error}
          </div>
        ) : null}

        <label className="label mt-4">Karta raqami (16 raqam)</label>
        <input
          className="input font-mono"
          value={cardNumber}
          onChange={(event) => setCardNumber(event.target.value)}
          placeholder="8600 1234 5678 9012"
          inputMode="numeric"
        />

        <label className="label mt-3">Karta egasi</label>
        <input
          className="input"
          value={cardHolder}
          onChange={(event) => setCardHolder(event.target.value)}
          placeholder="ABDULAZIZ ..."
        />

        <label className="label mt-3">Bank (ixtiyoriy)</label>
        <input
          className="input"
          value={bank}
          onChange={(event) => setBank(event.target.value)}
          placeholder="Uzcard / Humo / Kapitalbank"
        />

        <button
          type="button"
          className="btn btn-primary mt-5 w-full py-3"
          onClick={() => void save()}
          disabled={busy}
        >
          {busy ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>

        {saved ? <div className="mt-3 text-center text-[13px] text-money-600">Saqlandi ✓</div> : null}

        {card ? (
          <div className="mt-4 rounded-xl bg-tg-bg p-3 text-[13px]">
            Hozirgi karta: <span className="font-mono">{card.formatted ?? card.cardNumber}</span>
            <br />
            <span className="text-tg-hint">{card.cardHolder}</span>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-warn-500/40 bg-warn-500/10 p-3 text-[13px]">
            Karta hali sozlanmagan — foydalanuvchilar to‘lov qila olmaydi.
          </div>
        )}
      </div>
    </div>
  );
}
