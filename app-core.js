(async function(){
  try {
    for (const name of ["half1.js", "half2.js"]) {
      const r = await fetch(name + "?t=" + Date.now());
      if (!r.ok) throw new Error(name + " " + r.status);
      const text = await r.text();
      const s = document.createElement("script");
      s.text = text;
      document.head.appendChild(s);
    }
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML("afterbegin",
      "<div style=\"padding:16px;background:#fee;color:#900;font-family:sans-serif\">Помилка: " +
      String(e.message || e) + "</div>");
  }
})();
