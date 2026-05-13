/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Matches the theatrico web dark theater theme (HSL values from web index.css)
        app: {
          dark: '#130f12',      // --background:  330 13% 7%
          darker: '#0a090b',    // deeper than background
          card: '#1f131b',      // --card:         334 14% 11%
          input: '#2e1e27',     // --muted:        334 11% 17%
          border: '#3d2430',    // --border:       334 12% 22%
          accent: '#b31e35',    // --primary:      350 66% 42%  (rose/crimson)
          gold: '#d4913e',      // --secondary:    39  70% 58%  (amber/gold)
          teal: '#3e9287',      // --accent:       176 34% 38%  (teal)
          text: '#f0e6d5',      // --foreground:   36  38% 92%  (warm cream)
          muted: '#c4b49a',     // --muted-foreground: 36 15% 70%
          label: '#a89070',     // mid between foreground and muted-foreground
          tertiary: '#7a6858',  // dimmer label
          subtle: '#4d3d48',    // dim, near border brightness
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'ui-serif', 'serif'],
      },
    },
  },
  plugins: [],
};
