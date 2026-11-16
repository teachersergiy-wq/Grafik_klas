(async function () {
  try {
    const urls = [
      "https://raw.githubusercontent.com/teachersergiy-wq/Grafik_klas/a60b49b6d88170c3f99bba6abb2c4c4b89037f91/app-core.js",
      "app-patch.js?t=" + Date.now()
    ];
    for (const url of urls) {
      const r = await fetch(url);
      if (!r.ok) throw new Error(url + " " + r.status);
      const text = await r.text();
      const s = document.createElement("script");
      s.text = text;
      document.head.appendChild(s);
    }
    if (typeof renderAll === "function") renderAll();
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML("afterbegin",
      '<div style="padding:16px;background:#fee;color:#900;font-family:sans-serif">Помилка завантаження: ' +
      String(e.message || e) + "</div>");
  }
})();
