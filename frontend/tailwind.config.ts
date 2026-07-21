import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    fontFamily: {
      sans: ['var(--font-sans)', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          shade: 'hsl(var(--primary-shade))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          popover: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-bg))',
          border: 'hsl(var(--sidebar-border))',
        },
        charcoal: {
          DEFAULT: 'hsl(var(--charcoal))',
          foreground: 'hsl(var(--charcoal-foreground))',
        },
      },
      borderRadius: {
        /* HIG continuous-curve scale: 8px controls, 10px cards, 14px+ overlays */
        none: '0px',
        hairline: '1px',
        button: '8px',
        sm: '6px',
        DEFAULT: '8px',
        md: '8px',
        card: '10px',
        lg: 'var(--radius)',
        xl: '14px',
        '2xl': '18px',
        'glass-pill': '24px',
        'badge-pill': '32px',
        pill: '60px',
        full: '9999px',
      },
      boxShadow: {
        /* HIG elevation: barely-there on resting surfaces, growing with float distance */
        none: 'none',
        soft: '0 1px 2px rgb(0 0 0 / 0.04), 0 1px 1px rgb(0 0 0 / 0.03)',
        'soft-md': '0 2px 8px rgb(0 0 0 / 0.06), 0 1px 2px rgb(0 0 0 / 0.04)',
        'soft-lg': '0 8px 24px rgb(0 0 0 / 0.10), 0 2px 6px rgb(0 0 0 / 0.05)',
        'soft-xl': '0 16px 48px rgb(0 0 0 / 0.14), 0 4px 12px rgb(0 0 0 / 0.06)',
        focus: 'inset 0 0 0 1px hsl(var(--ring))',
        'border': '0 0 0 1px hsl(var(--border))',
      },
      backgroundImage: {
        /* Gradient-free system — kept only as escape hatches, unused by default components */
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out forwards',
        'fade-in-up': 'fade-in-up 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-left': 'slide-in-left 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-right': 'slide-in-right 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scale-in 0.15s ease-out forwards',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.4s ease-in-out infinite',
        'spin-slow': 'spin-slow 3s linear infinite',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-left': {
          from: { opacity: '0', transform: 'translateX(-8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(8px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      transitionDuration: {
        '400': '400ms',
      },
      transitionTimingFunction: {
        'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      letterSpacing: {
        tightest: '-0.02em',
        display: '-0.01em',
      },
      fontSize: {
        /*
         * HIG-calibrated ramp (caption2 → large title). Redefining the default
         * Tailwind steps snaps every existing text-* call site in the app to
         * this scale - the ramp IS the system, no per-page migration needed.
         *   2xs 11 · xs 12 · sm 13 · base 15 · lg 17 · xl 20 · 2xl 22 · 3xl 28 · 4xl 34
         */
        '2xs': ['0.6875rem', { lineHeight: '0.875rem' }],
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.8125rem', { lineHeight: '1.125rem' }],
        base: ['0.9375rem', { lineHeight: '1.375rem' }],
        lg: ['1.0625rem', { lineHeight: '1.5rem', letterSpacing: '-0.01em' }],
        xl: ['1.25rem', { lineHeight: '1.625rem', letterSpacing: '-0.012em' }],
        '2xl': ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.015em' }],
        '3xl': ['1.75rem', { lineHeight: '2.125rem', letterSpacing: '-0.018em' }],
        '4xl': ['2.125rem', { lineHeight: '2.5rem', letterSpacing: '-0.02em' }],
        'display-sm': ['2.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-md': ['3.5rem', { lineHeight: '1', letterSpacing: '-0.022em', fontWeight: '700' }],
        'display-lg': ['5rem', { lineHeight: '0.95', letterSpacing: '-0.025em', fontWeight: '700' }],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
