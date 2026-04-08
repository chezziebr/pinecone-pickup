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
        pine: '#2D5016',
        'pine-mid': '#3D6B1F',
        'pine-light': '#F0F5E8',
        orange: '#E8650A',
        'orange-light': '#FFF4EC',
        cream: '#FDFAF4',
        dark: '#1A1A1A',
        muted: '#5C5C4A',
        border: '#D4CEBC',
      },
      fontFamily: {
        'fraunces': ['var(--font-fraunces)', 'serif'],
        'sans': ['var(--font-dm-sans)', 'DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config