module.exports = {
  content: ["./index.html", "./standalone.html", "./js/*.js"],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans','system-ui','sans-serif'],
        serif: ['Instrument Serif','serif'],
        mono: ['JetBrains Mono','monospace']
      },
      colors: {
        primary: '#0F172A',
        accent: '#FF3B30',
        gold: '#FFB800',
        paper: '#FFFBF0',
      },
      boxShadow: {
        soft: '0 10px 40px -10px rgba(15,23,42,.12)',
        card: '0 4px 24px rgba(15,23,42,.06)',
      }
    }
  },
  plugins: []
}
