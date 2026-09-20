/* Generates PWA / Android / iOS app icons from assets/logo.png */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'assets', 'logo.png');
const OUT = path.join(ROOT, 'assets', 'icons');
const BRAND = { r: 0x2e, g: 0x0e, b: 0x4e, alpha: 1 };   // #2E0E4E

// Circular mark inside the source artwork (measured):
const MARK = { left: 419, top: 98, width: 570, height: 570 };

await mkdir(OUT, { recursive: true });

/** The bare circular mark, transparent outside the circle. */
async function mark(size) {
  const disc = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  return sharp(SRC)
    .extract(MARK)
    .resize(size, size, { fit: 'cover' })
    .composite([{ input: disc, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

/** Mark centred on a solid brand-purple square (iOS / maskable / splash). */
async function padded(size, scale, bg = BRAND) {
  const inner = Math.round(size * scale);
  const off = Math.round((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: await mark(inner), left: off, top: off }])
    .png()
    .toBuffer();
}

const write = async (name, buf) => {
  const { size } = await sharp(buf).png({ compressionLevel: 9 }).toFile(path.join(OUT, name));
  console.log(String(name).padEnd(28), (size / 1024).toFixed(1) + ' KB');
};

// --- PWA "any" icons: transparent-cornered circular mark ------------------
for (const s of [48, 72, 96, 128, 144, 192, 256, 384, 512]) {
  await write(`icon-${s}.png`, await mark(s));
}
// --- PWA "maskable": content inside the 80% safe zone ---------------------
for (const s of [192, 512]) {
  await write(`maskable-${s}.png`, await padded(s, 0.78));
}
// --- iOS home screen (no transparency allowed) ----------------------------
await write('apple-touch-icon.png', await padded(180, 0.86));
await write('apple-touch-icon-167.png', await padded(167, 0.86));
await write('apple-touch-icon-152.png', await padded(152, 0.86));
// --- favicons -------------------------------------------------------------
for (const s of [16, 32]) await write(`favicon-${s}.png`, await mark(s));
// --- in-app header logo (light replacement for the 1 MB original) ---------
await write('logo-128.png', await mark(128));
// --- Android adaptive icon foreground (safe zone = centre 66%) ------------
await write(
  'android-foreground-432.png',
  await padded(432, 0.62, { r: 0, g: 0, b: 0, alpha: 0 })
);
console.log('\nIcons written to assets/icons/');
