/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Chrome tab group colors
        'chrome-grey': '#5f6368',
        'chrome-blue': '#1a73e8',
        'chrome-red': '#d93025',
        'chrome-yellow': '#f9ab00',
        'chrome-green': '#1e8e3e',
        'chrome-pink': '#d01884',
        'chrome-purple': '#9334e6',
        'chrome-cyan': '#007b83',
      },
      width: {
        popup: '400px',
      },
      maxHeight: {
        popup: '600px',
      },
    },
  },
  plugins: [],
};
