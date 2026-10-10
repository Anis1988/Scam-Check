// "Light & calm", toned down: the greens, ambers, reds and teals are muted (less saturated) versions,
// so the whole app is gentler on the eyes. Verdict meaning stays the same: green safe, amber suspicious, red scam.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Nunito', 'system-ui', 'sans-serif'],
        display: ['Nunito', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        cream: '#F2EFE9',
        coral: '#C98A7A',
        teal: { 50: '#EEF3F2', 100: '#DDE8E6', 200: '#C3D6D3', 600: '#5B8580', 700: '#4A726D', 800: '#3D5F5B', 900: '#2F4A47' },
        emerald: { 50: '#F0F4EF', 200: '#D3E0D3', 500: '#7C9F80', 600: '#64886A', 700: '#527457', 800: '#435F48', 900: '#344A38' },
        amber: { 50: '#F8F3E8', 200: '#E6D8B8', 400: '#CDAE6E', 600: '#A3834A', 700: '#876C3C', 800: '#6C5631', 900: '#544327' },
        red: { 50: '#F6EEEC', 200: '#E3CFCA', 500: '#B77B71', 600: '#9E655C', 700: '#86544C', 800: '#6D443E', 900: '#563631' },
      },
    },
  },
  plugins: [],
};
