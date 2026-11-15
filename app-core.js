(async function(){
  try {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const r = await fetch("t" + i + ".js.txt?t=" + Date.now());
      if (!r.ok) throw new Error("part " + i + " " + r.status);
      parts.push(await r.text());
    }
    const text = parts.join("");
    const s = document.createElement("script");
    s.text = text;
    document.head.appendChild(s);
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML("afterbegin",
      "<div style=\"padding:16px;background:#fee;color:#900;font-family:sans-serif\">Помилка: " +
      String(e.message || e) + "</div>");
  }
})();
