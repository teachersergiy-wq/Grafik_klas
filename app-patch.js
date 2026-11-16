(function () {
  function weekdayUk(iso) {
    const names = ["неділя", "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота"];
    const p = iso.split("-").map(Number);
    const d = new Date(p[0], p[1] - 1, p[2], 12);
    return names[d.getDay()] || iso;
  }

  function attendanceStats(studentId) {
    let present = 0, absentNote = 0, absentNoNote = 0, dutyServed = 0, dutyNoshow = 0, dutyAssigned = 0;
    const days = data.days || {};
    Object.keys(days).forEach(function (date) {
      const rec = days[date];
      if (!rec) return;
      const abs = rec.absent || [];
      const isAbs = abs.indexOf(studentId) >= 0;
      if (isAbs) {
        if (hasParentNote(rec, studentId)) absentNote += 1;
        else absentNoNote += 1;
      } else {
        present += 1;
      }
      if (rec.duty === studentId) {
        const st = dutyStatusOf(rec);
        if (st === "served") dutyServed += 1;
        else if (st === "noshow") dutyNoshow += 1;
        else dutyAssigned += 1;
      }
    });
    return {
      present: present,
      absentNote: absentNote,
      absentNoNote: absentNoNote,
      absentTotal: absentNote + absentNoNote,
      dutyServed: dutyServed,
      dutyNoshow: dutyNoshow,
      dutyAssigned: dutyAssigned
    };
  }

  window.openStudentInfo = function (sid) {
    const st = studentById(sid);
    if (!st) return;
    const a = attendanceStats(sid);
    const title = document.getElementById("pctModalTitle");
    const body = document.getElementById("pctModalBody");
    if (title) title.textContent = st.name;
    if (body) {
      let html = "";
      html += "<p><strong>Відвідування (за графіком 8 класу)</strong></p>";
      html += '<p class="muted">Днів у школі: <strong style="color:var(--text)">' + a.present + "</strong></p>";
      html += '<p class="muted">Пропусків усього: <strong style="color:var(--text)">' + a.absentTotal + "</strong></p>";
      html += '<p class="muted">з них з довідкою / запискою: <strong style="color:var(--text)">' + a.absentNote + "</strong></p>";
      html += '<p class="muted" style="margin-bottom:12px">без поважної причини (без довідки/записки): <strong style="color:var(--danger)">' + a.absentNoNote + "</strong></p>";
      html += "<p><strong>Чергування</strong></p>";
      html += '<p class="muted">Прочергував: <strong style="color:var(--text)">' + a.dutyServed + "</strong></p>";
      html += '<p class="muted">Не виконав обов\'язки: <strong style="color:var(--text)">' + a.dutyNoshow + "</strong></p>";
      html += '<p class="muted" style="margin-bottom:12px">Призначений (ще без підтвердження): <strong style="color:var(--text)">' + a.dutyAssigned + "</strong></p>";
      html += '<p class="muted" style="font-size:0.85rem">Натисніть на відсоток — деталі розрахунку відсотка чергувань (відношення чергувань до кількості днів присутності в школі).</p>';
      body.innerHTML = html;
    }
    const m = document.getElementById("pctModal");
    if (m) m.classList.remove("hidden");
  };

  window.describeCellDay = function (sid, date) {
    const st = studentById(sid);
    const rec = dayRecord(date);
    let lines = [];
    if (!rec) {
      lines.push("<p>За цей день запису ще немає.</p>");
      return lines.join("");
    }
    const abs = rec.absent || [];
    const isAbs = abs.indexOf(sid) >= 0;
    if (isAbs) {
      const note = hasParentNote(rec, sid);
      if (note) {
        lines.push("<p>Учень <strong>не був</strong> у школі. Надано довідку лікаря або записку батьків.</p>");
      } else {
        lines.push("<p>Учень <strong>не був</strong> у школі. Довідки / записки батьків <strong>немає</strong> (пропуск без поважної причини).</p>");
      }
    } else {
      lines.push("<p>Учень <strong>був</strong> у школі.</p>");
    }
    if (rec.duty === sid) {
      const status = dutyStatusOf(rec);
      if (status === "served") {
        lines.push("<p>Чергував у класі (підтверджено: прочергував).</p>");
      } else if (status === "noshow") {
        lines.push("<p>Був призначений черговим, але <strong>не виконав</strong> свої обов'язки.</p>");
      } else {
        lines.push("<p>Призначений черговим (підтвердження після 14:00 ще не зроблено).</p>");
      }
      if (rec.by === "teacher") {
        lines.push('<p class="muted">Призначив учитель.</p>');
      } else {
        lines.push('<p class="muted">Призначено за графіком (відсоток).</p>');
      }
    } else if (rec.duty) {
      const dSt = studentById(rec.duty);
      lines.push('<p class="muted">Черговий цього дня: ' + escapeHtml(dSt ? dSt.name : rec.duty) + ".</p>");
    } else {
      lines.push('<p class="muted">Чергового цього дня не призначено.</p>');
    }
    if (rec.note) {
      lines.push('<p class="muted">Примітка до дня: ' + escapeHtml(rec.note) + "</p>");
    }
    return lines.join("");
  };

  // Clearer main-screen hint: * refers to duty, not absences
  const _renderDuty = window.renderDuty;
  if (typeof _renderDuty === "function") {
    window.renderDuty = function () {
      _renderDuty();
      const t = todayStr();
      const rec = dayRecord(t);
      const hint = document.getElementById("dutyHint");
      if (!hint) return;
      if (!rec) {
        hint.textContent = "Черговий з’явиться після збереження присутності за сьогодні (за бажанням).";
        return;
      }
      const abs = (rec.absent || []).map(function (id) {
        const s = studentById(id);
        return s ? s.name : id;
      });
      const absPart = abs.length ? ("Відсутні: " + abs.join(", ") + ".") : "Усі присутні.";
      if (!rec.duty) {
        let t2 = absPart + " Чергового сьогодні немає.";
        if (rec.note) t2 += " Примітка: " + rec.note;
        hint.textContent = t2;
        return;
      }
      let dutyHow = "";
      if (isManualDuty(rec)) {
        dutyHow = "Чергового призначив учитель (позначка * біля імені).";
      } else {
        dutyHow = "Чергового обрано за відсотковим розрахунком.";
      }
      const stl = dutyStatusLabel(rec);
      let t2 = absPart + " " + dutyHow;
      if (stl) t2 += " Статус: " + stl + ".";
      if (rec.note) t2 += " Примітка: " + rec.note;
      hint.textContent = t2;
    };
  }

  const _openCellModal = window.openCellModal;
  window.openCellModal = function (sid, date) {
    const st = studentById(sid);
    const title = document.getElementById("cellModalTitle");
    const sub = document.getElementById("cellModalSub");
    const body = document.getElementById("cellModalBody");
    const err = document.getElementById("cellModalErr");
    if (err) err.classList.add("hidden");
    if (title) title.textContent = st ? st.name : "День";
    if (sub) sub.textContent = weekdayUk(date) + ", " + formatDateUk(date);

    const infoHtml = describeCellDay(sid, date);
    const canEdit = (role === "teacher") || (role === "head" && canEditDay(date));

    if (!canEdit) {
      if (body) body.innerHTML = infoHtml;
      const saveBtn = document.getElementById("btnCellSave");
      if (saveBtn) saveBtn.classList.add("hidden");
      const m = document.getElementById("cellModal");
      if (m) m.classList.remove("hidden");
      cellEdit = null;
      return;
    }

    if (typeof _openCellModal === "function") {
      _openCellModal(sid, date);
    }
    if (body) {
      const editHtml = body.innerHTML;
      body.innerHTML = '<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">' +
        infoHtml + "</div>" + editHtml;
    }
    const saveBtn = document.getElementById("btnCellSave");
    if (saveBtn) saveBtn.classList.remove("hidden");
  };

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
      var autoBox = document.getElementById("starostaDutyPreview");
      if (!autoBox) {
        autoBox = document.createElement("div");
        autoBox.id = "starostaDutyPreview";
        autoBox.className = "hint-box";
        autoBox.style.marginTop = "12px";
        const list = document.getElementById("absentList");
        if (list && list.parentNode) list.parentNode.insertBefore(autoBox, list.nextSibling);
      }
      if (role === "head") {
        if (btn) btn.textContent = "Зберегти присутність і призначити чергового";
        const absent = typeof getSelectedAbsentIds === "function" ? getSelectedAbsentIds() : [];
        const autoId = typeof pickDuty === "function" ? pickDuty(absent) : null;
        const st = autoId ? studentById(autoId) : null;
        const rec = dayRecord(editDate);
        autoBox.classList.remove("hidden");
        if (rec && rec.duty) {
          const dSt = studentById(rec.duty);
          autoBox.innerHTML = "Сьогодні вже збережено. Черговий: <strong>" +
            escapeHtml(dSt ? dSt.name : rec.duty) + "</strong>" +
            (rec.by === "teacher" ? " (призначив вчитель)" : " (за графіком)") +
            ". Змінювати може лише вчитель.";
        } else if (st) {
          autoBox.innerHTML = "Після збереження черговим буде: <strong>" +
            escapeHtml(st.name) + "</strong> (автоматично за найменшим відсотком серед присутніх).";
        } else {
          autoBox.innerHTML = "Немає присутніх — чергового призначити не можна.";
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
            box.innerHTML = s
              ? ("Після збереження черговим буде: <strong>" + escapeHtml(s.name) + "</strong>.")
              : "Немає присутніх — чергового призначити не можна.";
          });
        });
        if (hint && canEditDay(editDate) && !dayRecord(editDate)) {
          hint.textContent = "Можна зберегти один раз за сьогодні. Черговий призначиться автоматично.";
        } else if (hint && canEditDay(editDate) && dayRecord(editDate) && !dayRecord(editDate).duty) {
          hint.textContent = "Присутність є, але чергового ще немає — збережіть, щоб призначити.";
        }
      } else {
        if (btn) btn.textContent = "Зберегти присутність";
        if (autoBox) autoBox.classList.add("hidden");
      }
    };
  }

  const _renderMatrix = window.renderMatrix;
  if (typeof _renderMatrix === "function") {
    window.renderMatrix = function () {
      _renderMatrix();
      const table = document.getElementById("matrixTable");
      if (!table) return;
      const thead = table.querySelector("thead");
      const tbody = table.querySelector("tbody");
      if (thead) {
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
      }
      if (tbody) {
        tbody.querySelectorAll("tr").forEach(function (tr) {
          const nameTd = tr.querySelector("td.name");
          const pctTd = tr.querySelector("td.pct[data-sid]");
          if (nameTd && pctTd) {
            const sid = pctTd.getAttribute("data-sid");
            nameTd.classList.add("clickable");
            nameTd.title = "Статистика відвідування";
            nameTd.onclick = function (e) {
              e.stopPropagation();
              openStudentInfo(sid);
            };
          }
        });
        tbody.querySelectorAll("td[data-sid][data-date]").forEach(function (td) {
          td.classList.add("clickable");
          td.style.cursor = "pointer";
          td.onclick = function () {
            openCellModal(td.getAttribute("data-sid"), td.getAttribute("data-date"));
          };
        });
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
    if (sub) sub.textContent = weekdayUk(date);
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
})();
