import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ===== 1. Cấu hình Firebase ===== */
const firebaseConfig = {
  apiKey: "AIzaSyAvhuFBaxq4eNF3SIfltIfgs7ZOqanU4Nc",
  authDomain: "checklist-1bc04.firebaseapp.com",
  projectId: "checklist-1bc04",
  storageBucket: "checklist-1bc04.firebasestorage.app",
  messagingSenderId: "433774598052",
  appId: "1:433774598052:web:ae7d90229ecbb902fad331"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ===== 2. Hằng số & Xử lý Ngày/Tuần ===== */
const DAYS  = ['Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7','Chủ Nhật'];
const SLOTS = ['Sáng','Trưa','Chiều','Tối'];
const CELLS = DAYS.length * SLOTS.length; // 28 ô/tuần
const MAX_MEMBERS = 20;
const MAX_NAME = 24;

function getMonday(date){
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d;
}
function addDays(date, n){
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + n);
  return d;
}
function toISODate(date){
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function fmtDM(date){
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

const todayISO = toISODate(new Date());
let currentWeekStart = getMonday(new Date());

/* ===== 3. Phòng (Room) & Trạng thái ===== */
const params = new URLSearchParams(location.search);
const roomId = (params.get('room') || 'nhom-6-nguoi').replace(/[^a-zA-Z0-9_-]/g, '') || 'nhom-6-nguoi';
const roomRef = doc(db, 'rooms', roomId);

let state = null;
let activeCell = null;
let saveTimer = null;

const $ = id => document.getElementById(id);
const els = {
  thead:$('thead'), tbody:$('tbody'), wrap:$('wrap'), info:$('info'), pop:$('pop'),
  weekLabel:$('weekLabel'), syncBadge:$('syncBadge'), syncText:$('syncText'),
  overlay:$('overlay'), dlgTitle:$('dlgTitle'), dlgMsg:$('dlgMsg'), dlgInput:$('dlgInput'),
  dlgActions:$('dlgActions'), toast:$('toast')
};

function h(tag, cls, text){
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function blankCells(){ return new Array(CELLS).fill(0); }
function freshId(members){
  let id;
  do { id = Math.random().toString(36).slice(2,7); } while (!id || members.some(m => m.id === id));
  return id;
}
function defaultState(){
  const members = [];
  for (let i = 1; i <= 6; i++){
    members.push({ id: freshId(members), name: 'Bạn ' + i });
  }
  return { members, schedules: {} };
}
function getWeekKey(){ return toISODate(currentWeekStart); }
function getWeekCells(memberId){
  const wk = getWeekKey();
  if (!state.schedules[wk]) state.schedules[wk] = {};
  if (!Array.isArray(state.schedules[wk][memberId]) || state.schedules[wk][memberId].length !== CELLS){
    state.schedules[wk][memberId] = blankCells();
  }
  return state.schedules[wk][memberId];
}

function setSyncStatus(mode, text){
  els.syncBadge.className = 'sync-badge' + (mode ? ' ' + mode : '');
  els.syncText.textContent = text;
}

/* ===== 4. Lưu lên Firebase Firestore ===== */
function saveToCloud(immediate = false){
  setSyncStatus('syncing', 'Đang đồng bộ...');
  clearTimeout(saveTimer);
  const run = async () => {
    try {
      await setDoc(roomRef, state);
      setSyncStatus('', 'Đã đồng bộ trực tuyến');
    } catch (err) {
      console.error('Lỗi lưu Firestore:', err);
      setSyncStatus('error', 'Lỗi đồng bộ');
      showToast('Không thể lưu dữ liệu. Kiểm tra lại Rules của Firebase!');
    }
  };
  if (immediate) run();
  else saveTimer = setTimeout(run, 350);
}

/* ===== 5. Hiển thị giao diện ===== */
function renderWeekHeader(){
  const end = addDays(currentWeekStart, 6);
  els.weekLabel.textContent = `Tuần ${fmtDM(currentWeekStart)} - ${fmtDM(end)}/${end.getFullYear()}`;
}

function render(){
  if (!state) return;
  renderWeekHeader();

  const focused = document.activeElement;
  const focusedMemberId = focused && focused.classList.contains('name-input') ? focused.dataset.id : null;
  const selStart = focusedMemberId ? focused.selectionStart : null;
  const selEnd = focusedMemberId ? focused.selectionEnd : null;

  const members = state.members;
  const n = members.length;

  const counts = new Array(CELLS).fill(0);
  members.forEach(m => {
    const a = getWeekCells(m.id);
    for (let i = 0; i < CELLS; i++) if (a[i] === 1) counts[i]++;
  });
  const max = Math.max(0, ...counts);

  const trh = document.createElement('tr');
  trh.append(h('th','col-day','Ngày'), h('th','col-slot','Buổi'));

  members.forEach((m, mi) => {
    const th = h('th','member');
    const box = h('div','member-head');

    const input = h('input','name-input');
    input.type = 'text';
    input.value = m.name;
    input.dataset.id = m.id;
    input.maxLength = MAX_NAME;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Tên thành viên ' + (mi + 1));
    input.addEventListener('focus', closePopover);
    input.addEventListener('input', () => {
      m.name = input.value.slice(0, MAX_NAME);
      saveToCloud(false);
    });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
    input.addEventListener('blur', () => {
      if (!input.value.trim()){
        m.name = 'Bạn ' + (state.members.indexOf(m) + 1);
        input.value = m.name;
      }
      saveToCloud(true);
    });

    const del = h('button','del','×');
    del.type = 'button';
    del.title = 'Xóa người này';
    del.setAttribute('aria-label', 'Xóa ' + m.name);
    del.addEventListener('click', () => removeMember(m));

    box.append(input, del);
    th.append(box);
    trh.append(th);
  });

  trh.append(h('th','total','Rảnh'));
  els.thead.replaceChildren(trh);

  if (focusedMemberId){
    const targetInput = els.thead.querySelector(`.name-input[data-id="${focusedMemberId}"]`);
    if (targetInput){
      targetInput.focus();
      if (selStart != null && selEnd != null) targetInput.setSelectionRange(selStart, selEnd);
    }
  }

  const frag = document.createDocumentFragment();
  DAYS.forEach((dayName, d) => {
    const dateObj = addDays(currentWeekStart, d);
    const dateISO = toISODate(dateObj);
    const isToday = dateISO === todayISO;
    const dmStr = fmtDM(dateObj);

    SLOTS.forEach((slot, s) => {
      const idx = d * SLOTS.length + s;
      const tr = h('tr',
        (d % 2 ? 'alt ' : '') +
        (s === SLOTS.length - 1 ? 'day-end ' : '') +
        (isToday ? 'is-today' : '')
      );

      if (s === 0){
        const td = h('td','day');
        td.rowSpan = SLOTS.length;
        td.append(
          h('span','day-name', dayName),
          h('span','day-date', dmStr)
        );
        if (isToday) td.append(h('span','today-tag','Hôm nay'));
        tr.append(td);
      }
      tr.append(h('td','slot',slot));

      members.forEach(m => {
        const v = getWeekCells(m.id)[idx];
        const label = v === 1 ? 'Rảnh' : v === 2 ? 'Bận' : '–';
        const td = h('td', 'cell' + (v === 1 ? ' free' : v === 2 ? ' busy' : ''));
        td.tabIndex = 0;
        td.dataset.m = m.id;
        td.dataset.i = idx;
        td.setAttribute('role','button');
        td.setAttribute('aria-label', `${m.name}, ${dayName} (${dmStr}) ${slot}: ${v === 1 ? 'Rảnh' : v === 2 ? 'Bận' : 'chưa chọn'}`);
        td.append(h('div','pill', label));
        tr.append(td);
      });

      const c = counts[idx];
      tr.append(h('td', 'total' + (c > 0 ? ' some' : '') + (max > 0 && c === max ? ' best' : ''), `${c}/${n}`));
      frag.append(tr);
    });
  });

  els.tbody.replaceChildren(frag);
  updateInfo(counts, max, n);
}

function updateInfo(counts, max, n){
  const bar = els.info;
  bar.replaceChildren();
  if (max === 0){
    bar.className = 'infobar empty';
    bar.textContent = 'Chưa có ai chọn lịch rảnh trong tuần này. Bấm vào các ô bên dưới để bắt đầu!';
    return;
  }
  bar.className = 'infobar';

  const ranked = counts
    .map((c, idx) => ({ c, idx }))
    .filter(x => x.c > 0)
    .sort((a, b) => b.c - a.c || a.idx - b.idx)
    .slice(0, 3);

  bar.append(h('strong', null, 'Khung giờ đẹp nhất tuần: '));
  ranked.forEach(({ c, idx }) => {
    const d = Math.floor(idx / SLOTS.length);
    const s = idx % SLOTS.length;
    const dm = fmtDM(addDays(currentWeekStart, d));
    bar.append(h('span', 'best-chip', `${SLOTS[s]} ${DAYS[d]} (${dm}) • ${c}/${n}`));
  });
}

/* ===== 6. Popover chọn Rảnh / Bận ===== */
function openPopover(td, viaKeyboard){
  closePopover();
  const id = td.dataset.m, idx = +td.dataset.i;
  activeCell = { id, idx, td, kbd: !!viaKeyboard };
  td.classList.add('active');

  const cur = getWeekCells(id)[idx];
  els.pop.querySelectorAll('button').forEach(b => {
    b.classList.toggle('on', cur !== 0 && +b.dataset.v === cur);
  });

  els.pop.hidden = false;
  const r = td.getBoundingClientRect();
  const pw = els.pop.offsetWidth, ph = els.pop.offsetHeight;
  let left = r.left + r.width / 2 - pw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
  let top = r.bottom + 6;
  if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
  els.pop.style.left = left + 'px';
  els.pop.style.top = top + 'px';

  if (viaKeyboard) els.pop.querySelector('button').focus();
}
function closePopover(){
  if (els.pop.hidden) return;
  els.pop.hidden = true;
  if (activeCell && activeCell.td) activeCell.td.classList.remove('active');
  activeCell = null;
}
function applyChoice(v){
  if (!activeCell) return;
  const { id, idx, kbd } = activeCell;
  const arr = getWeekCells(id);
  arr[idx] = (v !== 0 && arr[idx] === v) ? 0 : v;
  closePopover();
  render();
  saveToCloud(true);
  if (kbd){
    const t = els.tbody.querySelector(`td.cell[data-m="${id}"][data-i="${idx}"]`);
    if (t) t.focus();
  }
}

/* ===== 7. Quản lý thành viên & Tuần ===== */
function addMember(){
  closePopover();
  if (state.members.length >= MAX_MEMBERS){ showToast('Tối đa ' + MAX_MEMBERS + ' người'); return; }
  const names = new Set(state.members.map(m => m.name));
  let k = state.members.length + 1;
  while (names.has('Bạn ' + k)) k++;
  const id = freshId(state.members);
  state.members.push({ id, name: 'Bạn ' + k });
  render();
  saveToCloud(true);
  els.wrap.scrollTo({ left: els.wrap.scrollWidth, behavior: 'smooth' });
}

async function removeMember(m){
  closePopover();
  if (state.members.length <= 1){ showToast('Cần giữ ít nhất 1 người'); return; }
  const ok = await openDialog({
    title: 'Xóa người này?',
    message: `Xóa cột "${m.name || 'không tên'}" khỏi lịch nhóm?`,
    buttons: [{ text:'Hủy', value:false }, { text:'Xóa', value:true, cls:'danger' }],
    focus: 0
  });
  if (!ok) return;
  state.members = state.members.filter(x => x.id !== m.id);
  Object.values(state.schedules).forEach(wk => { delete wk[m.id]; });
  render();
  saveToCloud(true);
}

async function clearCurrentWeek(){
  closePopover();
  const ok = await openDialog({
    title: 'Xóa lịch tuần này?',
    message: 'Toàn bộ lựa chọn Rảnh/Bận trong tuần đang xem sẽ được xóa trắng. Tên thành viên và các tuần khác vẫn giữ nguyên.',
    buttons: [{ text:'Hủy', value:false }, { text:'Xóa trắng', value:true, cls:'danger' }],
    focus: 0
  });
  if (!ok) return;
  state.schedules[getWeekKey()] = {};
  render();
  saveToCloud(true);
  showToast('Đã xóa trắng lịch tuần này');
}

/* ===== 8. Copy Link chia sẻ ===== */
async function copyText(text){
  try {
    if (navigator.clipboard && window.isSecureContext){
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly','');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

async function copyLink(){
  closePopover();
  const base = location.href.split('#')[0].split('?')[0];
  const link = `${base}?room=${encodeURIComponent(roomId)}`;
  if (await copyText(link)){
    showToast('Đã copy link phòng! Gửi cho nhóm để cùng điền nhé.');
  } else {
    await openDialog({
      title: 'Copy link thủ công',
      message: 'Sao chép đường link bên dưới để gửi cho nhóm:',
      input: link,
      buttons: [{ text:'Đóng', value:true, cls:'primary' }]
    });
  }
}

/* ===== 9. Dialog & Toast ===== */
function openDialog(opt){
  return new Promise(resolve => {
    const prev = document.activeElement;
    els.dlgTitle.textContent = opt.title;
    els.dlgMsg.textContent = opt.message || '';
    if (opt.input != null){ els.dlgInput.hidden = false; els.dlgInput.value = opt.input; }
    else { els.dlgInput.hidden = true; }
    els.dlgActions.replaceChildren();

    const finish = v => {
      els.overlay.hidden = true;
      els.overlay.onclick = null;
      document.removeEventListener('keydown', onKey, true);
      if (prev && prev.focus) prev.focus();
      resolve(v);
    };
    function onKey(e){
      if (e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); finish(false); }
    }

    let first = null;
    opt.buttons.forEach((b, i) => {
      const btn = h('button', 'btn ' + (b.cls || ''), b.text);
      btn.type = 'button';
      btn.addEventListener('click', () => finish(b.value));
      els.dlgActions.append(btn);
      if (i === (opt.focus == null ? 0 : opt.focus)) first = btn;
    });
    els.overlay.onclick = e => { if (e.target === els.overlay) finish(false); };
    document.addEventListener('keydown', onKey, true);
    els.overlay.hidden = false;
    if (opt.input != null){ els.dlgInput.focus(); els.dlgInput.select(); }
    else if (first){ first.focus(); }
  });
}

let toastTimer = null;
function showToast(msg){
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
}

/* ===== 10. Gắn sự kiện ===== */
$('btnAdd').addEventListener('click', addMember);
$('btnCopy').addEventListener('click', copyLink);
$('btnClear').addEventListener('click', clearCurrentWeek);

$('btnPrevWeek').addEventListener('click', () => {
  closePopover();
  currentWeekStart = addDays(currentWeekStart, -7);
  render();
});
$('btnNextWeek').addEventListener('click', () => {
  closePopover();
  currentWeekStart = addDays(currentWeekStart, 7);
  render();
});
$('btnToday').addEventListener('click', () => {
  closePopover();
  currentWeekStart = getMonday(new Date());
  render();
});

els.tbody.addEventListener('click', e => {
  const td = e.target.closest('td.cell');
  if (td) openPopover(td, false);
});
els.tbody.addEventListener('keydown', e => {
  const td = e.target.closest('td.cell');
  if (td && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openPopover(td, true); }
});
els.pop.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) applyChoice(+b.dataset.v);
});
document.addEventListener('pointerdown', e => {
  if (!els.pop.hidden && !els.pop.contains(e.target)) closePopover();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !els.pop.hidden){
    const t = activeCell && activeCell.kbd ? activeCell.td : null;
    closePopover();
    if (t && t.isConnected) t.focus();
  }
});
els.wrap.addEventListener('scroll', closePopover, { passive: true });
window.addEventListener('resize', closePopover);

/* ===== 11. Khởi chạy & Lắng nghe Realtime từ Firestore ===== */
onSnapshot(roomRef, (snap) => {
  if (snap.exists()){
    const data = snap.data();
    state = {
      members: Array.isArray(data.members) && data.members.length ? data.members : defaultState().members,
      schedules: data.schedules && typeof data.schedules === 'object' ? data.schedules : {}
    };
    setSyncStatus('', 'Đã đồng bộ trực tuyến');
    render();
  } else {
    state = defaultState();
    render();
    saveToCloud(true);
  }
}, (err) => {
  console.error('Lỗi kết nối Firestore:', err);
  setSyncStatus('error', 'Mất kết nối');
  if (!state){
    state = defaultState();
    render();
  }
  showToast('Không kết nối được Firebase. Kiểm tra lại mạng hoặc Firestore Rules.');
});