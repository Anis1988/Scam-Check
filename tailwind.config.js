// "Light futuristic": a cool, misty light page with frosted-glass panels, thin cyan→violet light edges and soft glows.
// Colours are muted (gentle on the eyes). Verdict meaning stays the same everywhere: green safe, amber suspicious,
// red scam — always with an icon and words, never colour alone.
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
const scale = (name, steps) => Object.fromEntries(steps.map((n) => [n, v(`${name}-${n}`)]));

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      // Every colour is a CSS variable (index.css), so 🌙 dark mode swaps the whole palette at once.
      colors: {
        white: v('white'),
        mist: v('mist'),
        iris: scale('iris', [300, 400, 500, 600]),
        // cool greys instead of warm ones
        stone: scale('stone', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        teal: scale('teal', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        emerald: scale('emerald', [50, 200, 500, 600, 700, 800, 900]),
        amber: scale('amber', [50, 200, 400, 600, 700, 800, 900]),
        red: scale('red', [50, 200, 500, 600, 700, 800, 900]),
      },
    },
  },
  plugins: [],
};
