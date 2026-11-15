const CFG = {
  owner: "teachersergiy-wq",
  repo: "Grafik_klas",
  file: "data.json",
  defaultPasswords: { teacher: "teacher", starosta: "starosta" }
};

const DRAFT_KEY = "gk_draft_v1";

let data = { students: [], days: {}, passwords: null };
let token = localStorage.getItem("gk_write_token") || "";
let userLogin = localStorage.getItem("gk_login") || "";
let role = localStorage.getItem("gk_role") || "viewer";
let editDate = todayStr();
let dataSha = null;
let loginOpen = false;
let editingId = null;
let weekOffset = 0;
let highlightToday = false;
let theme = localStorage.getItem("gk_theme") || "light";
const THEMES = ["light", "dark", "color", "neon"];
const THEME_ICONS = { light: "☀️", dark: "🌙", color: "🎨", neon: "🌈" };

function applyTheme() {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("btnTheme");
  if (btn) {
    btn.textContent = THEME_ICONS[theme] || "🎨";
    btn.title = "Тема: " + ({ light: "світла", dark: "темна", color: "рожева", neon: "бірюзова" }[theme] || theme);
  }
}
function cycleTheme() {
  const i = THEMES.indexOf(theme);
  theme = THEMES[(i + 1) % THEMES.length];
  localStorage.setItem("gk_theme", theme);
  applyTheme();
}
function todayStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
}
function kyivNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Kyiv" }));
}
function isWeekdayKyiv() {
  const d = kyivNow().getDay();
  return d >= 1 && d <= 5;
}
function isHeadTimeWindow() {
  if (!isWeekdayKyiv()) return false;
  const n = kyivNow();
  const mins = n.getHours() * 60 + n.getMinutes();
  return mins >= 8 * 60 && mins < 10 * 60 + 40;
}
function apiUrl(path) {
  return "https://api.github.com/repos/" + CFG.owner + "/" + CFG.repo + "/contents/" + path;
}
function getPasswords() {
  const p = data.passwords || {};
  return {
    teacher: p.teacher || CFG.defaultPasswords.teacher,
    starosta: p.starosta || CFG.defaultPasswords.starosta
  };
}

async function loadData() {
  try {
    const headers = token ? { Authorization: "Bearer " + token } : {};
    const r = await fetch(apiUrl(CFG.file) + "?ref=main", { headers: headers });
    if (!r.ok) throw new Error("load fail");
    const j = await r.json();
    dataSha = j.sha;
    const text = decodeURIComponent(escape(atob(j.content.replace(/\n/g, ""))));
    data = JSON.parse(text);
    if (!data.students) data.students = [];
    if (!data.days) data.days = {};
  } catch (e) {
    try {
      const r2 = await fetch("https://raw.githubusercontent.com/" + CFG.owner + "/" + CFG.repo + "/main/" + CFG.file + "?t=" + Date.now());
      data = await r2.json();
      dataSha = null;
      if (!data.students) data.students = [];
      if (!data.days) data.days = {};
    } catch (e2) {
      data = { students: [], days: {} };
    }
  }
  migrateStudentStats();
  renderAll();
  trySendDraft();
}

async function saveData(msg) {
  if (!token) throw new Error("Немає токена збереження. Вставте його у блок «Токен для збереження» вище.");
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const body = { message: msg || "Оновлення графіка чергування", content: content, branch: "main" };
  if (dataSha) body.sha = dataSha;
  const r = await fetch(apiUrl(CFG.file), {
    method: "PUT",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json"
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    const err = await r.json().catch(function () { return {}; });
    throw new Error(err.message || "Помилка збереження");
  }
  const j = await r.json();
  dataSha = j.content.sha;
}

function studentById(id) {
  return data.students.find(function (s) { return s.id === id; });
}

function scheduleStats(studentId) {
  let b = 0, ch = 0;
  const days = data.days || {};
  Object.keys(days).forEach(function (date) {
    const rec = days[date];
    if (!rec) return;
    const abs = rec.absent || [];
    if (abs.indexOf(studentId) < 0) b += 1;
    if (rec.duty === studentId && dutyCountsInCh(rec)) ch += 1;
  });
  return { b: b, ch: ch };
}
function pastB(s) {
  if (s.b0 != null && s.b0 !== undefined) return Number(s.b0) || 0;
  return Number(s.b) || 0;
}
function pastCh(s) {
  if (s.ch0 != null && s.ch0 !== undefined) return Number(s.ch0) || 0;
  return Number(s.ch) || 0;
}
function totalB(s) { return pastB(s) + scheduleStats(s.id).b; }
function totalCh(s) { return pastCh(s) + scheduleStats(s.id).ch; }
function calcPct(s) {
  const b = totalB(s);
  const ch = totalCh(s);
  if (!b || b <= 0) return ch > 0 ? 1 : 0;
  return ch / b;
}
function migrateStudentStats() {
  if (!data.students) return;
  data.students.forEach(function (s) {
    if (s.b0 != null && s.ch0 != null) return;
    const sch = scheduleStats(s.id);
    const tb = Number(s.b) || 0;
    const tc = Number(s.ch) || 0;
    s.b0 = Math.max(0, tb - sch.b);
    s.ch0 = Math.max(0, tc - sch.ch);
  });
}
function pickDuty(absentIds) {
  const present = data.students.filter(function (s) { return absentIds.indexOf(s.id) < 0; });
  if (!present.length) return null;
  present.sort(function (a, b) {
    const pa = calcPct(a), pb = calcPct(b);
    if (Math.abs(pa - pb) > 1e-9) return pa - pb;
    const ca = totalCh(a), cb = totalCh(b);
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name, "uk");
  });
  return present[0].id;
}
function dayRecord(date) { return data.days[date] || null; }
function dutyCountsInCh(rec) {
  if (!rec || !rec.duty) return false;
  const st = dutyStatusOf(rec);
  return st === "served" || st === "assigned";
}
function dutyStatusOf(rec) {
  if (!rec || !rec.duty) return null;
  if (rec.dutyStatus) return rec.dutyStatus;
  return "served";
}
function canEditDay(date) {
  if (role === "teacher") return true;
  if (role !== "head") return false;
  if (date !== todayStr()) return false;
  if (!isHeadTimeWindow()) return false;
  const rec = dayRecord(date);
  if (rec && Object.keys(data.days).indexOf(date) >= 0 && rec.absent) {
    // starosta can only write once per day if already saved - keep can edit if no record
  }
  return true;
}
function canEditDayNote(date) {
  if (role === "teacher") return true;
  if (role !== "head") return false;
  if (date !== todayStr()) return false;
  if (!isWeekdayKyiv()) return false;
  const n = kyivNow();
  const mins = n.getHours() * 60 + n.getMinutes();
  return mins >= 8 * 60 && mins < 16 * 60;
}
function canEditMatrixCell(date) {
  if (role === "teacher") return true;
  if (role === "head") return canEditDay(date);
  return false;
}
function dutyStatusLabel(rec) {
  const st = dutyStatusOf(rec);
  if (st === "assigned") return "призначений (ще не підтверджено)";
  if (st === "served") return "прочергував";
  if (st === "noshow") return "не прочергував";
  return "";
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """);
}
function formatDateUk(iso) {
  const p = iso.split("-");
  return p[2] + "." + p[1] + "." + p[0];
}
function mondayOfWeekKyiv() {
  const n = kyivNow();
  const day = n.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const m = new Date(n);
  m.setDate(n.getDate() + diff);
  m.setHours(12, 0, 0, 0);
  return m;
}
function dateToIsoLocal(d) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return y + "-" + mo + "-" + da;
}
function weekMondayWithOffset(offset) {
  const mon = mondayOfWeekKyiv();
  mon.setDate(mon.getDate() + offset * 7);
  return mon;
}

function renderMatrix() {
  const table = document.getElementById("matrixTable");
  const label = document.getElementById("weekLabel");
  if (!table) return;
  const names = ["Пн", "Вт", "Ср", "Чт", "Пт"];
  const mon = weekMondayWithOffset(weekOffset);
  const today = todayStr();
  const days = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    days.push(dateToIsoLocal(d));
  }
  if (label) label.textContent = formatDateUk(days[0]) + " – " + formatDateUk(days[4]);
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  let head = "<tr><th>Учень</th><th>%</th>";
  for (let i = 0; i < 5; i++) {
    const isToday = highlightToday && days[i] === today;
    const dayRec = dayRecord(days[i]);
    const noteMark = (dayRec && dayRec.note) ? '<span class="day-note-badge" title="' + escapeHtml(dayRec.note) + '">📝</span>' : "";
    const headCls = (isToday ? "today-col " : "") + "day-head-click";
    head += '<th class="' + headCls + '" data-date="' + days[i] + '" title="Примітка до дня">' + names[i] + noteMark + "<br>" +
      days[i].slice(8) + "." + days[i].slice(5, 7) + "</th>";
  }
  head += "</tr>";
  thead.innerHTML = head;
  const sorted = data.students.slice().sort(function (a, b) {
    return a.name.localeCompare(b.name, "uk");
  });
  let body = "";
  sorted.forEach(function (s) {
    const pct = (calcPct(s) * 100).toFixed(2);
    body += '<tr><td class="name">' + escapeHtml(s.name) + '</td><td class="pct" data-sid="' + s.id + '">' + pct + "</td>";
    for (let i = 0; i < 5; i++) {
      const date = days[i];
      const rec = dayRecord(date);
      const isToday = highlightToday && date === today;
      let cls = isToday ? "today-col " : "";
      let mark = "";
      if (rec) {
        const abs = rec.absent || [];
        if (rec.duty === s.id) {
          const st = dutyStatusOf(rec);
          if (st === "noshow") {
            cls += "cell-ch-noshow";
            mark = '<span class="mark-ch-noshow">ч</span>';
          } else {
            cls += "cell-ch";
            mark = '<span class="mark-ch">ч</span>';
          }
        } else if (abs.indexOf(s.id) >= 0) {
          cls += "cell-n";
          const note = (rec.notes || []).indexOf(s.id) >= 0;
          mark = '<span class="mark-n">н' + (note ? '<span class="mark-note">*</span>' : "") + "</span>";
        } else {
          mark = '<span class="mark-b">б</span>';
        }
      }
      const click = (role === "teacher" || role === "head") ? " clickable" : "";
      body += '<td class="' + cls + click + '" data-sid="' + s.id + '" data-date="' + date + '">' + mark + "</td>";
    }
    body += "</tr>";
  });
  tbody.innerHTML = body;
  tbody.querySelectorAll("td.clickable[data-sid]").forEach(function (td) {
    td.onclick = function () {
      if (typeof openCellModal === "function") openCellModal(td.getAttribute("data-sid"), td.getAttribute("data-date"));
    };
  });
  tbody.querySelectorAll("td.pct[data-sid]").forEach(function (td) {
    td.onclick = function (e) {
      e.stopPropagation();
      if (typeof openPctModal === "function") openPctModal(td.getAttribute("data-sid"));
    };
  });
  thead.querySelectorAll("th.day-head-click[data-date]").forEach(function (th) {
    th.onclick = function () {
      if (typeof openDayNoteModal === "function") openDayNoteModal(th.getAttribute("data-date"));
    };
  });
}

function renderDuty() {
  const nameEl = document.getElementById("dutyName");
  const hintEl = document.getElementById("dutyHint");
  const today = todayStr();
  const rec = dayRecord(today);
  if (!rec) {
    if (nameEl) nameEl.textContent = "— (ще немає запису)";
    if (hintEl) hintEl.textContent = "Черговий з’явиться після збереження присутності.";
  } else if (!rec.duty) {
    if (nameEl) nameEl.textContent = "— (не призначено)";
    if (hintEl) hintEl.textContent = "";
  } else {
    const st = studentById(rec.duty);
    const star = rec.by === "teacher" ? " *" : "";
    if (nameEl) nameEl.textContent = (st ? st.name : rec.duty) + star;
    if (hintEl) hintEl.textContent = dutyStatusLabel(rec);
  }
  const tom = document.getElementById("tomorrowDuty");
  if (tom && typeof getTomorrowDuty === "function") {
    const id = getTomorrowDuty();
    const st = id ? studentById(id) : null;
    tom.textContent = st ? st.name : "—";
  }
}

function getTomorrowDuty() {
  try {
    return pickDuty([]);
  } catch (e) { return null; }
}

function renderAll() {
  applyTheme();
  const todayLabel = document.getElementById("todayLabel");
  if (todayLabel) todayLabel.textContent = "Сьогодні: " + formatDateUk(todayStr());
  renderDuty();
  renderMatrix();
  if (typeof renderMonthFair === "function") renderMonthFair();
  if (typeof renderLateBanner === "function") renderLateBanner();
  if (typeof renderDraftBanner === "function") renderDraftBanner();
  if (typeof renderAuth === "function") renderAuth();
  if ((role === "teacher" || role === "head") && typeof renderEditor === "function") renderEditor();
}

function renderAuth() {
  const isTeacher = role === "teacher";
  const isHead = role === "head";
  const auth = document.getElementById("authSection");
  const loggedOut = document.getElementById("loggedOut");
  const loggedIn = document.getElementById("loggedIn");
  const editor = document.getElementById("editorSection");
  if (loginOpen && auth) auth.classList.remove("hidden");
  else if (auth) auth.classList.add("hidden");
  if (role === "viewer") {
    if (loggedOut) loggedOut.classList.remove("hidden");
    if (loggedIn) loggedIn.classList.add("hidden");
    if (editor) editor.classList.add("hidden");
  } else {
    if (loggedOut) loggedOut.classList.add("hidden");
    if (loggedIn) loggedIn.classList.remove("hidden");
    if (editor) editor.classList.remove("hidden");
    const ul = document.getElementById("userLogin");
    const ur = document.getElementById("userRole");
    if (ul) ul.textContent = userLogin;
    if (ur) ur.textContent = isTeacher ? "вчитель" : "староста";
  }
  const tabStudents = document.getElementById("tabStudentsBtn");
  const tabHistory = document.getElementById("tabHistoryBtn");
  const tabSettings = document.getElementById("tabSettingsBtn");
  const tabMonth = document.getElementById("tabMonthBtn");
  const tabExport = document.getElementById("tabExportBtn");
  const tabToday = document.getElementById("tabTodayBtn");
  if (tabToday) tabToday.classList.toggle("hidden", !(isTeacher || isHead));
  if (tabStudents) tabStudents.classList.toggle("hidden", !isTeacher);
  if (tabHistory) tabHistory.classList.toggle("hidden", !isTeacher);
  if (tabSettings) tabSettings.classList.toggle("hidden", !isTeacher);
  if (tabMonth) tabMonth.classList.toggle("hidden", !(isTeacher || isHead));
  if (tabExport) tabExport.classList.toggle("hidden", !isTeacher);
  const tokenCard = document.getElementById("tokenSetupCard");
  if (tokenCard) tokenCard.classList.toggle("hidden", !!token || role === "viewer");
}

function trySendDraft() {}
function renderLateBanner() {}
function renderDraftBanner() {}
function renderMonthFair() {}
function renderEditor() {}
function openCellModal() {}
function openPctModal() {}
function openDayNoteModal(date) {
  if (typeof window._openDayNote === "function") window._openDayNote(date);
}
function applyDay() {}
function reverseDay() {}
function dayRecord(date) { return (data.days && data.days[date]) || null; }

loadData();
