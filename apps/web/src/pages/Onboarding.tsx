import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { haptic, hapticResult } from '../lib/telegram';
import { Spinner } from '../components/ui';

const CHOICES = [
  {
    key: 'BUYER' as const,
    icon: '⏳',
    title: 'Menga navbat kerak',
    description: 'Vaqtingiz yo‘q — o‘rningizga navbatda kutadigan odam topamiz.',
  },
  {
    key: 'WORKER' as const,
    icon: '💰',
    title: 'Navbat kutib pul ishlayman',
    description: 'Bo‘sh vaqtingizni belgilang va sizga mos topshiriqlarni oling.',
  },
  {
    key: 'BOTH' as const,
    icon: '🔄',
    title: 'Ikkalasidan ham foydalanaman',
    description: 'Ikkala rejim ham ochiladi, istalgan vaqtda almashtirasiz.',
  },
];

export function Onboarding() {
  const { me, completeOnboarding } = useAuth();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<'BUYER' | 'WORKER' | 'BOTH' | null>(null);
  const [saving, setSaving] = useState(false);

  async function finish() {
    if (!selected) return;
    setSaving(true);
    try {
      await completeOnboarding(selected);
      hapticResult('success');
    } finally {
      setSaving(false);
    }
  }

  if (step === 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-between px-6 py-10">
        <div className="flex flex-1 flex-col justify-center text-center">
          <div className="mb-6 text-6xl">⏱</div>
          <h1 className="text-[26px] font-bold leading-tight">
            NAVBATga xush kelibsiz{me ? `, ${me.firstName}` : ''}
          </h1>

          <div className="mt-8 space-y-4 text-left">
            <div className="card p-4">
              <div className="text-[15px] font-semibold">Vaqtingiz yo‘qmi?</div>
              <p className="mt-1 text-[13px] leading-relaxed text-tg-hint">
                Navbatda siz uchun kutadigan odam toping.
              </p>
            </div>
            <div className="card p-4">
              <div className="text-[15px] font-semibold">Bo‘sh vaqtingiz bormi?</div>
              <p className="mt-1 text-[13px] leading-relaxed text-tg-hint">
                Boshqalar uchun navbat kutib pul ishlang.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn-primary mt-8 w-full"
          onClick={() => {
            haptic();
            setStep(1);
          }}
        >
          Boshlash
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-between px-6 py-10">
      <div>
        <h1 className="text-[22px] font-bold">Sizga qaysi biri kerak?</h1>
        <p className="mt-1.5 text-[14px] text-tg-hint">Keyinchalik o‘zgartirishingiz mumkin.</p>

        <div className="mt-6 space-y-3">
          {CHOICES.map((choice) => (
            <button
              key={choice.key}
              type="button"
              onClick={() => {
                haptic();
                setSelected(choice.key);
              }}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                selected === choice.key
                  ? 'border-brand-500 bg-brand-500/8'
                  : 'border-tg-border bg-tg-card'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{choice.icon}</span>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold">{choice.title}</div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-tg-hint">
                    {choice.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="btn-primary mt-8 w-full"
        disabled={!selected || saving}
        onClick={finish}
      >
        {saving ? <Spinner /> : 'Davom etish'}
      </button>
    </div>
  );
}
