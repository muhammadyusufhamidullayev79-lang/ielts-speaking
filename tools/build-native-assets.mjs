/**
 * Android va iOS loyihalari uchun launcher ikonkalari va splash ekranlarni yasaydi.
 *
 *   node tools/build-native-assets.mjs     (yoki: npm run build:native-assets)
 *
 * `npx cap add android|ios` dan keyin bir marta ishga tushiring; platformalarni
 * qayta yaratsangiz, yana ishga tushiring.
 * Logoni o'zgartirgan bo'lsangiz avval `node tools/make-logo.mjs`.
 */
import sharp from 'sharp';
import { mkdir, writeFile, access, readFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BRAND = '#060B14';                                  // logoning to'q foni
const brandRGB = { r: 0x06, g: 0x0b, b: 0x14, alpha: 1 };

const FULL = await readFile(path.join(ROOT, 'assets', 'logo.svg'));
const MARK = await readFile(path.join(ROOT, 'assets', 'logo-mark.svg'));
// Splash uchun shaffof fonli nusxa — kvadrat fon chegarasi ko'rinmasin
const FULL_FLAT = await readFile(path.join(ROOT, 'assets', 'logo-flat.svg'));

const has = async (p) => { try { await access(p); return true; } catch { return false; } };

/** SVG'ni berilgan o'lchamda rasterlaydi. */
const render = (svg, size) =>
  sharp(svg, { density: 384 }).resize(size, size, { fit: 'contain' }).png().toBuffer();

/** Logoni fon ustiga markazlab joylaydi. */
async function padded(svg, size, scale, bg = brandRGB) {
  const inner = Math.round(size * scale);
  const off = Math.round((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: await render(svg, inner), left: off, top: off }])
    .png()
    .toBuffer();
}

/** Splash: brend rangli fon, markazda to'liq logo. */
async function splash(w, h) {
  const inner = Math.round(Math.min(w, h) * 0.42);
  return sharp({ create: { width: w, height: h, channels: 4, background: brandRGB } })
    .composite([{ input: await render(FULL_FLAT, inner), gravity: 'centre' }])
    .png()
    .toBuffer();
}

const save = async (file, buf) => {
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(buf).png({ compressionLevel: 9 }).toFile(file);
};

/** App Store va launcher ikonkalari alpha kanalsiz bo'lishi kerak. */
const saveOpaque = async (file, buf) => {
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(buf).flatten({ background: BRAND }).png({ compressionLevel: 9 }).toFile(file);
};

/* ----------------------------------------------------------------- Android */
const ANDROID = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
if (await has(ANDROID)) {
  const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [d, size] of Object.entries(densities)) {
    // Legacy kvadrat ikonka: to'liq logo (kattaroq o'lchamlarda matn o'qiladi)
    const art = size >= 96 ? FULL : MARK;
    await saveOpaque(path.join(ANDROID, `mipmap-${d}`, 'ic_launcher.png'), await padded(art, size, 0.98));
    await saveOpaque(path.join(ANDROID, `mipmap-${d}`, 'ic_launcher_round.png'), await padded(art, size, 0.98));
    // Adaptive foreground: xavfsiz zona markazdagi ~60%, fon alohida qatlam
    await save(
      path.join(ANDROID, `mipmap-${d}`, 'ic_launcher_foreground.png'),
      await padded(MARK, Math.round(size * 2.25), 0.60, { r: 0, g: 0, b: 0, alpha: 0 })
    );
  }

  // Adaptive icon foni — brend rangi
  await writeFile(
    path.join(ANDROID, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND}</color>\n</resources>\n`
  );
  await writeFile(
    path.join(ANDROID, 'drawable', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android"\n    android:shape="rectangle">\n    <solid android:color="${BRAND}" />\n</shape>\n`
  );
  for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
    await writeFile(
      path.join(ANDROID, 'mipmap-anydpi-v26', name),
      `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`
    );
  }

  // Splash ekranlar (portret / landshaft, har xil zichlik)
  const port = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
  for (const [d, [w, h]] of Object.entries(port)) {
    await saveOpaque(path.join(ANDROID, `drawable-port-${d}`, 'splash.png'), await splash(w, h));
    await saveOpaque(path.join(ANDROID, `drawable-land-${d}`, 'splash.png'), await splash(h, w));
  }
  await saveOpaque(path.join(ANDROID, 'drawable', 'splash.png'), await splash(1280, 1920));
  console.log('✓ Android ikonkalari va splash ekranlari yangilandi');
} else {
  console.log('— Android loyihasi topilmadi (npx cap add android), o\'tkazib yuborildi');
}

/* --------------------------------------------------------------------- iOS */
const IOS = path.join(ROOT, 'ios', 'App', 'App', 'Assets.xcassets');
if (await has(IOS)) {
  await saveOpaque(path.join(IOS, 'AppIcon.appiconset', 'AppIcon-512@2x.png'), await padded(FULL, 1024, 0.98));
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await saveOpaque(path.join(IOS, 'Splash.imageset', f), await splash(2732, 2732));
  }
  console.log('✓ iOS ikonkasi va splash ekranlari yangilandi');
} else {
  console.log('— iOS loyihasi topilmadi (npx cap add ios), o\'tkazib yuborildi');
}
