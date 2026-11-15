(async function(){
  try {
    const r = await fetch("half1.js?t=" + Date.now());
    if (!r.ok) throw new Error("half1.js " + r.status);
    const text = await r.text();
    const s = document.createElement("script");
    s.text = text;
    document.head.appendChild(s);
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML("afterbegin",
      "<div style=\"padding:16px;background:#fee;color:#900;font-family:sans-serif\">Помилка завантаження: " +
      String(e.message || e) + "</div>");
  }
})();
