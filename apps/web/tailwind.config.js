/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Telegram mavzu o'zgaruvchilari (CSS variables orqali)
        tg: {
          bg: 'var(--tg-bg)',
          card: 'var(--tg-card)',
          text: 'var(--tg-text)',
          hint: 'var(--tg-hint)',
          link: 'var(--tg-link)',
          border: 'var(--tg-border)',
        },
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          500: '#2d6bff',
          600: '#1f56e0',
          700: '#1a45b4',
        },
        money: {
          500: '#12b76a',
          600: '#0e9455',
        },
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
