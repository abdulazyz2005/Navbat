import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { MessageDTO, OrderDTO } from '@navbat/shared';
import { api } from '../lib/api';
import { clockTime, relativeDate } from '../lib/format';
import { haptic } from '../lib/telegram';
import { Avatar, EmptyState, PageLoader, SkeletonList } from '../components/ui';

/** Chat ro'yxati — navbatchi topilgan buyurtmalar */
export function ChatList() {
  const [orders, setOrders] = useState<OrderDTO[] | null>(null);

  useEffect(() => {
    Promise.all([api.myOrders('buyer'), api.myOrders('worker')])
      .then(([buyer, worker]) => {
        const all = [...buyer.items, ...worker.items].filter((o) => o.worker);
        const unique = new Map(all.map((o) => [o.id, o]));
        setOrders([...unique.values()]);
      })
      .catch(() => setOrders([]));
  }, []);

  if (orders === null) return <SkeletonList count={3} />;

  return (
    <div className="space-y-4">
      <h1 className="text-[20px] font-bold">Chat</h1>
      {orders.length === 0 ? (
        <EmptyState
          icon="💬"
          title="Chat yo‘q"
          description="Chat navbatchi topilgandan keyin ochiladi."
        />
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const partner = order.myRole === 'BUYER' ? order.worker : order.buyer;
            return (
              <Link key={order.id} to={`/chat/${order.id}`} className="card flex items-center gap-3 p-3.5">
                <Avatar src={partner?.photoUrl ?? null} name={partner?.firstName ?? '?'} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{partner?.firstName}</div>
                  <div className="truncate text-[12px] text-tg-hint">{order.title}</div>
                </div>
                <div className="shrink-0 text-[11px] text-tg-hint">{relativeDate(order.date)}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Bitta buyurtma chati */
export function Chat() {
  const { id = '' } = useParams();
  const [messages, setMessages] = useState<MessageDTO[] | null>(null);
  const [order, setOrder] = useState<OrderDTO | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [messagesRes, orderRes] = await Promise.all([api.messages(id), api.order(id)]);
      setMessages(messagesRes.items);
      setOrder(orderRes);
    } catch {
      setMessages([]);
    }
  }, [id]);

  useEffect(() => {
    void load();
    // Yengil polling — WebSocketsiz MVP yechimi
    const timer = setInterval(() => void load(), 8000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages?.length]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    haptic();
    try {
      const message = await api.sendMessage(id, body);
      setMessages((prev) => [...(prev ?? []), message]);
      setText('');
    } finally {
      setSending(false);
    }
  }

  if (messages === null) return <PageLoader />;

  const partner = order?.myRole === 'BUYER' ? order?.worker : order?.buyer;

  return (
    <div className="flex min-h-[calc(100vh-13rem)] flex-col">
      {order ? (
        <Link to={`/orders/${order.id}`} className="card mb-3 flex items-center gap-3 p-3">
          <Avatar src={partner?.photoUrl ?? null} name={partner?.firstName ?? '?'} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold">{partner?.firstName}</div>
            <div className="truncate text-[12px] text-tg-hint">{order.title}</div>
          </div>
          <span className="text-tg-hint">›</span>
        </Link>
      ) : null}

      <div className="flex-1 space-y-2">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-tg-hint">
            Hali xabar yo‘q. Birinchi bo‘lib yozing.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug ${
                  message.mine
                    ? 'bg-brand-500 text-white'
                    : 'border border-tg-border bg-tg-card text-tg-text'
                }`}
              >
                <div className="whitespace-pre-wrap break-words">{message.body}</div>
                <div className={`mt-1 text-[10px] ${message.mine ? 'text-white/70' : 'text-tg-hint'}`}>
                  {clockTime(message.createdAt)}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-24 mt-3 flex gap-2">
        <input
          className="field flex-1"
          placeholder="Xabar yozing..."
          value={text}
          maxLength={2000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
        />
        <button
          type="button"
          className="btn-primary px-5"
          onClick={() => void send()}
          disabled={sending || !text.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
