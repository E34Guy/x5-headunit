/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cabin: '#2b2e33',
        mint: {
          DEFAULT: '#ff6600',
          soft: '#ffe8d6',
        },
        bmw: '#1c69d4',
      },
      boxShadow: {
        card: '0 8px 24px rgba(20, 40, 50, 0.06)',
      },
    },
  },
  plugins: [],
}
