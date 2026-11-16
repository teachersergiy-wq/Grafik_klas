(async function () {
  try {
    for (let i = 0; i < 4; i++) {
      const r = await fetch("part" + i + ".js?t=" + Date.now());
      if (!r.ok) throw new Error("part" + i + " " + r.status);
      const text = await r.text();
      const s = document.createElement("script");
      s.text = text;
      document.head.appendChild(s);
    }
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML("afterbegin",
      '<div style="padding:16px;background:#fee;color:#900;font-family:sans-serif">Помилка: ' +
      String(e.message || e) + "</div>");
  }
})();
