/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        ink: 'var(--ink)',
        'ink-muted': 'var(--ink-muted)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        gold: 'var(--gold)',
        danger: 'var(--danger)',
        line: 'var(--line)',
      },
      fontFamily: {
        sans: ['Vazirmatn', 'Segoe UI', 'Tahoma', 'sans-serif'],
        mono: ['ui-monospace', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      borderRadius: {
        card: '12px',
        control: '10px',
      },
      maxWidth: {
        auth: '400px',
      },
    },
  },
  plugins: [],
};
