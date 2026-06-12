// tailwind.config.ts
import type { Config } from 'tailwindcss'

export default {
  content: [
    './app.vue',
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './plugins/**/*.{js,ts}',
    './composables/**/*.{js,ts}',
    './utils/**/*.{js,ts}',
    './assets/**/*.{css,scss,js,ts}',
  ],
  safelist: [
    'bg-railton-green',
    'bg-railton-green-tint',
    'bg-railton-black',
    'bg-railton-white',
    'text-railton-green',
    'text-railton-black',
    'text-railton-white',
    'border-railton-green',
  ],
  theme: {
    extend: {
      colors: {
        'plott-teal': '#00DFDD',
      },
    },
  },
  plugins: [],
} satisfies Config
