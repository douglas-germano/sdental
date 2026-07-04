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
        /* Vodafone-inspired non-linear scale: sharp utility rectangles vs. full pills */
        none: '0px',
        hairline: '1px',
        button: '2px',
        sm: '2px',
        DEFAULT: '6px',
        md: '4px',
        card: '6px',
        lg: 'var(--radius)',
        xl: '12px',
        '2xl': '16px',
        'glass-pill': '24px',
        'badge-pill': '32px',
        pill: '60px',
        full: '9999px',
      },
      boxShadow: {
        /* The system is deliberately flat — only an inset focus ring is used for elevation. */
        none: 'none',
        soft: 'none',
        'soft-md': 'none',
        'soft-lg': 'none',
        'soft-xl': 'none',
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
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
        'display-sm': ['2.5rem', { lineHeight: '1.05', letterSpacing: '-0.01em', fontWeight: '800' }],
        'display-md': ['3.5rem', { lineHeight: '0.95', letterSpacing: '-0.02em', fontWeight: '800' }],
        'display-lg': ['5rem', { lineHeight: '0.9', letterSpacing: '-0.02em', fontWeight: '800' }],
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
export default config
