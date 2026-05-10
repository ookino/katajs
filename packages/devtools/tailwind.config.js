/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/ui/**/*.{ts,tsx,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: '#0f1115',
        panel: '#161922',
        'panel-2': '#1d2230',
        border: '#2a3041',
        muted: '#8b93a7',
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
