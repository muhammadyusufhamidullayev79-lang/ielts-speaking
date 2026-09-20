/**
 * Brend logosini SVG sifatida quradi (assets/logo.svg + assets/logo-mark.svg).
 *
 *   node tools/make-logo.mjs
 *
 * Matn vektor yo'llarga aylantiriladi — shrift o'rnatilgan bo'lishi shart emas
 * va istalgan o'lchamda aniq chiqadi.
 */
import fs from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';
import { decompress } from 'wawoff2';

const ROOT = path.resolve(import.meta.dirname, '..');
const FONT_DIR = path.join(ROOT, 'node_modules', '@fontsource', 'montserrat', 'files');

const C = {
  bg: '#060B14',        // deyarli qora fon
  ring: '#1D8FFF',      // tashqi doira
  blue: '#2C9BFF',      // aksent ko'k
  blueDark: '#0A6BD6',
  white: '#FFFFFF',
  soft: '#E8F1FB',
};

async function loadFont(weight) {
  const woff2 = path.join(FONT_DIR, `montserrat-latin-${weight}-normal.woff2`);
  const ttf = await decompress(fs.readFileSync(woff2));
  return opentype.parse(Uint8Array.from(ttf).buffer);
}

/** Matnni markazlashtirilgan vektor yo'lga aylantiradi. */
function textPath(font, text, { size, cx, y, tracking = 0, fill }) {
  const glyphs = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;

  const widths = glyphs.map((g) => g.advanceWidth * scale);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (glyphs.length - 1);

  let x = cx - total / 2;
  const parts = [];
  for (let i = 0; i < glyphs.length; i++) {
    parts.push(glyphs[i].getPath(x, y, size).toPathData(2));
    x += widths[i] + tracking;
  }
  return `<path d="${parts.join(' ')}" fill="${fill}"/>`;
}

const bold = await loadFont(800);
const semi = await loadFont(600);

/* ------------------------------------------------------------------ mikrofon */
const R = 132;                                   // suhbat pufagi radiusi
const pt = (deg, r = R) => {                     // burchak -> koordinata (y pastga)
  const a = (deg * Math.PI) / 180;
  return [ (r * Math.cos(a)).toFixed(1), (r * Math.sin(a)).toFixed(1) ];
};

/** Mikrofon + suhbat pufagi — logoning markaziy belgisi. */
function micMark({ cx, cy, scale = 1 }) {
  // Pufak halqasi: 128° dan soat strelkasiga teskari aylanib 158° gacha
  // (pastki chapda dumcha uchun uzilish qoladi).
  const [sx, sy] = pt(128);
  const [ex, ey] = pt(158);

  // Dumcha: halqadan tashqariga chiqqan uchburchak.
  const [t1x, t1y] = pt(124, R * 0.98);
  const [t2x, t2y] = pt(162, R * 0.98);
  const [t3x, t3y] = pt(146, R * 1.42);

  return `
  <g transform="translate(${cx} ${cy}) scale(${scale})">
    <!-- suhbat pufagi: ochiq halqa -->
    <path d="M ${sx} ${sy} A ${R} ${R} 0 1 0 ${ex} ${ey}"
          fill="none" stroke="url(#bubbleGrad)" stroke-width="27" stroke-linecap="round"/>
    <!-- pufak dumchasi -->
    <path d="M ${t1x} ${t1y} L ${t3x} ${t3y} L ${t2x} ${t2y} Z"
          fill="url(#bubbleGrad)" stroke="url(#bubbleGrad)" stroke-width="16" stroke-linejoin="round"/>

    <!-- mikrofon korpusi -->
    <rect x="-41" y="-104" width="82" height="146" rx="41" fill="${C.white}"/>
    <!-- korpusdagi chiziqlar -->
    <g stroke="${C.bg}" stroke-width="10" stroke-linecap="round" opacity=".9">
      <line x1="-23" y1="-70" x2="23" y2="-70"/>
      <line x1="-23" y1="-42" x2="23" y2="-42"/>
      <line x1="-23" y1="-14" x2="23" y2="-14"/>
    </g>
    <!-- ushlagich yoy -->
    <path d="M -76 4 A 76 76 0 0 0 76 4" fill="none" stroke="${C.white}"
          stroke-width="19" stroke-linecap="round"/>
    <!-- oyoq va asos -->
    <line x1="0" y1="72" x2="0" y2="112" stroke="${C.white}" stroke-width="19" stroke-linecap="round"/>
    <line x1="-46" y1="122" x2="46" y2="122" stroke="${C.white}" stroke-width="19" stroke-linecap="round"/>
  </g>`;
}

/* --------------------------------------------------------------- to'liq logo */
function fullLogo({ size = 1024, withRing = true, transparent = false } = {}) {
  const c = size / 2;
  const ringR = size * 0.468;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="IELTS Speaking">
  <defs>
    <linearGradient id="bubbleGrad" x1="0" y1="-1" x2="0.4" y2="1">
      <stop offset="0" stop-color="${C.blue}"/>
      <stop offset="1" stop-color="${C.blueDark}"/>
    </linearGradient>
    <linearGradient id="ringGrad" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#3AA7FF"/>
      <stop offset="0.5" stop-color="${C.ring}"/>
      <stop offset="1" stop-color="#0C63C9"/>
    </linearGradient>
    <radialGradient id="bgGrad" cx="0.5" cy="0.42" r="0.75">
      <stop offset="0" stop-color="#0E1A2C"/>
      <stop offset="1" stop-color="${C.bg}"/>
    </radialGradient>
  </defs>

  ${transparent ? '' : `<rect width="${size}" height="${size}" fill="url(#bgGrad)"/>`}
  ${withRing ? `<circle cx="${c}" cy="${c}" r="${ringR}" fill="none" stroke="url(#ringGrad)" stroke-width="${size * 0.019}"/>` : ''}

  ${micMark({ cx: c, cy: size * 0.375, scale: size / 1024 * 1.30 })}

  ${textPath(bold, 'IELTS', {
    size: size * 0.165,
    cx: c,
    y: size * 0.715,
    tracking: size * 0.004,
    fill: C.white,
  })}
  ${textPath(semi, 'SPEAKING', {
    size: size * 0.072,
    cx: c,
    y: size * 0.80,
    tracking: size * 0.019,
    fill: C.blue,
  })}
</svg>`;
}

/* ------------------------------ faqat belgi (kichik o'lchamlar / favicon) --- */
function markOnly({ size = 512, transparent = false } = {}) {
  const c = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="IELTS Speaking">
  <defs>
    <linearGradient id="bubbleGrad" x1="0" y1="-1" x2="0.4" y2="1">
      <stop offset="0" stop-color="${C.blue}"/>
      <stop offset="1" stop-color="${C.blueDark}"/>
    </linearGradient>
    <radialGradient id="bgGrad" cx="0.5" cy="0.42" r="0.75">
      <stop offset="0" stop-color="#0E1A2C"/>
      <stop offset="1" stop-color="${C.bg}"/>
    </radialGradient>
  </defs>
  ${transparent ? '' : `<circle cx="${c}" cy="${c}" r="${c}" fill="url(#bgGrad)"/>`}
  ${micMark({ cx: c, cy: c * 1.04, scale: size / 1024 * 2.05 })}
</svg>`;
}

const OUT = path.join(ROOT, 'assets');
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'logo.svg'), fullLogo({ size: 1024 }));
fs.writeFileSync(path.join(OUT, 'logo-mark.svg'), markOnly({ size: 1024 }));
// Shaffof fonli nusxalar — splash ekran va to'q fon ustiga qo'yish uchun
fs.writeFileSync(path.join(OUT, 'logo-flat.svg'), fullLogo({ size: 1024, transparent: true }));
fs.writeFileSync(path.join(OUT, 'logo-mark-flat.svg'), markOnly({ size: 1024, transparent: true }));
console.log('✓ assets/logo.svg, logo-mark.svg (+ -flat nusxalari) yozildi');
