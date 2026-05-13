/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        app: {
          dark: '#1a1a2e',
          darker: '#0a0a1a',
          card: '#16213e',
          input: '#0f3460',
          accent: '#e94560',
          text: '#e0e0ff',
          muted: '#8888bb',
          label: '#aaaacc',
          tertiary: '#6666aa',
          subtle: '#555577',
        },
      },
    },
  },
  plugins: [],
};
