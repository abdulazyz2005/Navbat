import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth, useViewMode } from '../hooks/useAuth';
import { haptic } from '../lib/telegram';
import { money } from '../lib/format';
import { Avatar } from './ui';

const BUYER_NAV = [
  { to: '/', icon: '🏠', label: 'Bosh' },
  { to: '/orders', icon: '📋', label: 'Buyurtmalar' },
  { to: '/create', icon: '➕', label: 'Yaratish', primary: true },
  { to: '/chats', icon: '💬', label: 'Chat' },
  { to: '/profile', icon: '👤', label: 'Profil' },
];

const WORKER_NAV = [
  { to: '/', icon: '🏠', label: 'Bosh' },
  { to: '/feed', icon: '🔎', label: 'Topshiriqlar' },
  { to: '/availability', icon: '🟢', label: 'Bo‘sh vaqtim', primary: true },
  { to: '/chats', icon: '💬', label: 'Chat' },
  { to: '/profile', icon: '👤', label: 'Profil' },
];

export function Layout({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const [mode, setMode] = useViewMode();
  const navigate = useNavigate();
  const location = useLocation();

  const canSwitch = me?.profile.roleMode === 'BOTH';
  const nav = mode === 'WORKER' ? WORKER_NAV : BUYER_NAV;

  return (
    <div className="mx-auto flex min-h-full max-w-lg flex-col">
      <header className="sticky top-0 z-30 border-b border-tg-border bg-tg-bg backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <button type="button" onClick={() => navigate('/profile')} className="shrink-0">
            <Avatar src={me?.photoUrl} name={me?.firstName ?? '?'} size={36} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold">{me?.firstName ?? 'NAVBAT'}</div>
            <div className="text-[12px] text-tg-hint">
              {mode === 'WORKER'
                ? `Balans: ${money(me?.profile.availableBalance ?? 0)}`
                : 'Buyurtmachi rejimi'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => navigate('/notifications')}
            className="relative shrink-0 rounded-full p-2 text-[18px]"
            aria-label="Bildirishnomalar"
          >
            🔔
            {me && me.unreadNotifications > 0 ? (
              <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {me.unreadNotifications > 9 ? '9+' : me.unreadNotifications}
              </span>
            ) : null}
          </button>
        </div>

        {canSwitch ? (
          <div className="flex gap-1 px-4 pb-3">
            {(
              [
                { key: 'BUYER', label: 'Buyurtmachi' },
                { key: 'WORKER', label: 'Navbat kutuvchi' },
              ] as const
            ).map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  haptic();
                  setMode(option.key);
                  if (location.pathname !== '/') navigate('/');
                }}
                className={`flex-1 rounded-xl px-3 py-2 text-[13px] font-semibold transition ${
                  mode === option.key
                    ? 'bg-brand-500 text-white'
                    : 'bg-tg-card text-tg-hint border border-tg-border'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <main className="flex-1 px-4 py-4 pb-28">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg border-t border-tg-border bg-tg-card backdrop-blur safe-bottom">
        <div className="flex items-stretch justify-around px-1 pt-1.5">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => haptic()}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition ${
                  isActive ? 'text-brand-600' : 'text-tg-hint'
                }`
              }
            >
              <span className={item.primary ? 'text-[22px]' : 'text-[19px]'}>{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
