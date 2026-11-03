const CFG = {
  owner: "teachersergiy-wq",
  repo: "Grafik_klas",
  file: "data.json",
  defaultPasswords: { teacher: "teacher", starosta: "starosta" }
};

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
}

async function saveData(msg) {
  if (!token) throw new Error("Немає токена збереження. Вчитель має ввести його в «Налашт.»");
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
    const st = studentById(rec.duty);
    dutyEl.textContent = st ? st.name : "id " + rec.duty;
    const abs = (rec.absent || []).map(function (id) {
      const s = studentById(id);
      return s ? s.name : id;
    });
    hint.textContent = abs.length ? "Відсутні: " + abs.join(", ") : "Усі присутні";
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
    const st = studentById(rec.duty);
    const name = st ? st.name : (rec.duty || "—");
    return '<div class="schedule-row"><span>' + formatDateUk(d) + '</span><strong>' + escapeHtml(name) + "</strong></div>";
  }).join("");
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
  document.getElementById("tabStudentsBtn").classList.toggle("hidden", !isTeacher);
  document.getElementById("tabHistoryBtn").classList.toggle("hidden", !isTeacher);
  document.getElementById("tabSettingsBtn").classList.toggle("hidden", !isTeacher);
  document.getElementById("studentsHint").textContent = "Можна змінити ім’я, дні в школі та кількість чергувань.";

  const ts = document.getElementById("tokenStatus");
  if (ts) {
    ts.textContent = token
      ? "Токен збереження на цьому телефоні є."
      : "Токена ще немає — збереження не працюватиме, доки вчитель не введе токен.";
  }
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
      };
    });
  }
  document.getElementById("btnSaveDay").disabled = !can;
  document.getElementById("btnClearDay").classList.toggle("hidden", !(role === "teacher" && dayRecord(editDate)));
  document.getElementById("saveError").classList.add("hidden");
  document.getElementById("saveOk").classList.add("hidden");
  if (role === "teacher") renderStudentsManage();
  document.getElementById("histDate").value = editDate;
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

document.getElementById("btnToggleLogin").onclick = function () {
  loginOpen = !loginOpen;
  renderAuth();
};

document.getElementById("btnLogin").onclick = function () {
  const login = document.getElementById("loginInput").value.trim().toLowerCase();
  const pass = document.getElementById("passInput").value;
  const err = document.getElementById("loginError");
  err.classList.add("hidden");
  const pw = getPasswords();
  if (login === "teacher" && pass === pw.teacher) {
    role = "teacher"; userLogin = "teacher";
  } else if (login === "starosta" && pass === pw.starosta) {
    role = "head"; userLogin = "starosta";
  } else {
    err.textContent = "Невірний логін або пароль.";
    err.classList.remove("hidden");
    return;
  }
  localStorage.setItem("gk_login", userLogin);
  localStorage.setItem("gk_role", role);
  document.getElementById("passInput").value = "";
  loginOpen = false;
  renderAll();
};

document.getElementById("btnLogout").onclick = function () {
  userLogin = ""; role = "viewer"; editingId = null;
  localStorage.removeItem("gk_login");
  localStorage.removeItem("gk_role");
  loginOpen = false;
  document.querySelectorAll(".tabs button").forEach(function (b) { b.classList.remove("active"); });
  const todayTab = document.querySelector('.tabs button[data-tab="today"]');
  if (todayTab) todayTab.classList.add("active");
  ["today", "students", "history", "settings"].forEach(function (t) {
    const el = document.getElementById("tab-" + t);
    if (el) el.classList.toggle("hidden", t !== "today");
  });
  renderAll();
};

document.querySelectorAll(".tabs button").forEach(function (btn) {
  btn.onclick = function () {
    document.querySelectorAll(".tabs button").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    ["today", "students", "history", "settings"].forEach(function (t) {
      const el = document.getElementById("tab-" + t);
      if (el) el.classList.toggle("hidden", btn.getAttribute("data-tab") !== t);
    });
  };
});

document.getElementById("btnShowAddStudent").onclick = function () {
  document.getElementById("addStudentForm").classList.remove("hidden");
  document.getElementById("btnShowAddStudent").classList.add("hidden");
};
document.getElementById("btnCancelAddStudent").onclick = function () {
  document.getElementById("addStudentForm").classList.add("hidden");
  document.getElementById("btnShowAddStudent").classList.remove("hidden");
  document.getElementById("studError").classList.add("hidden");
};

document.getElementById("btnSaveToken").onclick = function () {
  const t = document.getElementById("writeTokenInput").value.trim();
  const ok = document.getElementById("tokenOk");
  const er = document.getElementById("tokenErr");
  ok.classList.add("hidden"); er.classList.add("hidden");
  if (!t) { er.textContent = "Вставте токен"; er.classList.remove("hidden"); return; }
  token = t;
  localStorage.setItem("gk_write_token", token);
  ok.textContent = "Токен збережено на цьому телефоні.";
  ok.classList.remove("hidden");
  document.getElementById("writeTokenInput").value = "";
  renderAuth();
};

document.getElementById("btnSavePasswords").onclick = async function () {
  if (role !== "teacher") return;
  const tp = document.getElementById("newTeacherPass").value;
  const sp = document.getElementById("newStarostaPass").value;
  const ok = document.getElementById("passOk");
  const er = document.getElementById("passErr");
  ok.classList.add("hidden"); er.classList.add("hidden");
  if (!tp && !sp) { er.textContent = "Введіть хоча б один новий пароль"; er.classList.remove("hidden"); return; }
  if (!data.passwords) data.passwords = {};
  const cur = getPasswords();
  data.passwords.teacher = tp || cur.teacher;
  data.passwords.starosta = sp || cur.starosta;
  try {
    await saveData("Змінено паролі входу");
    ok.textContent = "Паролі оновлено."; ok.classList.remove("hidden");
    document.getElementById("newTeacherPass").value = "";
    document.getElementById("newStarostaPass").value = "";
  } catch (e) { er.textContent = e.message; er.classList.remove("hidden"); }
};

document.getElementById("btnSaveDay").onclick = async function () {
  const err = document.getElementById("saveError");
  const ok = document.getElementById("saveOk");
  err.classList.add("hidden"); ok.classList.add("hidden");
  if (!canEditDay(editDate)) {
    err.textContent = "Немає права зберегти цей день."; err.classList.remove("hidden"); return;
  }
  const absent = [];
  document.querySelectorAll("#absentList input[type=checkbox]").forEach(function (cb) {
    if (cb.checked) absent.push(cb.getAttribute("data-id"));
  });
  const duty = pickDuty(absent);
  if (!duty) {
    err.textContent = "Немає присутніх учнів для чергування."; err.classList.remove("hidden"); return;
  }
  const prev = dayRecord(editDate);
  if (prev) reverseDay(prev);
  data.days[editDate] = { absent: absent, duty: duty };
  applyDay(data.days[editDate]);
  try {
    await saveData("Присутність і черговий за " + editDate);
    const st = studentById(duty);
    ok.textContent = "Збережено. Черговий: " + (st ? st.name : duty);
    ok.classList.remove("hidden");
    renderAll();
  } catch (e) {
    reverseDay(data.days[editDate]);
    if (prev) { data.days[editDate] = prev; applyDay(prev); }
    else delete data.days[editDate];
    err.textContent = e.message; err.classList.remove("hidden");
  }
};

document.getElementById("btnClearDay").onclick = async function () {
  if (role !== "teacher") return;
  const rec = dayRecord(editDate);
  if (!rec) return;
  if (!confirm("Скасувати запис за " + formatDateUk(editDate) + "?")) return;
  reverseDay(rec);
  delete data.days[editDate];
  try {
    await saveData("Скасовано запис за " + editDate);
    renderAll();
  } catch (e) {
    applyDay(rec);
    data.days[editDate] = rec;
    alert(e.message);
  }
};

document.getElementById("btnAddStudent").onclick = async function () {
  if (role !== "teacher") return;
  const name = document.getElementById("newName").value.trim();
  const b = parseInt(document.getElementById("newB").value, 10) || 0;
  const ch = parseInt(document.getElementById("newCh").value, 10) || 0;
  const err = document.getElementById("studError");
  err.classList.add("hidden");
  if (!name) { err.textContent = "Вкажіть ім’я"; err.classList.remove("hidden"); return; }
  const id = String(Date.now());
  data.students.push({ id: id, name: name, b: b, ch: ch });
  try {
    await saveData("Додано учня " + name);
    document.getElementById("newName").value = "";
    document.getElementById("addStudentForm").classList.add("hidden");
    document.getElementById("btnShowAddStudent").classList.remove("hidden");
    renderAll();
  } catch (e) {
    data.students.pop();
    err.textContent = e.message; err.classList.remove("hidden");
  }
};

async function deleteStudent(id) {
  if (role !== "teacher") return;
  if (!confirm("Видалити учня?")) return;
  const idx = data.students.findIndex(function (s) { return s.id === id; });
  if (idx < 0) return;
  const removed = data.students.splice(idx, 1)[0];
  try {
    await saveData("Видалено учня " + removed.name);
    if (editingId === id) editingId = null;
    renderAll();
  } catch (e) {
    data.students.splice(idx, 0, removed);
    alert(e.message);
  }
}

document.getElementById("btnLoadDate").onclick = function () {
  if (role !== "teacher") return;
  const d = document.getElementById("histDate").value;
  if (!d) return;
  editDate = d;
  document.querySelector('.tabs button[data-tab="today"]').click();
  renderEditor();
  const rec = dayRecord(d);
  const info = document.getElementById("histInfo");
  if (!rec) info.innerHTML = "<p class='muted'>Записів немає</p>";
  else {
    const st = studentById(rec.duty);
    info.innerHTML = "<p>Черговий: <strong>" + (st ? escapeHtml(st.name) : rec.duty) +
      '</strong></p><p class="muted">Відсутні: ' +
      ((rec.absent || []).map(function (id) {
        const s = studentById(id);
        return s ? s.name : id;
      }).join(", ") || "—") + "</p>";
  }
};

loadData();
