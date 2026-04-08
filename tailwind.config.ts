import type { Config } from 'tailwindcss'

export default {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        pine: '#6B7563',
        'pine-mid': '#848B78',
        'pine-light': '#F0F2ED',
        orange: '#D4735B',
        'orange-light': '#F9F1ED',
        cream: '#FDFCFA',
        dark: '#2A2A2A',
        muted: '#6B7280',
        border: '#E5E7EB',
      },
      fontFamily: {
        'fraunces': ['var(--font-fraunces)', 'serif'],
        'sans': ['var(--font-dm-sans)', 'DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config