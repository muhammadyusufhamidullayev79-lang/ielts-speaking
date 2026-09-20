/**
 * Android va iOS loyihalari uchun launcher ikonkalari va splash ekranlarni yasaydi.
 *
 *   node tools/build-native-assets.mjs     (yoki: npm run build:native-assets)
 *
 * `npx cap add android|ios` dan keyin bir marta ishga tushiring; platformalarni
 * qayta yaratsangiz, yana ishga tushiring.
 */
import sharp from 'sharp';
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'assets', 'logo.png');
const MARK = { left: 419, top: 98, width: 570, height: 570 };   // logodagi doira
const BRAND = '#2E0E4E';
const brandRGB = { r: 0x2e, g: 0x0e, b: 0x4e, alpha: 1 };

const has = async (p) => { try { await access(p); return true; } catch { return false; } };

/** Doiraviy belgi, tashqarisi shaffof. */
async function mark(size) {
  const disc = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  return sharp(SRC).extract(MARK).resize(size, size, { fit: 'cover' })
    .composite([{ input: disc, blend: 'dest-in' }]).png().toBuffer();
}

/** Belgi + to'ldirish (fon rangli yoki shaffof). */
async function padded(size, scale, bg = brandRGB) {
  const inner = Math.round(size * scale);
  const off = Math.round((size - inner) / 2);
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: await mark(inner), left: off, top: off }]).png().toBuffer();
}

/** Splash: brend rangli fon, markazda belgi. */
async function splash(w, h) {
  const inner = Math.round(Math.min(w, h) * 0.26);
  return sharp({ create: { width: w, height: h, channels: 4, background: brandRGB } })
    .composite([{ input: await mark(inner), gravity: 'centre' }]).png().toBuffer();
}

const save = async (file, buf) => {
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(buf).png({ compressionLevel: 9 }).toFile(file);
};

/** App Store alpha kanalli ikonkani rad etadi — shaffoflikni olib tashlaymiz. */
const saveOpaque = async (file, buf) => {
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(buf).flatten({ background: BRAND }).png({ compressionLevel: 9 }).toFile(file);
};

/* ----------------------------------------------------------------- Android */
const ANDROID = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');
if (await has(ANDROID)) {
  // Launcher ikonkalari (legacy + adaptive foreground)
  const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [d, size] of Object.entries(densities)) {
    await saveOpaque(path.join(ANDROID, `mipmap-${d}`, 'ic_launcher.png'), await padded(size, 0.88));
    await save(path.join(ANDROID, `mipmap-${d}`, 'ic_launcher_round.png'), await mark(size));
    // Adaptive foreground: xavfsiz zona markazdagi ~66%
    await save(
      path.join(ANDROID, `mipmap-${d}`, 'ic_launcher_foreground.png'),
      await padded(Math.round(size * 2.25), 0.62, { r: 0, g: 0, b: 0, alpha: 0 })
    );
  }

  // Adaptive icon foni — brend rangi
  await writeFile(
    path.join(ANDROID, 'values', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND}</color>\n</resources>\n`
  );
  // Capacitor drawable/ic_launcher_background.xml ni ham qo'yadi — konflikt bo'lmasin
  await writeFile(
    path.join(ANDROID, 'drawable', 'ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android"\n    android:shape="rectangle">\n    <solid android:color="${BRAND}" />\n</shape>\n`
  );
  // Adaptive foreground vektorini PNG bilan almashtiramiz
  await writeFile(
    path.join(ANDROID, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`
  );
  await writeFile(
    path.join(ANDROID, 'mipmap-anydpi-v26', 'ic_launcher_round.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`
  );

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
  // App Store 1024px ikonkasi — alpha kanal bo'lmasligi shart
  await saveOpaque(path.join(IOS, 'AppIcon.appiconset', 'AppIcon-512@2x.png'), await padded(1024, 0.86));
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    await saveOpaque(path.join(IOS, 'Splash.imageset', f), await splash(2732, 2732));
  }
  console.log('✓ iOS ikonkasi va splash ekranlari yangilandi');
} else {
  console.log('— iOS loyihasi topilmadi (npx cap add ios), o\'tkazib yuborildi');
}
