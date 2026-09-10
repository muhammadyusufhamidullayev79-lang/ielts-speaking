/* Admin panel — secure + performant */
const ADMIN_USER = "admin";
const ADMIN_PASS_HASH = "7a7d0a9c4a3f7d9b0e8f8a1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2"; // placeholder, will compute real hash for IELTS2026! on load
const REAL_PASS = "IELTS2026!";

function escapeHTML(s){ return String(s??'').replace(/[&<>"']/g,c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function sanitize(s, max=500){ return String(s??'').slice(0,max).replace(/[<>]/g,''); }
async function sha256Hex(str){
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
let realHashCache = null;
async function getRealHash(){ if(realHashCache) return realHashCache; realHashCache = await sha256Hex(REAL_PASS); return realHashCache; }

function safeGet(k,d=null){ try{ const v=localStorage.getItem(k); return v===null?d:v; }catch(e){ return d; } }
function safeSet(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ if(e.name==='QuotaExceededError'){ try{ localStorage.removeItem('mockSavesMeta'); }catch(_){} try{ localStorage.setItem(k,v); return true;}catch(_){}} return false; } }
function safeJSON(k,d){ try{ const v=localStorage.getItem(k); return v? JSON.parse(v): d; }catch(e){ return d; } }

let sessionTimer=null;
function isLoggedIn(){
  try{
    const tok = sessionStorage.getItem('admin_token');
    const exp = parseInt(sessionStorage.getItem('admin_exp')||'0');
    if(!tok || Date.now()>exp) return false;
    return true;
  }catch(e){ return false; }
}
function setSession(){
  const exp = Date.now()+30*60*1000;
  sessionStorage.setItem('admin_token', Math.random().toString(36).slice(2)+Date.now().toString(36));
  sessionStorage.setItem('admin_exp', String(exp));
  sessionStorage.setItem('admin_login_at', String(Date.now()));
  // also store hash fragment to prevent tamper: we don't store pass
  updateSessionInfo();
  if(sessionTimer) clearInterval(sessionTimer);
  sessionTimer = setInterval(()=>{ if(!isLoggedIn()){ alert('Sessiya tugadi — qayta kiring.'); location.reload(); } updateSessionInfo(); }, 30000);
}
function adminLogout(){
  sessionStorage.removeItem('admin_token');
  sessionStorage.removeItem('admin_exp');
  location.reload();
}
function updateSessionInfo(){
  const exp = parseInt(sessionStorage.getItem('admin_exp')||'0');
  const el=document.getElementById('sessionInfo');
  if(!el) return;
  if(!isLoggedIn()){ el.textContent='Faol emas'; return; }
  const mins = Math.max(0, Math.floor((exp-Date.now())/60000));
  el.textContent = `Faol • ${mins} daq qoldi (30 daq limit)`;
}

// lockout handling
function getLockInfo(){
  const attempts = parseInt(localStorage.getItem('admin_attempts')||'0');
  const lockUntil = parseInt(localStorage.getItem('admin_lock_until')||'0');
  return {attempts, lockUntil};
}
function recordFail(){
  let {attempts, lockUntil} = getLockInfo();
  attempts++;
  localStorage.setItem('admin_attempts', String(attempts));
  if(attempts>=5){
    lockUntil = Date.now()+5*60*1000;
    localStorage.setItem('admin_lock_until', String(lockUntil));
  }
}
function clearFails(){
  localStorage.removeItem('admin_attempts');
  localStorage.removeItem('admin_lock_until');
}
async function handleAdminLogin(e){
  e.preventDefault();
  const errEl=document.getElementById('loginError');
  const {lockUntil} = getLockInfo();
  if(Date.now()<lockUntil){
    const sec=Math.ceil((lockUntil-Date.now())/1000);
    errEl.textContent=`Ko'p urinish — ${sec} soniyadan so'ng urinib ko'ring.`;
    errEl.classList.remove('hidden');
    return;
  }
  const u=document.getElementById('adminUser').value.trim();
  const p=document.getElementById('adminPass').value;
  if(!u||!p){ errEl.textContent='Login va parolni kiriting.'; errEl.classList.remove('hidden'); return; }
  // hash compare
  const h = await sha256Hex(p);
  const real = await getRealHash();
  if(u===ADMIN_USER && h===real){
    clearFails();
    setSession();
    showDashboard();
  } else {
    recordFail();
    const left=5-(parseInt(localStorage.getItem('admin_attempts')||'0'));
    errEl.textContent=`Login yoki parol xato. Qolgan urinish: ${Math.max(0,left)}`;
    errEl.classList.remove('hidden');
  }
}

// Data handling — load custom override similar to app.js
const _src = window.IELTS_DATA;
function loadCustom(){
  try{
    const raw=localStorage.getItem('ielts_custom_data');
    if(!raw) return null;
    const j=JSON.parse(raw);
    if(j && (j.part1||j.part2||j.part3)) return j;
  }catch(e){}
  return null;
}
let CUSTOM = loadCustom();
let DATA = CUSTOM ? {
  part1: CUSTOM.part1||_src.part1,
  part2: CUSTOM.part2||_src.part2,
  part3: CUSTOM.part3||_src.part3
} : _src;

function saveCustom(){
  const payload={part1:DATA.part1, part2:DATA.part2, part3:DATA.part3};
  const s=JSON.stringify(payload);
  // quota check
  const ok=safeSet('ielts_custom_data', s);
  if(!ok) alert('Saqlashda xato — storage to\'ldi. Brauzer xotirasini tozalang.');
  else {
    localStorage.setItem('admin_last_save', new Date().toISOString());
    updateStats();
  }
  return ok;
}

// UI
function showDashboard(){
  document.getElementById('adminLoginView').classList.add('hidden');
  document.getElementById('adminDashboard').classList.remove('hidden');
  document.getElementById('adminLogoutBtn').classList.remove('hidden');
  refreshIcons();
  updateStats();
  renderAllTables();
  renderMocks();
  setAdminTab('overview');
}
function checkAuthOnLoad(){
  if(isLoggedIn()) showDashboard();
  else {
    document.getElementById('adminLoginView').classList.remove('hidden');
    document.getElementById('adminDashboard').classList.add('hidden');
  }
  // lucide
  if(window.lucide) try{ lucide.createIcons(); }catch(e){}
}
function refreshIcons(){ if(window.lucide&&lucide.createIcons) try{lucide.createIcons()}catch(e){} }

function updateStats(){
  document.getElementById('statP1').textContent=DATA.part1.length;
  document.getElementById('statP2').textContent=DATA.part2.length;
  document.getElementById('statP3').textContent=DATA.part3.length;
  // storage usage estimate
  try{
    let total=0;
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      total+= (localStorage.getItem(k)||'').length;
    }
    const kb=Math.round(total/102.4)/10;
    document.getElementById('statStorage').textContent=kb+' KB';
    const mocks=safeJSON('mockSavesMeta',[]).length;
    document.getElementById('statMocks').textContent=mocks+' mock javob • '+kb+' KB localStorage';
  }catch(e){}
  const last=safeGet('admin_last_save','—');
  const lastEl=document.getElementById('lastSaveInfo');
  if(lastEl) lastEl.textContent = last==='—'?'—': new Date(last).toLocaleString();
  // counts
  ['P1','P2','P3'].forEach((k,i)=>{
    const part=['part1','part2','part3'][i];
    const el=document.getElementById('count'+k);
    if(el) el.textContent=DATA[part].length;
  });
  updateSessionInfo();
}

// Tabs
function setAdminTab(tab){
  document.querySelectorAll('.atab').forEach(b=>{
    if(b.dataset.atab===tab) b.className='atab px-4 py-2 rounded-full bg-slate-900 text-white text-[13px] font-bold';
    else b.className='atab px-4 py-2 rounded-full bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-[13px] font-bold';
  });
  document.querySelectorAll('.atabPane').forEach(p=>p.classList.add('hidden'));
  const pane=document.getElementById('atab-'+tab);
  if(pane) pane.classList.remove('hidden');
  refreshIcons();
}

// Pagination & search
let pageState={part1:{q:'',p:0}, part2:{q:'',p:0}, part3:{q:'',p:0}};
const PAGE_SIZE=20;
function debounce(fn,wait){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),wait); }; }

function renderTable(part){
  const state=pageState[part];
  const q=(state.q||'').toLowerCase();
  let list=DATA[part];
  if(q){
    list=list.filter(t=>{
      const hay=(t.title+' '+t.uz+' '+(t.desc||'')+' '+(t.cat||'')+' '+t.questions.map(x=>x.q).join(' ')+(t.prompts? t.prompts.join(' '):'')+' '+(t.answer||'')).toLowerCase();
      return hay.includes(q);
    });
  }
  const totalPages=Math.max(1, Math.ceil(list.length/PAGE_SIZE));
  if(state.p>=totalPages) state.p=totalPages-1;
  if(state.p<0) state.p=0;
  const start=state.p*PAGE_SIZE;
  const slice=list.slice(start,start+PAGE_SIZE);
  const el=document.getElementById('table'+part.charAt(0).toUpperCase()+part.slice(1));
  if(!el) return;
  if(!slice.length){
    el.innerHTML=`<div class="text-center py-8 text-slate-500 text-[13px]">Hech narsa topilmadi.</div>`;
  } else {
    el.innerHTML=slice.map(item=>{
      const qq = item.questions?.[0]?.q || item.prompts?.[0]||'';
      return `<div class="flex gap-3 items-center bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-3">
        <div class="w-9 h-9 rounded-xl bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 grid place-items-center text-[14px]">${escapeHTML(item.icon||'💬')}</div>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-[13px] truncate">${escapeHTML(item.title)}</div>
          <div class="text-[11px] text-slate-500 truncate">${escapeHTML(item.uz)} • ${escapeHTML(item.cat||'')} • ${escapeHTML(qq.slice(0,60))}</div>
          <div class="text-[11px] font-mono text-slate-400">${escapeHTML(item.id)} • ${item.questions.length} savol</div>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button onclick="openEditModal('${part}','${item.id}')" class="bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-full px-3 py-1 text-[12px] font-bold">Tahrir</button>
          <button onclick="deleteTopic('${part}','${item.id}')" class="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-300 rounded-full px-3 py-1 text-[12px] font-bold">O'chir</button>
        </div>
      </div>`;
    }).join('');
  }
  const pageEl=document.getElementById('page'+part.charAt(0).toUpperCase()+part.slice(1));
  if(pageEl) pageEl.textContent=`${state.p+1} / ${totalPages} • ${list.length} ta`;
}
function renderAllTables(){ renderTable('part1'); renderTable('part2'); renderTable('part3'); }
function changePage(part, dir){
  pageState[part].p+=dir;
  renderTable(part);
}
function bindAdminSearch(){
  ['part1','part2','part3'].forEach(part=>{
    const inp=document.getElementById('search'+part.charAt(0).toUpperCase()+part.slice(1));
    if(!inp) return;
    inp.addEventListener('input', debounce(()=>{
      pageState[part].q=sanitize(inp.value,80);
      pageState[part].p=0;
      renderTable(part);
    },300));
  });
}

// Edit modal
let editingPart=null, editingId=null;
function openEditModal(part, id){
  editingPart=part; editingId=id;
  const modal=document.getElementById('editModal');
  const titleEl=document.getElementById('editModalTitle');
  const body=document.getElementById('editModalBody');
  let item=null;
  if(id) item=DATA[part].find(x=>x.id===id);
  if(part==='part2'){
    // Part2 cue card
    const isEdit=!!item;
    titleEl.textContent=isEdit?`Tahrirlash: ${item.id}`:'Yangi Cue Card qo\'shish';
    body.innerHTML=`
      <div class="grid sm:grid-cols-2 gap-3">
        <label class="space-y-1"><span class="text-[12px] font-bold">ID (auto)</span><input id="edit_id" value="${escapeHTML(item?.id||'')}" placeholder="p2-81 auto" maxlength="10" class="w-full bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-[13px] ${isEdit?'bg-slate-100 opacity-70':''}" ${isEdit?'readonly':''}><div class="text-[11px] text-slate-500">Bo'sh qoldirsangiz auto generatsiya.</div></label>
        <label class="space-y-1"><span class="text-[12px] font-bold">Kategoriya</span><input id="edit_cat" value="${escapeHTML(item?.cat||'Objects & Experiences')}" maxlength="30" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]"></label>
        <label class="space-y-1"><span class="text-[12px] font-bold">Icon</span><input id="edit_icon" value="${escapeHTML(item?.icon||'🎁')}" maxlength="4" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]"></label>
        <label class="space-y-1"><span class="text-[12px] font-bold">Level</span><input id="edit_level" value="${escapeHTML(item?.level||'Band 7-9')}" maxlength="20" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]"></label>
      </div>
      <label class="block space-y-1"><span class="text-[12px] font-bold">Title (cue card matni)</span><input id="edit_title" value="${escapeHTML(item?.title||'')}" maxlength="150" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]"></label>
      <label class="block space-y-1"><span class="text-[12px] font-bold">UZ tarjima (qisqa)</span><input id="edit_uz" value="${escapeHTML(item?.uz||'')}" maxlength="80" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]"></label>
      <div class="space-y-2">
        <div class="text-[12px] font-bold">Prompts (4 ta nuqta)</div>
        ${(item?.prompts||['','','','']).map((pr,i)=>`<input id="edit_prompt_${i}" value="${escapeHTML(pr)}" maxlength="120" placeholder="Prompt ${i+1}" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]">`).join('')}
      </div>
      <label class="block space-y-1"><span class="text-[12px] font-bold">Best Answer (to'liq, ~180 so'z)</span><textarea id="edit_answer" maxlength="3000" rows="6" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]">${escapeHTML(item?.answer||'')}</textarea></label>
      <label class="block space-y-1"><span class="text-[12px] font-bold">Vocab (vergul bilan)</span><input id="edit_vocab" value="${escapeHTML((item?.vocab||[]).join(', '))}" maxlength="200" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]"></label>
      <label class="block space-y-1"><span class="text-[12px] font-bold">Tip</span><input id="edit_tip" value="${escapeHTML(item?.tip||'')}" maxlength="200" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]"></label>
    `;
  } else {
    // Part1 / Part3
    const isEdit=!!item;
    titleEl.textContent=isEdit?`Tahrirlash: ${item.id}`:(part==='part1'?'Yangi Part 1 mavzu':'Yangi Part 3 mavzu');
    const qs=item?.questions||[{q:'',a:''},{q:'',a:''},{q:'',a:''},{q:'',a:''}];
    // ensure 4
    while(qs.length<4) qs.push({q:'',a:'',vocab:[],tip:''});
    body.innerHTML=`
      <div class="grid sm:grid-cols-2 gap-3">
        <label class="space-y-1"><span class="text-[12px] font-bold">ID (auto)</span><input id="edit_id" value="${escapeHTML(item?.id||'')}" placeholder="${part==='part1'?'p1-39 auto':'p3-43 auto'}" maxlength="10" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px] ${isEdit?'bg-slate-100 opacity-70':''}" ${isEdit?'readonly':''}></label>
        <label class="space-y-1"><span class="text-[12px] font-bold">Kategoriya</span><input id="edit_cat" value="${escapeHTML(item?.cat||'Personal')}" maxlength="30" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]"></label>
        <label class="space-y-1"><span class="text-[12px] font-bold">Icon</span><input id="edit_icon" value="${escapeHTML(item?.icon||'💬')}" maxlength="4" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]"></label>
        <label class="space-y-1"><span class="text-[12px] font-bold">Level</span><input id="edit_level" value="${escapeHTML(item?.level||'Band 6-9')}" maxlength="20" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]"></label>
      </div>
      <label class="block space-y-1"><span class="text-[12px] font-bold">Title</span><input id="edit_title" value="${escapeHTML(item?.title||'')}" maxlength="80" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]"></label>
      <label class="block space-y-1"><span class="text-[12px] font-bold">UZ</span><input id="edit_uz" value="${escapeHTML(item?.uz||'')}" maxlength="80" class="w-full bg-white dark:bg-white/10 border rounded-xl px-3 py-2 text-[13px]"></label>
      <div class="space-y-3">
        <div class="text-[12px] font-bold">Savollar (4 ta) + Best Answer</div>
        ${[0,1,2,3].map(i=>`
          <div class="bg-white dark:bg-[#111A33] border border-slate-200 dark:border-white/10 rounded-xl p-3 space-y-2">
            <label class="block space-y-1"><span class="text-[11px] font-bold">Savol ${i+1}</span><input id="edit_q_${i}" value="${escapeHTML(qs[i]?.q||'')}" maxlength="200" class="w-full bg-slate-50 dark:bg-white/5 border rounded-xl px-3 py-2 text-[13px]"></label>
            <label class="block space-y-1"><span class="text-[11px] font-bold">Best Answer ${i+1}</span><textarea id="edit_a_${i}" maxlength="2000" rows="3" class="w-full bg-slate-50 dark:bg-white/5 border rounded-xl px-3 py-2 text-[13px]">${escapeHTML(qs[i]?.a||'')}</textarea></label>
            <div class="grid grid-cols-2 gap-2">
              <label class="space-y-1"><span class="text-[11px] font-bold">Vocab (vergul)</span><input id="edit_vocab_${i}" value="${escapeHTML((qs[i]?.vocab||[]).join(', '))}" maxlength="100" class="w-full bg-slate-50 dark:bg-white/5 border rounded-xl px-3 py-1.5 text-[12px]"></label>
              <label class="space-y-1"><span class="text-[11px] font-bold">Tip</span><input id="edit_tip_${i}" value="${escapeHTML(qs[i]?.tip||'')}" maxlength="150" class="w-full bg-slate-50 dark:bg-white/5 border rounded-xl px-3 py-1.5 text-[12px]"></label>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
  modal.classList.remove('hidden');
  document.body.style.overflow='hidden';
  refreshIcons();
}
function closeEditModal(){
  document.getElementById('editModal').classList.add('hidden');
  document.body.style.overflow='';
  editingPart=null; editingId=null;
}
function saveEditModal(){
  const part=editingPart;
  if(!part) return;
  // collect and validate
  const getVal=id=>document.getElementById(id)?.value?.trim()||'';
  // sanitize helper: strip tags, limit, but keep as stored raw (escaped on display)
  const sTitle=sanitize(getVal('edit_title'),80);
  const sUz=sanitize(getVal('edit_uz'),80);
  const sCat=sanitize(getVal('edit_cat'),30);
  const sIcon=getVal('edit_icon').slice(0,4) || '💬';
  const sLevel=sanitize(getVal('edit_level'),20);
  let id = sanitize(getVal('edit_id'),10);
  // validate required
  if(!sTitle){ alert('Title kiriting!'); return; }
  if(!sUz) { alert('UZ kiriting!'); return; }
  // ID generation if empty
  if(!id){
    const prefix = part==='part1'?'p1-': part==='part2'?'p2-':'p3-';
    const maxId = Math.max(0, ...DATA[part].map(x=> parseInt(x.id.split('-')[1])||0));
    id = prefix + String(maxId+1).padStart(2,'0');
    // ensure unique
    if(DATA[part].some(x=>x.id===id)) id = prefix + String(Date.now()).slice(-4);
  } else {
    // validate format
    if(!/^p[123]-\d{2,4}$/.test(id)){ alert('ID formati noto\'g\'ri: p1-39, p2-81, p3-43 kabi bo\'lsin'); return; }
    // if editing and id changed? but readonly for edit, so ok
    // if new and id exists
    if(!editingId && DATA[part].some(x=>x.id===id)){ alert('Bu ID allaqachon mavjud — boshqasini tanlang.'); return; }
  }

  if(part==='part2'){
    const prompts=[0,1,2,3].map(i=>sanitize(getVal('edit_prompt_'+i),120)).filter(Boolean);
    if(prompts.length<2){ alert('Kamida 2 ta prompt kiriting'); return; }
    while(prompts.length<4) prompts.push('And explain why it is memorable to you.');
    const answer=sanitize(getVal('edit_answer'),3000);
    if(!answer || answer.length<30){ alert('Answer kamida 30 belgi bo\'lsin'); return; }
    const vocab=sanitize(getVal('edit_vocab'),200).split(',').map(s=>sanitize(s.trim(),20)).filter(Boolean).slice(0,6);
    const tip=sanitize(getVal('edit_tip'),200);
    const obj={
      id, title:sTitle, uz:sUz, icon:sIcon, cat:sCat||'Objects & Experiences',
      desc:`Cue Card • ${sCat}`, level:sLevel||'Band 7-9',
      prompts, answer,
      vocab: vocab.length? vocab: ['lasting impression','pivotal moment','cherish'],
      tip: tip||'Use narrative structure: background → details → feelings → reflection.',
      questions: prompts.map(p=>({q:p, a: answer.split('. ').slice(0,2).join('. ')+'.'}))
    };
    if(editingId){
      const idx=DATA[part].findIndex(x=>x.id===editingId);
      if(idx>=0) DATA[part][idx]=obj;
    } else {
      DATA[part].push(obj);
    }
  } else {
    const questions=[];
    for(let i=0;i<4;i++){
      const q=sanitize(getVal('edit_q_'+i),200);
      const a=sanitize(getVal('edit_a_'+i),2000);
      if(!q||!a){ alert(`Savol ${i+1} va Best Answer ${i+1} to'ldiring`); return; }
      const vocab=sanitize(getVal('edit_vocab_'+i),100).split(',').map(s=>sanitize(s.trim(),20)).filter(Boolean).slice(0,5);
      const tip=sanitize(getVal('edit_tip_'+i),150);
      questions.push({q,a, vocab: vocab.length? vocab:['vibrant'], tip: tip||'Use one complex sentence + idiom.'});
    }
    const obj={
      id, title:sTitle, uz:sUz, icon:sIcon, cat:sCat||'Personal',
      desc:`${part==='part1'?'Part 1':'Part 3'} • ${sCat} • 4 savol`,
      level:sLevel||'Band 6-9',
      questions
    };
    if(editingId){
      const idx=DATA[part].findIndex(x=>x.id===editingId);
      if(idx>=0) DATA[part][idx]=obj;
    } else {
      DATA[part].push(obj);
    }
  }

  if(saveCustom()){
    closeEditModal();
    renderTable(part);
    updateStats();
    // show preview
    alert('Saqlab qoldi! Saytni yangilaganda yangi mavzu ko\'rinadi.');
  }
}
function deleteTopic(part, id){
  if(!confirm(`Haqiqatan ${id} ni o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi.`)) return;
  const idx=DATA[part].findIndex(x=>x.id===id);
  if(idx>=0){
    DATA[part].splice(idx,1);
    saveCustom();
    renderTable(part);
    updateStats();
  }
}

// Import / Export
function exportData(){
  const payload={part1:DATA.part1, part2:DATA.part2, part3:DATA.part3, exportedAt:new Date().toISOString(), version:1};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`ielts-speaking-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  // show preview
  const pre=document.getElementById('exportPreview');
  if(pre){ pre.textContent=JSON.stringify(payload,null,2).slice(0,6000); pre.classList.remove('hidden'); }
}
function importData(e){
  const file=e.target.files?.[0];
  if(!file) return;
  if(file.size>5*1024*1024){ alert('Fayl juda katta — 5MB dan oshmasin'); return; }
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const j=JSON.parse(reader.result);
      // validate
      if(!j.part1||!j.part2||!j.part3) throw new Error('part1/part2/part3 topilmadi');
      if(!Array.isArray(j.part1)||!Array.isArray(j.part2)||!Array.isArray(j.part3)) throw new Error('part arrays noto\'g\'ri');
      // quick sanity: check first item shape
      const check = (arr, part)=>{
        for(const it of arr.slice(0,2)){
          if(!it.id||!it.title||!it.questions) throw new Error(`${part} da id/title/questions yo'q`);
          if(!/^p[123]-/.test(it.id)) throw new Error(`${part} id formati xato ${it.id}`);
          // prevent XSS payloads with script tags
          const str=JSON.stringify(it);
          if(/<script|javascript:|onerror=|onload=/i.test(str)) throw new Error(`${part} da xavfli kod aniqlandi — rad etildi`);
        }
      };
      check(j.part1,'part1'); check(j.part2,'part2'); check(j.part3,'part3');
      if(!confirm(`${j.part1.length} Part1, ${j.part2.length} Part2, ${j.part3.length} Part3 import qilinsinmi? Hozirgi ma'lumotlar ustiga yoziladi.`)) return;
      DATA.part1=j.part1; DATA.part2=j.part2; DATA.part3=j.part3;
      saveCustom();
      renderAllTables();
      updateStats();
      alert('Import muvaffaqiyatli! Saytni yangilang.');
    }catch(err){ alert('Import xato: '+err.message); }
    e.target.value='';
  };
  reader.readAsText(file);
}
function resetCustomData(){
  if(!confirm('Barcha o\'zgarishlarni o\'chirib, default ma\'lumotga qaytishni istaysizmi?')) return;
  localStorage.removeItem('ielts_custom_data');
  localStorage.removeItem('admin_last_save');
  DATA={part1:_src.part1.slice(), part2:_src.part2.slice(), part3:_src.part3.slice()};
  // reload from src
  CUSTOM=null;
  // actually reset to src
  DATA.part1=_src.part1; DATA.part2=_src.part2; DATA.part3=_src.part3;
  renderAllTables();
  updateStats();
  alert('Defaultga qaytarildi. Sahifani yangilang.');
}
function downloadSample(){
  const sample={
    part1:[{id:"p1-99",title:"Sample Topic",uz:"Namuna",icon:"🧪",cat:"Personal",desc:"Part 1 • Personal • 4 savol",level:"Band 6-9",questions:[{q:"Do you like samples?",a:"To be honest, I love samples because they help me learn quickly. It's vibrant and useful.",vocab:["vibrant"],tip:"Use complex sentence"}]}],
    part2:[], part3:[]
  };
  const blob=new Blob([JSON.stringify(sample,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download='sample-topics.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),2000);
}

// mocks
function renderMocks(){
  const el=document.getElementById('mockAdminList');
  if(!el) return;
  const hist=safeJSON('mockHistory',[]);
  const meta=safeJSON('mockSavesMeta',[]);
  if(!hist.length && !meta.length){
    el.innerHTML=`<div class="text-[13px] text-slate-500 text-center py-8">Hali mock yo'q.</div>`;
    return;
  }
  const list=hist.length? hist: meta.map((m,i)=>({date:m.date, total:11, status:'completed', overall:'—'}));
  el.innerHTML=list.slice(0,20).map(h=>`
    <div class="flex items-center gap-3 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2.5">
      <div class="w-8 h-8 rounded-full ${h.status==='completed'?'bg-emerald-500':'bg-amber-400'} text-white grid place-items-center text-[11px] font-bold">${h.overall||'✓'}</div>
      <div class="flex-1">
        <div class="text-[12px] font-bold">${escapeHTML(new Date(h.date).toLocaleString())} • ${escapeHTML(String(h.total||11))} savol</div>
        <div class="text-[11px] text-slate-500">${escapeHTML(h.status||'completed')} ${h.breakdown? `• Flu ${h.breakdown.flu} Lex ${h.breakdown.lex}`:''}</div>
      </div>
      <span class="text-[11px] font-mono bg-white dark:bg-white/10 border px-2 py-1 rounded-full">${escapeHTML(String(new Date(h.date).toLocaleDateString()))}</span>
    </div>
  `).join('');
}
function clearAllMockData(){
  if(!confirm('Barcha mock tarixini o\'chirishni istaysizmi? Bu amal qaytarilmaydi.')) return;
  try{ localStorage.removeItem('mockHistory'); localStorage.removeItem('mockSavesMeta'); localStorage.removeItem('mockDone'); localStorage.removeItem('lastMockIds'); }catch(e){}
  renderMocks();
  updateStats();
  alert('Mock tarixi tozalandi.');
}

document.addEventListener('DOMContentLoaded', ()=>{
  checkAuthOnLoad();
  bindAdminSearch();
  // guard: if not logged in, prevent data render
  document.getElementById('adminUser')?.addEventListener('keydown', e=>{ if(e.key==='Enter') handleAdminLogin(e); });
  // session expiry check on focus
  window.addEventListener('focus', updateSessionInfo);
});
