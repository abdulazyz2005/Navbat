import { useCallback, useEffect, useState } from 'react';
import { formatRating, money } from '../lib/format';
import { ApiError, adminApi, type AdminUserRow } from './api';

export function Users() {
  const [items, setItems] = useState<AdminUserRow[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (q: string) => {
    try {
      const result = await adminApi.users(q);
      setItems(result.items);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yuklab bo‘lmadi');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(query), 300);
    return () => clearTimeout(timer);
  }, [query, load]);

  async function toggleBan(user: AdminUserRow) {
    const ok = window.confirm(
      user.isBanned ? 'Blokdan chiqarilsinmi?' : 'Foydalanuvchi bloklansinmi?',
    );
    if (!ok) return;
    try {
      await adminApi.banUser(user.id, !user.isBanned);
      await load(query);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Bajarib bo‘lmadi');
    }
  }

  return (
    <div className="space-y-4">
      <input
        className="input max-w-[360px]"
        placeholder="Ism yoki username bo‘yicha qidirish"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {error ? (
        <div className="rounded-xl border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-[13px] text-danger-600">
          {error}
        </div>
      ) : null}

      {items === null ? (
        <div className="text-[13px] text-tg-hint">Yuklanmoqda…</div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Foydalanuvchi</th>
                <th>Rol</th>
                <th>Reyting</th>
                <th>Buyurtmalar</th>
                <th>Balans</th>
                <th>Holat</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="font-medium">
                      {user.firstName} {user.lastName ?? ''}
                      {user.isAdmin ? ' 🛠' : ''}
                    </div>
                    <div className="text-[12px] text-tg-hint">
                      {user.username ? `@${user.username}` : `ID ${user.telegramId}`}
                    </div>
                  </td>
                  <td className="text-[12px]">{user.roleMode}</td>
                  <td className="text-[12px]">
                    ★ {formatRating(user.rating)} · {user.successRate}%
                  </td>
                  <td className="text-[12px]">
                    {user.completedOrders} tugallangan
                    <br />
                    <span className="text-tg-hint">{user.cancelledOrders} bekor</span>
                  </td>
                  <td className="text-[12px]">
                    {money(user.availableBalance)}
                    <br />
                    <span className="text-tg-hint">escrow: {money(user.pendingBalance)}</span>
                  </td>
                  <td>
                    {user.isBanned ? (
                      <span className="text-[12px] font-medium text-danger-600">Bloklangan</span>
                    ) : (
                      <span className="text-[12px] font-medium text-money-600">Faol</span>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`text-[12px] font-semibold ${
                        user.isBanned ? 'text-money-600' : 'text-danger-600'
                      }`}
                      onClick={() => void toggleBan(user)}
                    >
                      {user.isBanned ? 'Blokdan chiqarish' : 'Bloklash'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
