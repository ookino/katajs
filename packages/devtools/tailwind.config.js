/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/ui/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Brand neutral (shadcn neutral palette in dark mode):
        // bg=950, panel=900, panel-2=border=800, muted-fg=400.
        bg: '#0a0a0a',
        panel: '#171717',
        'panel-2': '#262626',
        border: '#262626',
        muted: '#a3a3a3',
        // Functional accents — kept colored so graph edges + HTTP methods
        // remain readable. These are signal colors, not brand colors.
        accent: '#7aa2ff',
        'accent-2': '#57c7b9',
        get: '#57c7b9',
        post: '#7aa2ff',
        put: '#f5a623',
        patch: '#f5a623',
        delete: '#ff6b6b',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
