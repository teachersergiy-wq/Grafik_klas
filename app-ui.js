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
  trySendDraft();
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

function saveTokenFromInput(inputId, okId, errId) {
  const t = document.getElementById(inputId).value.trim();
  const ok = document.getElementById(okId);
  const er = document.getElementById(errId);
  if (ok) ok.classList.add("hidden");
  if (er) er.classList.add("hidden");
  if (!t) {
    if (er) { er.textContent = "Вставте токен"; er.classList.remove("hidden"); }
    return;
  }
  token = t;
  localStorage.setItem("gk_write_token", token);
  if (ok) { ok.textContent = "Токен збережено на цьому телефоні."; ok.classList.remove("hidden"); }
  document.getElementById(inputId).value = "";
  renderAuth();
  trySendDraft();
}

document.getElementById("btnSaveToken").onclick = function () {
  saveTokenFromInput("writeTokenInput", "tokenOk", "tokenErr");
};

var btnShared = document.getElementById("btnSaveTokenShared");
if (btnShared) {
  btnShared.onclick = function () {
    saveTokenFromInput("writeTokenInputShared", "tokenSharedOk", "tokenSharedErr");
  };
}

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
  if (!token) {
    err.textContent = "Спочатку вставте токен у блок «Токен для збереження» вище.";
    err.classList.remove("hidden");
    var card = document.getElementById("tokenSetupCard");
    if (card) card.classList.remove("hidden");
    return;
  }
  const absent = getSelectedAbsentIds();
  const autoId = pickDuty(absent);
  let duty = null;
  let by = "auto";
  if (role === "teacher") {
    const sel = document.getElementById("dutySelect");
    const chosen = sel ? sel.value : "";
    if (chosen && chosen !== "__none__") {
      duty = chosen;
      if (duty !== autoId) by = "teacher";
      else by = "auto";
    }
  } else {
    duty = autoId;
  }
  if (duty && absent.indexOf(duty) >= 0) {
    err.textContent = "Черговий не може бути серед відсутніх."; err.classList.remove("hidden"); return;
  }
  try {
    await applyAndSaveDay(editDate, absent, duty, by, "Присутність за " + editDate + (duty ? " і черговий" : ""));
    clearDraft();
    if (duty) {
      const st = studentById(duty);
      const star = by === "teacher" ? " *" : "";
      ok.textContent = "Збережено. Черговий: " + (st ? st.name : duty) + star +
        " (призначений — підтвердження після 14:00)";
    } else {
      ok.textContent = "Збережено присутність. Чергового не призначено.";
    }
    ok.classList.remove("hidden");
    renderAll();
  } catch (e) {
    saveDraft({ date: editDate, absent: absent, duty: duty, by: by, savedAt: Date.now() });
    err.textContent = e.message + " Чернетку збережено на цьому телефоні — надішліть пізніше.";
    err.classList.remove("hidden");
  }
};

document.getElementById("btnSendDraft").onclick = async function () {
  const d = loadDraft();
  if (!d) return;
  try {
    if (!token) throw new Error("Спочатку введіть токен у блоці «Токен для збереження».");
    await applyAndSaveDay(d.date, d.absent, d.duty, d.by, "Чернетка: присутність за " + d.date);
    clearDraft();
    renderAll();
    alert("Чернетку надіслано.");
  } catch (e) {
    alert(e.message);
  }
};
document.getElementById("btnDiscardDraft").onclick = function () {
  if (confirm("Видалити чернетку?")) clearDraft();
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
  data.students.push({ id: id, name: name, b0: b, ch0: ch, b: b, ch: ch });
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
    const absIds = rec.absent || [];
    const presentNames = data.students
      .filter(function (s) { return absIds.indexOf(s.id) < 0; })
      .map(function (s) { return s.name; })
      .sort(function (a, b) { return a.localeCompare(b, "uk"); });
    const absentNames = absIds.map(function (id) {
      const s = studentById(id);
      return s ? s.name : id;
    });
    info.innerHTML =
      "<p>Черговий: <strong>" + escapeHtml(dutyLabel(rec)) + "</strong></p>" +
      "<p class=\"muted\">Правило: " + escapeHtml(dutyRuleText(rec)) + "</p>" +
      "<p class=\"muted\">Статус: " + escapeHtml(dutyStatusLabel(rec)) + "</p>" +
      "<p style=\"margin-top:8px\"><strong>Відсутні:</strong> " + escapeHtml(absentNames.join(", ") || "—") + "</p>" +
      "<p><strong>Присутні:</strong> " + escapeHtml(presentNames.join(", ") || "—") + "</p>";
  }
};

setInterval(function () {
  renderLateBanner();
  renderDraftBanner();
}, 60000);

window.addEventListener("online", function () { trySendDraft(); });

var btnTheme = document.getElementById("btnTheme");
if (btnTheme) {
  btnTheme.onclick = function () { cycleTheme(); };
}
var btnWeekPrev = document.getElementById("btnWeekPrev");
var btnWeekNext = document.getElementById("btnWeekNext");
if (btnWeekPrev) {
  btnWeekPrev.onclick = function () { weekOffset -= 1; highlightToday = false; renderMatrix(); };
}
if (btnWeekNext) {
  btnWeekNext.onclick = function () { weekOffset += 1; highlightToday = false; renderMatrix(); };
}
var btnJumpToday = document.getElementById("btnJumpToday");
if (btnJumpToday) {
  btnJumpToday.onclick = function () {
    weekOffset = 0;
    highlightToday = true;
    renderMatrix();
  };
}

async function handleConfirmDuty(status) {
  const err = document.getElementById("saveError");
  const ok = document.getElementById("saveOk");
  if (err) err.classList.add("hidden");
  if (ok) ok.classList.add("hidden");
  try {
    await confirmDutyStatus(editDate, status);
    if (ok) {
      ok.textContent = status === "served"
        ? "Підтверджено: прочергував (чергування зараховано)."
        : "Відмічено: не прочергував (чергування не зараховано).";
      ok.classList.remove("hidden");
    }
    renderAll();
  } catch (e) {
    if (err) { err.textContent = e.message; err.classList.remove("hidden"); }
  }
}
var btnConfirmServed = document.getElementById("btnConfirmServed");
var btnConfirmNoshow = document.getElementById("btnConfirmNoshow");
if (btnConfirmServed) {
  btnConfirmServed.onclick = function () { handleConfirmDuty("served"); };
}
if (btnConfirmNoshow) {
  btnConfirmNoshow.onclick = function () { handleConfirmDuty("noshow"); };
}

var btnCellSave = document.getElementById("btnCellSave");
var btnCellCancel = document.getElementById("btnCellCancel");
var cellModal = document.getElementById("cellModal");
if (btnCellSave) btnCellSave.onclick = function () { saveCellModal(); };
if (btnCellCancel) btnCellCancel.onclick = function () { closeCellModal(); };
if (cellModal) {
  cellModal.addEventListener("click", function (e) {
    if (e.target === cellModal) closeCellModal();
  });
}

loadData();
