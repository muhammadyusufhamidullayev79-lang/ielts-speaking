/* Generates PWA / Android / iOS app icons from assets/logo.svg + assets/logo-mark.svg
 *
 *   node tools/build-icons.mjs        (yoki: npm run build:icons)
 *
 * Logoni o'zgartirgan bo'lsangiz avval `node tools/make-logo.mjs` ni ishlating.
 */
import sharp from 'sharp';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'assets', 'icons');

/** Brend foni — logoning to'q ko'k-qora fonidan olingan. */
const BRAND = { r: 0x06, g: 0x0b, b: 0x14, alpha: 1 };   // #060B14

const FULL = await readFile(path.join(ROOT, 'assets', 'logo.svg'));   // doira + matn
const MARK = await readFile(path.join(ROOT, 'assets', 'logo-mark.svg')); // faqat belgi

await mkdir(OUT, { recursive: true });

/** SVG'ni berilgan o'lchamda rasterlaydi. */
const render = (svg, size) =>
  sharp(svg, { density: 384 }).resize(size, size, { fit: 'contain' }).png().toBuffer();

/** Belgini brend fonli kvadratga joylaydi (maskable / iOS uchun). */
async function padded(svg, size, scale, bg = BRAND) {
  const inner = Math.round(size * scale);
  const off = Math.round((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: await render(svg, inner), left: off, top: off }])
    .png()
    .toBuffer();
}

const write = async (name, buf) => {
  const { size } = await sharp(buf).png({ compressionLevel: 9 }).toFile(path.join(OUT, name));
  console.log(String(name).padEnd(28), (size / 1024).toFixed(1) + ' KB');
};

/** Alpha kanalsiz saqlash — App Store va launcher ikonkalari talabi. */
const writeOpaque = async (name, buf) => {
  const { size } = await sharp(buf)
    .flatten({ background: '#060B14' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT, name));
  console.log(String(name).padEnd(28), (size / 1024).toFixed(1) + ' KB');
};

// --- PWA "any" ikonkalari ---------------------------------------------------
// Kichik o'lchamlarda matn o'qilmaydi, shuning uchun faqat belgi ishlatiladi.
for (const s of [48, 72, 96, 128]) {
  await write(`icon-${s}.png`, await render(MARK, s));
}
// Kattaroqlarida to'liq logo (doira + IELTS SPEAKING) chiroyli ko'rinadi.
for (const s of [144, 192, 256, 384, 512]) {
  await write(`icon-${s}.png`, await render(FULL, s));
}

// --- PWA "maskable": kontent 80% xavfsiz zona ichida ------------------------
for (const s of [192, 512]) {
  await writeOpaque(`maskable-${s}.png`, await padded(FULL, s, 0.80));
}

// --- iOS home screen (shaffoflik mumkin emas) -------------------------------
await writeOpaque('apple-touch-icon.png', await padded(FULL, 180, 0.98));
await writeOpaque('apple-touch-icon-167.png', await padded(FULL, 167, 0.98));
await writeOpaque('apple-touch-icon-152.png', await padded(FULL, 152, 0.98));

// --- favicons ---------------------------------------------------------------
for (const s of [16, 32]) await write(`favicon-${s}.png`, await render(MARK, s));

// --- sayt sarlavhasidagi kichik logo ----------------------------------------
await write('logo-128.png', await render(MARK, 128));

// --- Android adaptive icon foreground (xavfsiz zona = markaziy 66%) ---------
await write(
  'android-foreground-432.png',
  await padded(MARK, 432, 0.60, { r: 0, g: 0, b: 0, alpha: 0 })
);

console.log('\nIcons written to assets/icons/');
