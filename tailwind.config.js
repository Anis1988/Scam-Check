// "Light futuristic": a cool, misty light page with frosted-glass panels, thin cyan→violet light edges and soft glows.
// Colours are muted (gentle on the eyes). Verdict meaning stays the same everywhere: green safe, amber suspicious,
// red scam — always with an icon and words, never colour alone.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        mist: '#EBF0F3',
        iris: { 300: '#B9B5E2', 400: '#9C96D2', 500: '#827BC0', 600: '#6C65A9' },
        // cool greys instead of warm ones
        stone: { 50: '#F6F8F9', 100: '#ECF0F2', 200: '#DCE3E7', 300: '#C4CDD3', 400: '#97A3AB', 500: '#6B7882', 600: '#515D66', 700: '#3E4850', 800: '#2B333A', 900: '#1B2227' },
        teal: { 50: '#EDF6F7', 100: '#D8ECEE', 200: '#B9DADE', 300: '#90C3C9', 400: '#66A9B1', 500: '#4A929B', 600: '#3B7E87', 700: '#316A72', 800: '#28575D', 900: '#1F4247' },
        emerald: { 50: '#EFF5F1', 200: '#CFE1D4', 500: '#76A486', 600: '#5E8C6E', 700: '#4D765B', 800: '#3F604A', 900: '#314B3A' },
        amber: { 50: '#F8F4EA', 200: '#E7DAB9', 400: '#CDAF6F', 600: '#A3844B', 700: '#876D3D', 800: '#6C5732', 900: '#544428' },
        red: { 50: '#F7EFEE', 200: '#E6D0CC', 500: '#BC7F76', 600: '#A3685F', 700: '#8A564E', 800: '#704640', 900: '#583833' },
      },
    },
  },
  plugins: [],
};
