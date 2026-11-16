(function () {
  if (typeof canEditDayNote !== "function") {
    window.canEditDayNote = function (date) {
      if (role === "teacher") return true;
      if (role !== "head") return false;
      if (date !== todayStr()) return false;
      if (!isWeekdayKyiv()) return false;
      const n = kyivNow();
      const mins = n.getHours() * 60 + n.getMinutes();
      return mins >= 8 * 60 && mins < 16 * 60;
    };
  }

  const _canEditDay = window.canEditDay;
  if (typeof _canEditDay === "function") {
    window.canEditDay = function (date) {
      if (role === "teacher") return true;
      if (role !== "head") return false;
      if (date !== todayStr()) return false;
      if (!isHeadTimeWindow()) return false;
      const rec = dayRecord(date);
      if (!rec) return true;
      if (!rec.duty) return true;
      return false;
    };
  }

  const _renderAuth = window.renderAuth;
  if (typeof _renderAuth === "function") {
    window.renderAuth = function () {
      _renderAuth();
      const isTeacher = role === "teacher";
      const isHead = role === "head";
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
    };
  }

  const _renderEditor = window.renderEditor;
  if (typeof _renderEditor === "function") {
    window.renderEditor = function () {
      _renderEditor();
      const btn = document.getElementById("btnSaveDay");
      const hint = document.getElementById("timeWindowHint");
      const can = canEditDay(editDate);

      var autoBox = document.getElementById("starostaDutyPreview");
      if (!autoBox) {
        autoBox = document.createElement("div");
        autoBox.id = "starostaDutyPreview";
        autoBox.className = "hint-box";
        autoBox.style.marginTop = "12px";
        const list = document.getElementById("absentList");
        if (list && list.parentNode) {
          list.parentNode.insertBefore(autoBox, list.nextSibling);
        }
      }

      if (role === "head") {
        if (btn) btn.textContent = "Зберегти присутність і призначити чергового";
        const absent = typeof getSelectedAbsentIds === "function" ? getSelectedAbsentIds() : [];
        const autoId = typeof pickDuty === "function" ? pickDuty(absent) : null;
        const st = autoId && typeof studentById === "function" ? studentById(autoId) : null;
        const rec = dayRecord(editDate);
        if (rec && rec.duty) {
          const dSt = studentById(rec.duty);
          autoBox.classList.remove("hidden");
          autoBox.innerHTML = "Сьогодні вже збережено. Черговий: <strong>" +
            escapeHtml(dSt ? dSt.name : rec.duty) + "</strong>" +
            (rec.by === "teacher" ? " (призначив вчитель)" : " (за графіком)") +
            ". Змінювати може лише вчитель.";
        } else if (st) {
          autoBox.classList.remove("hidden");
          autoBox.innerHTML = "Після збереження черговим буде: <strong>" +
            escapeHtml(st.name) + "</strong> (автоматично за найменшим відсотком серед присутніх).";
        } else {
          autoBox.classList.remove("hidden");
          autoBox.innerHTML = "Немає присутніх — чергового призначити не можна. Залиште хоча б одного присутнім.";
        }
        document.querySelectorAll("#absentList input[type=checkbox]").forEach(function (cb) {
          cb.addEventListener("change", function () {
            const box = document.getElementById("starostaDutyPreview");
            if (!box || role !== "head") return;
            const rec2 = dayRecord(editDate);
            if (rec2 && rec2.duty) return;
            const abs = getSelectedAbsentIds();
            const id = pickDuty(abs);
            const s = id ? studentById(id) : null;
            if (s) {
              box.innerHTML = "Після збереження черговим буде: <strong>" +
                escapeHtml(s.name) + "</strong> (автоматично за найменшим відсотком серед присутніх).";
            } else {
              box.innerHTML = "Немає присутніх — чергового призначити не можна.";
            }
          });
        });
        if (hint && can && !dayRecord(editDate)) {
          hint.textContent = "Можна зберегти один раз за сьогодні. Черговий призначиться автоматично.";
        } else if (hint && can && dayRecord(editDate) && !dayRecord(editDate).duty) {
          hint.textContent = "Присутність є, але чергового ще немає — збережіть, щоб призначити.";
        }
      } else {
        if (btn) btn.textContent = "Зберегти присутність";
        if (autoBox) autoBox.classList.add("hidden");
      }
    };
  }

  let dayNoteEditDate = null;
  window.closeDayNoteModal = function () {
    dayNoteEditDate = null;
    const m = document.getElementById("dayNoteModal");
    if (m) m.classList.add("hidden");
  };
  window.openDayNoteModal = function (date) {
    dayNoteEditDate = date;
    const rec = dayRecord(date);
    const title = document.getElementById("dayNoteModalTitle");
    const sub = document.getElementById("dayNoteModalSub");
    const input = document.getElementById("dayNoteModalInput");
    const hint = document.getElementById("dayNoteModalHint");
    const err = document.getElementById("dayNoteModalErr");
    const btnSave = document.getElementById("btnDayNoteSave");
    const btnClear = document.getElementById("btnDayNoteClear");
    if (err) err.classList.add("hidden");
    if (title) title.textContent = "Примітка · " + formatDateUk(date);
    if (sub) sub.textContent = date;
    if (input) input.value = (rec && rec.note) ? rec.note : "";
    const can = canEditDayNote(date);
    if (input) input.disabled = !can || role === "viewer";
    if (btnSave) btnSave.disabled = !can || role === "viewer";
    if (btnClear) btnClear.disabled = !can || role === "viewer";
    if (hint) {
      if (role === "viewer") hint.textContent = "Лише перегляд.";
      else if (role === "head" && date !== todayStr()) hint.textContent = "Староста: лише сьогодні.";
      else if (role === "head" && !can) hint.textContent = "Староста: 8:00–16:00 (Київ).";
      else if (role === "head") hint.textContent = "Можна зберегти до 16:00.";
      else hint.textContent = "Вчитель може змінювати будь-яку дату.";
    }
    const m = document.getElementById("dayNoteModal");
    if (m) m.classList.remove("hidden");
  };
  window.saveDayNote = async function (clear) {
    const err = document.getElementById("dayNoteModalErr");
    if (err) err.classList.add("hidden");
    if (!dayNoteEditDate) return;
    const date = dayNoteEditDate;
    if (!canEditDayNote(date)) {
      if (err) { err.textContent = "Немає права."; err.classList.remove("hidden"); }
      return;
    }
    if (!token) {
      if (err) { err.textContent = "Потрібен токен."; err.classList.remove("hidden"); }
      return;
    }
    const input = document.getElementById("dayNoteModalInput");
    const text = clear ? "" : ((input && input.value) || "").trim().slice(0, 120);
    const prev = dayRecord(date);
    const next = prev
      ? {
          absent: (prev.absent || []).slice(),
          notes: (prev.notes || []).slice(),
          duty: prev.duty,
          by: prev.by,
          dutyStatus: prev.dutyStatus
        }
      : { absent: [], notes: [] };
    if (prev && prev.duty) {
      next.duty = prev.duty;
      next.by = prev.by || "auto";
      next.dutyStatus = prev.dutyStatus || dutyStatusOf(prev);
    } else {
      delete next.duty;
      delete next.by;
      delete next.dutyStatus;
    }
    if (text) next.note = text;
    else delete next.note;
    const empty = !(next.absent && next.absent.length) && !next.duty && !next.note && !(next.notes && next.notes.length);
    try {
      if (empty && prev) delete data.days[date];
      else if (empty && !prev) { closeDayNoteModal(); return; }
      else data.days[date] = next;
      await saveData(text ? ("Примітка за " + date) : ("Примітку очищено " + date));
      closeDayNoteModal();
      renderAll();
    } catch (e) {
      if (prev) data.days[date] = prev;
      else delete data.days[date];
      if (err) { err.textContent = e.message; err.classList.remove("hidden"); }
    }
  };

  const _renderMatrix = window.renderMatrix;
  if (typeof _renderMatrix === "function") {
    window.renderMatrix = function () {
      _renderMatrix();
      const table = document.getElementById("matrixTable");
      if (!table) return;
      const thead = table.querySelector("thead");
      if (!thead) return;
      thead.querySelectorAll("th").forEach(function (th, idx) {
        if (idx < 2) return;
        th.style.cursor = "pointer";
        th.classList.add("day-head-click");
        if (!th.getAttribute("data-date")) {
          const mon = typeof weekMondayWithOffset === "function" ? weekMondayWithOffset(weekOffset) : null;
          if (mon) {
            const d = new Date(mon);
            d.setDate(mon.getDate() + (idx - 2));
            th.setAttribute("data-date", dateToIsoLocal(d));
          }
        }
        th.onclick = function () {
          const date = th.getAttribute("data-date");
          if (date) openDayNoteModal(date);
        };
      });
    };
  }
})();
