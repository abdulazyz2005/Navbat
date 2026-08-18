import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ command, mode }) => {
  // .env fayli monorepo ildizida turadi
  const env = loadEnv(mode, '../../', '');

  /**
   * MUHIM: Vite `.env` ichidagi NODE_ENV ni ham o'qiydi.
   * Agar u `development` bo'lsa, React'ning DEVELOPMENT versiyasi bundlega tushadi:
   * hajmi ~2 barobar oshadi va StrictMode har bir API so'rovini IKKI MARTA yuboradi.
   * Shuning uchun NODE_ENV `.env` da saqlanmaydi — uni host (Railway/Docker) beradi.
   */
  if (command === 'build' && env.NODE_ENV === 'development') {
    throw new Error(
      '\n\n  ❌ .env faylida NODE_ENV=development turibdi — bu production buildni buzadi.\n' +
        '     Yechim: .env dan NODE_ENV qatorini o‘chiring.\n' +
        '     (API uchun standart qiymat allaqachon "development".)\n',
    );
  }
  const apiTarget = env.VITE_DEV_API_TARGET ?? `http://localhost:${env.PORT || 3001}`;

  return {
    plugins: [react()],
    envDir: '../../',
    server: {
      port: 5173,
      host: true,
      // Telegram Mini App uchun tunnel (cloudflared / ngrok) ochilganda kerak
      allowedHosts: true,
      /**
       * Devda ham productiondagi kabi BIR origin bo'lishi uchun `/api` backendga
       * proxy qilinadi. Shu tufayli bitta tunnel (5173) Mini Appni to'liq ishlatadi.
       */
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
    preview: { port: 4173, host: true },
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
  };
});
