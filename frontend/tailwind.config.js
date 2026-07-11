/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      animation: {
        'spin-slow': 'spin-slow 20s linear infinite',
        'shimmer': 'shimmer 3s infinite',
        'border-rotate': 'border-rotate 4s ease infinite',
        'particle-float': 'particle-float 3s ease-in-out infinite',
        'bounce-slow': 'bounce-slow 3s ease-in-out infinite',
        'float-image': 'float-image 6s ease-in-out infinite',
      },
      keyframes: {
        'spin-slow': {
          'from': { transform: 'rotate(0deg)' },
          'to': { transform: 'rotate(360deg)' },
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'border-rotate': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'particle-float': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)', opacity: '0.6' },
          '25%': { transform: 'translate(10px, -20px) scale(1.5)', opacity: '1' },
          '50%': { transform: 'translate(-5px, -35px) scale(0.8)', opacity: '0.8' },
          '75%': { transform: 'translate(15px, -15px) scale(1.2)', opacity: '1' },
        },
        'bounce-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        'float-image': {
          '0%, 100%': { transform: 'translateY(0px) scale(1)' },
          '50%': { transform: 'translateY(-15px) scale(1.02)' },
        },
      },
      colors: {
        border: 'var(--color-app-border)',
        // Promage warm cream + charcoal theme tokens.
        primary: {
          50: '#fff4ec',
          100: '#ffe4d2',
          200: '#ffc7a6',
          300: '#f8a26d',
          400: '#ee8240',
          450: '#e9782f',
          500: '#e56a1f',
          600: '#d85a17',
          700: '#b94a15',
          800: '#933b16',
          900: '#6f2f14',
          950: '#411807',
        },
        surface: {
          DEFAULT: '#fcfcf8',
          muted: '#f1eee6',
          subtle: '#ece7db',
          border: '#e4dccb',
        },
        text: {
          primary: '#383028',
          secondary: '#6f675d',
          muted: '#8f877a',
          inverse: '#fffaf4',
        },
        status: {
          todo: { bg: '#f1eee6', text: '#6f675d' },
          in_progress: { bg: '#ffe5d3', text: '#b94a15' },
          in_review: { bg: '#fff1db', text: '#a66412' },
          completed: { bg: '#e3f4ea', text: '#14724b' },
          cancelled: { bg: '#fbe3de', text: '#b73c2a' },
        },
        priority: {
          low: { bg: '#e3f4ea', text: '#14724b' },
          medium: { bg: '#fff1db', text: '#a66412' },
          high: { bg: '#ffe0c7', text: '#b94a15' },
          critical: { bg: '#fbe3de', text: '#b73c2a' },
        },
        secondary: {
          50: '#f4eefb',
          100: '#e6d9fb',
          200: '#d1bef7',
          300: '#b99ded',
          400: '#9e82e0',
          500: '#856bd1',
          600: '#6e57b6',
          700: '#584593',
          800: '#463672',
          900: '#372a58',
        },
        accent: {
          lavender: '#e7dcfb',
          peach: '#fde1cf',
          sky: '#dcedfb',
          butter: '#f8f0c8',
        },
        gold: {
          400: '#e4c179',
          500: '#d4ab4f',
          600: '#b68d34',
        },
        dark: {
          900: '#1f1b17',
          800: '#2a2420',
          700: '#362f2a',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1rem',
      },
      boxShadow: {
        card: '0 1px 0 0 rgb(63 49 37 / 0.08)',
        'card-hover': '0 1px 0 0 rgb(63 49 37 / 0.10)',
        modal: '0 18px 40px -28px rgb(63 49 37 / 0.22)',
      },
    },
  },
  plugins: [],
}
