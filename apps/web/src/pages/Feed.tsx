import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ORDER_CATEGORY_ICONS,
  ORDER_CATEGORY_LABELS,
  type OrderCategory,
  type OrderDTO,
} from '@navbat/shared';
import { api } from '../lib/api';
import { OrderCard } from '../components/OrderCard';
import { EmptyState, SkeletonList } from '../components/ui';
import { haptic } from '../lib/telegram';

const SORTS = [
  { key: 'best_match', label: 'Eng mos' },
  { key: 'nearest', label: 'Eng yaqin' },
  { key: 'highest_pay', label: 'Eng yuqori to‘lov' },
  { key: 'newest', label: 'Eng yangi' },
] as const;

export function Feed() {
  const navigate = useNavigate();
  const [items, setItems] = useState<OrderDTO[] | null>(null);
  const [sort, setSort] = useState<(typeof SORTS)[number]['key']>('best_match');
  const [category, setCategory] = useState<OrderCategory | ''>('');
  const [showAll, setShowAll] = useState(false);
  const [minAmount, setMinAmount] = useState('');
  const [maxDistance, setMaxDistance] = useState('');

  const load = useCallback(() => {
    setItems(null);
    api
      .feed({
        sort,
        category: category || undefined,
        all: showAll ? 'true' : undefined,
        minAmount: minAmount || undefined,
        maxDistanceKm: maxDistance || undefined,
        limit: 30,
      })
      .then((res) => setItems(res.items))
      .catch(() => setItems([]));
  }, [sort, category, showAll, minAmount, maxDistance]);

  useEffect(() => {
    const timer = setTimeout(load, 250); // debounce
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[20px] font-bold">Topshiriqlar</h1>
        <button
          type="button"
          onClick={() => {
            haptic();
            setShowAll((v) => !v);
          }}
          className={`chip border ${
            showAll ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-tg-border text-tg-hint'
          }`}
        >
          {showAll ? 'Barchasi' : 'Faqat mos'}
        </button>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {SORTS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setSort(option.key)}
            className={`chip shrink-0 border ${
              sort === option.key
                ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                : 'border-tg-border bg-tg-card text-tg-hint'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        <button
          type="button"
          onClick={() => setCategory('')}
          className={`chip shrink-0 border ${
            category === '' ? 'border-brand-500 bg-brand-500/10 text-brand-600' : 'border-tg-border bg-tg-card text-tg-hint'
          }`}
        >
          Barchasi
        </button>
        {(Object.keys(ORDER_CATEGORY_LABELS) as OrderCategory[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(category === key ? '' : key)}
            className={`chip shrink-0 border ${
              category === key
                ? 'border-brand-500 bg-brand-500/10 text-brand-600'
                : 'border-tg-border bg-tg-card text-tg-hint'
            }`}
          >
            {ORDER_CATEGORY_ICONS[key]} {ORDER_CATEGORY_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          inputMode="numeric"
          className="field py-2.5 text-[13px]"
          placeholder="Min. to‘lov"
          value={minAmount}
          onChange={(e) => setMinAmount(e.target.value)}
        />
        <input
          type="number"
          inputMode="decimal"
          className="field py-2.5 text-[13px]"
          placeholder="Maks. masofa (km)"
          value={maxDistance}
          onChange={(e) => setMaxDistance(e.target.value)}
        />
      </div>

      {items === null ? (
        <SkeletonList count={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="🔍"
          title="Mos topshiriq yo‘q"
          description="Hozircha sizga mos topshiriqlar topilmadi. Bo‘sh vaqtingizni kengaytirib ko‘ring yoki radiusni oshiring."
          action={
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => navigate('/availability')}
            >
              Bo‘sh vaqtni sozlash
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((order) => (
            <OrderCard key={order.id} order={order} variant="feed" />
          ))}
        </div>
      )}
    </div>
  );
}
