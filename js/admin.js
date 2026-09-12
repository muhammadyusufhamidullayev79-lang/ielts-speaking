/* IELTS Speaking Pro — Admin panel (redesigned) */
'use strict';

/* ============================== utils ============================== */
function escapeHTML(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function sanitize(s, max){
  return String(s ?? '').slice(0, max).replace(/[<>]/g, '').trim();
}
function clampLen(s, max){ return String(s ?? '').slice(0, max); }
async function sha256Hex(str){
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function safeGet(k, d){
  try{ const v = localStorage.getItem(k); return v === null ? d : v; }catch(e){ return d; }
}
function safeSet(k, v){ try{ localStorage.setItem(k, v); return true; }catch(e){ return false; } }
function safeJSON(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
function clone(o){ try{ return JSON.parse(JSON.stringify(o)); }catch(e){ return o; } }
function val(id){ const el = document.getElementById(id); return el ? el.value : ''; }
function setVal(id, v){ const el = document.getElementById(id); if(el) el.value = v; }

/* ============================== icons ============================== */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  messages: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  chart: '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  edit: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  left: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  reset: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  arrowRight: '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>',
  check: '<polyline points="20 6 9 17 4 12"/>'
};
function ic(name, cls){
  return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}
function injectIcons(){
  document.querySelectorAll('[data-ic]').forEach(el => {
    const name = el.getAttribute('data-ic');
    if(ICONS[name]) el.innerHTML = ICONS[name] ? ('<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>') : '';
  });
}

/* ============================== auth ============================== */
const ADMIN_PASS_HASH = '5ff000d13e9b7b44ce23a9137dc85c86afd59d2d3ac2e04ece217a3645e3690d';
const SESSION_MS = 30 * 60 * 1000;
let sessionTimer = null;

function isLoggedIn(){
  try{
    const tok = sessionStorage.getItem('admin_token');
    const exp = parseInt(sessionStorage.getItem('admin_exp') || '0', 10);
    return !!(tok && Date.now() < exp);
  }catch(e){ return false; }
}
function setSession(){
  sessionStorage.setItem('admin_token', Math.random().toString(36).slice(2) + Date.now().toString(36));
  sessionStorage.setItem('admin_exp', String(Date.now() + SESSION_MS));
  if(sessionTimer) clearInterval(sessionTimer);
  sessionTimer = setInterval(() => {
    if(!isLoggedIn()){ alert('Sessiya tugadi — qayta kiring.'); location.reload(); }
  }, 30000);
}
function adminLogout(){
  try{ sessionStorage.removeItem('admin_token'); sessionStorage.removeItem('admin_exp'); }catch(e){}
  location.reload();
}
function lockInfo(){
  return {
    attempts: parseInt(safeGet('admin_attempts', '0'), 10) || 0,
    until: parseInt(safeGet('admin_lock_until', '0'), 10) || 0
  };
}
function recordFail(){
  const a = lockInfo().attempts + 1;
  safeSet('admin_attempts', String(a));
  if(a >= 5) safeSet('admin_lock_until', String(Date.now() + 5 * 60 * 1000));
}
function clearFails(){
  try{ localStorage.removeItem('admin_attempts'); localStorage.removeItem('admin_lock_until'); }catch(e){}
}

async function handleLogin(e){
  e.preventDefault();
  const err = document.getElementById('loginError');
  const { until } = lockInfo();
  if(Date.now() < until){
    const s = Math.ceil((until - Date.now()) / 1000);
    err.textContent = "Ko'p urinish — " + s + " soniyadan so'ng urinib ko'ring.";
    err.classList.remove('hidden');
    return;
  }
  const p = document.getElementById('adminPass').value;
  if(!p){
    err.textContent = 'Parolni kiriting.';
    err.classList.remove('hidden');
    return;
  }
  const h = await sha256Hex(p);
  if(h === ADMIN_PASS_HASH){
    clearFails();
    setSession();
    document.getElementById('adminPass').value = '';
    err.classList.add('hidden');
    showApp();
  } else {
    recordFail();
    const left = Math.max(0, 5 - lockInfo().attempts);
    err.textContent = 'Parol noto\u2018g\u2018ri. Qolgan urinish: ' + left;
    err.classList.remove('hidden');
  }
}

/* ============================== data ============================== */
const _src = window.IELTS_DATA || { part1: [], part2: [], part3: [] };

function loadCustom(){
  try{
    const raw = localStorage.getItem('ielts_custom_data');
    if(!raw) return null;
    const j = JSON.parse(raw);
    if(!j || typeof j !== 'object') return null;
    const out = {};
    ['part1', 'part2', 'part3'].forEach(p => { if(Array.isArray(j[p])) out[p] = j[p]; });
    if(Object.keys(out).length) return out;
  }catch(e){}
  return null;
}

let CUSTOM = loadCustom();
let DATA = {
  part1: (CUSTOM && Array.isArray(CUSTOM.part1)) ? CUSTOM.part1 : clone(_src.part1),
  part2: (CUSTOM && Array.isArray(CUSTOM.part2)) ? CUSTOM.part2 : clone(_src.part2),
  part3: (CUSTOM && Array.isArray(CUSTOM.part3)) ? CUSTOM.part3 : clone(_src.part3)
};

function saveCustom(){
  const payload = { part1: DATA.part1, part2: DATA.part2, part3: DATA.part3 };
  const ok = safeSet('ielts_custom_data', JSON.stringify(payload));
  if(!ok) showToast('Saqlashda xato — brauzer xotirasi to\u2018lgan.', 'error');
  else showToast('Saqlandi', 'success');
  return ok;
}

const PART_META = {
  part1: { key: 'part1', num: '1', title: 'Part 1', label: 'Part 1 — Kirish savollari', catDefault: 'Personal', levelDefault: 'Band 6-9', iconDefault: '\uD83D\uDCAC' },
  part2: { key: 'part2', num: '2', title: 'Part 2', label: 'Part 2 — Cue Cards', catDefault: 'Objects & Experiences', levelDefault: 'Band 7-9', iconDefault: '\uD83C\uDF81' },
  part3: { key: 'part3', num: '3', title: 'Part 3', label: 'Part 3 — Muhokama savollari', catDefault: 'Discussion', levelDefault: 'Band 7-9', iconDefault: '\uD83D\uDCD8' }
};

function findTopic(part, id){ return (DATA[part] || []).find(x => x.id === id) || null; }
function topicCount(part){ return (DATA[part] || []).length; }
function promptList(t){
  return (t.prompts && t.prompts.length) ? t.prompts : ((t.questions || []).map(q => q.q));
}
function questionCount(part){
  return (DATA[part] || []).reduce((n, t) => {
    if(part === 'part2') return n + promptList(t).length;
    return n + (t.questions || []).length;
  }, 0);
}
function nextId(part){
  const prefix = part === 'part1' ? 'p1-' : part === 'part2' ? 'p2-' : 'p3-';
  let max = 0;
  (DATA[part] || []).forEach(x => { const m = /^p[123]-(\d+)$/.exec(x.id || ''); if(m) max = Math.max(max, parseInt(m[1], 10)); });
  return prefix + String(max + 1).padStart(2, '0');
}

/* ============================== state & navigation ============================== */
const state = { view: 'overview', part: null, topicId: null };

function navigate(view, part, topicId){
  state.view = view;
  state.part = part || null;
  state.topicId = topicId || null;
  toggleSidebar(false);
  renderApp();
}
function openTopicView(part, id){
  navigate('questions', part, id);
}

function renderApp(){
  const app = document.getElementById('appView');
  if(!app) return;
  let html = '';
  if(state.view === 'overview') html = overviewHTML();
  else if(state.view === 'part') html = partHTML(state.part);
  else if(state.view === 'questions') html = questionsHTML(state.part, state.topicId);
  else if(state.view === 'import') html = importHTML();
  else if(state.view === 'mocks') html = mocksHTML();
  app.innerHTML = html;
  // re-trigger entrance animation
  app.classList.remove('view-anim'); void app.offsetWidth; app.classList.add('view-anim');
  if(state.view === 'part') renderTopicList(state.part);
  updateSidebar();
  updateTopbar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateSidebar(){
  document.querySelectorAll('.nav-item[data-view]').forEach(b => {
    const dv = b.getAttribute('data-view');
    const active = (state.view === 'part' && dv === state.part) || (state.view !== 'part' && dv === state.view);
    b.classList.toggle('active', active);
  });
}
function updateTopbar(){
  const el = document.getElementById('topbarTitle');
  if(!el) return;
  const map = {
    overview: 'Dashboard',
    part: PART_META[state.part] ? PART_META[state.part].label : 'Dashboard',
    questions: PART_META[state.part] ? (PART_META[state.part].title + ' — Savollar') : 'Dashboard',
    import: 'Import / Export',
    mocks: 'Mock tarixi'
  };
  el.textContent = map[state.view] || 'Dashboard';
}
function updateNavCounts(){
  ['p1', 'p2', 'p3'].forEach((k, i) => {
    const el = document.getElementById('navCount-' + k);
    if(el) el.textContent = topicCount(['part1', 'part2', 'part3'][i]);
  });
}

function toggleSidebar(open){
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebarBackdrop');
  const show = open === undefined ? !sb.classList.contains('open') : open;
  sb.classList.toggle('open', show);
  bd.classList.toggle('hidden', !show);
}

/* ============================== templates ============================== */
function crumbHTML(part, topicTitle){
  let html = '<span class="crumb" onclick="navigate(\'overview\')">Dashboard</span>';
  if(part){
    html += '<span class="crumb-sep">/</span>';
    html += topicTitle
      ? '<span class="crumb" onclick="navigate(\'part\',\'' + part + '\')">' + PART_META[part].title + '</span>'
      : '<span class="crumb crumb-current">' + PART_META[part].title + '</span>';
  }
  if(topicTitle){
    html += '<span class="crumb-sep">/</span><span class="crumb crumb-current">' + escapeHTML(topicTitle) + '</span>';
  }
  return html;
}

function emptyHTML(title, sub, icon){
  return '<div class="empty">' +
    '<div class="empty-icon">' + (icon || '\uD83D\uDCC4') + '</div>' +
    '<div class="empty-title">' + escapeHTML(title) + '</div>' +
    (sub ? '<div class="empty-sub">' + escapeHTML(sub) + '</div>' : '') +
    '</div>';
}

function overviewHTML(){
  const cards = ['part1', 'part2', 'part3'].map(p => {
    const meta = PART_META[p];
    const icName = p === 'part1' ? 'messages' : p === 'part2' ? 'file' : 'chart';
    return '<button class="stat-card" onclick="navigate(\'part\',\'' + p + '\')">' +
      '<div class="stat-icon icon-' + p + '">' + ic(icName) + '</div>' +
      '<div class="stat-body">' +
        '<div class="stat-name">' + meta.title + '</div>' +
        '<div class="stat-nums"><b>' + topicCount(p) + '</b> mavzu \u00B7 <b>' + questionCount(p) + '</b> savol</div>' +
      '</div>' +
      '<span class="stat-arrow">' + ic('arrowRight') + '</span>' +
    '</button>';
  }).join('');

  return '<div class="view-head">' +
    '<h1>Dashboard</h1>' +
    '<p class="sub-line">Bo\u2018limni tanlang va mavzular hamda savollarni boshqaring.</p>' +
    '</div>' +
    '<div class="stat-grid">' + cards + '</div>' +
    '<div class="hint-card"><span class="hint-icon">' + ic('info') + '</span><div>Oqim oddiy: <b>Dashboard \u2192 Part \u2192 Mavzular \u2192 Savollar</b>. Har bir bo\u2018limda yangi mavzu qo\u2018shishingiz, mavzu ichida esa savollarni qo\u2018shish, tahrirlash va o\u2018chirish mumkin.</div></div>';
}

function partHTML(part){
  const meta = PART_META[part];
  const n = topicCount(part);
  return '<div class="view-head">' +
    '<div class="breadcrumb">' + crumbHTML(part) + '</div>' +
    '<h1>' + meta.label + '</h1>' +
    '<p class="sub-line">' + n + ' ta mavzu</p>' +
    '</div>' +
    '<div class="toolbar">' +
      '<div class="search-box">' + ic('search') + '<input id="topicSearch" placeholder="Mavzularni qidirish..." maxlength="80" oninput="renderTopicList(\'' + part + '\')"></div>' +
      '<button class="btn btn-primary" onclick="openTopicModal(\'' + part + '\', null)">' + ic('plus') + ' Yangi mavzu qo\u2018shish</button>' +
    '</div>' +
    '<div class="card list-card"><div class="list" id="topicList"></div></div>';
}

function topicRowHTML(t, part){
  const meta = PART_META[part];
  const n = part === 'part2' ? promptList(t).length : (t.questions || []).length;
  const label = part === 'part2' ? 'prompt' : 'savol';
  return '<div class="topic-row" onclick="openTopicView(\'' + part + '\',\'' + escapeHTML(t.id) + '\')">' +
    '<span class="topic-icon">' + escapeHTML(t.icon || meta.iconDefault) + '</span>' +
    '<div class="topic-body">' +
      '<div class="topic-title">' + escapeHTML(t.title) + '</div>' +
      '<div class="topic-sub">' + escapeHTML(t.uz || '') + '<span class="dot">\u2022</span>' + n + ' ' + label + '</div>' +
    '</div>' +
    '<div class="topic-actions">' +
      '<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openTopicModal(\'' + part + '\',\'' + escapeHTML(t.id) + '\')">' + ic('edit') + ' Tahrir</button>' +
      '<button class="btn btn-danger-ghost btn-sm" onclick="event.stopPropagation();deleteTopic(\'' + part + '\',\'' + escapeHTML(t.id) + '\')">' + ic('trash') + ' O\u2018chirish</button>' +
    '</div>' +
  '</div>';
}

function renderTopicList(part){
  const el = document.getElementById('topicList');
  if(!el) return;
  const meta = PART_META[part];
  const q = (document.getElementById('topicSearch') ? document.getElementById('topicSearch').value : '').toLowerCase();
  const list = (DATA[part] || []).filter(t => {
    if(!q) return true;
    const hay = (t.title + ' ' + t.uz + ' ' + (t.cat || '') + ' ' + (t.questions || []).map(x => x.q).join(' ') + ' ' + (t.prompts || []).join(' ')).toLowerCase();
    return hay.indexOf(q) !== -1;
  });
  if(!list.length){
    el.innerHTML = emptyHTML(q ? 'Hech narsa topilmadi.' : 'Hali mavzu yo\u2018q.', q ? 'Boshqa so\u2018z bilan urinib ko\u2018ring.' : '\u201CYangi mavzu qo\u2018shish\u201D tugmasini bosing.', '\uD83D\uDCC2');
    return;
  }
  el.innerHTML = list.map(t => topicRowHTML(t, part)).join('');
}

function questionsHTML(part, topicId){
  const t = findTopic(part, topicId);
  if(!t){ navigate('part', part); return ''; }
  const meta = PART_META[part];
  const isPart2 = part === 'part2';
  const questions = isPart2 ? promptList(t) : (t.questions || []);
  const addLabel = isPart2 ? 'Prompt qo\u2018shish' : 'Savol qo\u2018shish';
  const note = isPart2 ? 'Cue card promptlari — har biri alohida band.' : 'Savollar va ularning Best Answerlari.';

  const rows = questions.length
    ? questions.map((q, i) => questionRowHTML(part, t, i)).join('')
    : emptyHTML(isPart2 ? 'Hali prompt yo\u2018q.' : 'Hali savol yo\u2018q.', '\u201C' + addLabel + '\u201D tugmasini bosing.', '\uD83D\uDCAC');

  return '<div class="view-head">' +
    '<div class="breadcrumb">' + crumbHTML(part, t.title) + '</div>' +
    '<div class="title-row">' +
      '<button class="btn btn-back" onclick="navigate(\'part\',\'' + part + '\')">' + ic('left') + ' ' + meta.title + '</button>' +
      '<div class="grow">' +
        '<h1>' + escapeHTML(t.title) + '</h1>' +
        '<p class="sub">' + escapeHTML(t.uz || '') + ' \u2022 ' + questions.length + ' ' + (isPart2 ? 'prompt' : 'savol') + '</p>' +
      '</div>' +
      '<div class="header-actions">' +
        (isPart2 ? '<button class="btn btn-ghost btn-sm" onclick="openAnswerModal(\'' + part + '\',\'' + escapeHTML(t.id) + '\')">' + ic('edit') + ' Best Answer</button>' : '') +
        '<button class="btn btn-ghost btn-sm" onclick="openTopicModal(\'' + part + '\',\'' + escapeHTML(t.id) + '\')">' + ic('edit') + ' Mavzuni tahrirlash</button>' +
        '<button class="btn btn-danger-ghost btn-sm" onclick="deleteTopic(\'' + part + '\',\'' + escapeHTML(t.id) + '\')">' + ic('trash') + ' O\u2018chirish</button>' +
      '</div>' +
    '</div>' +
    '</div>' +
    '<div class="toolbar">' +
      '<div class="note">' + note + '</div>' +
      '<button class="btn btn-primary" onclick="openQuestionModal(\'' + part + '\',\'' + escapeHTML(t.id) + '\', null)">' + ic('plus') + ' ' + addLabel + '</button>' +
    '</div>' +
    '<div class="card list-card"><div class="list">' + rows + '</div></div>';
}

function questionRowHTML(part, t, i){
  const id = escapeHTML(t.id);
  if(part === 'part2'){
    const p = promptList(t)[i] || '';
    return '<div class="q-row">' +
      '<span class="q-num">' + (i + 1) + '</span>' +
      '<div class="q-text"><div class="q-title">' + escapeHTML(p) + '</div></div>' +
      '<div class="q-actions">' +
        '<button class="btn btn-ghost btn-sm" onclick="openQuestionModal(\'' + part + '\',\'' + id + '\',' + i + ')">' + ic('edit') + ' Tahrir</button>' +
        '<button class="btn btn-danger-ghost btn-sm" onclick="deleteQuestion(\'' + part + '\',\'' + id + '\',' + i + ')">' + ic('trash') + ' O\u2018chirish</button>' +
      '</div>' +
    '</div>';
  }
  const q = (t.questions || [])[i] || {};
  const a = q.a || '';
  return '<div class="q-row">' +
    '<span class="q-num">' + (i + 1) + '</span>' +
    '<div class="q-text">' +
      '<div class="q-title">' + escapeHTML(q.q) + '</div>' +
      (a ? '<div class="q-answer">' + escapeHTML(a.slice(0, 110)) + (a.length > 110 ? '\u2026' : '') + '</div>' : '') +
    '</div>' +
    '<div class="q-actions">' +
      '<button class="btn btn-ghost btn-sm" onclick="openQuestionModal(\'' + part + '\',\'' + id + '\',' + i + ')">' + ic('edit') + ' Tahrir</button>' +
      '<button class="btn btn-danger-ghost btn-sm" onclick="deleteQuestion(\'' + part + '\',\'' + id + '\',' + i + ')">' + ic('trash') + ' O\u2018chirish</button>' +
    '</div>' +
  '</div>';
}

function importHTML(){
  return '<div class="view-head">' +
    '<div class="breadcrumb">' + crumbHTML() + '</div>' +
    '<h1>Import / Export</h1>' +
    '<p class="sub-line">Ma\u2019lumotlarni JSON ko\u2018rinishida zaxira oling yoki qayta tiklang.</p>' +
    '</div>' +
    '<div class="card" style="padding:22px">' +
      '<div class="meta-line">Export orqali barcha mavzular va savollarning zaxira nusxasini yuklab oling. Import qilishda fayl tekshiriladi va joriy ma\u2019lumotlar ustiga yoziladi.</div>' +
      '<div class="actions-row">' +
        '<button class="btn btn-primary" onclick="exportData()">' + ic('download') + ' JSON Export</button>' +
        '<label class="btn btn-ghost" style="cursor:pointer">' + ic('upload') + ' Fayl tanlab Import<input type="file" id="importFile" accept=".json" class="hidden" onchange="importData(event)"></label>' +
        '<button class="btn btn-ghost" onclick="downloadSample()">' + ic('file') + ' Namuna JSON</button>' +
        '<button class="btn btn-danger-ghost" onclick="resetCustomData()">' + ic('reset') + ' Defaultga qaytarish</button>' +
      '</div>' +
    '</div>';
}

function mocksHTML(){
  const hist = safeJSON('mockHistory', []);
  const meta = safeJSON('mockSavesMeta', []);
  let rows = '';
  if(!hist.length && !meta.length){
    rows = emptyHTML('Hali mock yo\u2018q.', 'Foydalanuvchilar mock topshirgach, tarix shu yerda ko\u2018rinadi.', '\uD83C\uDFA4');
  } else {
    const list = hist.length ? hist : meta.map(m => ({ date: m.date, total: 11, status: 'completed', overall: '\u2014' }));
    rows = list.slice(0, 30).map(h => {
      const done = h.status === 'completed';
      return '<div class="mock-row">' +
        '<div class="mock-badge ' + (done ? 'done' : 'warn') + '">' + (h.overall || '\u2713') + '</div>' +
        '<div class="mock-info">' +
          '<div class="t">' + escapeHTML(new Date(h.date).toLocaleString()) + '</div>' +
          '<div class="s">' + escapeHTML(String(h.total || 11)) + ' savol \u2022 ' + escapeHTML(h.status || 'completed') + (h.breakdown ? ' \u2022 Flu ' + h.breakdown.flu + ' \u00B7 Lex ' + h.breakdown.lex : '') + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }
  return '<div class="view-head">' +
    '<div class="breadcrumb">' + crumbHTML() + '</div>' +
    '<h1>Mock tarixi</h1>' +
    '<p class="sub-line">Foydalanuvchilarning mock natijalari.</p>' +
    '</div>' +
    '<div class="card" style="padding:18px">' +
      rows +
      '<div class="actions-row" style="margin-top:18px">' +
        '<button class="btn btn-danger-ghost" onclick="clearAllMockData()">' + ic('trash') + ' Barchasini o\u2018chirish</button>' +
      '</div>' +
    '</div>';
}

/* ============================== topic CRUD ============================== */
let topicModalState = { part: null, id: null };

function openTopicModal(part, id){
  topicModalState = { part, id };
  const meta = PART_META[part];
  const t = id ? findTopic(part, id) : null;
  document.getElementById('topicModalTitle').textContent = t ? 'Mavzuni tahrirlash' : 'Yangi mavzu qo\u2018shish';
  document.getElementById('topicModalPart').textContent = meta.title + (t ? ' \u2022 ' + t.id : '');
  setVal('topicTitle', t ? t.title : '');
  setVal('topicUz', t ? t.uz : '');
  setVal('topicIcon', t ? (t.icon || '') : meta.iconDefault);
  openModal('topicModal');
  const inp = document.getElementById('topicTitle');
  if(inp) setTimeout(() => inp.focus(), 30);
}
function closeTopicModal(){ closeModal('topicModal'); topicModalState = { part: null, id: null }; }

function buildNewTopic(part, id, title, uz, icon, meta){
  if(part === 'part2'){
    const prompts = ['Who it is', 'How you know this person', 'What this person does', 'And explain why it is important'];
    const subject = title.replace(/^Describe (a|an|the) /i, '').toLowerCase();
    const answer = 'I would like to talk about ' + subject + ', which left a lasting impression on me.\n\nTo give some background, it happened quite unexpectedly, and at first I did not realise how meaningful it would become. What struck me most was the atmosphere — it was full of small details that matter.\n\nLooking back, I remember feeling genuinely grateful for the opportunity. This experience taught me the importance of staying open-minded and cherishing the moment. It was a pivotal moment that shaped my perspective, and I often reflect on it with appreciation. If I had the chance, I would definitely relive it.';
    return {
      id, title, uz, icon,
      cat: meta.catDefault,
      desc: 'Cue Card \u2022 ' + meta.catDefault,
      level: meta.levelDefault,
      prompts: prompts.slice(),
      answer: answer,
      vocab: ['lasting impression', 'pivotal moment', 'cherish'],
      tip: 'Use past tenses + narrative structure: background \u2192 details \u2192 feelings \u2192 reflection.',
      questions: prompts.map(p => ({ q: p, a: '' }))
    };
  }
  return {
    id, title, uz, icon,
    cat: meta.catDefault,
    desc: meta.title + ' \u2022 ' + meta.catDefault,
    level: meta.levelDefault,
    questions: []
  };
}

function saveTopic(){
  const { part, id } = topicModalState;
  if(!part) return;
  const meta = PART_META[part];
  const title = sanitize(val('topicTitle'), 120);
  const uz = sanitize(val('topicUz'), 80) || title;
  const icon = clampLen(val('topicIcon').trim(), 4) || meta.iconDefault;
  if(!title){ showToast('Mavzu nomini kiriting.', 'error'); return; }

  const t = id ? findTopic(part, id) : null;
  if(t){
    t.title = title; t.uz = uz; t.icon = icon;
  } else {
    const newId = nextId(part);
    DATA[part].push(buildNewTopic(part, newId, title, uz, icon, meta));
  }
  saveCustom();
  closeTopicModal();
  updateNavCounts();
  renderApp();
}

function deleteTopic(part, id){
  const t = findTopic(part, id);
  if(!t) return;
  askConfirm({
    title: 'Mavzuni o\u2018chirish',
    message: 'Are you sure you want to delete this topic?\n\n\u00AB' + t.title + '\u00BB mavzusi va undagi barcha savollar o\u2018chiriladi. Bu amalni qaytarib bo\u2018lmaydi.',
    confirmLabel: 'O\u2018chirish',
    danger: true,
    onConfirm: function(){
      DATA[part] = DATA[part].filter(x => x.id !== id);
      saveCustom();
      updateNavCounts();
      navigate('part', part);
    }
  });
}

/* ============================== question CRUD ============================== */
let questionModalState = { part: null, topicId: null, index: null };

function openQuestionModal(part, topicId, index){
  const t = findTopic(part, topicId);
  if(!t) return;
  questionModalState = { part, topicId, index };
  const isPart2 = part === 'part2';
  const adding = index === null || index === undefined;

  document.getElementById('questionModalTitle').textContent = adding
    ? (isPart2 ? 'Yangi prompt qo\u2018shish' : 'Yangi savol qo\u2018shish')
    : (isPart2 ? 'Promptni tahrirlash' : 'Savolni tahrirlash');
  document.getElementById('questionTextLabel').textContent = isPart2 ? 'Prompt matni *' : 'Savol matni *';

  if(adding){
    setVal('qText', '');
    setVal('qAnswer', '');
    setVal('qVocab', '');
    setVal('qTip', '');
  } else if(isPart2){
    setVal('qText', promptList(t)[index] || '');
    setVal('qAnswer', ''); setVal('qVocab', ''); setVal('qTip', '');
  } else {
    const q = (t.questions || [])[index] || {};
    setVal('qText', q.q || '');
    setVal('qAnswer', q.a || '');
    setVal('qVocab', (q.vocab || []).join(', '));
    setVal('qTip', q.tip || '');
  }
  document.getElementById('qAnswerFields').classList.toggle('hidden', isPart2);
  openModal('questionModal');
  const inp = document.getElementById('qText');
  if(inp) setTimeout(() => inp.focus(), 30);
}
function closeQuestionModal(){ closeModal('questionModal'); questionModalState = { part: null, topicId: null, index: null }; }

function saveQuestion(){
  const { part, topicId, index } = questionModalState;
  const t = findTopic(part, topicId);
  if(!t) return;
  const isPart2 = part === 'part2';
  const adding = index === null || index === undefined;
  const qText = sanitize(val('qText'), 200);
  if(!qText){ showToast(isPart2 ? 'Prompt matnini kiriting.' : 'Savol matnini kiriting.', 'error'); return; }

  if(isPart2){
    const prompts = promptList(t).slice();
    if(adding) prompts.push(qText);
    else prompts[index] = qText;
    t.prompts = prompts;
    t.questions = prompts.map(p => ({ q: p, a: '' }));
  } else {
    const questions = (t.questions || []).slice();
    const obj = {
      q: qText,
      a: sanitize(val('qAnswer'), 3000),
      vocab: sanitize(val('qVocab'), 200).split(',').map(s => sanitize(s, 20)).filter(Boolean).slice(0, 6),
      tip: sanitize(val('qTip'), 200)
    };
    if(adding) questions.push(obj);
    else questions[index] = obj;
    t.questions = questions;
  }
  saveCustom();
  closeQuestionModal();
  renderApp();
}

function deleteQuestion(part, topicId, index){
  const t = findTopic(part, topicId);
  if(!t) return;
  const isPart2 = part === 'part2';
  const text = isPart2 ? (promptList(t)[index] || '') : ((t.questions || [])[index] ? (t.questions || [])[index].q : '');
  askConfirm({
    title: isPart2 ? 'Promptni o\u2018chirish' : 'Savolni o\u2018chirish',
    message: '\u00AB' + text + '\u00BB \u2014 o\u2018chirilsinmi? Bu amalni qaytarib bo\u2018lmaydi.',
    confirmLabel: 'O\u2018chirish',
    danger: true,
    onConfirm: function(){
      if(isPart2){
        const prompts = promptList(t);
        prompts.splice(index, 1);
        t.prompts = prompts;
        t.questions = prompts.map(p => ({ q: p, a: '' }));
      } else {
        t.questions = (t.questions || []).filter((q, i) => i !== index);
      }
      saveCustom();
      renderApp();
    }
  });
}

/* ============================== answer CRUD (Part 2) ============================== */
let answerModalState = { part: null, topicId: null };
function openAnswerModal(part, topicId){
  const t = findTopic(part, topicId);
  if(!t) return;
  answerModalState = { part, topicId };
  setVal('ansText', t.answer || '');
  setVal('ansVocab', (t.vocab || []).join(', '));
  setVal('ansTip', t.tip || '');
  openModal('answerModal');
}
function closeAnswerModal(){ closeModal('answerModal'); answerModalState = { part: null, topicId: null }; }
function saveAnswerModal(){
  const { part, topicId } = answerModalState;
  const t = findTopic(part, topicId);
  if(!t) return;
  t.answer = sanitize(val('ansText'), 4000);
  t.vocab = sanitize(val('ansVocab'), 200).split(',').map(s => sanitize(s, 20)).filter(Boolean).slice(0, 8);
  t.tip = sanitize(val('ansTip'), 200);
  saveCustom();
  closeAnswerModal();
  renderApp();
}

/* ============================== confirm modal ============================== */
let confirmCallback = null;
function askConfirm(opts){
  confirmCallback = opts.onConfirm || null;
  document.getElementById('confirmTitle').textContent = opts.title || 'Tasdiqlash';
  document.getElementById('confirmMessage').textContent = opts.message || '';
  document.getElementById('confirmYesBtn').textContent = opts.confirmLabel || 'O\u2018chirish';
  document.getElementById('confirmYesBtn').className = 'btn ' + (opts.danger === false ? 'btn-primary' : 'btn-danger');
  openModal('confirmModal');
}
function confirmYes(){
  const fn = confirmCallback;
  confirmCallback = null;
  closeModal('confirmModal');
  if(fn) fn();
}
function confirmNo(){
  confirmCallback = null;
  closeModal('confirmModal');
}

/* ============================== import / export ============================== */
function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportData(){
  const payload = { part1: DATA.part1, part2: DATA.part2, part3: DATA.part3, exportedAt: new Date().toISOString(), version: 1 };
  downloadJSON(payload, 'ielts-speaking-backup-' + new Date().toISOString().slice(0, 10) + '.json');
  showToast('JSON fayl yuklab olindi.', 'success');
}
function importData(e){
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  if(file.size > 5 * 1024 * 1024){ showToast('Fayl juda katta \u2014 5MB dan oshmasin.', 'error'); e.target.value = ''; return; }
  const reader = new FileReader();
  reader.onload = function(){
    let j;
    try{
      j = JSON.parse(reader.result);
      if(!j.part1 || !j.part2 || !j.part3) throw new Error('part1/part2/part3 topilmadi');
      if(![j.part1, j.part2, j.part3].every(Array.isArray)) throw new Error('format noto\u2018g\u2018ri');
      [['part1', j.part1], ['part2', j.part2], ['part3', j.part3]].forEach(pair => {
        const name = pair[0], arr = pair[1];
        for(const it of arr.slice(0, 2)){
          if(!it.id || !it.title || !it.questions) throw new Error(name + ' da id/title/questions yo\u2018q');
          if(!/^p[123]-/.test(it.id)) throw new Error(name + ' da id formati xato');
          const s = JSON.stringify(it);
          if(/<script|javascript:|onerror=|onload=/i.test(s)) throw new Error(name + ' da xavfli kod aniqlandi \u2014 rad etildi');
        }
      });
    }catch(err){
      showToast('Import xato: ' + err.message, 'error');
      e.target.value = '';
      return;
    }
    askConfirm({
      title: 'Import',
      message: j.part1.length + ' ta Part 1, ' + j.part2.length + ' ta Part 2, ' + j.part3.length + ' ta Part 3 mavzu import qilinsinmi? Joriy ma\u2019lumotlar ustiga yoziladi.',
      confirmLabel: 'Import qilish',
      danger: false,
      onConfirm: function(){
        DATA = { part1: j.part1, part2: j.part2, part3: j.part3 };
        saveCustom();
        updateNavCounts();
        renderApp();
      }
    });
    e.target.value = '';
  };
  reader.readAsText(file);
}
function resetCustomData(){
  askConfirm({
    title: 'Defaultga qaytarish',
    message: 'Barcha o\u2018zgarishlar o\u2018chirilib, asl (default) ma\u2019lumot tiklanadi. Davom etasizmi?',
    confirmLabel: 'Qaytarish',
    danger: true,
    onConfirm: function(){
      try{ localStorage.removeItem('ielts_custom_data'); }catch(e){}
      CUSTOM = null;
      DATA = { part1: clone(_src.part1), part2: clone(_src.part2), part3: clone(_src.part3) };
      updateNavCounts();
      renderApp();
      showToast('Default ma\u2019lumotga qaytarildi.', 'success');
    }
  });
}
function downloadSample(){
  const sample = {
    part1: [{ id: 'p1-99', title: 'Sample Topic', uz: 'Namuna', icon: '\uD83E\uDDEA', cat: 'Personal', desc: 'Part 1 \u2022 Personal', level: 'Band 6-9', questions: [{ q: 'Do you like samples?', a: 'To be honest, I love samples because they help me learn quickly. It is vibrant and useful.', vocab: ['vibrant'], tip: 'Use one complex sentence.' }] }],
    part2: [],
    part3: []
  };
  downloadJSON(sample, 'sample-topics.json');
}

/* ============================== mocks ============================== */
function clearAllMockData(){
  askConfirm({
    title: 'Mock tarixini tozalash',
    message: 'Barcha mock tarixi o\u2018chiriladi. Bu amalni qaytarib bo\u2018lmaydi.',
    confirmLabel: 'O\u2018chirish',
    danger: true,
    onConfirm: function(){
      try{ ['mockHistory', 'mockSavesMeta', 'mockDone', 'lastMockIds'].forEach(k => localStorage.removeItem(k)); }catch(e){}
      renderApp();
      showToast('Mock tarixi tozalandi.', 'success');
    }
  });
}

/* ============================== ui helpers ============================== */
function openModal(id){
  const m = document.getElementById(id);
  if(m) m.classList.add('open');
  document.body.classList.add('no-scroll');
}
function closeModal(id){
  const m = document.getElementById(id);
  if(m) m.classList.remove('open');
  if(!document.querySelector('.modal.open')) document.body.classList.remove('no-scroll');
}
let toastTimer = null;
function showToast(msg, type){
  const t = document.getElementById('toast');
  if(!t) return;
  t.textContent = msg;
  t.className = 'toast show ' + (type || '');
  if(toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
}

function showApp(){
  setChrome(true);
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
  document.getElementById('logoutBtn').classList.remove('hidden');
  document.getElementById('logoutBtnTop').classList.remove('hidden');
  document.getElementById('topbarTitle').textContent = 'Dashboard';
  updateNavCounts();
  navigate('overview');
}
function showLogin(){
  setChrome(false);
  document.getElementById('loginView').classList.remove('hidden');
  document.getElementById('appView').classList.add('hidden');
  document.getElementById('logoutBtn').classList.add('hidden');
  document.getElementById('logoutBtnTop').classList.add('hidden');
  document.getElementById('topbarTitle').textContent = 'Admin Panel';
  const err = document.getElementById('loginError');
  if(err) err.classList.add('hidden');
}
function setChrome(authed){
  const sb = document.getElementById('sidebar');
  const bd = document.getElementById('sidebarBackdrop');
  const tb = document.getElementById('topbar');
  if(sb) sb.classList.toggle('hidden', !authed);
  if(bd) bd.classList.add('hidden');
  if(tb) tb.classList.toggle('hidden', !authed);
}

/* ============================== init ============================== */
document.addEventListener('DOMContentLoaded', () => {
  injectIcons();
  if(isLoggedIn()) showApp();
  else showLogin();
  document.addEventListener('keydown', e => {
    if(e.key === 'Escape'){
      ['topicModal', 'questionModal', 'answerModal', 'confirmModal'].forEach(id => closeModal(id));
    }
  });
});

/* ============================== exports ============================== */
window.navigate = navigate;
window.openTopicView = openTopicView;
window.renderTopicList = renderTopicList;
window.handleLogin = handleLogin;
window.adminLogout = adminLogout;
window.toggleSidebar = toggleSidebar;
window.openTopicModal = openTopicModal;
window.closeTopicModal = closeTopicModal;
window.saveTopic = saveTopic;
window.deleteTopic = deleteTopic;
window.openQuestionModal = openQuestionModal;
window.closeQuestionModal = closeQuestionModal;
window.saveQuestion = saveQuestion;
window.deleteQuestion = deleteQuestion;
window.openAnswerModal = openAnswerModal;
window.closeAnswerModal = closeAnswerModal;
window.saveAnswerModal = saveAnswerModal;
window.confirmYes = confirmYes;
window.confirmNo = confirmNo;
window.exportData = exportData;
window.importData = importData;
window.resetCustomData = resetCustomData;
window.downloadSample = downloadSample;
window.clearAllMockData = clearAllMockData;
