/* Firebase auth & cloud sync smoke-test (jsdom) — <script> in'ektsiyasi orqali,
   chunki let-global'lar faqat sahifa kontekstida ko'rinadi (brauzer kabi). */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
html = html.replace(/<script src="https:[^"]+"[^>]*><\/script>/g, ''); // CDN'lar jsdom'da yuklanmaydi

const dataJs = fs.readFileSync(path.join(ROOT, 'js/data.js'), 'utf8');
const appJs = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

// lokal skriptlarni inline qilamiz — jsdom ularni sahifa kontekstida (brauzer kabi) bajaradi
html = html.replace('<script src="js/data.js" defer></script>', '<script>\n' + dataJs + '\n</script>');
html = html.replace('<script src="js/app.js" defer></script>', '<script>\n' + appJs + '\n</script>');

const results = [];
function check(name, cond) {
  results.push([cond ? 'PASS' : 'FAIL', name]);
  if (!cond) process.exitCode = 1;
}

const dom = new JSDOM(html, {
  url: 'http://localhost:3000/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.speechSynthesis = { getVoices: () => [], cancel() {}, speak() {}, onvoiceschanged: null };
    window.alert = () => {};
    window.confirm = () => true;
    window.HTMLMediaElement.prototype.play = function () {};
    window.HTMLMediaElement.prototype.pause = function () {};
  },
});

const { window } = dom;
const doc = window.document;
// sahifa kontekstida ishlatish (haqiqiy <script> — let-global'lar bilan bir xil scope)
function run(code) {
  const s = doc.createElement('script');
  s.textContent = code;
  doc.body.appendChild(s);
  s.remove();
}
function runAsync(code) { // Promise natijasini kutish: window.__done flag
  run(`window.__done=0; window.__err=''; Promise.resolve().then(()=>(${code})).then(()=>{window.__done=1;},e=>{window.__done=1;window.__err=e.message||String(e);});`);
  return new Promise((res) => {
    const t0 = Date.now();
    (function poll() {
      if (window.__done || Date.now() - t0 > 3000) return res({ err: window.__err });
      setTimeout(poll, 10);
    })();
  });
}

setTimeout(async () => {
  // ---- 1. Init (Firebase sozlanmagan — mehmon rejimi) ----
  check('header: Kirish tugmasi chiqdi (mehmon)', doc.getElementById('authArea').innerHTML.includes('Kirish'));
  check("header: Ro'yxatdan o'tish tugmasi chiqdi (mehmon)", doc.getElementById('authArea').innerHTML.includes("Ro'yxatdan o'tish"));
  check('mobil menyu: auth tugmalari chiqdi', doc.getElementById('authAreaM').innerHTML.includes('Kirish') && doc.getElementById('authAreaM').innerHTML.includes("Ro'yxatdan o'tish"));
  check('mock login eslatmasi ko‘rinadi (mehmon)', !doc.getElementById('mockLoginNote').classList.contains('hidden'));
  check('daily login eslatmasi ko‘rinadi (mehmon)', !doc.getElementById('dailyLoginNote').classList.contains('hidden'));

  // ---- 2. Gating: guest startMock => auth modal ----
  run('startMock()');
  check('gating: startMock modalni ochdi', !doc.getElementById('authModal').classList.contains('hidden'));
  check('gating: sabab xabari ko‘rsatildi', !doc.getElementById('authReason').classList.contains('hidden'));

  // ---- 3. Firebase sozlanmagan login => tushunarli xato ----
  run("document.getElementById('loginEmail').value='a@b.c'; document.getElementById('loginPass').value='123456';");
  await runAsync('doLogin()');
  check('login (SDK yo‘q): xato xabari chiqdi', !doc.getElementById('authError').classList.contains('hidden'));
  check('login xatosi FIREBASE_SETUP yo‘naltiradi', doc.getElementById('authError').textContent.includes('FIREBASE_CONFIG'));

  // ---- 4. collectState ----
  run("safeSet('streak','5'); safeSet('dailyNum','3');");
  const stObj = JSON.parse(window.localStorage.getItem('mockHistory') || '[]');
  check('collectState: streak saqlandi', window.localStorage.getItem('streak') === '5');
  check('collectState: dailyNum saqlandi', window.localStorage.getItem('dailyNum') === '3');
  void stObj;

  // ---- 5. Stub DB bilan syncOnLogin (yangi akkaunt — migratsiya) ----
  run(`
    window.__writes = [];
    fbDb = {
      collection(){ return { doc(){ return {
        get: async () => ({ exists:false, data: () => ({}) }),
        set: async (d, o) => { window.__writes.push({ d, o }); },
        onSnapshot: () => () => {}
      }; } }; }
    };
    localStorage.removeItem('syncUid'); localStorage.setItem('syncUpdatedAt','0');
  `);
  run("safeSet('mockSavesMeta', JSON.stringify([{q:'savol 1', part:'Part 1', date:'2026-09-11', duration:9}]));");
  const r1 = await runAsync("syncOnLogin({ uid:'u1', email:'ali@test.uz', displayName:'Ali' })");
  check('syncOnLogin xatosiz', !r1.err || (console.log('  err:', r1.err), false));
  const writes = window.__writes || [];
  check('syncOnLogin: hujjat yozildi', writes.length >= 1);
  if (writes.length) {
    const first = writes[0].d;
    check('migratsiya: profil yozildi', first.displayName === 'Ali' && first.email === 'ali@test.uz');
    check('migratsiya: lokal mockSavesMeta bulutga ko‘chdi', Array.isArray(first.data.mockSavesMeta) && first.data.mockSavesMeta.length === 1);
  }
  check('migratsiya: syncUid belgilandi', window.localStorage.getItem('syncUid') === 'u1');

  // ---- 6. Bulut g'alib: cloud.updatedAt > local => applyCloudState ----
  run(`
    localStorage.setItem('syncUpdatedAt','0');
    localStorage.setItem('streak','1');
    applyCloudState({
      mockHistory:[], mockSavesMeta:[], mockDone:7,
      dailyHistory:[], dailyNum:9, streak:12, lastMockIds:[],
      recs:{ 'p1-01':[ {qIdx:0, date:'2026-09-10', size:123} ] },
      updatedAt: 99999999999999
    }, 'u1');
  `);
  check('applyCloudState: streak bulutdan keldi (12)', window.localStorage.getItem('streak') === '12');
  check('applyCloudState: dailyNum bulutdan keldi (9)', window.localStorage.getItem('dailyNum') === '9');
  check('applyCloudState: mockDone keldi', window.localStorage.getItem('mockDone') === '7');
  check('applyCloudState: recs_ tiklandi', JSON.parse(window.localStorage.getItem('recs_p1-01') || '[]').length === 1);
  check('applyCloudState: UI streak yangilandi', doc.getElementById('streakVal').textContent.includes('12'));

  // ---- 7. Login holati: header + eslatmalar ----
  run("authUser = { uid:'u1', email:'ali@test.uz', displayName:'Ali' }; renderAuthUI();");
  const userHtml = doc.getElementById('authArea').innerHTML;
  check('header: foydalanuvchi ismi chiqdi', userHtml.includes('Ali'));
  check('header: Chiqish tugmasi bor', userHtml.includes('doLogout'));
  check('mobil: Chiqish tugmasi bor', doc.getElementById('authAreaM').innerHTML.includes('Chiqish'));
  check('mock eslatma yashirildi (login)', doc.getElementById('mockLoginNote').classList.contains('hidden'));
  check('daily eslatma yashirildi (login)', doc.getElementById('dailyLoginNote').classList.contains('hidden'));

  // ---- 8. queueCloudSave + safeSet(synced key) ----
  run('queueCloudSave();');
  check('queueCloudSave: syncUpdatedAt yangilandi', parseInt(window.localStorage.getItem('syncUpdatedAt') || '0') > 0);
  const wBefore = (window.__writes || []).length;
  run("safeSet('streak','13');");
  await new Promise((r) => setTimeout(r, 1700)); // debounce 1.5s
  check('safeSet(synced): debounce push ishga tushdi', (window.__writes || []).length > wBefore);

  // ---- 9. Signup validatsiyasi ----
  run("openAuthModal('signup'); document.getElementById('signupName').value='A'; document.getElementById('signupEmail').value='x@y.z'; document.getElementById('signupPass').value='123456'; document.getElementById('signupPass2').value='123456';");
  await runAsync('doSignup()');
  check("signup: qisqa ism rad etildi", !doc.getElementById('authError').classList.contains('hidden'));

  // ---- 10. Reset rejimi va modal yopish ----
  run("openAuthModal('reset')");
  check('reset rejimi: forma almashtirdi', !doc.getElementById('authResetForm').classList.contains('hidden') && doc.getElementById('authLoginForm').classList.contains('hidden'));
  run('closeAuthModal()');
  check('modal yopildi', doc.getElementById('authModal').classList.contains('hidden'));

  // ---- 11. Guest holatiga qaytish ----
  run('authUser = null; renderAuthUI();');
  check('logout: yana Kirish ko‘rindi', doc.getElementById('authArea').innerHTML.includes('Kirish'));
  check('logout: eslatmalar qaytdi', !doc.getElementById('mockLoginNote').classList.contains('hidden'));

  console.log('\n=== NATIJALAR ===');
  results.forEach(([s, n]) => console.log(`${s === 'PASS' ? '✅' : '❌'} ${n}`));
  const fails = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - fails}/${results.length} test o'tdi`);
  process.exit(fails ? 1 : 0);
}, 300);
