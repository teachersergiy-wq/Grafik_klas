(async function(){
  try {
    const parts = [];
    for (let i = 0; i < 6; i++) {
      const r = await fetch("q" + i + ".txt?t=" + Date.now());
      if (!r.ok) throw new Error("part " + i + " " + r.status);
      parts.push(await r.text());
    }
    const bin = atob(parts.join(""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const text = new TextDecoder("utf-8").decode(bytes);
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
