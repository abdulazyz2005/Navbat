import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Layout } from './components/Layout';
import { ErrorBox, PageLoader } from './components/ui';
import { Onboarding } from './pages/Onboarding';
import { Home } from './pages/Home';
import { CreateOrder } from './pages/CreateOrder';
import { MyOrders } from './pages/MyOrders';
import { Feed } from './pages/Feed';
import { OrderDetail } from './pages/OrderDetail';
import { Availability } from './pages/Availability';
import { Chat, ChatList } from './pages/Chat';
import { Legal, Profile } from './pages/Profile';
import { Balance } from './pages/Balance';
import { Payment } from './pages/Payment';
import { MyDisputes, Notifications } from './pages/Notifications';

function Shell() {
  const { me, loading, error } = useAuth();

  if (loading) return <PageLoader />;

  if (error || !me) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="mb-4 text-center text-5xl">⏱</div>
        <h1 className="mb-4 text-center text-[20px] font-bold">NAVBAT</h1>
        <ErrorBox
          message={error ?? 'Kirish amalga oshmadi'}
          onRetry={() => window.location.reload()}
        />
        <p className="mt-4 text-center text-[13px] leading-relaxed text-tg-hint">
          Ilovani Telegram ichidan oching. Agar muammo davom etsa, botni qaytadan ishga tushiring:
          <br />
          <code className="text-tg-text">/start</code>
        </p>
      </div>
    );
  }

  if (!me.profile.onboarded) return <Onboarding />;

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreateOrder />} />
        <Route path="/orders" element={<MyOrders />} />
        <Route path="/orders/:id" element={<OrderDetail />} />
        <Route path="/feed" element={<Feed />} />
        <Route path="/availability" element={<Availability />} />
        <Route path="/chats" element={<ChatList />} />
        <Route path="/chat/:id" element={<Chat />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/balance" element={<Balance />} />
        <Route path="/pay/:orderId" element={<Payment />} />
        <Route path="/topup" element={<Payment />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/disputes" element={<MyDisputes />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
