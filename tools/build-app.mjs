/**
 * Native (Android/iOS) qobiq uchun veb fayllarni `www/` ga yig'adi.
 *
 *   node tools/build-app.mjs      (yoki: npm run build:app)
 *
 * Nega alohida papka: Capacitor webDir'ni butunlay o'ziga oladi, saytning
 * ildizi esa Vercel uchun o'zgarishsiz qolishi kerak. Shu bois nusxa ko'chiramiz
 * va native'da keraksiz narsalarni (admin paneli, service worker) tashlab ketamiz.
 */
import { cp, rm, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WWW = path.join(ROOT, 'www');

/* Native ilovaga ko'chiriladigan fayllar */
const INCLUDE = [
  'index.html',
  'offline.html',
  'manifest.webmanifest',
  'css',
  'js',
  'vendor',
  'assets',
];

/* Native ilovada keraksiz (yoki zararli) fayllar */
const EXCLUDE = new Set([
  'assets/logo.png',            // 1 MB original — ilovada icons/logo-128.png ishlatiladi
  'js/admin.js',                // admin paneli faqat veb uchun
]);

const exclude = (src) => {
  const rel = path.relative(ROOT, src).split(path.sep).join('/');
  return EXCLUDE.has(rel);
};

await rm(WWW, { recursive: true, force: true });
await mkdir(WWW, { recursive: true });

for (const entry of INCLUDE) {
  const from = path.join(ROOT, entry);
  try { await stat(from); } catch { console.warn(`  ! topilmadi, o'tkazib yuborildi: ${entry}`); continue; }
  await cp(from, path.join(WWW, entry), {
    recursive: true,
    filter: (src) => !exclude(src),
  });
}

/* index.html'ni native uchun moslash:
 *   - service worker native'da kerak emas (fayllar allaqachon qurilmada)
 *   - Capacitor bridge'ini ulaymiz */
const indexPath = path.join(WWW, 'index.html');
let html = await readFile(indexPath, 'utf8');

html = html.replace(
  '<script src="js/pwa.js" defer></script>',
  '<script src="capacitor.js" defer></script>\n<script src="js/pwa.js" defer></script>'
);

await writeFile(indexPath, html);

/* Native'da SW ro'yxatdan o'tmasin */
const pwaPath = path.join(WWW, 'js', 'pwa.js');
let pwa = await readFile(pwaPath, 'utf8');
pwa = pwa.replace(
  "if ('serviceWorker' in navigator && location.protocol !== 'file:') {",
  "if ('serviceWorker' in navigator && location.protocol !== 'file:' && !IS_NATIVE) {"
);
await writeFile(pwaPath, pwa);

console.log(`✓ www/ tayyor — 'npx cap sync' bilan Android/iOS ga ko'chiring`);
