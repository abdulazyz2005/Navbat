import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminApp } from './AdminApp';
import '../index.css';
import './admin.css';

/**
 * ADMIN PANEL — alohida ilova (alohida bundle, alohida HTML).
 * Telegram SDK bu yerda umuman yuklanmaydi: panel oddiy brauzerda ishlaydi.
 */
const container = document.getElementById('root');
if (!container) throw new Error('#root topilmadi');

createRoot(container).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
