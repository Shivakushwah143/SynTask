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
        // Deep, confident navy — the "strong roots" anchor color
        primary: {
          50: '#eef2fb',
          100: '#dce4f5',
          200: '#b3c4e8',
          300: '#8aa3da',
          400: '#5677bf',
          500: '#33529f',
          600: '#243d7d',
          700: '#1c3164',
          800: '#16264e',
          900: '#101b38',
          950: '#0a1226',
        },
        // Refined warm-neutral surfaces instead of flat gray
        surface: {
          DEFAULT: '#ffffff',
          muted: '#faf9f7',
          subtle: '#f3f1ec',
          border: '#e6e2d9',
        },
        text: {
          primary: '#171512',
          secondary: '#5c574e',
          muted: '#8c8577',
          inverse: '#ffffff',
        },
        status: {
          todo: { bg: '#f3f1ec', text: '#5c574e' },
          in_progress: { bg: '#dce4f5', text: '#243d7d' },
          in_review: { bg: '#fbf0dc', text: '#8a5a12' },
          completed: { bg: '#dcf3e8', text: '#0f6b45' },
          cancelled: { bg: '#fbe4e1', text: '#9a3226' },
        },
        priority: {
          low: { bg: '#dcf3e8', text: '#0f6b45' },
          medium: { bg: '#fbf0dc', text: '#8a5a12' },
          high: { bg: '#fbe3ce', text: '#9a4a12' },
          critical: { bg: '#fbe4e1', text: '#9a3226' },
        },
        // Rich emerald accent — growth, prestige, "award-winning" polish
        secondary: {
          50: '#eafaf2',
          100: '#c9f0dc',
          200: '#94e0ba',
          300: '#5cc994',
          400: '#2fac74',
          500: '#188f5c',
          600: '#0f6b45',
          700: '#0c5539',
          800: '#0a422d',
          900: '#083322',
        },
        // Optional muted gold — for premium accents, badges, "award" flourishes
        gold: {
          400: '#e0b45c',
          500: '#c9973a',
          600: '#a8792a',
        },
        dark: {
          900: '#0a1226',
          800: '#101b38',
          700: '#16264e',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '0.75rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(16 27 56 / 0.08), 0 1px 2px -1px rgb(16 27 56 / 0.08)',
        'card-hover': '0 4px 6px -1px rgb(16 27 56 / 0.10), 0 2px 4px -2px rgb(16 27 56 / 0.10)',
        modal: '0 20px 25px -5px rgb(16 27 56 / 0.12), 0 8px 10px -6px rgb(16 27 56 / 0.12)',
      },
    },
  },
  plugins: [],
}