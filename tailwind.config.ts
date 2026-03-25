import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#E85D04',
          50:  '#FEF3EC',
          100: '#FDE0C8',
          200: '#FABB91',
          300: '#F8965A',
          400: '#F57123',
          500: '#E85D04',
          600: '#C44D03',
          700: '#9D3D03',
          800: '#762E02',
          900: '#4F1E01',
        },
        gray: {
          950: '#030712',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
