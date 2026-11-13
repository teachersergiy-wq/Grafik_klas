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
function totalB(s) {
  return pastB(s) + scheduleStats(s.id).b;
}
function totalCh(s) {
  return pastCh(s) + scheduleStats(s.id).ch;
}
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
function isManualDuty(rec) {
  return !!(rec && (rec.by === "teacher" || rec.manual === true));
}
function dutyLabel(rec) {
  if (!rec) return "—";
  if (!rec.duty) return "не призначено";
  const st = studentById(rec.duty);
  let name = st ? st.name : ("id " + rec.duty);
  if (isManualDuty(rec)) name += " *";
  const ds = dutyStatusOf(rec);
  if (ds === "noshow") name += " (не прочергував)";
  else if (ds === "assigned") name += " (призначений)";
  return name;
}
function dutyRuleText(rec) {
  if (!rec || !rec.duty) return "";
  if (isManualDuty(rec)) return "призначив учитель *";
  return "за відсотковим розрахунком";
}
function dutyStatusOf(rec) {
  if (!rec || !rec.duty) return null;
  if (rec.dutyStatus === "assigned" || rec.dutyStatus === "served" || rec.dutyStatus === "noshow") {
    return rec.dutyStatus;
  }
  return "served";
}
function dutyCountsInCh(rec) {
  return dutyStatusOf(rec) === "served";
}
function isAfterConfirmTimeKyiv() {
  const n = kyivNow();
  return n.getHours() * 60 + n.getMinutes() >= 14 * 60;
}
function canConfirmDuty(date) {
  if (role !== "teacher") return false;
  const rec = dayRecord(date);
  if (!rec || !rec.duty) return false;
  if (date < todayStr()) return true;
  if (date === todayStr()) return isAfterConfirmTimeKyiv();
  return false;
}
function hasParentNote(rec, studentId) {
  if (!rec || !rec.notes) return false;
  return (rec.notes || []).indexOf(studentId) >= 0;
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
  const amp = String.fromCharCode(38) + "amp;";
  const lt = String.fromCharCode(38) + "lt;";
  const gt = String.fromCharCode(38) + "gt;";
  const quot = String.fromCharCode(38) + "quot;";
  return String(s).replace(/&/g, amp).replace(/</g, lt).replace(/>/g, gt).replace(/"/g, quot);
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
    head += '<th class="' + (isToday ? "today-col" : "") + '">' + names[i] + "<br>" +
      days[i].slice(8) + "." + days[i].slice(5, 7) + "</th>";
  }
  head += "</tr>";
  thead.innerHTML = head;
  if (!data.students.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">Учнів ще немає</td></tr>';
    return;
  }
  const sorted = data.students.slice().sort(function (a, b) {
    return a.name.localeCompare(b.name, "uk");
  });
  const recs = days.map(function (iso) { return dayRecord(iso); });
  const editable = (role === "teacher" || role === "head");
  tbody.innerHTML = sorted.map(function (s) {
    const pct = (calcPct(s) * 100).toFixed(2);
    let row = '<tr><td class="name">' + escapeHtml(s.name) + '</td><td class="pct" data-sid="' + s.id + '" title="Натисніть — розрахунок">' + pct + "</td>";
    for (let i = 0; i < 5; i++) {
      const isToday = highlightToday && days[i] === today;
      const rec = recs[i];
      const iso = days[i];
      let mark = "";
      let cellCls = isToday ? "today-col" : "";
      if (rec) {
        const abs = rec.absent || [];
        if (rec.duty && rec.duty === s.id) {
          const st = dutyStatusOf(rec);
          if (st === "noshow") {
            mark = '<span class="mark-ch-noshow">ч</span>';
            cellCls = (cellCls ? cellCls + " " : "") + "cell-ch-noshow";
          } else {
            mark = '<span class="mark-ch">ч</span>';
            cellCls = (cellCls ? cellCls + " " : "") + "cell-ch";
          }
        } else if (abs.indexOf(s.id) >= 0) {
          const note = hasParentNote(rec, s.id);
          mark = '<span class="mark-n">н' + (note ? '<span class="mark-note">*</span>' : "") + "</span>";
          cellCls = (cellCls ? cellCls + " " : "") + "cell-n";
        } else {
          mark = '<span class="mark-b">б</span>';
        }
      }
      if (editable) cellCls = (cellCls ? cellCls + " " : "") + "clickable";
      row += '<td class="' + cellCls + '" data-sid="' + s.id + '" data-date="' + iso + '">' + mark + "</td>";
    }
    row += "</tr>";
    return row;
  }).join("");
  if (editable) {
    tbody.querySelectorAll("td.clickable").forEach(function (td) {
      td.onclick = function () {
        openCellModal(td.getAttribute("data-sid"), td.getAttribute("data-date"));
      };
    });
  }
  tbody.querySelectorAll("td.pct[data-sid]").forEach(function (td) {
    td.onclick = function (e) {
      e.stopPropagation();
      openPctModal(td.getAttribute("data-sid"));
    };
  });
}

function renderWeek() { renderMatrix(); }
function renderStats() { }
function renderSchedule() { }

async function quickChangeDuty(date) {
  if (role !== "teacher") return;
  const rec = dayRecord(date);
  if (!rec) return;
  const absent = rec.absent || [];
  const present = data.students.filter(function (s) { return absent.indexOf(s.id) < 0; })
    .slice().sort(function (a, b) { return a.name.localeCompare(b.name, "uk"); });
  if (!present.length) {
    alert("Немає присутніх для цього дня.");
    return;
  }
  const names = present.map(function (s, i) { return (i + 1) + ". " + s.name; }).join("\n");
  const ans = prompt("Новий черговий на " + formatDateUk(date) + ".\nВведіть номер:\n" + names, "1");
  if (ans === null) return;
  const idx = parseInt(ans, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= present.length) {
    alert("Невірний номер.");
    return;
  }
  const newId = present[idx].id;
  if (newId === rec.duty) return;
  reverseDay(rec);
  const next = { absent: absent.slice(), duty: newId, by: "teacher", dutyStatus: "assigned", notes: (rec.notes || []).slice() };
  data.days[date] = next;
  applyDay(next);
  try {
    await saveData("Змінено чергового за " + date);
    renderAll();
  } catch (e) {
    reverseDay(next);
    data.days[date] = rec;
    applyDay(rec);
    alert(e.message);
  }
}

function renderDuty() {
  const t = todayStr();
  document.getElementById("todayLabel").textContent = "Сьогодні: " + formatDateUk(t);
  const rec = dayRecord(t);
  const dutyEl = document.getElementById("dutyName");
  const hint = document.getElementById("dutyHint");
  if (!rec) {
    dutyEl.textContent = "ще не призначено";
    hint.textContent = "Черговий з’явиться після збереження присутності за сьогодні (за бажанням).";
  } else if (!rec.duty) {
    dutyEl.textContent = "не призначено";
    const abs = (rec.absent || []).map(function (id) {
      const s = studentById(id);
      return s ? s.name : id;
    });
    hint.textContent = (abs.length ? "Відсутні: " + abs.join(", ") : "Усі присутні") + " · чергового немає";
  } else {
    dutyEl.textContent = dutyLabel(rec);
    const abs = (rec.absent || []).map(function (id) {
      const s = studentById(id);
      return s ? s.name : id;
    });
    let t2 = abs.length ? "Відсутні: " + abs.join(", ") : "Усі присутні";
    t2 += " · " + dutyRuleText(rec);
    const stl = dutyStatusLabel(rec);
    if (stl) t2 += " · " + stl;
    hint.textContent = t2;
  }
}

function renderLateBanner() {
  const banner = document.getElementById("lateBanner");
  const title = document.getElementById("lateTitle");
  const text = document.getElementById("lateText");
  if (!banner) return;
  if (!isWeekdayKyiv()) {
    banner.classList.add("hidden");
    return;
  }
  const n = kyivNow();
  const mins = n.getHours() * 60 + n.getMinutes();
  const start = 8 * 60 + 30;
  const end = 10 * 60 + 40;
  const t = todayStr();
  const hasDay = !!data.days[t];
  if (hasDay || mins < start) {
    banner.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  if (mins <= end) {
    const late = mins - start;
    title.textContent = "Відсутніх ще не подано";
    text.textContent = "Уже минуло " + late + " хв. від 8:30. Запису за сьогодні ще немає.";
  } else {
    title.textContent = "Запис за сьогодні відсутній";
    text.textContent = "Після 10:40 запис може внести або виправити лише вчитель.";
  }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveDraft(draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  renderDraftBanner();
}
function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  renderDraftBanner();
}
function renderDraftBanner() {
  const banner = document.getElementById("draftBanner");
  const text = document.getElementById("draftText");
  if (!banner) return;
  const d = loadDraft();
  if (!d || (role !== "teacher" && role !== "head")) {
    banner.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  text.textContent = "Дата: " + formatDateUk(d.date) + ". " +
    (d.duty ? ("Черговий буде: " + (studentById(d.duty) ? studentById(d.duty).name : d.duty)) : "Без чергового") +
    ". Натисніть «Надіслати», коли є інтернет.";
}

async function trySendDraft() {
  const d = loadDraft();
  if (!d || !token) {
    renderDraftBanner();
    return;
  }
  if (role !== "teacher" && role !== "head") {
    renderDraftBanner();
    return;
  }
  try {
    await applyAndSaveDay(d.date, d.absent, d.duty, d.by, "Чернетка: присутність за " + d.date);
    clearDraft();
  } catch (e) {
    renderDraftBanner();
  }
}

function renderAuth() {
  const auth = document.getElementById("authSection");
  const out = document.getElementById("loggedOut");
  const inn = document.getElementById("loggedIn");
  const lockBtn = document.getElementById("btnToggleLogin");
  if (userLogin && role !== "viewer") {
    out.classList.add("hidden");
    inn.classList.remove("hidden");
    document.getElementById("userLogin").textContent = userLogin;
    document.getElementById("userRole").textContent = role === "teacher" ? "класний керівник" : "староста";
    document.getElementById("editorSection").classList.remove("hidden");
    lockBtn.textContent = "🔓";
    lockBtn.title = "Обліковий запис";
    if (loginOpen) auth.classList.remove("hidden");
    else auth.classList.add("hidden");
  } else {
    inn.classList.add("hidden");
    out.classList.remove("hidden");
    document.getElementById("editorSection").classList.add("hidden");
    lockBtn.textContent = "🔒";
    lockBtn.title = "Вхід";
    if (loginOpen) auth.classList.remove("hidden");
    else auth.classList.add("hidden");
  }
  const isTeacher = role === "teacher";
  const isHead = role === "head";
  document.getElementById("tabStudentsBtn").classList.toggle("hidden", !isTeacher);
  document.getElementById("tabHistoryBtn").classList.toggle("hidden", !isTeacher);
  document.getElementById("tabSettingsBtn").classList.toggle("hidden", !isTeacher);
  document.getElementById("studentsHint").textContent = "Минулі роки можна редагувати. За 8 клас — з графіка. Разом = сума.";
  const tokenCard = document.getElementById("tokenSetupCard");
  if (tokenCard) {
    if ((isTeacher || isHead) && !token) tokenCard.classList.remove("hidden");
    else tokenCard.classList.add("hidden");
  }
  const tss = document.getElementById("tokenSharedStatus");
  if (tss) {
    tss.textContent = token
      ? "Токен збереження на цьому телефоні є — можна зберігати дані."
      : "Без токена збереження неможливе. Вставте токен вище (його дає вчитель).";
  }
  const ts = document.getElementById("tokenStatus");
  if (ts) {
    ts.textContent = token
      ? "Токен збереження на цьому телефоні є."
      : "Токена ще немає — збереження не працюватиме.";
  }
  renderDraftBanner();
}

function canEditDay(date) {
  if (role === "teacher") return true;
  if (role !== "head") return false;
  if (date !== todayStr()) return false;
  if (!isHeadTimeWindow()) return false;
  const rec = dayRecord(date);
  if (rec && (rec.duty || (rec.absent && rec.absent.length) || data.days[date])) return false;
  return true;
}

function renderEditor() {
  if (role === "head") editDate = todayStr();
  else editDate = editDate || todayStr();
  document.getElementById("editDateLabel").textContent = formatDateUk(editDate);
  const hint = document.getElementById("timeWindowHint");
  const can = canEditDay(editDate);
  if (role === "head") {
    if (!isWeekdayKyiv()) hint.textContent = "Староста вносить дані лише в будні.";
    else if (!isHeadTimeWindow()) hint.textContent = "Вікно для старости: 8:00–10:40 (Київ). Зараз закрито.";
    else if (dayRecord(editDate)) hint.textContent = "Запис за сьогодні вже є. Змінювати може лише вчитель.";
    else hint.textContent = "Можна зберегти присутність один раз за сьогодні.";
  } else {
    hint.textContent = "Вчитель може змінювати будь-яку дату. Черговий не обов’язковий.";
  }
  const list = document.getElementById("absentList");
  const rec = dayRecord(editDate) || { absent: [], duty: null };
  const absentSet = {};
  (rec.absent || []).forEach(function (id) { absentSet[id] = true; });
  if (!data.students.length) {
    list.innerHTML = "<p class='muted'>Спочатку додайте учнів (вкладка «Учні»).</p>";
  } else {
    const sorted = data.students.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name, "uk");
    });
    list.innerHTML = sorted.map(function (s) {
      const isAbs = !!absentSet[s.id];
      const checked = isAbs ? "checked" : "";
      const dis = can ? "" : "disabled";
      const cls = isAbs ? "absent-row marked" : "absent-row";
      return '<label class="' + cls + '">' +
        '<input type="checkbox" data-id="' + s.id + '" ' + checked + " " + dis + ">" +
        '<span class="student-name"><strong>' + escapeHtml(s.name) + "</strong>" +
        '<div class="mark-label">' + (isAbs ? "відсутній" : "присутній") + "</div></span></label>";
    }).join("");
    list.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      cb.onchange = function () {
        const row = cb.closest(".absent-row");
        const lab = row.querySelector(".mark-label");
        if (cb.checked) { row.classList.add("marked"); lab.textContent = "відсутній"; }
        else { row.classList.remove("marked"); lab.textContent = "присутній"; }
        if (role === "teacher") updateDutyPickUI(can);
      };
    });
  }
  updateDutyPickUI(can);
  document.getElementById("btnSaveDay").disabled = !can;
  document.getElementById("btnClearDay").classList.toggle("hidden", !(role === "teacher" && dayRecord(editDate)));
  document.getElementById("saveError").classList.add("hidden");
  document.getElementById("saveOk").classList.add("hidden");
  const conf = document.getElementById("confirmDutyBlock");
  if (conf) {
    const recNow = dayRecord(editDate);
    const showConf = role === "teacher" && recNow && recNow.duty;
    conf.classList.toggle("hidden", !showConf);
    if (showConf) {
      const st = studentById(recNow.duty);
      const nameEl = document.getElementById("confirmDutyName");
      const hintEl = document.getElementById("confirmDutyHint");
      if (nameEl) nameEl.textContent = (st ? st.name : ("id " + recNow.duty)) +
        " — зараз: " + (dutyStatusLabel(recNow) || "—");
      let ht = "Можна змінити статус: прочергував або не прочергував.";
      if (editDate === todayStr() && !isAfterConfirmTimeKyiv()) {
        ht = "Зміна статусу доступна після 14:00 за київським часом.";
      } else if (editDate > todayStr()) {
        ht = "Для майбутньої дати зміна статусу недоступна.";
      }
      if (hintEl) hintEl.textContent = ht;
      const okTime = canConfirmDuty(editDate);
      const b1 = document.getElementById("btnConfirmServed");
      const b2 = document.getElementById("btnConfirmNoshow");
      if (b1) {
        b1.disabled = !okTime;
        b1.textContent = dutyStatusOf(recNow) === "served" ? "Залишити: прочергував" : "Прочергував";
      }
      if (b2) {
        b2.disabled = !okTime;
        b2.textContent = dutyStatusOf(recNow) === "noshow" ? "Залишити: не прочергував" : "Не прочергував";
      }
    }
  }
  if (role === "teacher") renderStudentsManage();
  document.getElementById("histDate").value = editDate;
}

function getSelectedAbsentIds() {
  const absent = [];
  document.querySelectorAll("#absentList input[type=checkbox]").forEach(function (cb) {
    if (cb.checked) absent.push(cb.getAttribute("data-id"));
  });
  return absent;
}

function updateDutyPickUI(can) {
  const block = document.getElementById("dutyPickBlock");
  const sel = document.getElementById("dutySelect");
  const autoHint = document.getElementById("dutyAutoHint");
  if (!block || !sel) return;
  if (role !== "teacher") {
    block.classList.add("hidden");
    return;
  }
  block.classList.remove("hidden");
  const absent = getSelectedAbsentIds();
  const present = data.students.filter(function (s) { return absent.indexOf(s.id) < 0; })
    .slice().sort(function (a, b) { return a.name.localeCompare(b.name, "uk"); });
  const autoId = pickDuty(absent);
  const autoSt = autoId ? studentById(autoId) : null;
  autoHint.textContent = autoSt
    ? ("За розрахунком (якщо призначити): " + autoSt.name)
    : "Немає присутніх — або оберіть «Без чергового».";
  const prev = dayRecord(editDate);
  const current = (sel.value && present.some(function (s) { return s.id === sel.value; }))
    ? sel.value
    : (prev && prev.duty && present.some(function (s) { return s.id === prev.duty; })
      ? prev.duty
      : (autoId || ""));
  let opts = '<option value="__none__">— Без чергового —</option>';
  opts += present.map(function (s) {
    const mark = (s.id === autoId) ? " (за розрахунком)" : "";
    return '<option value="' + s.id + '">' + escapeHtml(s.name) + mark + "</option>";
  }).join("");
  sel.innerHTML = opts;
  if (prev && !prev.duty) sel.value = "__none__";
  else if (current) sel.value = current;
  else if (autoId) sel.value = autoId;
  else sel.value = "__none__";
  sel.disabled = !can;
}

function renderStudentsManage() {
  const sm = document.getElementById("studentsManage");
  if (!sm) return;
  if (!data.students.length) { sm.innerHTML = "<p class='muted'>Порожньо</p>"; return; }
  const sorted = data.students.slice().sort(function (a, b) {
    return a.name.localeCompare(b.name, "uk");
  });
  sm.innerHTML = sorted.map(function (s) {
    const sch = scheduleStats(s.id);
    const pb = pastB(s);
    const pc = pastCh(s);
    const tb = pb + sch.b;
    const tc = pc + sch.ch;
    const pct = (calcPct(s) * 100).toFixed(1);
    let html = '<div class="student-row" style="flex-wrap:wrap">' +
      '<span class="student-name"><strong>' + escapeHtml(s.name) + "</strong>" +
      '<span class="muted" style="display:block;font-size:0.85rem">Разом: ' + tc + " черг. / " + tb + " дн. (" + pct + "%)</span></span>";
    html += '<button type="button" class="secondary small-btn" data-edit="' + s.id + '">Змінити</button>';
    html += '<button type="button" class="secondary small-btn" data-del="' + s.id + '">Видалити</button>';
    html += "</div>";
    if (editingId === s.id) {
      html += '<div class="edit-panel" data-edit-panel="' + s.id + '">' +
        '<label>Ім’я</label><input type="text" data-f="name" value="' + escapeHtml(s.name) + '">' +
        '<p class="muted" style="margin-top:12px;margin-bottom:4px"><strong>Минулі роки</strong> (можна змінити)</p>' +
        '<label>Днів у школі за минулі роки</label><input type="number" data-f="b0" min="0" value="' + pb + '">' +
        '<label>Чергувань за минулі роки</label><input type="number" data-f="ch0" min="0" value="' + pc + '">' +
        '<p class="muted" style="margin-top:12px;margin-bottom:4px"><strong>За графіком 8 класу</strong> (з таблиці, лише перегляд)</p>' +
        '<p>Днів присутності: <strong>' + sch.b + '</strong></p>' +
        '<p>Чергувань (підтверджених): <strong>' + sch.ch + '</strong></p>' +
        '<p class="muted" style="margin-top:12px;margin-bottom:4px"><strong>Разом</strong></p>' +
        '<p>Днів: <strong>' + tb + '</strong> · Чергувань: <strong>' + tc + '</strong> · Відсоток: <strong>' + pct + '</strong></p>' +
        '<button type="button" class="small-btn" data-save-edit="' + s.id + '">Зберегти зміни</button>' +
        '<button type="button" class="secondary small-btn" data-cancel-edit="' + s.id + '">Скасувати</button>' +
        '<p class="error hidden" data-edit-err="' + s.id + '"></p></div>';
    }
    return html;
  }).join("");
  sm.querySelectorAll("[data-edit]").forEach(function (btn) {
    btn.onclick = function () { editingId = btn.getAttribute("data-edit"); renderStudentsManage(); };
  });
  sm.querySelectorAll("[data-cancel-edit]").forEach(function (btn) {
    btn.onclick = function () { editingId = null; renderStudentsManage(); };
  });
  sm.querySelectorAll("[data-del]").forEach(function (btn) {
    btn.onclick = function () { deleteStudent(btn.getAttribute("data-del")); };
  });
  sm.querySelectorAll("[data-save-edit]").forEach(function (btn) {
    btn.onclick = function () { saveStudentEdit(btn.getAttribute("data-save-edit")); };
  });
}

async function saveStudentEdit(id) {
  if (role !== "teacher") return;
  const panel = document.querySelector('[data-edit-panel="' + id + '"]');
  if (!panel) return;
  const name = panel.querySelector('[data-f="name"]').value.trim();
  const b0 = parseInt(panel.querySelector('[data-f="b0"]').value, 10);
  const ch0 = parseInt(panel.querySelector('[data-f="ch0"]').value, 10);
  const err = panel.querySelector('[data-edit-err="' + id + '"]');
  err.classList.add("hidden");
  if (!name) { err.textContent = "Вкажіть ім’я"; err.classList.remove("hidden"); return; }
  if (isNaN(b0) || b0 < 0 || isNaN(ch0) || ch0 < 0) {
    err.textContent = "Числа мають бути 0 або більше"; err.classList.remove("hidden"); return;
  }
  const st = studentById(id);
  if (!st) return;
  const old = { name: st.name, b0: st.b0, ch0: st.ch0, b: st.b, ch: st.ch };
  st.name = name;
  st.b0 = b0;
  st.ch0 = ch0;
  const sch = scheduleStats(id);
  st.b = b0 + sch.b;
  st.ch = ch0 + sch.ch;
  try {
    await saveData("Оновлено учня " + name);
    editingId = null;
    renderAll();
  } catch (e) {
    st.name = old.name; st.b0 = old.b0; st.ch0 = old.ch0; st.b = old.b; st.ch = old.ch;
    err.textContent = e.message; err.classList.remove("hidden");
  }
}

function closePctModal() {
  const m = document.getElementById("pctModal");
  if (m) m.classList.add("hidden");
}
function openPctModal(sid) {
  const st = studentById(sid);
  if (!st) return;
  const sch = scheduleStats(sid);
  const pb = pastB(st);
  const pc = pastCh(st);
  const tb = pb + sch.b;
  const tc = pc + sch.ch;
  const pct = (calcPct(st) * 100).toFixed(2);
  const title = document.getElementById("pctModalTitle");
  const body = document.getElementById("pctModalBody");
  if (title) title.textContent = st.name;
  if (body) {
    let html = "";
    html += '<p class="muted" style="margin-bottom:10px">Відсоток = чергування ÷ дні в школі</p>';
    html += '<p style="font-size:1.25rem;font-weight:700;margin-bottom:12px">' + pct + ' = ' + tc + ' ÷ ' + tb + '</p>';
    html += '<p><strong>Минулі роки</strong></p>';
    html += '<p class="muted">Днів у школі: <strong style="color:var(--text)">' + pb + '</strong></p>';
    html += '<p class="muted" style="margin-bottom:10px">Чергувань: <strong style="color:var(--text)">' + pc + '</strong></p>';
    html += '<p><strong>За графіком 8 класу</strong></p>';
    html += '<p class="muted">Днів присутності: <strong style="color:var(--text)">' + sch.b + '</strong></p>';
    html += '<p class="muted" style="margin-bottom:10px">Чергувань (підтверджених «прочергував»): <strong style="color:var(--text)">' + sch.ch + '</strong></p>';
    html += '<p><strong>Разом</strong></p>';
    html += '<p class="muted">Днів: <strong style="color:var(--text)">' + tb + '</strong> = ' + pb + ' + ' + sch.b + '</p>';
    html += '<p class="muted">Чергувань: <strong style="color:var(--text)">' + tc + '</strong> = ' + pc + ' + ' + sch.ch + '</p>';
    if (!tb) {
      html += '<p class="muted" style="margin-top:10px">Поки немає днів у школі — відсоток умовно 0 (або 100, якщо вже є чергування без днів).</p>';
    }
    body.innerHTML = html;
  }
  const m = document.getElementById("pctModal");
  if (m) m.classList.remove("hidden");
}

let cellEdit = null;
function closeCellModal() {
  cellEdit = null;
  const m = document.getElementById("cellModal");
  if (m) m.classList.add("hidden");
}

function openCellModal(sid, date) {
  if (role === "head" && !canEditDay(date)) {
    alert("Староста може вносити лише сьогодні в дозволений час, і лише якщо запису ще немає.");
    return;
  }
  if (role !== "teacher" && role !== "head") return;
  cellEdit = { sid: sid, date: date };
  const st = studentById(sid);
  const rec = dayRecord(date);
  const isAbs = !!(rec && (rec.absent || []).indexOf(sid) >= 0);
  const hasNote = hasParentNote(rec, sid);
  const isDuty = !!(rec && rec.duty === sid);
  const dStatus = rec ? dutyStatusOf(rec) : null;
  const title = document.getElementById("cellModalTitle");
  const sub = document.getElementById("cellModalSub");
  const body = document.getElementById("cellModalBody");
  const err = document.getElementById("cellModalErr");
  if (err) err.classList.add("hidden");
  if (title) title.textContent = st ? st.name : ("id " + sid);
  if (sub) sub.textContent = formatDateUk(date);
  let html = "";
  html += '<label class="row-opt"><input type="radio" name="cellPres" value="present" ' + (!isAbs ? "checked" : "") + '> <span>Присутній</span></label>';
  html += '<label class="row-opt"><input type="radio" name="cellPres" value="absent" ' + (isAbs ? "checked" : "") + '> <span>Не був у школі</span></label>';
  html += '<label class="row-opt" id="cellNoteRow"><input type="checkbox" id="cellNote" ' + (hasNote ? "checked" : "") + '> <span>Є довідка від батьків про причину відсутності</span></label>';
  if (role === "teacher") {
    html += '<label class="row-opt"><input type="checkbox" id="cellMakeDuty" ' + (isDuty ? "checked" : "") + '> <span>Призначити черговим</span></label>';
  }
  if (isDuty) {
    html += '<p class="muted" style="margin-top:10px">Статус чергування: <strong>' + escapeHtml(dutyStatusLabel(rec) || "—") + '</strong></p>';
  }
  if (role === "teacher" && isDuty) {
    const canCh = canConfirmDuty(date);
    html += '<p class="muted" style="margin-top:8px"><strong>Змінити статус чергування</strong></p>';
    html += '<label class="row-opt"><input type="radio" name="cellConfirm" value="" checked> <span>Не змінювати</span></label>';
    html += '<label class="row-opt"><input type="radio" name="cellConfirm" value="served" ' + (canCh ? "" : "disabled") + '> <span>Прочергував' + (dStatus === "served" ? " (зараз)" : "") + '</span></label>';
    html += '<label class="row-opt"><input type="radio" name="cellConfirm" value="noshow" ' + (canCh ? "" : "disabled") + '> <span>Не прочергував' + (dStatus === "noshow" ? " (зараз)" : "") + '</span></label>';
    if (!canCh && date === todayStr()) {
      html += '<p class="muted">Зміна статусу доступна після 14:00 (Київ).</p>';
    }
  }
  if (role === "head") {
    html += '<p class="muted" style="margin-top:8px">Староста може лише відмітити присутність / відсутність (і довідку) при першому внесенні за сьогодні.</p>';
  }
  body.innerHTML = html;
  function syncNote() {
    const abs = document.querySelector('input[name="cellPres"][value="absent"]');
    const noteRow = document.getElementById("cellNoteRow");
    const note = document.getElementById("cellNote");
    const makeDuty = document.getElementById("cellMakeDuty");
    const isA = abs && abs.checked;
    if (noteRow) noteRow.style.opacity = isA ? "1" : "0.45";
    if (note) { note.disabled = !isA; if (!isA) note.checked = false; }
    if (makeDuty) { makeDuty.disabled = isA; if (isA) makeDuty.checked = false; }
  }
  body.querySelectorAll('input[name="cellPres"]').forEach(function (r) {
    r.onchange = syncNote;
  });
  syncNote();
  document.getElementById("cellModal").classList.remove("hidden");
}

async function saveCellModal() {
  if (!cellEdit) return;
  const err = document.getElementById("cellModalErr");
  if (err) err.classList.add("hidden");
  const sid = cellEdit.sid;
  const date = cellEdit.date;
  if (role === "head" && !canEditDay(date)) {
    if (err) { err.textContent = "Немає права зберегти."; err.classList.remove("hidden"); }
    return;
  }
  if (role !== "teacher" && role !== "head") return;
  if (!token) {
    if (err) { err.textContent = "Спочатку вставте токен для збереження."; err.classList.remove("hidden"); }
    return;
  }
  const pres = document.querySelector('input[name="cellPres"]:checked');
  const isAbsent = !!(pres && pres.value === "absent");
  const noteEl = document.getElementById("cellNote");
  const hasNote = !!(noteEl && noteEl.checked && isAbsent);
  const makeDutyEl = document.getElementById("cellMakeDuty");
  const makeDuty = !!(makeDutyEl && makeDutyEl.checked && !isAbsent && role === "teacher");
  let confirmVal = "";
  const conf = document.querySelector('input[name="cellConfirm"]:checked');
  if (conf) confirmVal = conf.value || "";

  const prev = dayRecord(date);
  let absent = prev ? (prev.absent || []).slice() : [];
  let notes = prev ? (prev.notes || []).slice() : [];
  let duty = prev ? prev.duty : null;
  let by = prev ? (prev.by || "auto") : "auto";
  let dutyStatus = prev && prev.duty ? (prev.dutyStatus || dutyStatusOf(prev)) : null;

  if (isAbsent) {
    if (absent.indexOf(sid) < 0) absent.push(sid);
  } else {
    absent = absent.filter(function (id) { return id !== sid; });
  }
  if (hasNote) {
    if (notes.indexOf(sid) < 0) notes.push(sid);
  } else {
    notes = notes.filter(function (id) { return id !== sid; });
  }
  notes = notes.filter(function (id) { return absent.indexOf(id) >= 0; });

  if (makeDuty) {
    duty = sid;
    by = "teacher";
    dutyStatus = "assigned";
  } else if (duty === sid && isAbsent) {
    duty = null;
    dutyStatus = null;
    by = "auto";
  }
  if (duty && absent.indexOf(duty) >= 0) {
    duty = null;
    dutyStatus = null;
    by = "auto";
  }

  if (confirmVal === "served" || confirmVal === "noshow") {
    if (!(prev && prev.duty === sid)) {
      if (err) { err.textContent = "Статус можна змінити лише для призначеного чергового цього дня."; err.classList.remove("hidden"); }
      return;
    }
    if (date === todayStr() && !isAfterConfirmTimeKyiv()) {
      if (err) { err.textContent = "Зміна статусу після 14:00 (Київ)."; err.classList.remove("hidden"); }
      return;
    }
    if (date > todayStr()) {
      if (err) { err.textContent = "Не можна змінити статус для майбутньої дати."; err.classList.remove("hidden"); }
      return;
    }
    duty = sid;
    dutyStatus = confirmVal;
  }

  try {
    if (prev) reverseDay(prev);
    const next = { absent: absent, notes: notes };
    if (duty) {
      next.duty = duty;
      next.by = by || "auto";
      next.dutyStatus = dutyStatus || "assigned";
    }
    data.days[date] = next;
    applyDay(next);
    await saveData("Оновлено клітинку " + date);
    closeCellModal();
    renderAll();
  } catch (e) {
    if (prev) {
      data.days[date] = prev;
      applyDay(prev);
    } else {
      delete data.days[date];
    }
    if (err) { err.textContent = e.message; err.classList.remove("hidden"); }
  }
}

function renderAll() {
  applyTheme();
  renderDuty();
  renderMatrix();
  renderLateBanner();
  renderAuth();
  if (role === "teacher" || role === "head") renderEditor();
}

function applyDay(rec) {
}
function reverseDay(rec) {
}

async function applyAndSaveDay(date, absent, duty, by, msg) {
  const prev = dayRecord(date);
  if (prev) reverseDay(prev);
  const prevNotes = prev && prev.notes ? prev.notes.filter(function (id) { return absent.indexOf(id) >= 0; }) : [];
  const next = { absent: absent, notes: prevNotes };
  if (duty) {
    next.duty = duty;
    next.by = by || "auto";
    next.dutyStatus = "assigned";
  }
  data.days[date] = next;
  applyDay(next);
  try {
    await saveData(msg || ("Присутність за " + date + (duty ? " і черговий" : "")));
  } catch (e) {
    reverseDay(data.days[date]);
    if (prev) { data.days[date] = prev; applyDay(prev); }
    else delete data.days[date];
    throw e;
  }
}

async function confirmDutyStatus(date, status) {
  if (role !== "teacher") throw new Error("Лише вчитель підтверджує чергування");
  const rec = dayRecord(date);
  if (!rec || !rec.duty) throw new Error("Немає призначеного чергового");
  if (status !== "served" && status !== "noshow" && status !== "assigned") {
    throw new Error("Невірний статус");
  }
  if (date === todayStr() && !isAfterConfirmTimeKyiv()) {
    throw new Error("Зміна статусу можлива після 14:00 (Київ)");
  }
  if (date > todayStr()) throw new Error("Не можна підтвердити майбутню дату");
  if (dutyStatusOf(rec) === status) return;
  reverseDay(rec);
  const next = {
    absent: (rec.absent || []).slice(),
    duty: rec.duty,
    by: rec.by || "auto",
    dutyStatus: status,
    notes: (rec.notes || []).slice()
  };
  data.days[date] = next;
  applyDay(next);
  try {
    var msg = "Статус чергування за " + date + ": ";
    if (status === "served") msg += "прочергував";
    else if (status === "noshow") msg += "не прочергував";
    else msg += "призначений";
    await saveData(msg);
  } catch (e) {
    reverseDay(next);
    data.days[date] = rec;
    applyDay(rec);
    throw e;
  }
}
