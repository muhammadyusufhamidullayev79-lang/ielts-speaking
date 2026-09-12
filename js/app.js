/* IELTS Speaking Pro — app.js — optimized + hardened v2 */
const _DATA_SRC = window.IELTS_DATA;

// === SECURITY: escape & sanitize ===
function escapeHTML(s){ return String(s??'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function sanitizeText(s, max=500){ let v=String(s??'').slice(0,max); return v.replace(/[<>]/g,''); } // strip tags for speak
function sanitizeInput(s, max=100){ return String(s??'').slice(0,max).replace(/[<>]/g,'').trim(); }

// === PERFORMANCE: debounce / throttle / idle ===
function debounce(fn, wait=250){ let t; return function(...a){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,a), wait); }; }
function throttle(fn, limit=200){ let inThrottle=false; return function(...a){ if(!inThrottle){ fn.apply(this,a); inThrottle=true; setTimeout(()=>inThrottle=false, limit); } }; }
function onIdle(fn){ if('requestIdleCallback' in window) requestIdleCallback(fn,{timeout:400}); else setTimeout(fn,150); }
function revokeBlobUrl(url){ try{ if(url) URL.revokeObjectURL(url); }catch(e){} }
// PERFORMANCE: cleanup orphan blob URLs on page hide/unload
window.addEventListener('pagehide', ()=>{ try{ if(lastUrl) revokeBlobUrl(lastUrl); }catch(e){} });
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='hidden'){
    // pause daily timer to save CPU
    if(dailyRunning){ clearInterval(dailyInterval); dailyInterval=null; }
  } else {
    // resume
    if(dailyRunning && !dailyInterval) runDailyInterval();
  }
});

// Account progress never falls back to a shared device's localStorage.
const PROGRESS_KEYS = new Set(['mockHistory','mockSavesMeta','mockDone','lastMockIds','dailyNum','streak','dailyHistory','completedTopics']);
const isProgressKey = k => PROGRESS_KEYS.has(k) || /^recs_[a-zA-Z0-9_-]+$/.test(k);
let accountUser = null, accountReady = false, progress = Object.create(null);
let accountProfile = { name: '', avatar: '' };  // foydalanuvchi profili (nickname + avatar)
let firebaseAPI, accountAuth, accountDB, unsubscribeProgress, accountEpoch = 0;
let pendingWrites = 0, authMode = 'login', authBusy = false, authReturnFocus;
function safeGet(k, d=null){
  if(isProgressKey(k)) return progress[k] ?? d;
  try{ return localStorage.getItem(k) ?? d; }catch(e){ return d; }
}
function safeJSON(k, d){ try{ return JSON.parse(safeGet(k)) ?? d; }catch(e){ return d; } }
function safeSet(k, v){
  if(isProgressKey(k)){
    if(!accountUser || !accountReady) return false;
    progress[k] = String(v);
    persistProgress(k, String(v));
    return true;
  }
  try{ localStorage.setItem(k,v); return true; }catch(e){ return false; }
}
function safeRemove(k){ if(isProgressKey(k)) safeSet(k, k==='mockDone' ? '0' : '[]'); else try{localStorage.removeItem(k);}catch(e){} }
function accountStatus(message){
  document.getElementById('accountStatus').textContent = message;
  document.getElementById('accountNotice').textContent = message;
}
function persistProgress(key, value){
  const epoch = accountEpoch;
  pendingWrites++;
  accountStatus('Saqlanmoqda…');
  firebaseAPI.setDoc(firebaseAPI.doc(accountDB,'users',accountUser.uid,'progress',key), {value})
    .then(()=>{ if(epoch===accountEpoch) accountStatus('Bulutga saqlandi.'); })
    .catch(()=>{ if(epoch===accountEpoch){ accountReady=false; accountStatus('Saqlanmadi. Internet yoki Firebase ruxsatlarini tekshirib, sahifani yangilang.'); openAuth('account'); } })
    .finally(()=>{ pendingWrites--; });
}
function requireAccount(){
  if(accountUser && accountReady) return true;
  openAuth(accountUser ? 'account' : 'login');
  accountStatus(accountUser ? 'Ma’lumotlar hali yuklanmagan. Ulanishni tekshiring.' : 'Natijani saqlash uchun akkauntingizga kiring.');
  return false;
}

// === custom data override (admin panel) ===
function loadCustomData(){
  try{
    const raw = localStorage.getItem('ielts_custom_data');
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed !== 'object') return null;
    // validate arrays exist and have correct shape (basic)
    ['part1','part2','part3'].forEach(part=>{
      if(parsed[part] && !Array.isArray(parsed[part])) delete parsed[part];
    });
    if(parsed.part1||parsed.part2||parsed.part3){
      return {
        part1: Array.isArray(parsed.part1) && parsed.part1.length ? parsed.part1 : _DATA_SRC.part1,
        part2: Array.isArray(parsed.part2) && parsed.part2.length ? parsed.part2 : _DATA_SRC.part2,
        part3: Array.isArray(parsed.part3) && parsed.part3.length ? parsed.part3 : _DATA_SRC.part3
      };
    }
  }catch(e){}
  return null;
}
const _customData = loadCustomData();
const DATA = _customData || _DATA_SRC;

let currentPreviewTab = 'part1';
let previewLimit = 8;
let currentModalTopic = null;
let speechRate = parseFloat(safeGet('voiceRate','1'));
let voicePref = safeGet('voicePref','female');
let autoPlay = safeGet('autoPlay','true')!=='false';
let theme = safeGet('theme','light');

// state for mock
let mockQueue = [];
let mockIndex = 0;
let mockTimerInterval = null;
let mockElapsed = 0;
let mediaRecorder = null;
let recChunks = [];
let recStart = 0;
let recTimer = null;
let lastBlob = null;
let lastUrl = null;
let mockSessionAnswered = 0;
// per-mock session store: every recording is attached to its question index
let mockSessionSaves = [];        // [{qIdx, duration, date, url, blob}]
let mockAnsweredMap = {};         // qIdx -> true (user pressed "Saqlash")
let mockAnswersMeta = [];         // [{qIdx, part, q, duration, date}]
let mockRevealAnswer = false;     // Best Answer ko'rsatish (mock davomida yopiq)

// Speech-to-text (Web Speech API) — mock yozuvi davomida jonli transkripsiya
let recognition = null;
let mockTranscripts = {};        // qIdx -> yakuniy matn
let mockConfidences = {};        // qIdx -> { sum, count } (ASR ishonch darajasi)

// daily
let dailyInterval = null;
let dailyRemaining = 20*60;
let dailyRunning = false;
let dailyNum = parseInt(safeGet('dailyNum','1'));
let streak = parseInt(safeGet('streak','1'));

document.addEventListener('DOMContentLoaded', ()=>{
  initTheme();
  initAccount();
  initVoiceUI();
  refreshIcons();
  bindSearches();
  renderPreview();
  // LAZY: render parts only when needed (idle or on navigate) to avoid 240 cards at startup
  onIdle(()=>{ try{ renderPart('part1'); }catch(e){} });
  // defer other parts until router or idle
  let _lazyPartsDone=false;
  function _lazyRest(){ if(_lazyPartsDone) return; _lazyPartsDone=true; try{ renderPart('part2'); renderPart('part3'); }catch(e){} }
  // if user stays on home, render after 1.5s idle
  setTimeout(_lazyRest, 1500);
  // also expose for router
  window._lazyRest=_lazyRest;

  syncCounts();
  // hero pleyer darhol haqiqiy umumiy vaqtni ko'rsatadi (statik 0:24 / 1:08 emas)
  heroAudioResetUI(heroEstimatedDuration(heroAudioText()));
  renderDaily();
  renderMockHistory();
  updateMockStats();
  // OPTIMIZE: no per-second polling — update only on mock events & visibility
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') updateMockStats(); });
  // also throttle storage events
  window.addEventListener('storage', throttle(updateMockStats, 800));
  // hero voice
  document.getElementById('heroVoiceName').textContent = voicePref==='female' ? 'Dilnoza • Qiz bola' : 'Jasur • O‘g‘il bola';
  document.getElementById('mockVoiceLabel').textContent = voicePref==='female' ? 'Dilnoza • Qiz bola' : 'Jasur • O‘g‘il bola';
  // load voices
  speechSynthesis.onvoiceschanged = ()=> {/* preload */};
});

function refreshIcons(){ if(window.lucide && window.lucide.createIcons) try{window.lucide.createIcons()}catch(e){} }
function initTheme(){
  if(theme==='dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  document.documentElement.classList.remove('light');
  document.documentElement.classList.add(theme);
}
function toggleTheme(){ setTheme(theme==='dark'?'light':'dark'); }
function setTheme(t){
  theme=t; safeSet('theme',t);
  initTheme(); refreshIcons();
}

function initVoiceUI(){
  document.querySelectorAll('input[name="voice"]').forEach(r=> r.checked = r.value===voicePref);
  document.getElementById('voiceRate').value = speechRate;
  document.getElementById('rateVal').textContent = speechRate.toFixed(1)+'×';
  document.getElementById('autoPlay').checked = autoPlay;
  document.getElementById('modalVoiceSwitch').value = voicePref;
}
function setVoice(v){
  voicePref=v; safeSet('voicePref',v);
  document.getElementById('heroVoiceName').textContent = v==='female'?'Dilnoza • Qiz bola':'Jasur • O‘g‘il bola';
  document.getElementById('mockVoiceLabel').textContent = v==='female'?'Dilnoza • Qiz bola':'Jasur • O‘g‘il bola';
  initVoiceUI();
}
function setRate(v){
  speechRate=parseFloat(v); safeSet('voiceRate',v);
  document.getElementById('rateVal').textContent = speechRate.toFixed(1)+'×';
}
function saveSettings(){
  autoPlay=document.getElementById('autoPlay').checked;
  safeSet('autoPlay',autoPlay);
}
function previewVoice(v){
  speak(v==='female'?"Hello, I'm Dilnoza. I will read your IELTS questions clearly and warmly. Let's practise together!":"Hello, I'm Jasur. I will read your IELTS questions confidently and clearly. Let's ace your speaking!", v);
}
function switchModalVoice(v){ setVoice(v); if(currentModalTopic) playQuestionAudio(0,true); }

function getVoiceForPref(pref){
  const voices = speechSynthesis.getVoices();
  if(!voices.length) return null;
  if(pref==='female'){
    return voices.find(v=>/female|zira|samantha|karen|moira|tessa|fiona|veena|google.*female/i.test(v.name)) 
        || voices.find(v=>v.lang.startsWith('en-GB')||v.lang.startsWith('en-US')) 
        || voices[0];
  } else {
    return voices.find(v=>/David|Alex|Mark|Daniel|Arthur|George|James/i.test(v.name) && v.lang.startsWith('en-')) || voices.find(v=>/male|google.*male/i.test(v.name))
        || voices.find(v=>v.lang.startsWith('en-US') && !/female/i.test(v.name))
        || voices[1]||voices[0];
  }
}
let _lastSpeakAt=0;
function speak(text, pref, onend, maxLen){
  // SECURITY: sanitize speak text (strip tags, limit length)
  text = sanitizeText(text, maxLen || 600);
  if(!text) return null;
  // PERFORMANCE: throttle speak — 400ms anti-spam
  const now=Date.now(); if(now - _lastSpeakAt < 400) speechSynthesis.cancel();
  _lastSpeakAt=now;
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voice = getVoiceForPref(pref||voicePref);
  if(voice) utter.voice = voice;
  utter.lang = voice? voice.lang : 'en-US';
  utter.rate = Math.min(1.3, Math.max(0.7, speechRate));
  utter.pitch = (pref||voicePref)==='female' ? 1.12 : 0.72;
  utter.volume = 1.0;
  if(onend) utter.onend = onend;
  // SECURITY: prevent error bubbling
  utter.onerror = function(){ /* silent */ };
  try{ speechSynthesis.speak(utter); }catch(e){}
  return utter;
}
function stopSpeak(){ speechSynthesis.cancel(); }

// ROUTER
function router(view){
  // SECURITY: validate view name
  const allowed=['home','part1','part2','part3','mock','daily'];
  if(!allowed.includes(view)) view='home';
  // cleanup media/recording when leaving mock
  if(view!=='mock'){ try{ stopSpeak(); }catch(e){} try{ stopLiveTranscription(); }catch(e){} try{ if(mediaRecorder && mediaRecorder.state==='recording') mediaRecorder.stop(); }catch(e){} try{ if(window._modalRecIntv) clearInterval(window._modalRecIntv); }catch(e){} }
  // pause daily timer if leaving daily (keep state but stop tick)
  // (daily timer continues only if user explicitly started, but we reduce CPU by not ticking when hidden)
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  const id = view==='home' ? 'view-home' : `view-${view}`;
  const el=document.getElementById(id);
  if(el) el.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b=> b.classList.remove('bg-slate-900','text-white','dark:bg-white','dark:text-slate-900'));
  const active=document.querySelector(`[data-nav="${view}"]`);
  if(active) active.classList.add('bg-slate-900','text-white','dark:bg-white','dark:text-slate-900');
  window.scrollTo({top:0, behavior:'smooth'});
  // lazy ensure part data rendered
  if(view==='part1'||view==='part2'||view==='part3'){
    try{ if(window._lazyRest) window._lazyRest(); }catch(e){}
    renderPart(view);
  }
  // throttle mock stats only when needed
  if(view==='mock') updateMockStats();
  refreshIcons();
  // PERFORMANCE: revoke idle heavy work when hidden
  if(document.visibilityState==='hidden'){ /* pause non-critical */ }
}
function toggleMobileMenu(){
  const m=document.getElementById('mobileMenu');
  m.classList.toggle('hidden'); m.classList.toggle('flex');
}

// SEARCH
function bindSearches(){
  document.getElementById('globalSearch')?.addEventListener('keydown', e=>{ if(e.key==='Enter') doGlobalSearch(); });
  // PERFORMANCE: debounce per-part searches (250ms) + limit length
  ['part1','part2','part3'].forEach(part=>{
    const inp=document.getElementById(`search-${part}`);
    if(!inp) return;
    let handler = debounce(()=>{ inp.value = sanitizeInput(inp.value, 80); renderPart(part); if(part==='part1'||part==='part3'){ const pre=document.getElementById('previewSearch'); if(pre) pre.value=inp.value; renderPreview(); } }, 250);
    inp.addEventListener('input', handler);
    inp.setAttribute('maxlength','80');
    inp.setAttribute('autocomplete','off');
    inp.setAttribute('spellcheck','false');
  });
  // preview search also debounce
  const pre=document.getElementById('previewSearch');
  if(pre){
    pre.setAttribute('maxlength','80');
    const h=debounce(()=>{ pre.value=sanitizeInput(pre.value,80); renderPreview(); }, 250);
    pre.addEventListener('input', h);
  }
}
function doGlobalSearch(){
  let raw=(document.getElementById('globalSearch').value || document.getElementById('globalSearchM')?.value || '');
  raw=sanitizeInput(raw,80);
  const q=raw.toLowerCase();
  if(!q) return;
  // decide which part has most hits
  const hits = {
    part1: DATA.part1.filter(t=> (t.title+t.uz+t.questions.map(x=>x.q).join(' ')).toLowerCase().includes(q)).length,
    part2: DATA.part2.filter(t=> t.title.toLowerCase().includes(q)).length,
    part3: DATA.part3.filter(t=> (t.title+t.uz).toLowerCase().includes(q)).length,
  };
  let best = Object.entries(hits).sort((a,b)=>b[1]-a[1])[0][0];
  if(hits[best]===0) best='part1';
  router(best);
  setTimeout(()=>{
    const inp=document.getElementById(`search-${best}`);
    if(inp) { inp.value=q; renderPart(best); }
    if(best==='part1'||best==='part3') document.getElementById('previewSearch').value=q;
    currentPreviewTab=best; renderPreview();
  },100);
}
function setPreviewTab(tab){
  currentPreviewTab=tab;
  document.querySelectorAll('.prevTab').forEach(b=> b.className='prevTab px-4 py-2 rounded-full bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-[13px] font-bold');
  const active=document.getElementById(`prevTab-${tab}`);
  if(active) active.className='prevTab px-4 py-2 rounded-full bg-slate-900 text-white text-[13px] font-bold';
  previewLimit=8;
  document.getElementById('previewSearch').value='';
  renderPreview();
}
function previewMore(){ previewLimit+=8; renderPreview(); }

function filteredTopics(part, query){
  const q=query.toLowerCase().trim();
  const arr = DATA[part];
  if(!q) return arr;
  return arr.filter(t=>{
    const hay = (t.title+' '+t.uz+' '+(t.desc||'')+' '+(t.cat||'')+' '+t.questions.map(x=>x.q).join(' ')+(t.prompts? t.prompts.join(' '):'')+' '+(t.answer||'')).toLowerCase();
    return hay.includes(q);
  });
}

function renderPreview(){
  const q=sanitizeInput(document.getElementById('previewSearch').value||'',80);
  const list=filteredTopics(currentPreviewTab,q);
  document.getElementById('previewCount').textContent = list.length;
  const grid=document.getElementById('previewGrid');
  // PERFORMANCE: use idle to avoid blocking main thread for 80 cards
  const html = list.slice(0,previewLimit).map(t=> cardHTML(t,currentPreviewTab)).join('') || `<div class="col-span-full text-center py-10 text-slate-500">Hech narsa topilmadi. Boshqa so'z bilan urinib ko'ring.</div>`;
  // double-buffer: replace via requestAnimationFrame
  requestAnimationFrame(()=>{ grid.innerHTML = html; refreshIcons(); });
  // immediate fallback for count
  document.getElementById('previewMoreBtn').style.display = list.length>previewLimit ? 'inline-flex' : 'none';
  return;
}
function renderPart(part){
  const raw=(document.getElementById(`search-${part}`)?.value||'');
  const q=sanitizeInput(raw,80).toLowerCase();
  const list= filteredTopics(part,q);
  const grid=document.getElementById(`grid-${part}`);
  if(!grid) return;
  if(part==='part2' && !q) {
    // filters
    const cats=[...new Set(DATA.part2.map(t=>t.cat))];
    const fEl=document.getElementById('part2Filters');
    if(fEl && fEl.children.length===0){
      fEl.innerHTML = `<button onclick="filterPart2('all')" data-cat="all" class="catBtn px-4 py-2 rounded-full bg-slate-900 text-white text-[13px] font-bold whitespace-nowrap">Barchasi</button>` + cats.map(c=>`<button onclick="filterPart2('${c}')" data-cat="${c}" class="catBtn px-4 py-2 rounded-full bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-[13px] font-bold whitespace-nowrap">${c}</button>`).join('');
    }
  }
  const partHTML = list.slice(0, 80).map(t=> cardHTML(t,part)).join('') || `<div class="col-span-full text-center py-10 text-slate-500">Hech narsa topilmadi</div>`;
  requestAnimationFrame(()=>{ grid.innerHTML = partHTML; refreshIcons(); });
  // PERFORMANCE: if list is huge, Virtualization note — currently capped at 80
}
let part2Cat='all';
function filterPart2(cat){
  part2Cat=cat;
  document.querySelectorAll('.catBtn').forEach(b=>{
    b.className = b.dataset.cat===cat ? 'catBtn px-4 py-2 rounded-full bg-slate-900 text-white text-[13px] font-bold whitespace-nowrap' : 'catBtn px-4 py-2 rounded-full bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-[13px] font-bold whitespace-nowrap';
  });
  const grid=document.getElementById('grid-part2');
  const list = cat==='all' ? DATA.part2 : DATA.part2.filter(t=>t.cat===cat);
  const rawQ=(document.getElementById('search-part2')?.value||'');
  const q=sanitizeInput(rawQ,80).toLowerCase();
  const filtered = q ? list.filter(t=> (t.title+t.questions.map(x=>x.q).join(' ')).toLowerCase().includes(q)) : list;
  const html2 = filtered.slice(0,80).map(t=>cardHTML(t,'part2')).join('');
  requestAnimationFrame(()=>{ grid.innerHTML = html2; refreshIcons(); });
}

function cardHTML(t, part){
  const badge = part==='part1' ? 'Part 1' : part==='part2' ? 'Part 2 • Cue Card' : 'Part 3';
  const color = part==='part1' ? 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200' : part==='part2' ? 'bg-[#0F172A] text-white dark:bg-white dark:text-slate-900' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200';
  const count = t.questions.length;
  const previewQ = escapeHTML(t.questions[0]?.q || t.prompts?.[0] || '');
  return `
  <article onclick="openTopic('${t.id}')" class="group bg-white dark:bg-[#111A33] rounded-[18px] border border-slate-200 dark:border-white/10 p-4 hover:shadow-soft hover:-translate-y-0.5 transition cursor-pointer flex flex-col">
    <div class="flex items-start justify-between gap-2">
      <div class="w-10 h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 grid place-items-center text-lg">${t.icon||'💬'}</div>
      <span class="text-[10px] font-extrabold tracking-wide px-2.5 py-1 rounded-full border ${part==='part2' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-white/5 '+color }">${badge}</span>
    </div>
    <h3 class="mt-3 font-bold text-[14px] leading-5 line-clamp-2 group-hover:text-sky-600 dark:group-hover:text-sky-300 transition">${escapeHTML(t.title)}</h3>
    <p class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">${escapeHTML(t.uz)} • ${escapeHTML(t.cat||'')}</p>
    <p class="text-[12px] leading-5 text-slate-600 dark:text-slate-300 mt-2 line-clamp-2 flex-1">${previewQ}</p>
    <div class="mt-3 flex items-center justify-between">
      <span class="text-[11px] font-bold bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-full">${count} savol • Best Answer</span>
      <span class="w-7 h-7 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 grid place-items-center group-hover:scale-105 transition"><i data-lucide="play" class="w-3 h-3 fill-current"></i></span>
    </div>
  </article>`;
}

// TOPIC MODAL
function openTopic(id){
  // SECURITY: validate id format p1-XX, p2-XX, p3-XX
  if(!/^p[123]-\d{2}$/.test(id)) return;
  const all=[...DATA.part1, ...DATA.part2, ...DATA.part3];
  const t=all.find(x=>x.id===id);
  if(!t) return;
  currentModalTopic=t;
  const part = id.startsWith('p1') ? 'PART 1' : id.startsWith('p2') ? 'PART 2' : 'PART 3';
  document.getElementById('modalPart').textContent=part;
  document.getElementById('modalTitle').textContent=sanitizeText(t.title,80);
  document.getElementById('modalUz').textContent=sanitizeText(t.uz,40) + ' • ' + sanitizeText(t.cat||'',30);
  document.getElementById('modalCount').textContent=t.questions.length + ' savol';
  document.getElementById('modalIcon').textContent=t.icon||'💬';
  document.getElementById('modalLevel').textContent=sanitizeText(t.level||'Band 8-9',20);
  const body=document.getElementById('modalBody');
  // build questions
  if(id.startsWith('p2')){
    // cue card layout
    body.innerHTML = `
      <div class="bg-white dark:bg-[#111A33] rounded-[18px] border border-slate-200 dark:border-white/10 p-5">
        <div class="flex items-center gap-2 text-[11px] font-extrabold tracking-wide"><span class="bg-amber-400 text-slate-900 px-2 py-1 rounded-full">CUE CARD</span><span class="bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-2 py-1 rounded-full">${escapeHTML(t.cat)}</span></div>
        <h3 class="mt-3 font-serif text-[20px] leading-tight">${escapeHTML(t.title)}</h3>
        <div class="mt-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4">
          <div class="text-[11px] font-extrabold tracking-widest text-amber-700 dark:text-amber-300">YOU WILL HAVE TO TALK ABOUT:</div>
          <ul class="mt-2 space-y-1.5">
            ${t.prompts.map(p=>`<li class="flex gap-2 text-[13px]"><span class="text-amber-600">•</span><span>${escapeHTML(p)}</span></li>`).join('')}
            <li class="flex gap-2 text-[13px] font-semibold"><span class="text-amber-600">•</span><span>and explain why it is important / memorable to you.</span></li>
          </ul>
          <div class="mt-3 flex gap-2">
            <button onclick="speak(\`${escapeHTML(t.title)}. ${t.prompts.join('. ')}\`, voicePref)" class="bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full px-4 py-2 text-[13px] font-bold inline-flex items-center gap-2"><i data-lucide="volume-2" class="w-4 h-4"></i> Cue cardni eshitish</button>
            <span class="text-[11px] self-center text-slate-500">1 min tayyorgarlik • 2 min gapirish</span>
          </div>
        </div>
        <div class="mt-5">
          <div class="text-[11px] font-extrabold tracking-widest text-slate-500">BEST ANSWER — NAMUNA (Band 9 • ~2 min)</div>
          <div class="mt-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-[13px] leading-6 whitespace-pre-wrap">${escapeHTML(t.answer)}</div>
          <div class="mt-3 flex flex-wrap gap-2">
            ${t.vocab.map(v=>`<span class="text-[11px] bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 px-2 py-1 rounded-full">${escapeHTML(v)}</span>`).join('')}
          </div>
          <div class="mt-3 p-3 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 text-[12px] leading-5"><b>Tip:</b> ${escapeHTML(t.tip)}</div>
          <div class="mt-4 flex gap-2">
            <button onclick="startRecordingForTopic()" class="flex-1 bg-red-500 text-white rounded-full py-2.5 text-[13px] font-bold inline-flex items-center justify-center gap-2"><i data-lucide="mic" class="w-4 h-4"></i> Javobni yozib olish</button>
            <button onclick="speak(\`${t.answer.replace(/`/g,'').slice(0,300)}\`, voicePref)" class="bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full px-4 py-2.5 text-[13px] font-bold">Javobni eshitish</button>
          </div>
          <div id="modalRecArea" class="hidden mt-3 bg-white dark:bg-[#0B1020] border border-slate-200 dark:border-white/10 rounded-2xl p-3">
            <div class="flex items-center justify-between"><span class="text-[12px] font-bold">Yozuv</span><span id="modalRecTime" class="font-mono text-[12px]">00:00</span></div>
            <div class="mt-2 h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden"><div id="modalRecBar" class="h-full bg-red-500" style="width:0%"></div></div>
            <audio id="modalPlayback" controls class="w-full mt-2 hidden"></audio>
          </div>
        </div>
      </div>
    `;
  } else {
    body.innerHTML = t.questions.map((qq,idx)=>`
      <div class="bg-white dark:bg-[#111A33] rounded-[18px] border border-slate-200 dark:border-white/10 overflow-hidden">
        <div class="px-5 py-4 flex items-start gap-3">
          <span class="shrink-0 w-8 h-8 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 grid place-items-center text-[12px] font-extrabold">${idx+1}</span>
          <div class="flex-1">
            <h4 class="font-semibold text-[14px] leading-6">${escapeHTML(qq.q)}</h4>
            <div class="mt-3 flex flex-wrap gap-2">
              <button onclick="playQuestionAudio(${idx})" class="bg-[#0F172A] dark:bg-white text-white dark:text-slate-900 rounded-full px-4 py-1.5 text-[12px] font-bold inline-flex items-center gap-2"><i data-lucide="volume-2" class="w-3.5 h-3.5"></i> Eshitish</button>
              <button onclick="toggleRecForQuestion(${idx})" id="qRecBtn-${idx}" class="bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full px-3 py-1.5 text-[12px] font-bold inline-flex items-center gap-1.5"><i data-lucide="mic" class="w-3.5 h-3.5"></i> Yozish</button>
              <span class="text-[11px] bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-full">${escapeHTML(qq.vocab.join(' • '))}</span>
            </div>
          </div>
        </div>
        <div class="mx-5 mb-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4">
          <div class="text-[11px] font-extrabold tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><i data-lucide="sparkles" class="w-3 h-3"></i> BEST ANSWER • BAND 8-9</div>
          <p class="mt-2 text-[13px] leading-6">${escapeHTML(qq.a)}</p>
          <div class="mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-[11px] leading-5"><b>Vocab:</b> ${escapeHTML(qq.vocab.join(', '))} • <b>Tip:</b> ${escapeHTML(qq.tip)}</div>
          <div id="qRecArea-${idx}" class="hidden mt-3">
            <div class="h-1.5 bg-slate-200 dark:bg-white/10 rounded-full overflow-hidden"><div id="qRecBar-${idx}" class="h-full bg-red-500" style="width:0%"></div></div>
            <audio id="qPlayback-${idx}" controls class="w-full mt-2 hidden"></audio>
          </div>
        </div>
      </div>
    `).join('');
  }
  document.getElementById('topicModal').classList.remove('hidden');
  document.body.style.overflow='hidden';
  refreshIcons();
  if(autoPlay){
    setTimeout(()=> {
      if(t.id.startsWith('p2')) speak(`${escapeHTML(t.title)}. ${t.prompts.join('. ')}`, voicePref);
      else playQuestionAudio(0);
    }, 400);
  }
}
function closeTopic(){
  document.getElementById('topicModal').classList.add('hidden');
  document.body.style.overflow='';
  stopSpeak();
  stopAnyRecording();
}
function playQuestionAudio(idx, quiet){
  if(!currentModalTopic) return;
  const q=currentModalTopic.questions[idx];
  if(!q) return;
  speak(q.q, voicePref);
}
function addToDailyFromModal(){
  if(!currentModalTopic) return;
  // add to daily lesson as extra
  alert(`"${currentModalTopic.title}" Daily darsga qo'shildi! 20' darsingizda mashq qilasiz.`);
  closeTopic();
  router('daily');
}

// RECORDING for modal questions
let qRecState = {};
async function toggleRecForQuestion(idx){
  const btn=document.getElementById(`qRecBtn-${idx}`);
  const area=document.getElementById(`qRecArea-${idx}`);
  const bar=document.getElementById(`qRecBar-${idx}`);
  const audio=document.getElementById(`qPlayback-${idx}`);
  if(qRecState[idx]?.recording){
    // stop
    qRecState[idx].recorder.stop();
    qRecState[idx].recording=false;
    btn.innerHTML=`<i data-lucide="mic" class="w-3.5 h-3.5"></i> Yozish`;
    refreshIcons();
    return;
  }
  try{
    const recordingEpoch=accountEpoch;
    const recordingTopic=currentModalTopic?.id;
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(recordingEpoch!==accountEpoch){stream.getTracks().forEach(t=>t.stop());return;}
    const rec=new MediaRecorder(stream);
    const chunks=[];
    rec.ondataavailable=e=> chunks.push(e.data);
    rec.onstop=()=>{
      if(recordingEpoch!==accountEpoch){stream.getTracks().forEach(t=>t.stop());return;}
      const blob=new Blob(chunks,{type:'audio/webm'});
      const url=URL.createObjectURL(blob);
      audio.src=url; audio.classList.remove('hidden'); area.classList.remove('hidden');
      // save
      saveQRecording(recordingTopic, idx, blob);
      stream.getTracks().forEach(t=>t.stop());
    };
    rec.start();
    qRecState[idx]={recorder:rec, recording:true, start:Date.now()};
    btn.innerHTML=`<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> To'xtatish`;
    area.classList.remove('hidden');
    let intv=setInterval(()=>{
      if(!qRecState[idx]?.recording){ clearInterval(intv); return; }
      const sec=Math.floor((Date.now()-qRecState[idx].start)/1000);
      bar.style.width=Math.min(100, sec*3)+'%';
    },200);
    refreshIcons();
  }catch(e){ alert('Mikrofonga ruxsat bering: '+e.message); }
}
function saveQRecording(topicId, qIdx, blob){
  if(!requireAccount()) return;
  const key='recs_'+topicId;
  const arr=safeJSON(key,[]);
  arr.push({qIdx, date:new Date().toISOString(), size:blob.size});
  safeSet(key, JSON.stringify(arr.slice(-200)));

}
async function startRecordingForTopic(){
  // for part2 modal
  const area=document.getElementById('modalRecArea');
  const bar=document.getElementById('modalRecBar');
  const audio=document.getElementById('modalPlayback');
  const time=document.getElementById('modalRecTime');
  area.classList.remove('hidden');
  try{
    const recordingEpoch=accountEpoch;
    const recordingTopic=currentModalTopic?.id;
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(recordingEpoch!==accountEpoch){stream.getTracks().forEach(t=>t.stop());return;}
    const rec=new MediaRecorder(stream);
    const chunks=[];
    const start=Date.now();
    rec.ondataavailable=e=> chunks.push(e.data);
    rec.onstop=()=>{
      if(recordingEpoch!==accountEpoch){stream.getTracks().forEach(t=>t.stop());return;}
      const blob=new Blob(chunks,{type:'audio/webm'});
      const url=URL.createObjectURL(blob);
      audio.src=url; audio.classList.remove('hidden');
      stream.getTracks().forEach(t=>t.stop());
      clearInterval(window._modalRecIntv);
      if(recordingTopic) saveQRecording(recordingTopic, 0, blob);
    };
    rec.start();
    window._modalRecorder=rec;
    window._modalRecIntv=setInterval(()=>{
      const sec=Math.floor((Date.now()-start)/1000);
      const m=String(Math.floor(sec/60)).padStart(2,'0'), s=String(sec%60).padStart(2,'0');
      time.textContent=`${m}:${s}`;
      bar.style.width=Math.min(100, sec*2)+'%';
    },200);
    setTimeout(()=>{ if(rec.state==='recording') rec.stop(); }, 120000);
    // toggle stop on second click
    area.onclick=()=>{
      if(rec.state==='recording') rec.stop();
    };
  }catch(e){ alert('Mikrofon ruxsati kerak: '+e.message); }
}
function stopAnyRecording(){
  if(window._modalRecorder && window._modalRecorder.state==='recording') window._modalRecorder.stop();
  Object.values(qRecState).forEach(s=> { if(s.recording && s.recorder.state==='recording') s.recorder.stop(); });
}

// MOCK
function shuffleArray(arr){
  const a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}
function buildMockQueue(){
  // avoid repeating last mock's questions
  const lastIds = safeJSON('lastMockIds', []);
  // 6 from part1, 1 cue card from part2, 4 from part3 = 11, shuffled properly
  let p1Pool = shuffleArray(DATA.part1);
  // filter out lastIds if possible
  let p1Filtered = p1Pool.filter(t=>!lastIds.includes(t.id));
  if(p1Filtered.length < 6) p1Filtered = p1Pool;
  const p1 = p1Filtered.slice(0,6).flatMap(t=> t.questions.slice(0,1).map(q=> ({part:'Part 1', badge:'PART 1', q:q.q, a:q.a, hint:q.tip, id:t.id, vocab:q.vocab})));
  // Part2: pick cue card not in lastIds
  let p2Pool = shuffleArray(DATA.part2);
  let p2Filtered = p2Pool.filter(t=>!lastIds.includes(t.id));
  const p2topic = (p2Filtered[0] || p2Pool[0]);
  const p2 = [{part:'Part 2', badge:'PART 2 • CUE CARD', q: `${p2topic.title}. ${p2topic.prompts.join('. ')}.`, a:p2topic.answer, hint:p2topic.tip, id:p2topic.id, isCue:true, prompts:p2topic.prompts, title:p2topic.title, vocab:p2topic.vocab}];
  let p3Pool = shuffleArray(DATA.part3);
  let p3Filtered = p3Pool.filter(t=>!lastIds.includes(t.id));
  if(p3Filtered.length < 4) p3Filtered = p3Pool;
  const p3 = p3Filtered.slice(0,4).flatMap(t=> t.questions.slice(0,1).map(q=> ({part:'Part 3', badge:'PART 3', q:q.q, a:q.a, hint:q.tip, id:t.id, vocab:q.vocab})));
  const queue = [...p1, ...p2, ...p3];
  // save ids for next time
  const ids = [...p1Filtered.slice(0,6).map(t=>t.id), p2topic.id, ...p3Filtered.slice(0,4).map(t=>t.id)];
  safeSet('lastMockIds', JSON.stringify(ids));
  return queue;
}
function startMock(){
  mockQueue=buildMockQueue();
  mockIndex=0;
  mockElapsed=0;
  mockSessionAnswered=0;
  // yangi mock — barcha ro'yxatlar va yozuvlar noldan
  mockSessionSaves=[];
  mockAnsweredMap={};
  mockAnswersMeta=[];
  mockRevealAnswer=false;
  mockTranscripts={};
  mockConfidences={};
  stopLiveTranscription();
  const runner=document.getElementById('mockRunner');
  runner.classList.remove('hidden');
  hideMockResults();
  try{runner.scrollIntoView({behavior:'smooth'});}catch(e){}
  renderMockQuestion();
  startMockTimer();
  // save start to history
  const hist=safeJSON('mockHistory',[]);
  hist.unshift({date:new Date().toISOString(), total:mockQueue.length, answered:0, recorded:0, status:'started'});
  safeSet('mockHistory', JSON.stringify(hist.slice(0,20)));
  renderMockHistory();
  updateMockStats();
}
function startMockTimer(){
  clearInterval(mockTimerInterval);
  mockTimerInterval=setInterval(()=>{
    mockElapsed++;
    const m=String(Math.floor(mockElapsed/60)).padStart(2,'0'), s=String(mockElapsed%60).padStart(2,'0');
    document.getElementById('mockTimer').textContent=`${m}:${s}`;
    if(mockElapsed>=14*60) { stopMock(); alert('Mock vaqti tugadi (14 min).'); }
  },1000);
}
// === MOCK PART META (har bir bo'lim uchun alohida rang/nom) ===
function mockPartStyle(part){
  if(part==='Part 1') return {badge:'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-500/20'};
  if(part==='Part 2') return {badge:'bg-amber-400 text-slate-900 border border-amber-400'};
  return {badge:'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20'};
}
function fmtDur(sec){
  sec=Math.max(0, Math.floor(sec||0));
  return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;
}
function mockRec(i){ return mockSessionSaves.find(s=>s.qIdx===i) || null; }
function renderMockQuestion(){
  const item=mockQueue[mockIndex];
  if(!item) return;
  document.getElementById('mockPartLabel').textContent=item.part;
  document.getElementById('mockProgressLabel').textContent=`${mockIndex+1} / ${mockQueue.length}`;
  document.getElementById('mockQBadge').textContent=`${item.badge} • Q${mockIndex+1}`;
  document.getElementById('mockQuestion').textContent=item.q;
  document.getElementById('mockQHint').textContent=item.hint;
  document.getElementById('mockOverallBar').style.width=`${((mockIndex+1)/mockQueue.length*100).toFixed(0)}%`;
  renderMockBestAnswer(item);
  renderMockSavedList();
  // shu savol uchun oldin yozib olingan bo'lsa — playerni tiklaymiz
  const pb=document.getElementById('playback');
  const prev=mockRec(mockIndex);
  lastBlob=null; lastUrl=null;
  if(pb){
    try{ pb.pause(); }catch(e){}
    if(prev){ pb.src=prev.url; pb.classList.remove('hidden'); lastBlob=prev.blob; lastUrl=prev.url; }
    else { pb.removeAttribute('src'); pb.classList.add('hidden'); }
  }
  const st=document.getElementById('recStatus');
  if(st){
    if(prev){ st.textContent='Yozib olingan ✓'; st.className='text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500 text-white'; }
    else if(mockAnsweredMap[mockIndex]){ st.textContent='Saqlangan ✓'; st.className='text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500 text-white'; }
    else { st.textContent='Tayyor'; st.className='text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900'; }
  }
  const bt=document.getElementById('recBtn');
  if(bt) bt.classList.toggle('animate-pulse', false);
  refreshIcons();
  if(autoPlay) setTimeout(()=> playMockQuestion(), 400);
}
// Best Answer — mock davomida yopiq, topshirilgandan keyin ochiladi
function renderMockBestAnswer(item){
  const box=document.getElementById('mockBestAnswer');
  const locked=document.getElementById('mockBestAnswerLocked');
  const btn=document.getElementById('mockRevealBtn');
  if(box) box.textContent=item.a||'';
  if(!box||!locked) return;
  if(mockRevealAnswer){
    box.classList.remove('hidden'); locked.classList.add('hidden');
    if(btn) btn.textContent='Yashirish';
  } else {
    box.classList.add('hidden'); locked.classList.remove('hidden');
    if(btn) btn.textContent='Ko‘rsatish';
  }
}
function revealMockAnswer(force){
  mockRevealAnswer = (typeof force==='boolean') ? force : !mockRevealAnswer;
  const item=mockQueue[mockIndex];
  if(item) renderMockBestAnswer(item);
}
// Har bir bo'lim (Part) uchun alohida ro'yxat — joriy qism ko'rsatiladi
function renderMockSavedList(){
  const el=document.getElementById('mockSavedList');
  const cur=mockQueue[mockIndex];
  if(!el||!cur) return;
  const items=mockQueue.map((it,i)=>({it,i})).filter(x=>x.it.part===cur.part);
  const answered=items.filter(x=>mockAnsweredMap[x.i]).length;
  const rows=items.map(({i})=>{
    const s=mockRec(i);
    return `
    <div class="flex items-center gap-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2">
      <span class="w-6 h-6 shrink-0 rounded-full ${s?'bg-emerald-500 text-white':'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'} grid place-items-center text-[10px] font-extrabold">${i+1}</span>
      <div class="flex-1 min-w-0">
        <div class="text-[12px] font-bold truncate">Savol ${i+1}${mockAnsweredMap[i]?' • saqlangan ✓':(s?' • yozilgan':' • yozuv yo‘q')}</div>
        <div class="text-[11px] text-slate-500">${s? `${fmtDur(s.duration)} • ${new Date(s.date).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : 'tinglash uchun yozuv yo‘q'}</div>
      </div>
      ${s? `<audio src="${s.url}" controls preload="none" class="w-[110px] h-7"></audio>` : ''}
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="flex items-center justify-between mb-2">
      <span class="text-[11px] font-extrabold tracking-wide ${mockPartStyle(cur.part).badge} px-2 py-1 rounded-full">${escapeHTML(cur.part)} RO‘YXATI</span>
      <span class="text-[11px] font-bold text-slate-500">${answered} / ${items.length} saqlangan • ${items.filter(x=>mockRec(x.i)).length} audio</span>
    </div>` + (rows || `<div class="text-[11px] text-slate-500 text-center py-2">Hali javob saqlanmadi — Record bosing</div>`);
  refreshIcons();
}
function playMockQuestion(force){
  const item=mockQueue[mockIndex];
  if(!item) return;
  const btn=document.getElementById('mockPlayBtn');
  btn.innerHTML=`<span class="w-3 h-3 rounded-full bg-white animate-pulse"></span> Eshitilmoqda...`;
  speak(item.q, voicePref, ()=>{
    btn.innerHTML=`<i data-lucide="volume-2" class="w-4 h-4"></i> Savolni eshitish`;
    refreshIcons();
  });
}
function nextMockQuestion(){
  if(mockIndex < mockQueue.length-1){
    mockIndex++; renderMockQuestion();
  } else {
    finishMock();
  }
}
function finishMock(){
  if(!accountUser) requireAccount();
  // mock yakunlandi — tarixni yangilab, natija + Best Answer ro'yxatlarini chiqaramiz
  clearInterval(mockTimerInterval); mockTimerInterval=null;
  const hist=safeJSON('mockHistory',[]);
  if(hist[0]){
    hist[0].status='completed';
    hist[0].answered=mockSessionAnswered;
    hist[0].recorded=mockSessionSaves.length;
  }
  safeSet('mockHistory', JSON.stringify(hist));
  renderMockHistory(); updateMockStats();
  stopMock();
}
function stopMock(){
  clearInterval(mockTimerInterval); mockTimerInterval=null;
  stopSpeak();
  stopLiveTranscription();
  if(mediaRecorder && mediaRecorder.state==='recording') try{ mediaRecorder.stop(); }catch(e){}
  try{ if(mediaRecorder && mediaRecorder.stream) mediaRecorder.stream.getTracks().forEach(tr=>tr.stop()); }catch(e){}
  const runner=document.getElementById('mockRunner');
  if(runner) runner.classList.add('hidden');
  showMockResults();
}
// joriy savol uchun yozuvlar (eski API nomi saqlab qolindi)
function getMockSavedForCurrent(){
  return mockSessionSaves.filter(s=> s.qIdx===mockIndex);
}

/* ============ SPEECH-TO-TEXT (Web Speech API) ============ */
function speechRecAvailable(){
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
function stopLiveTranscription(){
  if(recognition){
    try{ recognition.onresult = null; recognition.onerror = null; recognition.onend = null; recognition.abort(); }catch(e){}
    recognition = null;
  }
}
function startLiveTranscription(){
  if(!speechRecAvailable()){ updateSttStatus('off'); return false; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  try{
    stopLiveTranscription();
    recognition = new SR();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    const qIdx = mockIndex;
    let finalText = '';
    if(!mockTranscripts[qIdx]) mockTranscripts[qIdx] = '';
    if(!mockConfidences[qIdx]) mockConfidences[qIdx] = { sum: 0, count: 0 };
    recognition.onresult = (event) => {
      let interim = '';
      for(let i = event.resultIndex; i < event.results.length; i++){
        const res = event.results[i];
        if(res.isFinal){
          finalText += res[0].transcript + ' ';
          if(typeof res[0].confidence === 'number'){
            mockConfidences[qIdx].sum += res[0].confidence;
            mockConfidences[qIdx].count++;
          }
        } else {
          interim += res[0].transcript;
        }
      }
      mockTranscripts[qIdx] = (finalText + ' ' + interim).replace(/\s+/g, ' ').trim();
      updateSttStatus('live');
      updateLiveTranscriptUI();
    };
    recognition.onerror = (e) => {
      if(e.error === 'not-allowed' || e.error === 'service-not-allowed') updateSttStatus('off');
      else if(e.error === 'no-speech'){ /* kutishda davom etadi */ }
    };
    recognition.onend = () => { updateSttStatus(mockTranscripts[mockIndex] ? 'done' : 'idle'); };
    recognition.start();
    updateSttStatus('live');
    return true;
  }catch(e){ updateSttStatus('off'); return false; }
}
function updateSttStatus(state){
  const el = document.getElementById('sttStatus');
  if(!el) return;
  const map = {
    live:  { t: '● Tinglanmoqda', c: 'text-emerald-600 dark:text-emerald-400' },
    done:  { t: '✓ Matn olindi',  c: 'text-emerald-600 dark:text-emerald-400' },
    idle:  { t: '',               c: '' },
    off:   { t: 'Chrome/Edge da ishlaydi', c: 'text-slate-400' }
  };
  const s = map[state] || map.idle;
  el.textContent = s.t; el.className = 'text-[10px] font-bold ' + s.c;
}
function updateLiveTranscriptUI(){
  const el = document.getElementById('liveTranscript');
  if(!el) return;
  const text = mockTranscripts[mockIndex] || '';
  el.textContent = text || 'Gapirganingizda shu yerda matn ko\u2018rinadi (Chrome/Edge).';
}
async function toggleRecording(){
  const btn=document.getElementById('recBtn');
  const status=document.getElementById('recStatus');
  const bar=document.getElementById('recBar');
  const time=document.getElementById('recTime');
  const playback=document.getElementById('playback');
  if(mediaRecorder && mediaRecorder.state==='recording'){
    stopLiveTranscription();
    mediaRecorder.stop();
    status.textContent='Saqlanmoqda...';
    btn.classList.remove('animate-pulse');
    clearInterval(recTimer);
    return;
  }
  try{
    const recordingEpoch=accountEpoch;
    const recordingTopic=currentModalTopic?.id;
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    if(recordingEpoch!==accountEpoch){stream.getTracks().forEach(t=>t.stop());return;}
    recChunks=[];
    mediaRecorder=new MediaRecorder(stream);
    mediaRecorder.ondataavailable=e=> recChunks.push(e.data);
    mediaRecorder.onstop=()=>{
      if(recordingEpoch!==accountEpoch){stream.getTracks().forEach(t=>t.stop());return;}
      const blob=new Blob(recChunks,{type:'audio/webm'});
      lastBlob=blob;
      lastUrl=URL.createObjectURL(blob);
      playback.src=lastUrl; playback.classList.remove('hidden');
      // enable save
      status.textContent='Yozib olindi ✓';
      status.className='text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500 text-white';
      stream.getTracks().forEach(t=>t.stop());
      // FAQAT shu savolga tegishli yozuv sifatida saqlanadi (har bir bo'lim alohida ro'yxat)
      const rec={qIdx:mockIndex, duration:Math.floor((Date.now()-recStart)/1000), date:new Date().toISOString(), url:lastUrl, blob};
      mockSessionSaves = mockSessionSaves.filter(s=> s.qIdx!==mockIndex).concat([rec]);
      renderMockSavedList();
      const bt=document.getElementById('recBtn');
      if(bt) bt.classList.remove('animate-pulse');
    };
    mediaRecorder.start();
    recStart=Date.now();
    startLiveTranscription();
    status.textContent='Yozilmoqda...';
    status.className='text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-500 text-white animate-pulse';
    btn.classList.add('animate-pulse');
    recTimer=setInterval(()=>{
      const sec=Math.floor((Date.now()-recStart)/1000);
      const m=String(Math.floor(sec/60)).padStart(2,'0'), s=String(sec%60).padStart(2,'0');
      time.textContent=`${m}:${s}`;
      bar.style.width=Math.min(100, sec/90*100)+'%';
    },200);
  }catch(e){
    alert('Mikrofonga ruxsat bering. Brauzer sozlamalaridan mikrofonni yoqing.\n'+e.message);
  }
}
function playLastRecording(){
  const audio=document.getElementById('playback');
  if(audio.src) audio.play();
  else alert('Avval yozib oling!');
}
function saveMockAnswer(){
  if(!requireAccount()) return;
  const item=mockQueue[mockIndex];
  const rec=mockRec(mockIndex);
  if(!item || !rec || !rec.blob){ alert('Avval Record bosing va javob bering!'); return; }
  // joriy sessiya ro'yxati (bo'limlar bo'yicha)
  if(mockAnsweredMap[mockIndex]) return;
  mockAnsweredMap[mockIndex]=true;
  mockAnswersMeta.push({qIdx:mockIndex, part:item.part, q:item.q, duration:rec.duration, date:rec.date});
  mockSessionAnswered++;
  // storage meta
  const saves=safeJSON('mockSavesMeta',[]);
  saves.push({q:item.q, part:item.part, date:rec.date, duration:rec.duration});
  safeSet('mockSavesMeta', JSON.stringify(saves.slice(-200)));
  safeSet('mockDone', String(parseInt(safeGet('mockDone')||'0')+1));
  const hist=safeJSON('mockHistory',[]);
  if(hist[0]) hist[0].answered=mockSessionAnswered;
  safeSet('mockHistory', JSON.stringify(hist));
  updateMockStats(); renderMockHistory(); renderMockSavedList();
  const st=document.getElementById('recStatus');
  if(st){
    st.textContent='Saqlab qo\u2018yildi \u2713';
    st.className='text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500 text-white';
  }
  setTimeout(()=>{
    const s2=document.getElementById('recStatus');
    if(s2){ s2.textContent='Tayyor'; s2.className='text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900'; }
  }, 1500);
  // auto next after 1s
  const savedEpoch=accountEpoch;
  setTimeout(()=>{if(savedEpoch===accountEpoch) nextMockQuestion();}, 900);
}
function renderMockHistory(){
  const hist=safeJSON('mockHistory',[]);
  const meta=safeJSON('mockSavesMeta',[]);
  const el=document.getElementById('mockHistory');
  if(!el) return;
  if(!hist.length && !meta.length){
    el.innerHTML=`<div class="text-[13px] text-slate-500 text-center py-6">Hali mock topshirmadingiz.<br>Birinchi mockni boshlang — natijalar shu yerda saqlanadi.</div>`;
    return;
  }
  el.innerHTML = (hist.length? hist : [{date:new Date().toISOString(), total:11, status:'completed'}]).slice(0,6).map(h=>{
    // har bir mock uchun o'z javob soni (avval hamma qatorda bir xil raqam chiqardi)
    const ans = (typeof h.answered==='number') ? h.answered : (h.status==='completed' ? meta.length : 0);
    const audio = (typeof h.recorded==='number') ? h.recorded : 0;
    return `
    <div class="flex items-center gap-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5">
      <div class="w-8 h-8 rounded-full ${h.status==='completed'?'bg-emerald-500':'bg-amber-400'} text-white grid place-items-center">${h.overall? `<span class="text-[10px] font-extrabold">${escapeHTML(String(h.overall))}</span>`:`<i data-lucide="${h.status==='completed'?'check':'clock'}" class="w-4 h-4"></i>`}</div>
      <div class="flex-1 min-w-0">
        <div class="text-[12px] font-bold">${new Date(h.date).toLocaleDateString()} • ${new Date(h.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
        <div class="text-[11px] text-slate-500">${h.total||11} savol • ${h.status==='completed'?'Yakunlandi':'Boshlangan'}</div>
      </div>
      <span class="text-[11px] font-bold bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 px-2 py-1 rounded-full whitespace-nowrap">${ans} javob${audio?` • ${audio} audio`:''}</span>
    </div>`;
  }).join('');
  refreshIcons();
  const doneEl=document.getElementById('mockStatsDone');
  if(doneEl) doneEl.textContent = meta.length || safeGet('mockDone')||'0';
}
function clearMockHistory(){
  if(!requireAccount()) return;
  if(!confirm('Barcha mock tarixini o‘chirishni istaysizmi?')) return;
  ['mockHistory','mockSavesMeta','mockDone'].forEach(safeRemove);
  mockSessionSaves=[]; mockAnsweredMap={}; mockAnswersMeta=[]; mockSessionAnswered=0;
  renderMockHistory(); updateMockStats();
}
function updateMockStats(){
  const q = (DATA.part1.length*4 + DATA.part2.length + DATA.part3.length*4);
  const totalEl=document.getElementById('mockStatsTotal');
  if(totalEl) totalEl.textContent = q;
  const done = safeJSON('mockSavesMeta',[]).length;
  const el=document.getElementById('mockStatsDone');
  if(el) el.textContent=done;
  syncCounts();
}
// Hero/nav ko'rsatkichlarini haqiqiy ma'lumotdan hisoblaymiz (statik "608", "35+" xatolari o'rniga)
function syncCounts(){
  const p1=DATA.part1.length, p2=DATA.part2.length, p3=DATA.part3.length;
  const best = p1*4 + p2 + p3*4;           // har bir savol uchun 1 ta Best Answer
  const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent=val; };
  set('navCountP1', p1); set('navCountP2', p2); set('navCountP3', p3);
  set('mNavCountP1', p1); set('mNavCountP2', p2); set('mNavCountP3', p3);
  set('heroTopicCount', p1+p2+p3);
  set('heroBestCount', best);
  set('heroP1Count', p1); set('heroP1Q', p1*4);
  set('heroP2Count', p2); set('heroP2Q', p2*4);
  set('heroP3Count', p3); set('heroP3Q', p3*4);
  set('mockStatsTotal', best);
  ['', '2'].forEach(sfx=>{ set('p1HeaderCount'+sfx, p1); set('p2HeaderCount'+sfx, p2); set('p3HeaderCount'+sfx, p3); });
}

// HERO audio demo — vaqt va progress haqiqiy holatga qarab (qotib qolgan "0:24 / 1:08" o'rniga)
let heroAudioTimer=null;
let heroAudioPlaying=false;
function heroAudioText(){
  return "Describe a person who taught you something important. Who is this person, how do you know this person, what this person taught you, and explain why it was important.";
}
function heroEstimatedDuration(text){
  // nutq tezligi ~2.6 so'z/sek (rate=1.0); sozlangan tezlikka moslashtiramiz
  const words=text.trim().split(/\s+/).length;
  const rate=Math.min(1.3, Math.max(0.7, parseFloat(speechRate)||1));
  return Math.max(4, Math.round(words/(2.6*rate)));
}
function heroAudioResetUI(total){
  const bar=document.getElementById('heroProgress');
  const timeEl=document.getElementById('heroAudioTime');
  const btn=document.getElementById('heroPlayBtn');
  if(bar) bar.style.width='0%';
  if(timeEl) timeEl.textContent=`0:00 / 0:${String(total).padStart(2,'0')}`;
  if(btn) btn.innerHTML='<i data-lucide="play" class="w-4 h-4 fill-current"></i>';
  refreshIcons();
}
function playHeroAudio(){
  const bar=document.getElementById('heroProgress');
  const timeEl=document.getElementById('heroAudioTime');
  const btn=document.getElementById('heroPlayBtn');
  // qayta bosilsa — to'xtatamiz
  if(heroAudioPlaying){
    stopSpeak();
    if(heroAudioTimer){ clearInterval(heroAudioTimer); heroAudioTimer=null; }
    heroAudioPlaying=false;
    heroAudioResetUI(heroEstimatedDuration(heroAudioText()));
    return;
  }
  const text=heroAudioText();
  const total=heroEstimatedDuration(text);
  let elapsed=0;
  heroAudioPlaying=true;
  if(bar) bar.style.width='0%';
  if(btn) btn.innerHTML='<i data-lucide="square" class="w-4 h-4 fill-current"></i>';
  refreshIcons();
  const render=()=>{
    const sec=String(elapsed%60).padStart(2,'0');
    const tsec=String(total%60).padStart(2,'0');
    if(timeEl) timeEl.textContent=`0:${sec} / 0:${tsec}`;
    if(bar) bar.style.width=Math.min(100, elapsed/total*100).toFixed(0)+'%';
  };
  render();
  if(heroAudioTimer) clearInterval(heroAudioTimer);
  heroAudioTimer=setInterval(()=>{
    elapsed++;
    if(elapsed>total) elapsed=total;
    render();
    if(elapsed>=total){ clearInterval(heroAudioTimer); heroAudioTimer=null; }
  },1000);
  const finish=()=>{
    if(heroAudioTimer){ clearInterval(heroAudioTimer); heroAudioTimer=null; }
    heroAudioPlaying=false;
    heroAudioResetUI(total);
  };
  // brauzerda ovoz mavjud bo'lmasa ham tugma holati to'g'ri qoladi
  try{
    const u=speak(text, voicePref, finish);
    if(!u) finish();
  }catch(e){ finish(); }
}
// DAILY
// DAILY
function renderDaily(){
  document.getElementById('dailyNum').textContent=String(dailyNum).padStart(2,'0');
  const ri=document.getElementById('dailyRestartInfo'); if(ri) ri.textContent=String(dailyNum).padStart(2,'0');
  document.getElementById('streakVal').textContent=streak+' kun';
  // week plan
  const weekEl=document.getElementById('weekPlan');
  weekEl.innerHTML = Array.from({length:7},(_,i)=>{
    const active = i=== (new Date().getDay()%7);
    const done = i < (streak%7);
    return `<div class="rounded-xl p-2 ${active?'bg-amber-400 text-slate-900':'bg-white/10 dark:bg-white/5'} ${done?'ring-2 ring-emerald-400':''}">
      <div class="text-[10px] font-bold">${['Ya','Du','Se','Ch','Pa','Ju','Sh'][i]}</div>
      <div class="text-[11px] font-mono font-bold">${done?'✓': active? '●':'·'}</div>
    </div>`;
  }).join('');
  // lesson content: pick deterministic daily topics
  const p1 = DATA.part1[(dailyNum*7) % DATA.part1.length];
  const p2 = DATA.part2[(dailyNum*13) % DATA.part2.length];
  const p3 = DATA.part3[(dailyNum*5) % DATA.part3.length];
  document.getElementById('todayTopicName').textContent = `${p1.title} + ${p2.title.slice(0,32)}... + ${p3.title}`;
  const lessonEl=document.getElementById('dailyLesson');
  lessonEl.innerHTML = `
    <div class="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
      <div class="bg-sky-50 dark:bg-sky-500/10 px-4 py-2 flex items-center justify-between">
        <span class="text-[11px] font-extrabold tracking-wide text-sky-700 dark:text-sky-300">PART 1 • 6 min</span>
        <button onclick="speak('${p1.questions[0].q}', voicePref)" class="bg-white dark:bg-white/10 border border-sky-200 dark:border-white/10 rounded-full px-3 py-1 text-[11px] font-bold inline-flex items-center gap-1"><i data-lucide="volume-2" class="w-3 h-3"></i> Eshitish</button>
      </div>
      <div class="p-4">
        <h4 class="font-bold text-[14px]">${escapeHTML(p1.title)} — ${escapeHTML(p1.questions[0].q)}</h4>
        <p class="text-[13px] leading-6 mt-2 text-slate-600 dark:text-slate-300">${escapeHTML(p1.questions[0].a.slice(0,180))}...</p>
        <div class="mt-3 flex gap-2">
          <button onclick="openTopic('${p1.id}')" class="bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full px-4 py-1.5 text-[12px] font-bold">Mavzuni ochish</button>
          <button onclick="speak('${p1.questions[1].q}', voicePref)" class="bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full px-3 py-1.5 text-[12px] font-bold">2-savolni eshitish</button>
        </div>
      </div>
    </div>
    <div class="rounded-2xl border-2 border-amber-300 dark:border-amber-500/30 overflow-hidden">
      <div class="bg-amber-400 px-4 py-2 flex items-center justify-between">
        <span class="text-[11px] font-extrabold tracking-wide text-slate-900">PART 2 • 8 min — CUE CARD</span>
        <span class="text-[10px] font-bold bg-slate-900 text-white px-2 py-0.5 rounded-full">1 min prep + 2 min talk</span>
      </div>
      <div class="p-4 bg-amber-50/50 dark:bg-amber-500/5">
        <h4 class="font-serif text-[15px] leading-tight">${escapeHTML(p2.title)}</h4>
        <ul class="mt-2 space-y-1">
          ${p2.prompts.map(pr=>`<li class="text-[12px] flex gap-2"><span class="text-amber-600">•</span>${escapeHTML(pr)}</li>`).join('')}
        </ul>
        <div class="mt-3 flex gap-2">
          <button onclick="speak('${p2.title}. ${p2.prompts.join('. ')}', voicePref)" class="bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full px-4 py-1.5 text-[12px] font-bold inline-flex items-center gap-1"><i data-lucide="volume-2" class="w-3 h-3"></i> Cue cardni eshitish</button>
          <button onclick="openTopic('${p2.id}')" class="bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full px-3 py-1.5 text-[12px] font-bold">Namuna javob</button>
        </div>
      </div>
    </div>
    <div class="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
      <div class="bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 flex items-center justify-between">
        <span class="text-[11px] font-extrabold tracking-wide text-emerald-700 dark:text-emerald-300">PART 3 • 6 min</span>
        <button onclick="speak('${p3.questions[0].q}', voicePref)" class="bg-white dark:bg-white/10 border border-emerald-200 dark:border-white/10 rounded-full px-3 py-1 text-[11px] font-bold inline-flex items-center gap-1"><i data-lucide="volume-2" class="w-3 h-3"></i> Eshitish</button>
      </div>
      <div class="p-4">
        <h4 class="font-bold text-[14px]">${escapeHTML(p3.questions[0].q)}</h4>
        <p class="text-[13px] leading-6 mt-2 text-slate-600 dark:text-slate-300">${escapeHTML(p3.questions[0].a.slice(0,200))}...</p>
        <button onclick="openTopic('${p3.id}')" class="mt-3 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full px-4 py-1.5 text-[12px] font-bold">Muhokamani ochish</button>
      </div>
    </div>
  `;
  refreshIcons();
  // history
  const hist=safeJSON('dailyHistory',[]);
  document.getElementById('dailyHistory').innerHTML = hist.slice(0,5).map(h=>`
    <div class="flex items-center gap-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2">
      <div class="w-8 h-8 rounded-full bg-emerald-500 text-white grid place-items-center text-[11px] font-bold">${h.num}</div>
      <div class="flex-1"><div class="text-[12px] font-bold">${escapeHTML(h.title)}</div><div class="text-[11px] text-slate-500">${new Date(h.date).toLocaleDateString()} • ${h.duration}</div></div>
      <span class="text-[11px] font-bold bg-white dark:bg-white/10 px-2 py-1 rounded-full">✓</span>
    </div>
  `).join('') || `<div class="text-[12px] text-slate-500 text-center py-4">Hali dars yakunlanmadi. 20 daqiqalik darsni boshlang — streak yig'ing!</div>`;
  updateDailyTimerUI();
}
function updateDailyTimerUI(){
  const m=String(Math.floor(Math.max(0,dailyRemaining)/60)).padStart(2,'0'), s=String(Math.max(0,dailyRemaining)%60).padStart(2,'0');
  const t=document.getElementById('dailyTimer'); if(t) t.textContent=`${m}:${s}`;
  const p=document.getElementById('dailyProgress'); if(p) p.style.width=`${Math.min(100,(1 - dailyRemaining/(20*60))*100)}%`;
  const a=document.getElementById('autoNextLabel'); if(a) a.textContent = dailyRunning ? `${m}:${s} dan so'ng auto` : `${m}:${s}`;
  const btn=document.getElementById('dailyToggle');
  if(btn && !dailyRunning) btn.className='w-20 bg-emerald-500 text-white rounded-full py-1.5 text-[12px] font-bold';
}
// bitta joydan boshqariladigan taymer (visibility/fokus bilan ham mos)
function runDailyInterval(){
  clearInterval(dailyInterval);
  dailyInterval=setInterval(()=>{
    dailyRemaining--;
    updateDailyTimerUI();
    if(dailyRemaining<=0) completeDaily(true);
  },1000);
}
function toggleDaily(){
  if(dailyRunning){ pauseDaily(); } else { startDaily(); }
}
function startDaily(){
  if(dailyRunning) return;
  dailyRunning=true;
  const btn=document.getElementById('dailyToggle');
  if(btn){ btn.textContent='Pauza'; btn.className='w-20 bg-amber-400 text-slate-900 rounded-full py-1.5 text-[12px] font-bold'; }
  runDailyInterval();
}
function pauseDaily(){
  dailyRunning=false;
  clearInterval(dailyInterval); dailyInterval=null;
  const btn=document.getElementById('dailyToggle');
  if(btn){ btn.textContent='Davom ettirish'; btn.className='w-20 bg-emerald-500 text-white rounded-full py-1.5 text-[12px] font-bold'; }
}
// === RESTART: joriy 20 daqiqalik darsni boshidan boshlash ===
function restartDaily(){
  clearInterval(dailyInterval); dailyInterval=null;
  dailyRemaining=20*60;
  dailyRunning=false;
  updateDailyTimerUI();
  const btn=document.getElementById('dailyToggle');
  if(btn){ btn.textContent='Pauza'; }
  renderDailyTopicsInfo();
  startDaily();                        // darhol qayta ishga tushadi
  const note=document.getElementById('dailyRestartNote');
  if(note){
    note.textContent=`Dars qaytadan boshlandi • 20:00 (Dars #${String(dailyNum).padStart(2,'0')})`;
    note.classList.remove('hidden');
    setTimeout(()=>note.classList.add('hidden'), 4000);
  }
}
// === TO'LIQ RESET: dars raqami 01 dan, streak qaytadan ===
function resetDailyProgress(){
  if(!requireAccount()) return;
  if(!confirm('Daily progress noldan boshlansinmi? (dars #01, timer 20:00, 7 kunlik reja yangilanadi)')) return;
  clearInterval(dailyInterval); dailyInterval=null;
  dailyRunning=false;
  dailyNum=1; streak=1;
  safeSet('dailyNum','1'); safeSet('streak','1');
  safeRemove('dailyHistory'); safeRemove('completedTopics');
  dailyRemaining=20*60;
  renderDaily();
  const btn=document.getElementById('dailyToggle');
  if(btn){ btn.textContent='Boshlash'; btn.className='w-20 bg-emerald-500 text-white rounded-full py-1.5 text-[12px] font-bold'; }
  const note=document.getElementById('dailyRestartNote');
  if(note){ note.textContent='Hammasi noldan: Dars #01 tayyor • 20:00'; note.classList.remove('hidden'); setTimeout(()=>note.classList.add('hidden'), 4000); }
}
// faqat mavzu nomlarini yangilab beradi (restart paytida dars almashmasligi uchun)
function renderDailyTopicsInfo(){
  const el=document.getElementById('todayTopicName');
  if(!el) return;
  const p1 = DATA.part1[(dailyNum*7) % DATA.part1.length];
  const p2 = DATA.part2[(dailyNum*13) % DATA.part2.length];
  const p3 = DATA.part3[(dailyNum*5) % DATA.part3.length];
  el.textContent = `${p1.title} + ${p2.title.slice(0,32)}... + ${p3.title}`;
}
function completeDaily(auto){
  if(!requireAccount()){ clearInterval(dailyInterval); dailyInterval=null; dailyRunning=false; return; }
  clearInterval(dailyInterval); dailyInterval=null;
  dailyRunning=false;
  const p1 = DATA.part1[(dailyNum*7) % DATA.part1.length];
  const hist=safeJSON('dailyHistory',[]);
  hist.unshift({num:dailyNum, title:p1.title, date:new Date().toISOString(), duration: auto?'20:00 auto': `${20*60 - dailyRemaining} sec`});
  safeSet('dailyHistory', JSON.stringify(hist.slice(0,20)));
  const completed = new Set(safeJSON('completedTopics', []));
  ['part1','part2','part3'].forEach((part,i)=>completed.add(part+':'+DATA[part][(dailyNum*[7,13,5][i]) % DATA[part].length].id));
  safeSet('completedTopics', JSON.stringify([...completed]));
  // next lesson
  dailyNum++;
  streak++;
  safeSet('dailyNum', String(dailyNum));
  safeSet('streak', String(streak));
  dailyRemaining=20*60;
  renderDaily();
  const tgl=document.getElementById('dailyToggle');
  if(tgl){ tgl.textContent='Boshlash'; tgl.className='w-20 bg-emerald-500 text-white rounded-full py-1.5 text-[12px] font-bold'; }
  if(auto){
    alert('20 daqiqa tugadi — keyingi mavzuga avtomatik o‘tdingiz! Davom eting.');
    setTimeout(startDaily, 800);
  } else {
    alert('Ajoyib! Dars yakunlandi. Keyingi 20 daqiqalik dars tayyor.');
  }
}
function skipDaily(){
  if(!confirm('Keyingi mavzuga o‘tishni istaysizmi? Joriy dars yakunlangan deb hisoblanadi.')) return;
  completeDaily(false);
}
function resetDailyLesson(){ restartDaily(); }

// SETTINGS modal
function openSettings(){ document.getElementById('settingsModal').classList.remove('hidden'); document.body.style.overflow='hidden'; refreshIcons(); }
function closeSettings(){ document.getElementById('settingsModal').classList.add('hidden'); document.body.style.overflow=''; saveSettings(); }

window.router=router; window.toggleTheme=toggleTheme; window.setTheme=setTheme; window.doGlobalSearch=doGlobalSearch;
window.setPreviewTab=setPreviewTab; window.previewMore=previewMore; window.renderPart=renderPart; window.openTopic=openTopic;
window.closeTopic=closeTopic; window.playQuestionAudio=playQuestionAudio; window.toggleRecForQuestion=toggleRecForQuestion;
window.startRecordingForTopic=startRecordingForTopic; window.addToDailyFromModal=addToDailyFromModal;
window.setVoice=setVoice; window.setRate=setRate; window.previewVoice=previewVoice; window.switchModalVoice=switchModalVoice;
window.saveSettings=saveSettings; window.openSettings=openSettings; window.closeSettings=closeSettings;
window.toggleMobileMenu=toggleMobileMenu; window.filterPart2=filterPart2; window.speak=speak; window.stopSpeak=stopSpeak;
window.playHeroAudio=playHeroAudio; window.startMock=startMock; window.stopMock=stopMock; window.nextMockQuestion=nextMockQuestion;
window.playMockQuestion=playMockQuestion; window.toggleRecording=toggleRecording; window.playLastRecording=playLastRecording;
window.saveMockAnswer=saveMockAnswer; window.clearMockHistory=clearMockHistory; window.toggleDaily=toggleDaily;
window.closeMockResults=closeMockResults; window.revealMockAnswer=revealMockAnswer; window.speakMockBestAnswer=speakMockBestAnswer;
window.downloadMockReport=downloadMockReport; window.hideMockResults=hideMockResults;
window.completeDaily=completeDaily; window.skipDaily=skipDaily; window.renderMockHistory=renderMockHistory;
window.restartDaily=restartDaily; window.resetDailyProgress=resetDailyProgress; window.resetDailyLesson=resetDailyLesson;
window.handleAvatarChange=handleAvatarChange; window.saveNickname=saveNickname;

function closeMockResults(){ hideMockResults(); }
function hideMockResults(){
  const el=document.getElementById('mockResults');
  if(el) el.classList.add('hidden');
}
/* ================= MOCK AUDIO TAHLILI & BAHOLASH ================= */
const PART_TARGETS = {
  'Part 1': { min: 6, good: 12, great: 18, label: '12\u201330 soniya' },
  'Part 2': { min: 35, good: 60, great: 90, label: '1:30\u20132:00 daqiqa' },
  'Part 3': { min: 7, good: 15, great: 25, label: '15\u201340 soniya' }
};

// Yozuvni VAD (voice activity detection) bilan tahlil qiladi:
// haqiqiy gapirish vaqti, pauzalar, ovoz darajasi.
async function analyzeRecording(blob){
  const info = { ok:false, totalSec:0, voicedSec:0, speechRatio:0, pauses:0, longPauses:0, maxPause:0, rms:0 };
  if(!blob) return info;
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return info;
    const ctx = new AC();
    try{
      const buf = await blob.arrayBuffer();
      const audio = await ctx.decodeAudioData(buf);
      const ch = audio.getChannelData(0);
      const sr = audio.sampleRate;
      const frame = Math.max(64, Math.floor(sr * 0.03));
      const rmsArr = [];
      let maxRms = 0, sumRms = 0;
      for(let i = 0; i < ch.length; i += frame){
        let s = 0; const end = Math.min(i + frame, ch.length); const n = end - i;
        for(let j = i; j < end; j++){ const v = ch[j]; s += v * v; }
        const rms = Math.sqrt(s / n);
        rmsArr.push(rms); sumRms += rms; if(rms > maxRms) maxRms = rms;
      }
      if(!rmsArr.length) return info;
      const frameSec = frame / sr;
      const thresh = Math.max(0.006, maxRms * 0.05);
      let voiced = 0, total = 0, curSilence = 0, pauses = 0, longPauses = 0, maxPause = 0;
      for(const r of rmsArr){
        total += frameSec;
        if(r >= thresh){
          voiced += frameSec;
          if(curSilence > 0.5){ pauses++; if(curSilence > maxPause) maxPause = curSilence; if(curSilence >= 1.2) longPauses++; }
          curSilence = 0;
        } else {
          curSilence += frameSec;
        }
      }
      if(curSilence > 0.5){ pauses++; if(curSilence > maxPause) maxPause = curSilence; if(curSilence >= 1.2) longPauses++; }
      info.ok = true;
      info.totalSec = total;
      info.voicedSec = voiced;
      info.speechRatio = total ? (voiced / total) : 0;
      info.pauses = pauses;
      info.longPauses = longPauses;
      info.maxPause = Math.round(maxPause * 10) / 10;
      info.rms = rmsArr.length ? (sumRms / rmsArr.length) : 0;
    } finally { try{ ctx.close(); }catch(e){} }
  }catch(e){ /* decode qo'llab-quvvatlanmasa, pastda konservativ fallback */ }
  return info;
}

async function analyzeMockSession(){
  const recs = (mockSessionSaves || []).filter(r => mockAnsweredMap[r.qIdx]);
  const out = [];
  await Promise.all(recs.map(async r => {
    const item = mockQueue[r.qIdx];
    const a = await analyzeRecording(r.blob);
    a.qIdx = r.qIdx;
    a.part = item ? item.part : 'Part 1';
    a.wallSec = r.duration || 0;
    a.transcript = mockTranscripts[r.qIdx] || '';
    const c = mockConfidences[r.qIdx];
    a.asrConfidence = (c && c.count) ? (c.sum / c.count) : null;
    a.tr = analyzeTranscript(a.transcript, item ? item.vocab : null);
    if(!a.ok){
      // audio decode ishlamasa — yozuv davomiyligiga qarab konservativ baho
      a.estimated = true;
      a.totalSec = a.wallSec || 0;
      a.voicedSec = Math.max(0, (a.wallSec || 0) * 0.6);
      a.speechRatio = 0.6;
    }
    out.push(a);
  }));
  return out;
}

function lengthScore(voicedSec, part){
  const t = PART_TARGETS[part] || PART_TARGETS['Part 1'];
  if(voicedSec >= t.great) return 1;
  if(voicedSec >= t.good) return 0.8 + 0.2 * ((voicedSec - t.good) / (t.great - t.good));
  if(voicedSec >= t.min) return 0.55 + 0.25 * ((voicedSec - t.min) / (t.good - t.min));
  if(voicedSec > 0) return 0.2 + 0.35 * (voicedSec / t.min);
  return 0;
}
function continuityScore(speechRatio){
  if(speechRatio >= 0.85) return 0.95;
  if(speechRatio >= 0.75) return 0.8 + 0.15 * ((speechRatio - 0.75) / 0.1);
  if(speechRatio >= 0.6) return 0.65 + 0.15 * ((speechRatio - 0.6) / 0.15);
  if(speechRatio >= 0.45) return 0.5 + 0.15 * ((speechRatio - 0.45) / 0.15);
  return Math.max(0.05, 0.45 * (speechRatio / 0.45));
}
function clampBand(raw, comp){
  let b = Math.round((raw * comp) * 2) / 2; // 0.5 qadam
  b = Math.min(9, Math.max(3, b));
  return b;
}

/* ============ MATN TAHLILI (speech-to-text natijasidan) ============ */
const FILLERS = ['um','uh','erm','hmm','you know','i mean','like','basically','actually','so yeah','well'];
const CONNECTORS = ['however','moreover','furthermore','although','because','therefore','in addition','for example','for instance','while','whereas','on the other hand','as a result','consequently','besides','despite'];

function analyzeTranscript(text, bestVocab){
  const t = { wordCount:0, uniqueRatio:0, longWordRatio:0, fillers:0, connectorCount:0, vocabMatch:0 };
  if(!text) return t;
  const clean = String(text).toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ');
  const tokens = clean.split(/\s+/).filter(Boolean);
  const words = tokens.filter(w => /[a-z]/.test(w));
  t.wordCount = words.length;
  if(t.wordCount){
    const unique = new Set(words);
    t.uniqueRatio = unique.size / t.wordCount;
    t.longWordRatio = words.filter(w => w.length >= 7).length / t.wordCount;
    t.fillers = FILLERS.filter(f => {
      const pat = f.indexOf(' ') > -1 ? f.replace(/ /g, '\\s+') : '\\b' + f + '\\b';
      return new RegExp(pat, 'g').test(clean);
    }).length;
    t.connectorCount = CONNECTORS.filter(c => new RegExp('\\b' + c + '\\b', 'g').test(clean)).length;
    if(Array.isArray(bestVocab) && bestVocab.length){
      t.vocabMatch = bestVocab.filter(v => clean.indexOf(String(v).toLowerCase()) > -1).length;
    }
  }
  return t;
}
function lexicalFromTranscript(t){
  if(!t || !t.wordCount) return 0;
  const div = Math.min(1, t.uniqueRatio / 0.55);   // 0.55 unikallik ~ to'liq
  const adv = Math.min(1, t.longWordRatio / 0.15); // uzun/akademik so'zlar
  const conn = Math.min(1, t.connectorCount / 2);
  return 0.25 + 0.4 * div + 0.2 * adv + 0.15 * conn;
}
function grammarFromTranscript(t){
  if(!t || !t.wordCount) return 0;
  const conn = Math.min(1, t.connectorCount / 2);
  const len = Math.min(1, t.wordCount / 60);
  const fillPen = Math.min(0.3, t.fillers * 0.05);
  return Math.max(0.1, 0.3 + 0.4 * conn + 0.3 * len - fillPen);
}

// Ballar endi faqat o'lchangan signallardan kelib chiqadi (random/bonus yo'q).
function computeBands(analyses, answered, total){
  const n = analyses.length;
  const avg = f => n ? analyses.reduce((s, a) => s + f(a), 0) / n : 0;
  const lenAvg = avg(a => lengthScore(a.voicedSec, a.part));
  const contAvg = avg(a => continuityScore(a.speechRatio));
  const levelAvg = avg(a => Math.min(1, a.rms * 6));
  const lexT = avg(a => lexicalFromTranscript(a.tr));
  const gramT = avg(a => grammarFromTranscript(a.tr));
  const longPauses = analyses.reduce((s, a) => s + (a.longPauses || 0), 0);
  const maxPause = analyses.reduce((s, a) => Math.max(s, a.maxPause || 0), 0);
  const fillers = analyses.reduce((s, a) => s + ((a.tr && a.tr.fillers) || 0), 0);
  const wordCount = analyses.reduce((s, a) => s + ((a.tr && a.tr.wordCount) || 0), 0);
  const hasTranscript = analyses.some(a => a.tr && a.tr.wordCount);
  const asrConf = avg(a => a.asrConfidence != null ? a.asrConfidence : 0);
  const hasAsr = analyses.some(a => a.asrConfidence != null);
  // ASR ishonchi odatda 0.6–0.95 oralig'ida — uni 0..1 "tiniqlik"ga keltiramiz
  const asrClarity = Math.max(0, Math.min(1, (asrConf - 0.55) / 0.35));
  const ratio = total ? (answered / total) : 0;
  const comp = 0.35 + 0.65 * ratio;

  const pausePen = Math.min(1.5, longPauses * 0.2 + (maxPause >= 5 ? 0.5 : 0) + Math.min(0.4, fillers * 0.05));
  const flu  = clampBand(2.5 + (contAvg * 0.7 + lenAvg * 0.3) * 6.5 - pausePen, comp);
  // Lexical: transkript bor bo'lsa — so'z boyligi; yo'q bo'lsa — davomiylik/qat'iylik
  const lex  = clampBand(2.5 + (hasTranscript ? (lexT * 0.7 + lenAvg * 0.3) : (lenAvg * 0.8 + contAvg * 0.2)) * 6.5, comp);
  // Grammar: transkript bor bo'lsa — bog'lovchilar + uzunlik; yo'q bo'lsa — umumiy o'lchov
  const gram = clampBand(2.5 + (hasTranscript ? (gramT * 0.7 + contAvg * 0.3) : (lenAvg * 0.5 + contAvg * 0.5)) * 6.5, comp);
  // Pronunciation: ASR ishonchi (tiniqlik) bor bo'lsa ishlatiladi, aks holda ovoz sifati
  const pron = clampBand(2.5 + (hasAsr ? (asrClarity * 0.55 + contAvg * 0.45) : (levelAvg * 0.25 + contAvg * 0.5 + lenAvg * 0.25)) * 6.5, comp);

  return { flu, lex, gram, pron, ratio, longPauses, maxPause, lenAvg, contAvg, hasTranscript, hasAsr, fillers, wordCount };
}

function buildMockFeedback(b, analyses, answered, total){
  const f = [];
  f.push(answered + ' / ' + total + ' savolga javob berdingiz.');
  f.push('Nutq davomiyligi: yozuv vaqtining ~' + Math.round(b.contAvg * 100) + '% qismida haqiqatdan gapirgansiz (pauza emas).');
  if(b.longPauses > 0) f.push(b.longPauses + ' ta uzun pauza aniqlandi \u2014 oqimni saqlash uchun pauzalarni qisqartiring.');
  if(b.maxPause >= 3) f.push('Eng uzun pauza ' + b.maxPause.toFixed(1) + ' soniya.');

  // Speech-to-text natijalari
  if(b.hasTranscript){
    f.push('Speech-to-text: jami ~' + b.wordCount + ' so\u2018z aytdingiz, shundan ' + b.fillers + ' ta to\u2018ldiruvchi so\u2018z (um, like, you know).');
    const connectors = analyses.reduce((s, a) => s + ((a.tr && a.tr.connectorCount) || 0), 0);
    if(connectors < 3) f.push('Bog\u2018lovchilar juda kam (' + connectors + ' ta) \u2014 however, because, for example kabi so\u2018zlarni qo\u2018shing.');
    else f.push('Bog\u2018lovchilardan yaxshi foydalangansiz (' + connectors + ' ta).');
  } else {
    f.push('Eslatma: matn tahlili uchun Chrome/Edge brauzerida topshiring \u2014 hozir faqat audio o\u2018lchovlar ishlatildi.');
  }

  const weak = analyses.filter(a => a.voicedSec < (PART_TARGETS[a.part] || PART_TARGETS['Part 1']).min);
  if(weak.length){
    const byPart = {};
    weak.forEach(a => { (byPart[a.part] = byPart[a.part] || []).push(a); });
    Object.keys(byPart).forEach(p => {
      f.push(p + ': ' + byPart[p].length + ' ta javob juda qisqa \u2014 har biri kamida ' + PART_TARGETS[p].label + ' bo\u2018lsin.');
    });
  }

  if(b.flu < 6) f.push('Fluency: pauzalarni kamaytirib, bog\u2018lovchilar (however, moreover, actually) ishlating.');
  else f.push('Fluency: yaxshi oqim \u2014 shu tempni saqlang!');
  if(b.lex < 6) f.push('Lexical: javoblarni uzaytirib, mavzuga oid 2-3 akademik so\u2018z qo\u2018shing.');
  else f.push('Lexical: so\u2018z boyligi yaxshi.');
  if(b.gram < 6) f.push('Grammar: complex sentences (if, although, which, while) ko\u2018paytiring.');
  else f.push('Grammar: tuzilma barqaror.');
  if(b.pron < 6) f.push('Pronunciation: aniqroq va balandroq gapiring \u2014 AI ovozini tinglab, talaffuzni takrorlang.');
  else f.push('Pronunciation: ovoz tiniq va barqaror.');
  f.push('Eslatma: ballar yozuv + speech-to-text matnidan (gapirish vaqti, pauzalar, so\u2018z boyligi, bog\u2018lovchilar, talaffuz tiniqligi) hisoblanadi \u2014 tasodif yo\u2018q.');
  return f;
}

async function showMockResults(){
  const total = mockQueue.length;
  const answered = mockSessionAnswered; // per-mock session, resets each mock
  const recorded = mockSessionSaves.length;
  const el = document.getElementById('mockResults');
  if(!el) return;

  let analyses = [];
  if(answered > 0) analyses = await analyzeMockSession();

  let flu, lex, gram, pron, overall, feedback;
  if(answered === 0){
    flu = lex = gram = pron = overall = 0;
    feedback = [
      'Hech bir savolga javob bermadingiz \u2014 natija 0.0.',
      'Har bir savolda \u201CRecord\u201D bosing, javob bering va \u201CSaqlash\u201D tugmasini bosing.'
    ];
  } else {
    const b = computeBands(analyses, answered, total);
    flu = b.flu; lex = b.lex; gram = b.gram; pron = b.pron;
    overall = Math.round(((flu + lex + gram + pron) / 4) * 2) / 2;
    feedback = buildMockFeedback(b, analyses, answered, total);
  }

  el.classList.remove('hidden');
  if(el.scrollIntoView) try{el.scrollIntoView({behavior:'smooth'});}catch(e){}
  document.getElementById('resOverall').textContent = overall.toFixed(1);
  document.getElementById('resFlu').textContent = flu.toFixed(1);
  document.getElementById('resLex').textContent = lex.toFixed(1);
  document.getElementById('resGram').textContent = gram.toFixed(1);
  document.getElementById('resPron').textContent = pron.toFixed(1);
  document.getElementById('resTotal').textContent = answered + ' / ' + total + ' javob';
  document.getElementById('resTime').textContent = Math.floor(mockElapsed/60) + ':' + String(mockElapsed%60).padStart(2,'0');
  const recEl = document.getElementById('resAudioCount');
  if(recEl) recEl.textContent = recorded + ' audio yozuv';

  document.getElementById('resFeedback').innerHTML = feedback.map(f => '<div class="text-[13px] leading-5">' + f + '</div>').join('');

  // === HAR BIR BO'LIM UCHUN ALOHIDA RO'YXAT: savol + sizning audio javobingiz + Best Answer ===
  renderMockResultsByPart();
  // save overall
  const hist2 = safeJSON('mockHistory',[]);
  if(hist2[0]) { hist2[0].overall = overall; hist2[0].breakdown = {flu, lex, gram, pron}; hist2[0].answered = answered; hist2[0].recorded = recorded; safeSet('mockHistory', JSON.stringify(hist2)); renderMockHistory(); }
  refreshIcons();
}

// === Natija: Part 1 / Part 2 / Part 3 — har biri o'z ro'yxatida ===
function mockResultRow(it,i){
  const s=mockRec(i);
  const answered=!!mockAnsweredMap[i];
  const style=mockPartStyle(it.part);
  return `
  <article class="p-4 sm:p-5 bg-white dark:bg-[#111A33]">
    <div class="flex items-start gap-3">
      <span class="shrink-0 w-8 h-8 rounded-full ${answered?'bg-emerald-500 text-white':'bg-slate-900 dark:bg-white text-white dark:text-slate-900'} grid place-items-center text-[12px] font-extrabold">${i+1}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-[10px] font-extrabold tracking-wide px-2 py-0.5 rounded-full ${style.badge}">${escapeHTML(it.badge)}</span>
          ${s? `<span class="text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/20 px-2 py-0.5 rounded-full">🎙 ${fmtDur(s.duration)} yozuv</span>`:''}
          ${answered? '<span class="text-[10px] font-bold bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-2 py-0.5 rounded-full">Saqlangan ✓</span>' : '<span class="text-[10px] font-bold bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20 px-2 py-0.5 rounded-full">Javob berilmagan</span>'}
        </div>
        <h5 class="mt-2 font-semibold text-[14px] leading-6">${escapeHTML(it.q)}</h5>
        ${s? `<div class="mt-2"><audio src="${s.url}" controls preload="metadata" class="w-full max-w-[340px] h-9"></audio></div>` : `<div class="mt-2 text-[12px] text-slate-500 italic">Bu savolga yozuv yo'q — keyingi mockda mikrofonni yoqib javob bering.</div>`}
        <div class="mt-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-3">
          <div class="flex items-center justify-between gap-2">
            <div class="text-[10px] font-extrabold tracking-widest text-emerald-600 dark:text-emerald-400">BEST ANSWER • BAND 8-9</div>
            <button onclick="speakMockBestAnswer(${i})" class="bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full px-2.5 py-1 text-[11px] font-bold inline-flex items-center gap-1.5"><i data-lucide="volume-2" class="w-3 h-3"></i> Eshitish</button>
          </div>
          <p class="mt-1.5 text-[13px] leading-6 whitespace-pre-wrap">${escapeHTML(it.a||'')}</p>
          ${it.hint? `<div class="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-[11px] leading-5"><b>Tip:</b> ${escapeHTML(it.hint)}</div>`:''}
        </div>
      </div>
    </div>
  </article>`;
}
function renderMockResultsByPart(){
  const el=document.getElementById('mockResultsByPart');
  if(!el) return;
  const parts=['Part 1','Part 2','Part 3'];
  const html = parts.map(part=>{
    const items=mockQueue.map((it,i)=>({it,i})).filter(x=>x.it.part===part);
    if(!items.length) return '';
    const recs=items.filter(x=>mockRec(x.i)).length;
    const ans=items.filter(x=>mockAnsweredMap[x.i]).length;
    const style=mockPartStyle(part);
    return `
    <section class="rounded-[20px] border border-slate-200 dark:border-white/10 overflow-hidden bg-slate-50/60 dark:bg-white/[0.02]">
      <header class="px-4 py-3 flex flex-wrap items-center justify-between gap-2 bg-slate-100/70 dark:bg-white/[0.04] border-b border-slate-200 dark:border-white/10">
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-extrabold tracking-wide px-2 py-1 rounded-full ${style.badge}">${escapeHTML(part)}</span>
          <b class="text-[13px]">${part} — ${items.length} savol</b>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-bold bg-emerald-500 text-white px-2 py-1 rounded-full">${ans} javob saqlangan</span>
          <span class="text-[11px] font-bold bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 px-2 py-1 rounded-full">${recs} audio yozuv</span>
        </div>
      </header>
      <div class="divide-y divide-slate-200 dark:divide-white/10">${items.map(x=>mockResultRow(x.it,x.i)).join('')}</div>
    </section>`;
  }).join('');
  el.innerHTML = html || `<div class="text-[13px] text-slate-500 text-center py-6">Bu mockda savollar yo'q.</div>`;
  refreshIcons();
}
function speakMockBestAnswer(i){
  const it=mockQueue[i];
  if(!it) return;
  speak(it.a||'', voicePref, null, 1600);
}
// natijani matn ko'rinishida yuklab olish (bo'limlar bo'yicha)
function downloadMockReport(){
  const parts=['Part 1','Part 2','Part 3'];
  const lines=[`IELTS SPEAKING MOCK HISOBOTI — ${new Date().toLocaleString()}`,`Umumiy: ${document.getElementById('resOverall').textContent} • ${mockSessionAnswered}/${mockQueue.length} javob • ${mockSessionSaves.length} audio yozuv`,''];
  parts.forEach(part=>{
    const items=mockQueue.map((it,i)=>({it,i})).filter(x=>x.it.part===part);
    if(!items.length) return;
    lines.push(`========== ${part} (${items.length} savol) ==========`,'');
    items.forEach(({it,i})=>{
      const s=mockRec(i);
      lines.push(`Q${i+1}. ${it.q}`);
      lines.push(`Sizning javobingiz: ${s? `${fmtDur(s.duration)} audio yozuv (${mockAnsweredMap[i]?'saqlangan':'yozilgan'})` : 'yozuv yo\'q'}`);
      lines.push(`Best Answer: ${it.a||''}`);
      if(it.hint) lines.push(`Tip: ${it.hint}`);
      lines.push('');
    });
  });
  const blob=new Blob([lines.join('\n')],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`ielts-mock-hisobot-${new Date().toISOString().slice(0,10)}.txt`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 3000);
}

// === Firebase Authentication + per-user Firestore progress ===
async function initAccount(){
  const modal=document.getElementById('authModal');
  modal.addEventListener('click', e=>{ if(e.target===modal) closeAuth(); });
  modal.addEventListener('keydown', e=>{
    if(e.key==='Escape') closeAuth();
    if(e.key==='Tab'){
      const nodes=[...modal.querySelectorAll('button,input,[tabindex]')].filter(el=>!el.disabled && el.getClientRects().length);
      const first=nodes[0], last=nodes[nodes.length-1];
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  window.addEventListener('beforeunload', e=>{if(pendingWrites){e.preventDefault();e.returnValue='';}});
  const config=window.FIREBASE_CONFIG;
  if(!config?.apiKey || !config?.projectId){ accountStatus('Firebase hali sozlanmagan. Loyiha sozlamalarini kiriting.'); return; }
  try{
    const base='https://www.gstatic.com/firebasejs/12.2.1/';
    const [app,auth,db]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-firestore.js')]);
    firebaseAPI={...auth,...db};
    const instance=app.initializeApp(config);
    accountAuth=auth.getAuth(instance); accountDB=db.getFirestore(instance);
    await auth.setPersistence(accountAuth,auth.browserLocalPersistence);
    auth.onAuthStateChanged(accountAuth, user=>{
      accountEpoch++;
      if(unsubscribeProgress) unsubscribeProgress();
      accountReady=false; accountUser=user; progress=Object.create(null);
      accountProfile = loadLocalProfile(user ? user.uid : null);
      // Discard session data on identity changes; never attach another user's work.
      stopLiveTranscription(); mockTranscripts={}; mockConfidences={};
      clearInterval(mockTimerInterval); mockTimerInterval=null;
      clearInterval(dailyInterval); dailyInterval=null; dailyRunning=false; dailyRemaining=1200;
      if(mediaRecorder){ mediaRecorder.onstop=null; try{mediaRecorder.stop();}catch(e){} mediaRecorder.stream?.getTracks().forEach(t=>t.stop()); }
      clearInterval(recTimer);
      // Disable recording callbacks before stopping: no previous account writes.
      [window._modalRecorder,...Object.values(qRecState).map(s=>s.recorder)].filter(Boolean).forEach(rec=>{
        rec.onstop=null; try{rec.stop();}catch(e){} rec.stream?.getTracks().forEach(t=>t.stop());
      });
      qRecState={}; clearInterval(window._modalRecIntv);
      closeTopic();
      mockSessionSaves.forEach(r=>revokeBlobUrl(r.url));
      mockSessionSaves=[]; mockAnsweredMap={}; mockAnswersMeta=[]; mockSessionAnswered=0; mockQueue=[];
      lastBlob=null; revokeBlobUrl(lastUrl); lastUrl=null;
      const playback=document.getElementById('playback'); if(playback) playback.removeAttribute('src');
      document.getElementById('mockRunner')?.classList.add('hidden'); hideMockResults();
      document.getElementById('mockSavedList').innerHTML='';
      document.getElementById('mockResultsByPart').innerHTML='';
      refreshAccountProgress(); updateAccountControls();
      if(!user){accountStatus('Natijalarni saqlash uchun kiring.');return;}
      accountStatus('Ma’lumotlar yuklanmoqda…');
      const epoch=accountEpoch;
      unsubscribeProgress=db.onSnapshot(db.collection(accountDB,'users',user.uid,'progress'), {includeMetadataChanges:true}, snapshot=>{
        if(epoch!==accountEpoch) return;
        // Wait for server confirmation before enabling writes on a new device.
        if(snapshot.metadata.fromCache && !accountReady) return;
        progress=Object.create(null);
        snapshot.forEach(doc=>{
          const val = doc.data() && doc.data().value;
          if(doc.id === 'profile'){
            try{
              accountProfile = JSON.parse(val || '{}') || { name:'', avatar:'' };
              if(user.uid){ try{ localStorage.setItem('profile_'+user.uid, val || ''); }catch(e){} }
            }catch(e){ accountProfile = { name:'', avatar:'' }; }
          } else if(isProgressKey(doc.id) && typeof val === 'string'){
            progress[doc.id] = val;
          }
        });
        accountReady=true; refreshAccountProgress();
        if(!snapshot.metadata.hasPendingWrites) accountStatus('Akkaunt ma’lumotlari sinxronlandi.');
      }, ()=>{ if(epoch===accountEpoch){accountReady=false;accountStatus('Firestore bilan ulanishda xato. Internet va Security Rules sozlamalarini tekshiring.');} });
    });
  }catch(e){ accountStatus('Firebase ishga tushmadi. Sozlamalar va internetni tekshiring.'); }
}
function refreshAccountProgress(){
  dailyNum=parseInt(safeGet('dailyNum','1')) || 1;
  streak=parseInt(safeGet('streak','1')) || 1;
  if(!dailyRunning) renderDaily();
  renderMockHistory(); updateMockStats(); renderAccountHistory();
}
function updateAccountControls(){
  const button=document.getElementById('accountButton');
  const name = (accountProfile && accountProfile.name) || (accountUser && accountUser.displayName) || (accountUser && accountUser.email) || '';
  if(accountUser){
    const avatar = (accountProfile && accountProfile.avatar)
      ? '<img class="account-btn-avatar" src="' + escapeHTML(accountProfile.avatar) + '" alt="">'
      : '';
    button.innerHTML = avatar + '<span class="account-btn-name">' + escapeHTML(name) + '</span>';
    button.title = name || accountUser.email || '';
  } else {
    button.innerHTML = '<span class="account-btn-name">Kirish / Ro\'yxatdan o\'tish</span>';
    button.title = '';
  }
  document.getElementById('logoutButton').hidden=!accountUser;
  if(!document.getElementById('authModal').hidden) openAuth(accountUser?'account':'login');
}
function openAuth(mode){
  if(authBusy) return;
  authMode=accountUser?'account':(mode==='signup'||mode==='reset'?mode:'login');
  const modal=document.getElementById('authModal');
  if(modal.hidden) authReturnFocus=document.activeElement;
  modal.hidden=false;
  document.getElementById('authTitle').textContent={login:'Kirish',signup:"Ro'yxatdan o'tish",reset:'Parolni tiklash',account:'Akkaunt'}[authMode];
  document.getElementById('authForm').hidden=authMode==='account';
  document.getElementById('authLinks').hidden=authMode==='account';
  document.getElementById('accountDetails').hidden=authMode!=='account';
  document.getElementById('accountEmail').textContent=accountUser?.email || '';
  document.getElementById('authNameLabel').hidden=authMode!=='signup';
  document.getElementById('authName').required=authMode==='signup';
  const password=document.getElementById('authPassword');
  password.value=''; password.required=authMode!=='reset'; password.disabled=authMode==='reset';
  password.autocomplete=authMode==='signup'?'new-password':'current-password';
  document.getElementById('authPasswordLabel').hidden=authMode==='reset';
  document.getElementById('authSubmit').textContent=authMode==='reset'?'Tiklash havolasini yuborish':document.getElementById('authTitle').textContent;
  renderAccountHistory();
  modal.querySelector('.account-dialog').focus();
}
function closeAuth(){
  if(authBusy) return;
  document.getElementById('authModal').hidden=true;
  document.getElementById('authPassword').value='';
  authReturnFocus?.focus();
}
function authError(e){
  return ({'auth/invalid-email':'Email manzili noto‘g‘ri.', 'auth/invalid-credential':'Email yoki parol noto‘g‘ri.', 'auth/email-already-in-use':'Bu email bilan akkaunt mavjud.', 'auth/weak-password':'Parol kamida 6 belgidan iborat bo‘lsin.', 'auth/too-many-requests':'Urinishlar ko‘p. Birozdan so‘ng qayta urinib ko‘ring.', 'auth/network-request-failed':'Internet aloqasini tekshiring.'})[e.code] || 'Amal bajarilmadi. Firebase sozlamalarini tekshiring yoki qayta urinib ko‘ring.';
}
async function submitAuth(event){
  event.preventDefault();
  if(authBusy) return;
  if(!accountAuth){accountStatus('Firebase hali tayyor emas. Sozlamalar va ulanishni tekshiring.');return;}
  const mode=authMode, email=document.getElementById('authEmail').value.trim(), password=document.getElementById('authPassword').value;
  authBusy=true; document.getElementById('authSubmit').disabled=true;
  let success=false;
  try{
    if(mode==='reset'){
      try{await firebaseAPI.sendPasswordResetEmail(accountAuth,email);}catch(e){if(e.code!=='auth/user-not-found') throw e;}
      accountStatus('Agar bu email uchun akkaunt mavjud bo‘lsa, tiklash havolasi yuborildi. Spam papkasini ham tekshiring.');
    }else if(mode==='signup'){
      const credential=await firebaseAPI.createUserWithEmailAndPassword(accountAuth,email,password);
      const dispName=document.getElementById('authName').value.trim();
      try{ await firebaseAPI.updateProfile(credential.user,{displayName:dispName}); }catch(e){}
      accountProfile = { name: dispName, avatar: '' };
      try{ localStorage.setItem('profile_'+credential.user.uid, JSON.stringify(accountProfile)); }catch(e){}
      try{ firebaseAPI.setDoc(firebaseAPI.doc(accountDB,'users',credential.user.uid,'progress','profile'), {value: JSON.stringify(accountProfile)}); }catch(e){}
      success=true;
    }else{await firebaseAPI.signInWithEmailAndPassword(accountAuth,email,password);success=true;}
  }catch(e){accountStatus(authError(e));}
  finally{authBusy=false;document.getElementById('authSubmit').disabled=false;document.getElementById('authPassword').value='';}
  if(success){updateAccountControls();closeAuth();}
}
async function logoutAccount(){
  if(!accountAuth) return;
  if(pendingWrites){openAuth('account');accountStatus('Saqlash tugashini kuting. Internet aloqasini tekshiring.');return;}
  try{await firebaseAPI.signOut(accountAuth);}catch(e){openAuth('account');accountStatus(authError(e));}
}
async function importLegacyProgress(){
  if(!requireAccount()) return;
  if(!confirm('Bu qurilmadagi eski natijalar siznikimi? Faqat bulutda mavjud bo‘lmagan bo‘limlar ko‘chiriladi.')) return;
  const uid=accountUser.uid, epoch=accountEpoch;
  let entries=[];
  try{for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(isProgressKey(k)) entries.push([k,localStorage.getItem(k)]);}}catch(e){accountStatus('Brauzer xotirasini o‘qib bo‘lmadi.');return;}
  pendingWrites++;
  try{
    for(const [key,value] of entries){
      if(epoch!==accountEpoch) return;
      const ref=firebaseAPI.doc(accountDB,'users',uid,'progress',key);
      await firebaseAPI.runTransaction(accountDB,async tx=>{const old=await tx.get(ref);if(!old.exists()) tx.set(ref,{value});});
    }
    if(epoch===accountEpoch) accountStatus(entries.length?'Eski natijalar ko‘chirildi. Mavjud bulut natijalari almashtirilmadi.':'Bu qurilmada eski natijalar topilmadi.');
  }catch(e){accountStatus('Ko‘chirish tugamadi. Qayta urinib ko‘ring.');}
  finally{pendingWrites--;}
}
function loadLocalProfile(uid){
  if(!uid) return { name:'', avatar:'' };
  try{
    const raw = localStorage.getItem('profile_'+uid);
    if(!raw) return { name:'', avatar:'' };
    const j = JSON.parse(raw);
    return { name: sanitizeInput(j && j.name, 40), avatar: (j && j.avatar && /^data:image\//.test(j.avatar)) ? j.avatar : '' };
  }catch(e){ return { name:'', avatar:'' }; }
}
function setText(id, val){ const el = document.getElementById(id); if(el) el.textContent = val; }

function renderProfileUI(){
  const rawName = (accountProfile && accountProfile.name) || (accountUser && accountUser.displayName) || '';
  const fallback = accountUser && accountUser.email ? accountUser.email : 'Foydalanuvchi';
  const elName = document.getElementById('accountName');
  if(elName) elName.textContent = rawName || fallback;
  const elEmail = document.getElementById('accountEmail');
  if(elEmail) elEmail.textContent = accountUser ? accountUser.email : '';
  const nameInput = document.getElementById('accountNameInput');
  if(nameInput && document.activeElement !== nameInput) nameInput.value = rawName;
  const img = document.getElementById('accountAvatarImg');
  const initial = document.getElementById('accountAvatarInitial');
  if(accountProfile && accountProfile.avatar){
    if(img){ img.src = accountProfile.avatar; img.style.display = 'block'; }
    if(initial) initial.style.display = 'none';
  } else {
    if(img){ img.removeAttribute('src'); img.style.display = 'none'; }
    if(initial){
      initial.style.display = 'grid';
      const ch = (rawName || fallback).trim().charAt(0).toUpperCase() || 'U';
      initial.textContent = ch;
    }
  }
}

function saveProfile(patch){
  accountProfile = Object.assign({}, accountProfile, patch || {});
  accountProfile.name = sanitizeInput(accountProfile.name, 40);
  if(accountProfile.avatar && !/^data:image\//.test(accountProfile.avatar)) accountProfile.avatar = '';
  if(accountUser && accountUser.uid){
    try{ localStorage.setItem('profile_'+accountUser.uid, JSON.stringify(accountProfile)); }catch(e){}
  }
  if(accountUser && accountDB && firebaseAPI){
    firebaseAPI.setDoc(firebaseAPI.doc(accountDB,'users',accountUser.uid,'progress','profile'), { value: JSON.stringify(accountProfile) })
      .catch(()=>{ accountStatus('Profil bulutga saqlanmadi \u2014 Firestore qoidalarini yangilang.'); });
  }
  renderProfileUI();
  updateAccountControls();
}

function handleAvatarChange(e){
  const file = e.target && e.target.files && e.target.files[0];
  if(e.target) e.target.value = '';
  if(!file) return;
  if(!/^image\//.test(file.type)){ accountStatus('Iltimos, rasm faylini tanlang.'); return; }
  if(file.size > 5 * 1024 * 1024){ accountStatus('Rasm 5MB dan katta bo\u2018lmasin.'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      try{
        const size = 200;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const s = Math.min(img.width, img.height);
        const sx = (img.width - s) / 2, sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
        const dataURL = canvas.toDataURL('image/jpeg', 0.85);
        if(!dataURL || dataURL.length > 800000){ accountStatus('Rasmni qayta ishlab bo\u2018lmadi.'); return; }
        saveProfile({ avatar: dataURL });
        accountStatus('Profil rasmi yangilandi.');
      }catch(err){ accountStatus('Rasmni qayta ishlab bo\u2018lmadi.'); }
    };
    img.onerror = () => accountStatus('Rasm ochilmadi.');
    img.src = reader.result;
  };
  reader.onerror = () => accountStatus('Faylni o\u2018qib bo\u2018lmadi.');
  reader.readAsDataURL(file);
}

async function saveNickname(){
  const input = document.getElementById('accountNameInput');
  const name = sanitizeInput(input ? input.value : '', 40);
  if(!name){ accountStatus('Ism (nickname) kiriting.'); return; }
  saveProfile({ name });
  if(accountUser && accountAuth && firebaseAPI){
    try{ await firebaseAPI.updateProfile(accountUser, { displayName: name }); }catch(e){}
  }
  accountStatus('Nickname saqlandi.');
}

function renderAccountHistory(){
  renderProfileUI();
  const mocks = safeJSON('mockHistory', []);
  setText('statMockCount', String(mocks.length));
  const bands = mocks.map(h => parseFloat(h.overall)).filter(b => isFinite(b) && b > 0);
  setText('statBestBand', bands.length ? Math.max.apply(null, bands).toFixed(1) : '\u2014');
  setText('statStreak', String(streak) + ' kun');
  setText('statDailyDone', String(safeJSON('dailyHistory', []).length));
  const listEl = document.getElementById('accountMockList');
  if(listEl){
    if(!mocks.length){
      listEl.innerHTML = '<div class="account-empty">Hali mock topshirmadingiz.</div>';
    } else {
      listEl.innerHTML = mocks.slice(0, 10).map(h => {
        const d = new Date(h.date);
        const badge = h.status === 'completed' ? (h.overall > 0 ? h.overall : '\u2713') : '\u2022';
        return '<div class="account-mock-row">' +
          '<span class="account-mock-badge' + (h.status === 'completed' ? ' done' : '') + '">' + escapeHTML(String(badge)) + '</span>' +
          '<div class="account-mock-meta">' +
            '<div class="t">' + escapeHTML(d.toLocaleDateString()) + ' \u2022 ' + escapeHTML(d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})) + '</div>' +
            '<div class="s">' + escapeHTML(String(h.total || 11)) + ' savol \u2022 ' + escapeHTML(h.status === 'completed' ? 'Yakunlandi' : 'Boshlangan') + (h.answered != null ? ' \u2022 ' + h.answered + ' javob' : '') + '</div>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }
}
