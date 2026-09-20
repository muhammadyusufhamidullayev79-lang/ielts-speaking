// PWA qatlamining tekshiruvlari.
// Run: node --test tests/pwa.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));

/* ------------------------------------------------------------- manifest */

test('manifest o\u2019rnatish talablarini qanoatlantiradi', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.name && m.short_name, 'name va short_name bo\u2019lishi kerak');
  assert.ok(m.start_url.startsWith('/'), 'start_url ildizdan boshlanishi kerak');
  assert.equal(m.scope, '/');
  assert.match(m.theme_color, /^#[0-9A-Fa-f]{6}$/);
  assert.match(m.background_color, /^#[0-9A-Fa-f]{6}$/);

  const any = m.icons.filter((i) => (i.purpose || 'any').includes('any'));
  const maskable = m.icons.filter((i) => (i.purpose || '').includes('maskable'));
  assert.ok(any.some((i) => i.sizes === '192x192'), '192px "any" ikonka kerak');
  assert.ok(any.some((i) => i.sizes === '512x512'), '512px "any" ikonka kerak');
  assert.ok(maskable.some((i) => i.sizes === '512x512'), '512px maskable ikonka kerak');

  for (const icon of m.icons) {
    assert.ok(exists(icon.src), `ikonka fayli mavjud emas: ${icon.src}`);
  }
  for (const s of m.shortcuts || []) {
    for (const icon of s.icons || []) assert.ok(exists(icon.src), `shortcut ikonkasi yo\u2019q: ${icon.src}`);
  }
});

/* ------------------------------------------------------------- offline */

test('service worker offline uchun zarur fayllarni cache qiladi', () => {
  const sw = read('sw.js');
  const core = [...sw.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
  for (const rel of ['./index.html', './js/data.js', './js/app.js', './css/app.css', './js/pwa.js']) {
    assert.ok(core.includes(rel), `CORE_ASSETS ichida ${rel} bo\u2019lishi kerak`);
  }
  // Ro'yxatdagi har bir lokal fayl haqiqatan mavjud bo'lishi shart —
  // aks holda cache.addAll() yiqiladi va offline butunlay ishlamaydi.
  for (const rel of new Set(core)) {
    if (rel === './') continue;
    assert.ok(exists(rel.slice(2)), `sw.js ro\u2019yxatidagi fayl yo\u2019q: ${rel}`);
  }
});

test('Firebase so\u2019rovlari hech qachon cache\u2019lanmaydi', () => {
  const sw = read('sw.js');
  for (const host of ['firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com']) {
    assert.ok(sw.includes(host), `${host} network-only ro\u2019yxatida bo\u2019lishi kerak`);
  }
  assert.match(sw, /if \(isNetworkOnly\(url\)\) return;/, 'network-only manzillarda SW chetlab o\u2019tishi kerak');
});

test('sw.js va pwa.js sintaktik jihatdan to\u2019g\u2019ri', () => {
  for (const f of ['sw.js', 'js/pwa.js']) {
    assert.doesNotThrow(() => new vm.Script(read(f)), `${f} sintaksis xatosi`);
  }
});

/* ------------------------------------------------- tashqi bog'liqliklar */

test('index.html offline\u2019ni buzadigan tashqi resurslarga bog\u2019lanmaydi', () => {
  const html = read('index.html');
  const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  // Firebase SDK ataylab tashqarida: u faqat login/bulut uchun, offline ishlashga ta'sir qilmaydi.
  const blocking = external.filter((u) => !u.startsWith('https://www.gstatic.com/'));
  assert.deepEqual(blocking, [], `offline\u2019ni buzuvchi tashqi resurslar: ${blocking.join(', ')}`);
});

test('shriftlar va ikonka kutubxonasi loyiha ichida', () => {
  assert.ok(exists('vendor/lucide.min.js'), 'lucide lokal bo\u2019lishi kerak');
  assert.ok(exists('assets/fonts/fonts.css'), 'shrift css lokal bo\u2019lishi kerak');
  const css = read('assets/fonts/fonts.css');
  const urls = [...css.matchAll(/url\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(urls.length > 0, 'font-face qoidalari bo\u2019lishi kerak');
  for (const u of urls) {
    assert.ok(!u.startsWith('http'), `shrift tashqaridan yuklanmoqda: ${u}`);
    assert.ok(exists(path.join('assets/fonts', u)), `shrift fayli yo\u2019q: ${u}`);
  }
});

test('index.html PWA meta teglarini o\u2019z ichiga oladi', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /name="theme-color"/);
  assert.match(html, /name="apple-mobile-web-app-capable"/);
  assert.match(html, /rel="apple-touch-icon"/);
  assert.match(html, /viewport-fit=cover/, 'notch uchun viewport-fit kerak');
  assert.match(html, /src="js\/pwa\.js"/);
});

test('CSP lokal skript va shriftlarga ruxsat beradi', () => {
  const html = read('index.html');
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src [^;]*'self'/);
  assert.match(csp, /script-src [^;]*https:\/\/www\.gstatic\.com/, 'Firebase SDK uchun gstatic kerak');
  assert.match(csp, /font-src [^;]*'self'/);
  assert.ok(!/script-src [^;]*unpkg\.com/.test(csp), 'unpkg endi ishlatilmaydi');
});

/* -------------------------------------------- brauzerdagi xulq (jsdom) */

/**
 * Haqiqiy brauzer ketma-ketligini takrorlaydi:
 *   pwa.js (head, defer) → app.js startMock'ni e'lon qiladi → 'load' hodisasi.
 */
function browser({ online = true, standalone = false, url = 'https://example.com/' } = {}) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(read('index.html'), { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  Object.defineProperty(window.navigator, 'onLine', { value: online, configurable: true });
  window.matchMedia = (q) => ({
    matches: standalone && q.includes('standalone'),
    media: q, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, onchange: null, dispatchEvent: () => false,
  });

  const calls = { mock: 0, routed: [] };
  window.router = (v) => calls.routed.push(v);            // app.js dagi router o'rnini bosadi

  // Service worker API'si jsdom'da yo'q — PWA qatlami usiz ham ishlashi kerak.
  window.eval(read('js/pwa.js'));

  window.startMock = () => { calls.mock += 1; };          // app.js shu bosqichda yuklanadi
  window.eval('window.dispatchEvent(new Event("load"))');  // deferred skriptlardan keyin

  const setOnline = (v) => {
    Object.defineProperty(window.navigator, 'onLine', { value: v, configurable: true });
    window.eval(`window.dispatchEvent(new Event(${v ? '"online"' : '"offline"'}))`);
  };
  const clickMock = () => {
    const btn = window.document.querySelector('[data-needs-online]');
    const ev = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    let reached = false;
    btn.addEventListener('click', () => { reached = true; });
    btn.dispatchEvent(ev);
    return { reached, defaultPrevented: ev.defaultPrevented };
  };
  return { window, calls, setOnline, clickMock };
}

test('oflayn holatda Mock bloklanadi, mavzular esa ochiq qoladi', () => {
  const { window, calls, setOnline, clickMock } = browser({ online: false });
  setOnline(false);

  // 1) Tugmani bosish — hodisa onclick'gacha yetib bormaydi.
  const click = clickMock();
  assert.equal(click.reached, false, 'oflaynda bosish onclick\u2019gacha yetmasligi kerak');
  assert.equal(click.defaultPrevented, true);

  // 2) To'g'ridan-to'g'ri chaqiruv ham to'xtatiladi.
  window.startMock();
  assert.equal(calls.mock, 0, 'oflaynda Mock boshlanmasligi kerak');

  assert.equal(window.document.getElementById('offlineBar'), null, 'oflayn chizig\u2019i olib tashlangan');

  const mockBtn = window.document.querySelector('[data-needs-online]');
  assert.equal(mockBtn.disabled, true, 'Mock tugmasi o\u2019chirilishi kerak');
  assert.ok(mockBtn.classList.contains('needs-online-locked'));

  // 3) Mavzular hech qanday cheklovga uchramaydi.
  for (const id of ['view-part1', 'view-part2', 'view-part3']) {
    const view = window.document.getElementById(id);
    assert.ok(view, `${id} mavjud bo\u2019lishi kerak`);
    assert.ok(!view.hasAttribute('data-needs-online'), `${id} internet talab qilmasligi kerak`);
  }
});

test('internet qaytganda Mock qayta ochiladi', () => {
  const { window, calls, setOnline, clickMock } = browser({ online: false });
  setOnline(false);
  window.startMock();
  assert.equal(calls.mock, 0);

  setOnline(true);

  window.startMock();
  assert.equal(calls.mock, 1, 'ulanish tiklangach Mock ishlashi kerak');
  assert.equal(clickMock().reached, true, 'onlaynda bosish o\u2019tishi kerak');
  assert.equal(window.document.getElementById('offlineBar'), null);
  assert.equal(window.document.querySelector('[data-needs-online]').disabled, false);
});

test('o\u2019rnatish tugmasi beforeinstallprompt\u2019dan keyin chiqadi', () => {
  const { window } = browser();
  const btn = window.document.querySelector('[data-pwa-install]');
  assert.equal(btn.hidden, true, 'boshida yashirin bo\u2019lishi kerak');

  window.eval(`
    const e = new Event('beforeinstallprompt');
    e.prompt = () => { window.__prompted = true; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  `);
  assert.equal(btn.hidden, false, 'prompt tayyor bo\u2019lganda ko\u2019rinishi kerak');

  window.pwaInstall();
  assert.equal(window.__prompted, true, 'tugma bosilganda o\u2019rnatish oynasi chiqishi kerak');
});

test('o\u2019rnatilgan (standalone) rejimda o\u2019rnatish tugmasi chiqmaydi', () => {
  const { window } = browser({ standalone: true });
  assert.equal(window.document.querySelector('[data-pwa-install]').hidden, true);
  assert.ok(window.document.documentElement.classList.contains('pwa-standalone'));
});

test('prompt bo\u2019lmaganda (iOS) qo\u2019llanma modali ochiladi', () => {
  const { window } = browser();
  const help = window.document.getElementById('pwaInstallHelp');
  assert.equal(help.hidden, true);
  window.pwaInstall();
  assert.equal(help.hidden, false, 'iOS uchun qo\u2019lda o\u2019rnatish qo\u2019llanmasi ochilishi kerak');
  window.closeInstallHelp();
  assert.equal(help.hidden, true);
});

test('PWA shortcut\u2019lari kerakli bo\u2019limni ochadi', () => {
  const { calls } = browser({ url: 'https://example.com/?view=daily&source=shortcut' });
  assert.ok(calls.routed.includes('daily'), `?view=daily router\u2019ni chaqirishi kerak (${calls.routed})`);
});

test('noto\u2019g\u2019ri ?view qiymati router\u2019ga uzatiladi va u o\u2019zi tekshiradi', () => {
  const { calls } = browser({ url: 'https://example.com/?view=part2' });
  assert.ok(calls.routed.includes('part2'));
});
