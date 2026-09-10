/* IELTS Speaking Pro — app.js */
const DATA = window.IELTS_DATA;
let currentPreviewTab = 'part1';
let previewLimit = 8;
let currentModalTopic = null;
let speechRate = parseFloat(localStorage.getItem('voiceRate')||'1');
let voicePref = localStorage.getItem('voicePref')||'female';
let autoPlay = localStorage.getItem('autoPlay')!=='false';
let theme = localStorage.getItem('theme')||'light';

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

// daily
let dailyInterval = null;
let dailyRemaining = 20*60;
let dailyRunning = false;
let dailyNum = parseInt(localStorage.getItem('dailyNum')||'1');
let streak = parseInt(localStorage.getItem('streak')||'1');

document.addEventListener('DOMContentLoaded', ()=>{
  initTheme();
  initVoiceUI();
  lucide.createIcons();
  bindSearches();
  renderPreview();
  renderPart('part1');
  renderPart('part2');
  renderPart('part3');
  renderDaily();
  renderMockHistory();
  updateMockStats();
  setInterval(updateMockStats,1000);
  // hero voice
  document.getElementById('heroVoiceName').textContent = voicePref==='female' ? 'Dilnoza • Qiz bola' : 'Jasur • O‘g‘il bola';
  document.getElementById('mockVoiceLabel').textContent = voicePref==='female' ? 'Dilnoza • Qiz bola' : 'Jasur • O‘g‘il bola';
  // load voices
  speechSynthesis.onvoiceschanged = ()=> {/* preload */};
});

function initTheme(){
  if(theme==='dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  document.documentElement.classList.remove('light');
  document.documentElement.classList.add(theme);
}
function toggleTheme(){ setTheme(theme==='dark'?'light':'dark'); }
function setTheme(t){
  theme=t; localStorage.setItem('theme',t);
  initTheme(); lucide.createIcons();
}

function initVoiceUI(){
  document.querySelectorAll('input[name="voice"]').forEach(r=> r.checked = r.value===voicePref);
  document.getElementById('voiceRate').value = speechRate;
  document.getElementById('rateVal').textContent = speechRate.toFixed(1)+'×';
  document.getElementById('autoPlay').checked = autoPlay;
  document.getElementById('modalVoiceSwitch').value = voicePref;
}
function setVoice(v){
  voicePref=v; localStorage.setItem('voicePref',v);
  document.getElementById('heroVoiceName').textContent = v==='female'?'Dilnoza • Qiz bola':'Jasur • O‘g‘il bola';
  document.getElementById('mockVoiceLabel').textContent = v==='female'?'Dilnoza • Qiz bola':'Jasur • O‘g‘il bola';
  initVoiceUI();
}
function setRate(v){
  speechRate=parseFloat(v); localStorage.setItem('voiceRate',v);
  document.getElementById('rateVal').textContent = speechRate.toFixed(1)+'×';
}
function saveSettings(){
  autoPlay=document.getElementById('autoPlay').checked;
  localStorage.setItem('autoPlay',autoPlay);
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
    return voices.find(v=>/male|david|mark|alex|daniel|arthur|google.*male/i.test(v.name))
        || voices.find(v=>v.lang.startsWith('en-US') && !/female/i.test(v.name))
        || voices[1]||voices[0];
  }
}
function speak(text, pref, onend){
  speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voice = getVoiceForPref(pref||voicePref);
  if(voice) utter.voice = voice;
  utter.lang = voice? voice.lang : 'en-US';
  utter.rate = speechRate;
  utter.pitch = pref==='female' || voicePref==='female' ? 1.05 : 0.95;
  if(onend) utter.onend = onend;
  speechSynthesis.speak(utter);
  return utter;
}
function stopSpeak(){ speechSynthesis.cancel(); }

// ROUTER
function router(view){
  document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));
  const id = view==='home' ? 'view-home' : `view-${view}`;
  const el=document.getElementById(id);
  if(el) el.classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b=> b.classList.remove('bg-slate-900','text-white','dark:bg-white','dark:text-slate-900'));
  const active=document.querySelector(`[data-nav="${view}"]`);
  if(active) active.classList.add('bg-slate-900','text-white','dark:bg-white','dark:text-slate-900');
  window.scrollTo({top:0, behavior:'smooth'});
  if(view==='part1'||view==='part2'||view==='part3') renderPart(view);
  lucide.createIcons();
}
function toggleMobileMenu(){
  const m=document.getElementById('mobileMenu');
  m.classList.toggle('hidden'); m.classList.toggle('flex');
}

// SEARCH
function bindSearches(){
  document.getElementById('globalSearch')?.addEventListener('keydown', e=>{ if(e.key==='Enter') doGlobalSearch(); });
}
function doGlobalSearch(){
  const q=(document.getElementById('globalSearch').value || document.getElementById('globalSearchM')?.value || '').trim().toLowerCase();
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
  const q=document.getElementById('previewSearch').value||'';
  const list=filteredTopics(currentPreviewTab,q);
  document.getElementById('previewCount').textContent = list.length;
  const grid=document.getElementById('previewGrid');
  grid.innerHTML = list.slice(0,previewLimit).map(t=> cardHTML(t,currentPreviewTab)).join('') || `<div class="col-span-full text-center py-10 text-slate-500">Hech narsa topilmadi. Boshqa so'z bilan urinib ko'ring.</div>`;
  document.getElementById('previewMoreBtn').style.display = list.length>previewLimit ? 'inline-flex' : 'none';
  lucide.createIcons();
}
function renderPart(part){
  const q=(document.getElementById(`search-${part}`)?.value||'').toLowerCase();
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
  grid.innerHTML = list.slice(0, 80).map(t=> cardHTML(t,part)).join('') || `<div class="col-span-full text-center py-10 text-slate-500">Hech narsa topilmadi</div>`;
  lucide.createIcons();
}
let part2Cat='all';
function filterPart2(cat){
  part2Cat=cat;
  document.querySelectorAll('.catBtn').forEach(b=>{
    b.className = b.dataset.cat===cat ? 'catBtn px-4 py-2 rounded-full bg-slate-900 text-white text-[13px] font-bold whitespace-nowrap' : 'catBtn px-4 py-2 rounded-full bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-[13px] font-bold whitespace-nowrap';
  });
  const grid=document.getElementById('grid-part2');
  const list = cat==='all' ? DATA.part2 : DATA.part2.filter(t=>t.cat===cat);
  const q=(document.getElementById('search-part2')?.value||'').toLowerCase();
  const filtered = q ? list.filter(t=> (t.title+t.questions.map(x=>x.q).join(' ')).toLowerCase().includes(q)) : list;
  grid.innerHTML = filtered.slice(0,80).map(t=>cardHTML(t,'part2')).join('');
  lucide.createIcons();
}

function cardHTML(t, part){
  const badge = part==='part1' ? 'Part 1' : part==='part2' ? 'Part 2 • Cue Card' : 'Part 3';
  const color = part==='part1' ? 'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200' : part==='part2' ? 'bg-[#0F172A] text-white dark:bg-white dark:text-slate-900' : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200';
  const count = t.questions.length;
  const previewQ = t.questions[0]?.q || t.prompts?.[0] || '';
  return `
  <article onclick="openTopic('${t.id}')" class="group bg-white dark:bg-[#111A33] rounded-[18px] border border-slate-200 dark:border-white/10 p-4 hover:shadow-soft hover:-translate-y-0.5 transition cursor-pointer flex flex-col">
    <div class="flex items-start justify-between gap-2">
      <div class="w-10 h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 grid place-items-center text-lg">${t.icon||'💬'}</div>
      <span class="text-[10px] font-extrabold tracking-wide px-2.5 py-1 rounded-full border ${part==='part2' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-white/5 '+color }">${badge}</span>
    </div>
    <h3 class="mt-3 font-bold text-[14px] leading-5 line-clamp-2 group-hover:text-sky-600 dark:group-hover:text-sky-300 transition">${t.title}</h3>
    <p class="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">${t.uz} • ${t.cat||''}</p>
    <p class="text-[12px] leading-5 text-slate-600 dark:text-slate-300 mt-2 line-clamp-2 flex-1">${previewQ}</p>
    <div class="mt-3 flex items-center justify-between">
      <span class="text-[11px] font-bold bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-full">${count} savol • Best Answer</span>
      <span class="w-7 h-7 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 grid place-items-center group-hover:scale-105 transition"><i data-lucide="play" class="w-3 h-3 fill-current"></i></span>
    </div>
  </article>`;
}

// TOPIC MODAL
function openTopic(id){
  const all=[...DATA.part1, ...DATA.part2, ...DATA.part3];
  const t=all.find(x=>x.id===id);
  if(!t) return;
  currentModalTopic=t;
  const part = id.startsWith('p1') ? 'PART 1' : id.startsWith('p2') ? 'PART 2' : 'PART 3';
  document.getElementById('modalPart').textContent=part;
  document.getElementById('modalTitle').textContent=t.title;
  document.getElementById('modalUz').textContent=t.uz + ' • ' + (t.cat||'');
  document.getElementById('modalCount').textContent=t.questions.length + ' savol';
  document.getElementById('modalIcon').textContent=t.icon||'💬';
  document.getElementById('modalLevel').textContent=t.level||'Band 8-9';
  const body=document.getElementById('modalBody');
  // build questions
  if(id.startsWith('p2')){
    // cue card layout
    body.innerHTML = `
      <div class="bg-white dark:bg-[#111A33] rounded-[18px] border border-slate-200 dark:border-white/10 p-5">
        <div class="flex items-center gap-2 text-[11px] font-extrabold tracking-wide"><span class="bg-amber-400 text-slate-900 px-2 py-1 rounded-full">CUE CARD</span><span class="bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-2 py-1 rounded-full">${t.cat}</span></div>
        <h3 class="mt-3 font-serif text-[20px] leading-tight">${t.title}</h3>
        <div class="mt-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4">
          <div class="text-[11px] font-extrabold tracking-widest text-amber-700 dark:text-amber-300">YOU WILL HAVE TO TALK ABOUT:</div>
          <ul class="mt-2 space-y-1.5">
            ${t.prompts.map(p=>`<li class="flex gap-2 text-[13px]"><span class="text-amber-600">•</span><span>${p}</span></li>`).join('')}
            <li class="flex gap-2 text-[13px] font-semibold"><span class="text-amber-600">•</span><span>and explain why it is important / memorable to you.</span></li>
          </ul>
          <div class="mt-3 flex gap-2">
            <button onclick="speak(\`${t.title}. ${t.prompts.join('. ')}\`, voicePref)" class="bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full px-4 py-2 text-[13px] font-bold inline-flex items-center gap-2"><i data-lucide="volume-2" class="w-4 h-4"></i> Cue cardni eshitish</button>
            <span class="text-[11px] self-center text-slate-500">1 min tayyorgarlik • 2 min gapirish</span>
          </div>
        </div>
        <div class="mt-5">
          <div class="text-[11px] font-extrabold tracking-widest text-slate-500">BEST ANSWER — NAMUNA (Band 9 • ~2 min)</div>
          <div class="mt-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4 text-[13px] leading-6 whitespace-pre-wrap">${t.answer}</div>
          <div class="mt-3 flex flex-wrap gap-2">
            ${t.vocab.map(v=>`<span class="text-[11px] bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 px-2 py-1 rounded-full">${v}</span>`).join('')}
          </div>
          <div class="mt-3 p-3 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 text-[12px] leading-5"><b>Tip:</b> ${t.tip}</div>
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
            <h4 class="font-semibold text-[14px] leading-6">${qq.q}</h4>
            <div class="mt-3 flex flex-wrap gap-2">
              <button onclick="playQuestionAudio(${idx})" class="bg-[#0F172A] dark:bg-white text-white dark:text-slate-900 rounded-full px-4 py-1.5 text-[12px] font-bold inline-flex items-center gap-2"><i data-lucide="volume-2" class="w-3.5 h-3.5"></i> Eshitish</button>
              <button onclick="toggleRecForQuestion(${idx})" id="qRecBtn-${idx}" class="bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full px-3 py-1.5 text-[12px] font-bold inline-flex items-center gap-1.5"><i data-lucide="mic" class="w-3.5 h-3.5"></i> Yozish</button>
              <span class="text-[11px] bg-slate-100 dark:bg-white/10 px-2 py-1 rounded-full">${qq.vocab.join(' • ')}</span>
            </div>
          </div>
        </div>
        <div class="mx-5 mb-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-4">
          <div class="text-[11px] font-extrabold tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"><i data-lucide="sparkles" class="w-3 h-3"></i> BEST ANSWER • BAND 8-9</div>
          <p class="mt-2 text-[13px] leading-6">${qq.a}</p>
          <div class="mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-[11px] leading-5"><b>Vocab:</b> ${qq.vocab.join(', ')} • <b>Tip:</b> ${qq.tip}</div>
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
  lucide.createIcons();
  if(autoPlay){
    setTimeout(()=> {
      if(t.id.startsWith('p2')) speak(`${t.title}. ${t.prompts.join('. ')}`, voicePref);
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
    lucide.createIcons();
    return;
  }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const rec=new MediaRecorder(stream);
    const chunks=[];
    rec.ondataavailable=e=> chunks.push(e.data);
    rec.onstop=()=>{
      const blob=new Blob(chunks,{type:'audio/webm'});
      const url=URL.createObjectURL(blob);
      audio.src=url; audio.classList.remove('hidden'); area.classList.remove('hidden');
      // save
      saveQRecording(currentModalTopic.id, idx, blob);
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
    lucide.createIcons();
  }catch(e){ alert('Mikrofonga ruxsat bering: '+e.message); }
}
function saveQRecording(topicId, qIdx, blob){
  const key='recs_'+topicId;
  const reader=new FileReader();
  reader.onload=()=>{
    const arr=JSON.parse(localStorage.getItem(key)||'[]');
    arr.push({qIdx, date:new Date().toISOString(), size:blob.size});
    localStorage.setItem(key, JSON.stringify(arr));
  };
  reader.readAsDataURL(blob);
}
async function startRecordingForTopic(){
  // for part2 modal
  const area=document.getElementById('modalRecArea');
  const bar=document.getElementById('modalRecBar');
  const audio=document.getElementById('modalPlayback');
  const time=document.getElementById('modalRecTime');
  area.classList.remove('hidden');
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const rec=new MediaRecorder(stream);
    const chunks=[];
    const start=Date.now();
    rec.ondataavailable=e=> chunks.push(e.data);
    rec.onstop=()=>{
      const blob=new Blob(chunks,{type:'audio/webm'});
      const url=URL.createObjectURL(blob);
      audio.src=url; audio.classList.remove('hidden');
      stream.getTracks().forEach(t=>t.stop());
      clearInterval(window._modalRecIntv);
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
function buildMockQueue(){
  // 6 from part1, 1 cue card from part2, 4 from part3 = 11
  const p1 = [...DATA.part1].sort(()=>0.5-Math.random()).slice(0,6).flatMap(t=> t.questions.slice(0,1).map(q=> ({part:'Part 1', badge:'PART 1', q:q.q, a:q.a, hint:q.tip, id:t.id})));
  const p2topic = DATA.part2[Math.floor(Math.random()*DATA.part2.length)];
  const p2 = [{part:'Part 2', badge:'PART 2 • CUE CARD', q: `${p2topic.title}. ${p2topic.prompts.join('. ')}.`, a:p2topic.answer, hint:p2topic.tip, id:p2topic.id, isCue:true, prompts:p2topic.prompts, title:p2topic.title}];
  const p3 = [...DATA.part3].sort(()=>0.5-Math.random()).slice(0,4).flatMap(t=> t.questions.slice(0,1).map(q=> ({part:'Part 3', badge:'PART 3', q:q.q, a:q.a, hint:q.tip, id:t.id})));
  return [...p1, ...p2, ...p3];
}
function startMock(){
  mockQueue=buildMockQueue();
  mockIndex=0;
  mockElapsed=0;
  document.getElementById('mockRunner').classList.remove('hidden');
  document.getElementById('mockRunner').scrollIntoView({behavior:'smooth'});
  renderMockQuestion();
  startMockTimer();
  // save start to history
  const hist=JSON.parse(localStorage.getItem('mockHistory')||'[]');
  hist.unshift({date:new Date().toISOString(), total:mockQueue.length, status:'started'});
  localStorage.setItem('mockHistory', JSON.stringify(hist.slice(0,20)));
  renderMockHistory();
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
function renderMockQuestion(){
  const item=mockQueue[mockIndex];
  if(!item) return;
  document.getElementById('mockPartLabel').textContent=item.part;
  document.getElementById('mockProgressLabel').textContent=`${mockIndex+1} / ${mockQueue.length}`;
  document.getElementById('mockQBadge').textContent=`${item.badge} • Q${mockIndex+1}`;
  document.getElementById('mockQuestion').textContent=item.q;
  document.getElementById('mockQHint').textContent=item.hint;
  document.getElementById('mockBestAnswer').textContent=item.a;
  document.getElementById('mockOverallBar').style.width=`${((mockIndex+1)/mockQueue.length*100).toFixed(0)}%`;
  document.getElementById('mockSavedList').innerHTML = getMockSavedForCurrent().map(s=>`
    <div class="flex items-center gap-2 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2">
      <span class="w-7 h-7 rounded-full bg-emerald-500 text-white grid place-items-center"><i data-lucide="check" class="w-3.5 h-3.5"></i></span>
      <div class="flex-1"><div class="text-[12px] font-bold">Saqlangan javob #${s.idx+1}</div><div class="text-[11px] text-slate-500">${new Date(s.date).toLocaleTimeString()} • ${s.duration}s</div></div>
      <audio src="${s.url}" controls class="w-24 h-7"></audio>
    </div>
  `).join('') || `<div class="text-[11px] text-slate-500 text-center py-2">Hali javob saqlanmadi — Record bosing</div>`;
  lucide.createIcons();
  if(autoPlay) setTimeout(()=> playMockQuestion(), 400);
}
function playMockQuestion(force){
  const item=mockQueue[mockIndex];
  if(!item) return;
  const btn=document.getElementById('mockPlayBtn');
  btn.innerHTML=`<span class="w-3 h-3 rounded-full bg-white animate-pulse"></span> Eshitilmoqda...`;
  speak(item.q, voicePref, ()=>{
    btn.innerHTML=`<i data-lucide="volume-2" class="w-4 h-4"></i> Savolni eshitish`;
    lucide.createIcons();
  });
}
function nextMockQuestion(){
  if(mockIndex < mockQueue.length-1){
    mockIndex++; renderMockQuestion();
  } else {
    stopMock();
    // mark completed
    const hist=JSON.parse(localStorage.getItem('mockHistory')||'[]');
    if(hist[0]) hist[0].status='completed';
    localStorage.setItem('mockHistory', JSON.stringify(hist));
    renderMockHistory(); updateMockStats();
    alert('Mock yakunlandi! Barcha javoblar saqlandi. History bo‘limida ko‘rishingiz mumkin.');
  }
}
function stopMock(){
  clearInterval(mockTimerInterval);
  stopSpeak();
  if(mediaRecorder && mediaRecorder.state==='recording') mediaRecorder.stop();
}
function getMockSavedForCurrent(){
  const all=JSON.parse(localStorage.getItem('mockSaves')||'[]');
  // we store urls in memory only, so just return empty or from memory
  return window._mockSavesMem ? window._mockSavesMem.filter(s=> s.mockIdx===mockIndex) : [];
}
async function toggleRecording(){
  const btn=document.getElementById('recBtn');
  const status=document.getElementById('recStatus');
  const bar=document.getElementById('recBar');
  const time=document.getElementById('recTime');
  const playback=document.getElementById('playback');
  if(mediaRecorder && mediaRecorder.state==='recording'){
    mediaRecorder.stop();
    status.textContent='Saqlanmoqda...';
    btn.classList.remove('animate-pulse');
    clearInterval(recTimer);
    return;
  }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    recChunks=[];
    mediaRecorder=new MediaRecorder(stream);
    mediaRecorder.ondataavailable=e=> recChunks.push(e.data);
    mediaRecorder.onstop=()=>{
      const blob=new Blob(recChunks,{type:'audio/webm'});
      lastBlob=blob;
      lastUrl=URL.createObjectURL(blob);
      playback.src=lastUrl; playback.classList.remove('hidden');
      // enable save
      status.textContent='Yozib olindi ✓';
      status.className='text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-500 text-white';
      stream.getTracks().forEach(t=>t.stop());
      // store in memory for list
      if(!window._mockSavesMem) window._mockSavesMem=[];
      window._mockSavesMem.push({mockIdx:mockIndex, date:new Date().toISOString(), duration: Math.floor((Date.now()-recStart)/1000), url:lastUrl, blob});
      renderMockQuestion();
    };
    mediaRecorder.start();
    recStart=Date.now();
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
  if(!lastBlob){ alert('Avval Record bosing va javob bering!'); return; }
  const saves=JSON.parse(localStorage.getItem('mockSavesMeta')||'[]');
  saves.push({q: mockQueue[mockIndex].q, date:new Date().toISOString(), duration: Math.floor((Date.now()-recStart)/1000)});
  localStorage.setItem('mockSavesMeta', JSON.stringify(saves));
  // history
  const hist=JSON.parse(localStorage.getItem('mockHistory')||'[]');
  // update
  const done=parseInt(localStorage.getItem('mockDone')||'0')+1;
  localStorage.setItem('mockDone', String(done));
  updateMockStats();
  // download option
  const a=document.createElement('a');
  a.href=lastUrl; a.download=`mock-q${mockIndex+1}-${Date.now()}.webm`;
  // don't auto-download, just show saved
  document.getElementById('recStatus').textContent='Saqlab qo‘yildi ✓';
  setTimeout(()=> { document.getElementById('recStatus').textContent='Tayyor'; document.getElementById('recStatus').className='text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-900 text-white dark:bg-white dark:text-slate-900'; }, 1500);
  // auto next after 1s
  setTimeout(nextMockQuestion, 900);
}
function renderMockHistory(){
  const hist=JSON.parse(localStorage.getItem('mockHistory')||'[]');
  const meta=JSON.parse(localStorage.getItem('mockSavesMeta')||'[]');
  const el=document.getElementById('mockHistory');
  if(!hist.length && !meta.length){
    el.innerHTML=`<div class="text-[13px] text-slate-500 text-center py-6">Hali mock topshirmadingiz.<br>Birinchi mockni boshlang — natijalar shu yerda saqlanadi.</div>`;
    return;
  }
  el.innerHTML = (hist.length? hist : [{date:new Date().toISOString(), total:11, status:'completed'}]).slice(0,6).map(h=>`
    <div class="flex items-center gap-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5">
      <div class="w-8 h-8 rounded-full ${h.status==='completed'?'bg-emerald-500':'bg-amber-400'} text-white grid place-items-center"><i data-lucide="${h.status==='completed'?'check':'clock'}" class="w-4 h-4"></i></div>
      <div class="flex-1">
        <div class="text-[12px] font-bold">${new Date(h.date).toLocaleDateString()} • ${new Date(h.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</div>
        <div class="text-[11px] text-slate-500">${h.total||11} savol • ${h.status==='completed'?'Yakunlandi':'Boshlangan'}</div>
      </div>
      <span class="text-[11px] font-bold bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 px-2 py-1 rounded-full">${meta.length} javob</span>
    </div>
  `).join('');
  lucide.createIcons();
  document.getElementById('mockStatsDone').textContent = meta.length || localStorage.getItem('mockDone')||'0';
}
function clearMockHistory(){
  if(!confirm('Barcha mock tarixini o‘chirishni istaysizmi?')) return;
  localStorage.removeItem('mockHistory');
  localStorage.removeItem('mockSavesMeta');
  localStorage.removeItem('mockDone');
  window._mockSavesMem=[];
  renderMockHistory(); updateMockStats();
}
function updateMockStats(){
  const total = DATA.part1.length+DATA.part2.length+DATA.part3.length;
  document.getElementById('mockStatsTotal').textContent = (DATA.part1.length*4 + DATA.part2.length + DATA.part3.length*4);
  const done = JSON.parse(localStorage.getItem('mockSavesMeta')||'[]').length;
  const el=document.getElementById('mockStatsDone');
  if(el) el.textContent=done;
}

// HERO audio demo
function playHeroAudio(){
  speak("Describe a person who taught you something important. Who is this person, how do you know this person, what this person taught you, and explain why it was important.", voicePref);
  let w=36; const intv=setInterval(()=>{
    w+=4; if(w>100){ clearInterval(intv); w=36; }
    const el=document.getElementById('heroProgress'); if(el) el.style.width=w+'%';
  },200);
  setTimeout(()=> clearInterval(intv), 4000);
}

// DAILY
function renderDaily(){
  document.getElementById('dailyNum').textContent=String(dailyNum).padStart(2,'0');
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
        <h4 class="font-bold text-[14px]">${p1.title} — ${p1.questions[0].q}</h4>
        <p class="text-[13px] leading-6 mt-2 text-slate-600 dark:text-slate-300">${p1.questions[0].a.slice(0,180)}...</p>
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
        <h4 class="font-serif text-[15px] leading-tight">${p2.title}</h4>
        <ul class="mt-2 space-y-1">
          ${p2.prompts.map(pr=>`<li class="text-[12px] flex gap-2"><span class="text-amber-600">•</span>${pr}</li>`).join('')}
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
        <h4 class="font-bold text-[14px]">${p3.questions[0].q}</h4>
        <p class="text-[13px] leading-6 mt-2 text-slate-600 dark:text-slate-300">${p3.questions[0].a.slice(0,200)}...</p>
        <button onclick="openTopic('${p3.id}')" class="mt-3 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full px-4 py-1.5 text-[12px] font-bold">Muhokamani ochish</button>
      </div>
    </div>
  `;
  lucide.createIcons();
  // history
  const hist=JSON.parse(localStorage.getItem('dailyHistory')||'[]');
  document.getElementById('dailyHistory').innerHTML = hist.slice(0,5).map(h=>`
    <div class="flex items-center gap-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2">
      <div class="w-8 h-8 rounded-full bg-emerald-500 text-white grid place-items-center text-[11px] font-bold">${h.num}</div>
      <div class="flex-1"><div class="text-[12px] font-bold">${h.title}</div><div class="text-[11px] text-slate-500">${new Date(h.date).toLocaleDateString()} • ${h.duration}</div></div>
      <span class="text-[11px] font-bold bg-white dark:bg-white/10 px-2 py-1 rounded-full">✓</span>
    </div>
  `).join('') || `<div class="text-[12px] text-slate-500 text-center py-4">Hali dars yakunlanmadi. 20 daqiqalik darsni boshlang — streak yig'ing!</div>`;
  updateDailyTimerUI();
}
function updateDailyTimerUI(){
  const m=String(Math.floor(dailyRemaining/60)).padStart(2,'0'), s=String(dailyRemaining%60).padStart(2,'0');
  document.getElementById('dailyTimer').textContent=`${m}:${s}`;
  document.getElementById('dailyProgress').style.width=`${(1 - dailyRemaining/(20*60))*100}%`;
  document.getElementById('autoNextLabel').textContent = dailyRunning ? `${m}:${s} dan so'ng auto` : `20:00 dan so'ng`;
}
function toggleDaily(){
  if(dailyRunning){ pauseDaily(); } else { startDaily(); }
}
function startDaily(){
  if(dailyRunning) return;
  dailyRunning=true;
  document.getElementById('dailyToggle').textContent='Pauza';
  document.getElementById('dailyToggle').className='mt-2 w-20 bg-amber-400 text-slate-900 rounded-full py-1.5 text-[12px] font-bold';
  dailyInterval=setInterval(()=>{
    dailyRemaining--;
    updateDailyTimerUI();
    if(dailyRemaining<=0){
      completeDaily(true);
    }
  },1000);
}
function pauseDaily(){
  dailyRunning=false;
  clearInterval(dailyInterval);
  document.getElementById('dailyToggle').textContent='Davom ettirish';
  document.getElementById('dailyToggle').className='mt-2 w-20 bg-emerald-500 text-white rounded-full py-1.5 text-[12px] font-bold';
}
function completeDaily(auto){
  clearInterval(dailyInterval);
  dailyRunning=false;
  const p1 = DATA.part1[(dailyNum*7) % DATA.part1.length];
  const hist=JSON.parse(localStorage.getItem('dailyHistory')||'[]');
  hist.unshift({num:dailyNum, title:p1.title, date:new Date().toISOString(), duration: auto?'20:00 auto': `${20*60 - dailyRemaining} sec`});
  localStorage.setItem('dailyHistory', JSON.stringify(hist.slice(0,20)));
  // next lesson
  dailyNum++;
  streak++;
  localStorage.setItem('dailyNum', String(dailyNum));
  localStorage.setItem('streak', String(streak));
  dailyRemaining=20*60;
  renderDaily();
  document.getElementById('dailyToggle').textContent='Boshlash';
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

// SETTINGS modal
function openSettings(){ document.getElementById('settingsModal').classList.remove('hidden'); document.body.style.overflow='hidden'; lucide.createIcons(); }
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
window.completeDaily=completeDaily; window.skipDaily=skipDaily; window.renderMockHistory=renderMockHistory;
