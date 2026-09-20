/* IELTS Speaking Pro — PWA qatlami
 * - Service worker ro'yxatdan o'tkazish + yangilanish bildirishnomasi
 * - "Ilovani o'rnatish" tugmasi (Android/Chrome/Edge) va iOS uchun qo'llanma
 * - Onlayn/oflayn holat indikatori
 * - Mock Speaking faqat internet bilan (mavzular esa oflayn ochiladi)
 * - Capacitor (Android/iOS native qobiq) bilan integratsiya
 */
(function () {
  'use strict';

  const IS_NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const IS_STANDALONE =
    IS_NATIVE ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    window.navigator.standalone === true;

  const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  window.IELTS_PWA = { isNative: IS_NATIVE, isStandalone: IS_STANDALONE, isIOS: IS_IOS, online: navigator.onLine };

  document.documentElement.classList.toggle('pwa-standalone', IS_STANDALONE);
  document.documentElement.classList.toggle('pwa-native', IS_NATIVE);

  /* ---------------------------------------------------------------- toast */
  let toastTimer;
  function toast(message, opts) {
    const o = opts || {};
    let el = document.getElementById('pwaToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pwaToast';
      el.className = 'pwa-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.innerHTML = '';
    const text = document.createElement('span');
    text.className = 'pwa-toast-text';
    text.textContent = message;
    el.appendChild(text);
    if (o.actionLabel && typeof o.onAction === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pwa-toast-action';
      btn.textContent = o.actionLabel;
      btn.addEventListener('click', () => { hideToast(); o.onAction(); });
      el.appendChild(btn);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'pwa-toast-close';
    close.setAttribute('aria-label', 'Yopish');
    close.textContent = '\u2715';
    close.addEventListener('click', hideToast);
    el.appendChild(close);
    el.classList.add('show');
    clearTimeout(toastTimer);
    if (o.duration !== 0) toastTimer = setTimeout(hideToast, o.duration || 5200);
  }
  function hideToast() {
    const el = document.getElementById('pwaToast');
    if (el) el.classList.remove('show');
    clearTimeout(toastTimer);
  }
  window.pwaToast = toast;

  /* -------------------------------------------------- service worker + update */
  let waitingWorker = null;

  function promptUpdate(worker) {
    waitingWorker = worker;
    toast('Ilovaning yangi versiyasi tayyor.', {
      actionLabel: 'Yangilash',
      duration: 0,
      onAction: () => {
        if (!waitingWorker) return location.reload();
        waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      },
    });
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { scope: './' })
        .then((reg) => {
          if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
          reg.addEventListener('updatefound', () => {
            const sw = reg.installing;
            if (!sw) return;
            sw.addEventListener('statechange', () => {
              if (sw.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(sw);
            });
          });
          // Soatiga bir marta yangilanishni tekshiramiz
          setInterval(() => { try { reg.update(); } catch (e) { /* ignore */ } }, 60 * 60 * 1000);
        })
        .catch(() => { /* SW yo'q bo'lsa ham sayt oddiy ishlaydi */ });

      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
    });
  }

  /* ------------------------------------------------------- o'rnatish tugmasi */
  let deferredPrompt = null;

  function installButtons() {
    return Array.from(document.querySelectorAll('[data-pwa-install]'));
  }
  function showInstallUI(show) {
    installButtons().forEach((b) => { b.hidden = !show; });
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallUI(true);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    showInstallUI(false);
    try { localStorage.setItem('pwaInstalled', '1'); } catch (err) { /* ignore */ }
    toast('Ilova o\u2019rnatildi. Endi uni telefoningizdan ochishingiz mumkin.');
  });

  /* Bosilganda: darhol brauzerning o'z o'rnatish oynasini chiqaramiz (avto-o'rnatish).
   * Agar prompt hali tayyor bo'lmasa (service worker hali o'rnatilmoqda) — qisqa kutamiz:
   * tayyor bo'lgach oynani O'ZIMIZ ochamiz, foydalanuvchi qayta bosishi shart emas.
   * iOS'da brauzer bunday imkonni bermaydi — qo'lda qo'llanma ko'rsatamiz. */
  let waitingForInstallPrompt = false;
  window.pwaInstall = async function pwaInstall() {
    if (deferredPrompt) {
      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      try { promptEvent.prompt(); } catch (e) { openInstallHelp(); return; }
      try { await promptEvent.userChoice; } catch (e) { /* ignore */ }
      showInstallUI(false);
      return;
    }
    if (IS_IOS) { openInstallHelp(); return; }
    // Chrome/Edge: prompt bir-ikki soniyada tayyor bo'ladi — kutasiz va o'zi ochiladi.
    if ('serviceWorker' in navigator && !waitingForInstallPrompt) {
      waitingForInstallPrompt = true;
      toast('Ilova tayyorlanmoqda — o\u2019rnatish oynasi birozdan o\u2019zi ochiladi\u2026', { duration: 9000 });
      let timer = null;
      const cleanup = () => {
        waitingForInstallPrompt = false;
        window.removeEventListener('beforeinstallprompt', onReady);
        if (timer) clearTimeout(timer);
      };
      const onReady = (e) => {
        e.preventDefault();
        cleanup();
        deferredPrompt = e;
        window.pwaInstall(); // endi native o'rnatish oynasi o'zi ochiladi
      };
      timer = setTimeout(() => { cleanup(); if (!deferredPrompt) openInstallHelp(); }, 12000);
      window.addEventListener('beforeinstallprompt', onReady);
      return;
    }
    openInstallHelp();
  };

  /* iOS Safari'da beforeinstallprompt yo'q — qo'lda qo'llanma ko'rsatamiz. */
  function openInstallHelp() {
    const dlg = document.getElementById('pwaInstallHelp');
    if (!dlg) return;
    dlg.hidden = false;
    document.body.style.overflow = 'hidden';
    const card = dlg.querySelector('.pwa-help-card');
    if (card) card.focus();
  }
  window.closeInstallHelp = function closeInstallHelp() {
    const dlg = document.getElementById('pwaInstallHelp');
    if (!dlg) return;
    dlg.hidden = true;
    document.body.style.overflow = '';
  };
  window.openInstallHelp = openInstallHelp;

  /* ------------------------------------------------------ onlayn/oflayn holat */
  function setOnline(online) {
    window.IELTS_PWA.online = online;
    document.documentElement.classList.toggle('is-offline', !online);
    document.querySelectorAll('[data-needs-online]').forEach((el) => {
      el.classList.toggle('needs-online-locked', !online);
      if (el.tagName === 'BUTTON') el.disabled = !online;
      if (!online) {
        el.setAttribute('aria-disabled', 'true');
        if (!el.dataset.onlineTitle) el.dataset.onlineTitle = el.title || '';
        el.title = 'Bu bo\u2019lim internet talab qiladi';
      } else {
        el.removeAttribute('aria-disabled');
        el.title = el.dataset.onlineTitle || '';
      }
    });
    document.querySelectorAll('[data-offline-note]').forEach((el) => { el.hidden = online; });
  }

  window.addEventListener('online', () => {
    setOnline(true);
    toast('Internet qayta ulandi. Mock va bulutga saqlash ishlaydi.');
  });
  window.addEventListener('offline', () => {
    setOnline(false);
    toast('Internet yo\u2019q. Mavzular va Best Answer\u2019lar ochiq, Mock esa internet talab qiladi.', { duration: 6000 });
  });

  /* ------------------------------------------ oflaynda Mock'ni to'xtatish */
  const OFFLINE_MOCK_MSG =
    'Mock topshirish uchun internet kerak. Shu vaqtda Part 1/2/3 mavzularini oflayn mashq qiling.';

  /* 1-qatlam: bosishni capture bosqichida ushlaymiz — skriptlar tartibiga bog'liq emas. */
  document.addEventListener('click', (e) => {
    if (navigator.onLine) return;
    const target = e.target instanceof Element ? e.target.closest('[data-needs-online]') : null;
    if (!target) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    toast(OFFLINE_MOCK_MSG, { duration: 6000 });
  }, true);

  /* 2-qatlam: startMock() to'g'ridan-to'g'ri chaqirilsa ham himoyalangan bo'lsin. */
  function guardMock() {
    if (typeof window.startMock !== 'function' || window.startMock.__pwaGuarded) return;
    const original = window.startMock;
    const guarded = function () {
      if (!navigator.onLine) {
        toast(OFFLINE_MOCK_MSG, { duration: 6000 });
        return;
      }
      return original.apply(this, arguments);
    };
    guarded.__pwaGuarded = true;
    window.startMock = guarded;
  }

  /* --------------------------------------------- PWA shortcut'lari (?view=) */
  let launchViewApplied = false;
  function applyLaunchView() {
    if (launchViewApplied) return;
    let view;
    try { view = new URLSearchParams(location.search).get('view'); } catch (e) { return; }
    if (!view) return;
    // router app.js bilan keladi; hali yuklanmagan bo'lsa 'load' da qayta urinamiz.
    if (typeof window.router !== 'function') return;
    launchViewApplied = true;
    window.router(view);
  }

  /* ----------------------------------------------------- Capacitor (native) */
  async function initNative() {
    if (!IS_NATIVE) return;
    const C = window.Capacitor;
    const P = (C && C.Plugins) || {};
    try {
      if (P.StatusBar && P.StatusBar.setBackgroundColor) {
        await P.StatusBar.setBackgroundColor({ color: '#060B14' });
        if (P.StatusBar.setStyle) await P.StatusBar.setStyle({ style: 'DARK' });
      }
    } catch (e) { /* ignore */ }
    try { if (P.SplashScreen && P.SplashScreen.hide) await P.SplashScreen.hide(); } catch (e) { /* ignore */ }
    // Android "orqaga" tugmasi: bosh sahifada bo'lmasa — bosh sahifaga qaytadi.
    try {
      if (P.App && P.App.addListener) {
        P.App.addListener('backButton', ({ canGoBack }) => {
          const home = document.getElementById('view-home');
          const onHome = home && !home.classList.contains('hidden');
          if (!onHome && typeof window.router === 'function') window.router('home');
          else if (canGoBack) window.history.back();
          else if (P.App.exitApp) P.App.exitApp();
        });
      }
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ boot */
  let booted = false;
  function boot() {
    if (booted) return;   // DOMContentLoaded + load ikkalasi ham kelishi mumkin
    booted = true;
    setOnline(navigator.onLine);
    guardMock();
    applyLaunchView();
    initNative();
    // O'rnatilgan / native holatda "O'rnatish" tugmalari keraksiz.
    if (IS_STANDALONE) showInstallUI(false);
    else if (IS_IOS) showInstallUI(true); // iOS: qo'llanma modalini ochadi
    else showInstallUI(!!deferredPrompt);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  // app.js ham defer bilan yuklanadi va pwa.js dan keyin ishga tushadi:
  // 'load' paytida startMock allaqachon mavjud — o'shanda o'rab qo'yamiz.
  window.addEventListener('load', () => { boot(); guardMock(); applyLaunchView(); });
})();
