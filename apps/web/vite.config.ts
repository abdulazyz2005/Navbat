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
      '\n\n  ❌ Build paytida NODE_ENV=development aniqlandi — bu production buildni buzadi.\n' +
        '     React\'ning development versiyasi bundlega tushadi: hajm 2x, so‘rovlar 2x.\n\n' +
        '     Qayerdan kelgan bo‘lishi mumkin:\n' +
        '       1) .env faylidagi NODE_ENV qatori → o‘chiring\n' +
        '       2) muhitdagi NODE_ENV=development → build oldidan olib tashlang\n' +
        '       3) Dockerfile\'dagi ENV NODE_ENV=development → olib tashlang\n',
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
