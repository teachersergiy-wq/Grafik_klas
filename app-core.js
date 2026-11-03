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
function calcPct(s) {
  if (!s.b || s.b <= 0) return s.ch > 0 ? 1 : 0;
  return s.ch / s.b;
}
function pickDuty(absentIds) {
  const present = data.students.filter(function (s) { return absentIds.indexOf(s.id) < 0; });
  if (!present.length) return null;
  present.sort(function (a, b) {
    const pa = calcPct(a), pb = calcPct(b);
    if (Math.abs(pa - pb) > 1e-9) return pa - pb;
    if (a.ch !== b.ch) return a.ch - b.ch;
    return a.name.localeCompare(b.name, "uk");
  });
  return present[0].id;
}
function dayRecord(date) { return data.days[date] || null; }
function isManualDuty(rec) {
  return !!(rec && (rec.by === "teacher" || rec.manual === true));
}
function dutyLabel(rec) {
  if (!rec || !rec.duty) return "—";
  const st = studentById(rec.duty);
  const name = st ? st.name : ("id " + rec.duty);
  return isManualDuty(rec) ? (name + " *") : name;
}
function dutyRuleText(rec) {
  if (!rec || !rec.duty) return "";
  if (isManualDuty(rec)) return "призначив учитель *";
  return "за відсотковим розрахунком";
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

function renderWeek() {
  const grid = document.getElementById("weekGrid");
  if (!grid) return;
  const names = ["Пн", "Вт", "Ср", "Чт", "Пт"];
  const mon = mondayOfWeekKyiv();
  const today = todayStr();
  let html = "";
  for (let i = 0; i < 5; i++) {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const iso = dateToIsoLocal(d);
    const rec = dayRecord(iso);
    const who = rec && rec.duty ? dutyLabel(rec) : "ще немає";
    const cls = iso === today ? "week-day today" : "week-day";
    html += '<div class="' + cls + '"><div class="wd">' + names[i] + " · " + formatDateUk(iso) +
      '</div><div class="wn">' + escapeHtml(who) + "</div></div>";
  }
  grid.innerHTML = html;
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
  const rec = dayRecord(t);
  const hasDuty = !!(rec && rec.duty);
  if (hasDuty || mins < start) {
    banner.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  if (mins <= end) {
    const late = mins - start;
    title.textContent = "Відсутніх ще не подано";
    text.textContent = "Уже минуло " + late + " хв. від 8:30. Чергового за сьогодні ще немає.";
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
  text.textContent = "Дата: " + formatDateUk(d.date) + ". Черговий буде: " +
    (studentById(d.duty) ? studentById(d.duty).name : d.duty) +
    (d.by === "teacher" ? " *" : "") + ". Натисніть «Надіслати», коли є інтернет.";
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

function renderDuty() {
  const t = todayStr();
  document.getElementById("todayLabel").textContent = "Сьогодні: " + formatDateUk(t);
  const rec = dayRecord(t);
  const dutyEl = document.getElementById("dutyName");
  const hint = document.getElementById("dutyHint");
  if (!rec || !rec.duty) {
    dutyEl.textContent = "ще не призначено";
    hint.textContent = "Черговий з’явиться після збереження присутності за сьогодні.";
  } else {
    dutyEl.textContent = dutyLabel(rec);
    const abs = (rec.absent || []).map(function (id) {
      const s = studentById(id);
      return s ? s.name : id;
    });
    let t2 = abs.length ? "Відсутні: " + abs.join(", ") : "Усі присутні";
    t2 += " · " + dutyRuleText(rec);
    hint.textContent = t2;
  }
}

function renderStats() {
  const list = document.getElementById("statsList");
  if (!data.students.length) {
    list.innerHTML = "<p class='muted'>Учнів ще немає.</p>";
    return;
  }
  const sorted = data.students.slice().sort(function (a, b) {
    return calcPct(a) - calcPct(b) || a.name.localeCompare(b.name, "uk");
  });
  const showDetails = role === "teacher";
  list.innerHTML = sorted.map(function (s) {
    const pct = (calcPct(s) * 100).toFixed(1);
    const detail = showDetails
      ? '<span class="muted" style="font-size:0.8rem;display:block">' + s.ch + " черг. / " + s.b + " дн.</span>"
      : "";
    return '<div class="student-row"><span class="student-name">' + escapeHtml(s.name) + detail +
      '</span><span class="pct">' + pct + "%</span></div>";
  }).join("");
}

function renderSchedule() {
  const list = document.getElementById("scheduleList");
  const dates = Object.keys(data.days || {}).sort().reverse();
  if (!dates.length) {
    list.innerHTML = "<p class='muted'>Записів ще немає.</p>";
    return;
  }
  list.innerHTML = dates.slice(0, 30).map(function (d) {
    const rec = data.days[d];
    const name = dutyLabel(rec);
    let actions = "";
    if (role === "teacher") {
      actions = '<button type="button" class="secondary small-btn" data-swap="' + d + '">Змінити</button>';
    }
    return '<div class="schedule-row"><span>' + formatDateUk(d) + '</span><strong style="flex:1;text-align:right;margin-right:8px">' +
      escapeHtml(name) + "</strong>" + actions + "</div>";
  }).join("");
  list.querySelectorAll("[data-swap]").forEach(function (btn) {
    btn.onclick = function () { quickChangeDuty(btn.getAttribute("data-swap")); };
  });
}

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
  const next = { absent: absent.slice(), duty: newId, by: "teacher" };
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
  document.getElementById("studentsHint").textContent = "Можна змінити ім’я, дні в школі та кількість чергувань.";

  const tokenCard = document.getElementById("tokenSetupCard");
  if (tokenCard) {
    if ((isTeacher || isHead) && !token) {
      tokenCard.classList.remove("hidden");
    } else {
      tokenCard.classList.add("hidden");
    }
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
  if (rec && (rec.duty || (rec.absent && rec.absent.length))) return false;
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
    hint.textContent = "Вчитель може змінювати будь-яку дату.";
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
    ? ("За розрахунком відсотків: " + autoSt.name)
    : "Немає присутніх для чергування.";
  const prev = dayRecord(editDate);
  const current = (sel.value && present.some(function (s) { return s.id === sel.value; }))
    ? sel.value
    : (prev && prev.duty && present.some(function (s) { return s.id === prev.duty; })
      ? prev.duty
      : (autoId || ""));
  sel.innerHTML = present.map(function (s) {
    const mark = (s.id === autoId) ? " (за розрахунком)" : "";
    return '<option value="' + s.id + '">' + escapeHtml(s.name) + mark + "</option>";
  }).join("");
  if (current) sel.value = current;
  sel.disabled = !can || !present.length;
}

function renderStudentsManage() {
  const sm = document.getElementById("studentsManage");
  if (!sm) return;
  if (!data.students.length) { sm.innerHTML = "<p class='muted'>Порожньо</p>"; return; }
  const sorted = data.students.slice().sort(function (a, b) {
    return a.name.localeCompare(b.name, "uk");
  });
  sm.innerHTML = sorted.map(function (s) {
    const pct = (calcPct(s) * 100).toFixed(1);
    let html = '<div class="student-row" style="flex-wrap:wrap">' +
      '<span class="student-name"><strong>' + escapeHtml(s.name) + "</strong>" +
      '<span class="muted" style="display:block;font-size:0.85rem">' + s.ch + " черг. / " + s.b + " дн. (" + pct + "%)</span></span>";
    html += '<button type="button" class="secondary small-btn" data-edit="' + s.id + '">Змінити</button>';
    html += '<button type="button" class="secondary small-btn" data-del="' + s.id + '">Видалити</button>';
    html += "</div>";
    if (editingId === s.id) {
      html += '<div class="edit-panel" data-edit-panel="' + s.id + '">' +
        "<label>Ім’я</label><input type=\"text\" data-f=\"name\" value=\"" + escapeHtml(s.name) + "\">" +
        "<label>Днів у школі (b)</label><input type=\"number\" data-f=\"b\" min=\"0\" value=\"" + (s.b || 0) + "\">" +
        "<label>Разів чергував (ch)</label><input type=\"number\" data-f=\"ch\" min=\"0\" value=\"" + (s.ch || 0) + "\">" +
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
  const b = parseInt(panel.querySelector('[data-f="b"]').value, 10);
  const ch = parseInt(panel.querySelector('[data-f="ch"]').value, 10);
  const err = panel.querySelector('[data-edit-err="' + id + '"]');
  err.classList.add("hidden");
  if (!name) { err.textContent = "Вкажіть ім’я"; err.classList.remove("hidden"); return; }
  if (isNaN(b) || b < 0 || isNaN(ch) || ch < 0) {
    err.textContent = "Числа мають бути 0 або більше"; err.classList.remove("hidden"); return;
  }
  const st = studentById(id);
  if (!st) return;
  const old = { name: st.name, b: st.b, ch: st.ch };
  st.name = name; st.b = b; st.ch = ch;
  try {
    await saveData("Оновлено учня " + name);
    editingId = null;
    renderAll();
  } catch (e) {
    st.name = old.name; st.b = old.b; st.ch = old.ch;
    err.textContent = e.message; err.classList.remove("hidden");
  }
}

function renderAll() {
  renderDuty();
  renderWeek();
  renderLateBanner();
  renderStats();
  renderSchedule();
  renderAuth();
  if (role === "teacher" || role === "head") renderEditor();
}

function applyDay(rec) {
  const absent = {};
  (rec.absent || []).forEach(function (id) { absent[id] = true; });
  data.students.forEach(function (s) {
    if (!absent[s.id]) s.b = (s.b || 0) + 1;
    if (s.id === rec.duty) s.ch = (s.ch || 0) + 1;
  });
}
function reverseDay(rec) {
  const absent = {};
  (rec.absent || []).forEach(function (id) { absent[id] = true; });
  data.students.forEach(function (s) {
    if (!absent[s.id]) s.b = Math.max(0, (s.b || 0) - 1);
    if (s.id === rec.duty) s.ch = Math.max(0, (s.ch || 0) - 1);
  });
}

async function applyAndSaveDay(date, absent, duty, by, msg) {
  const prev = dayRecord(date);
  if (prev) reverseDay(prev);
  data.days[date] = { absent: absent, duty: duty, by: by || "auto" };
  applyDay(data.days[date]);
  try {
    await saveData(msg || ("Присутність і черговий за " + date));
  } catch (e) {
    reverseDay(data.days[date]);
    if (prev) { data.days[date] = prev; applyDay(prev); }
    else delete data.days[date];
    throw e;
  }
}
