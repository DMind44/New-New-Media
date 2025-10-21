import React, { useEffect, useRef, useState } from "react";

// configure how many frames you shipped
const FRAME_COUNT = 80; // change if you have more/less
const FRAME_PREFIX = import.meta.env.BASE_URL + "frames/frame_";
const DURATION_MS = 2000; // 2s crossfade

const pad = (n) => n.toString().padStart(6, "0");
const frameJpg = (i) => `${FRAME_PREFIX}${pad(i)}.jpg`;
const frameJson = (i) => `${FRAME_PREFIX}${pad(i)}.json`;

export default function PlayerWeb() {
  const canvasA = useRef(null);
  const canvasB = useRef(null);
  const ringRef = useRef([]);             // {img, caption}
  const [bufferSize, setBufferSize] = useState(0);
  const [caption, setCaption] = useState("");
  const [paused, setPaused] = useState(false);
  const idxRef = useRef(0);
  const tRef = useRef({ start: null });

  // preload frames and captions
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      const entries = [];
      for (let i = 0; i < FRAME_COUNT; i++) {
        const [img, cap] = await Promise.all([
          new Promise((res, rej) => {
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = rej;
            im.src = frameJpg(i);
          }),
          fetch(frameJson(i)).then(r => r.ok ? r.json() : { caption: "" }).catch(() => ({ caption: "" })),
        ]);
        entries.push({ img, caption: cap.caption || "" });
        if (cancelled) return;
        ringRef.current = entries.slice(0); // copy
        setBufferSize(ringRef.current.length);
      }
      // set initial caption
      if (!cancelled && entries.length) setCaption(entries[0].caption || "");
    }
    loadAll();
    return () => { cancelled = true; };
  }, []);

  // render loop
  useEffect(() => {
    const cA = canvasA.current, cB = canvasB.current;
    if (!cA || !cB) return;
    const ctxA = cA.getContext("2d"), ctxB = cB.getContext("2d");
    let raf;

    function drawCover(ctx, img, canvas) {
      const cw = canvas.width, ch = canvas.height;
      const arImg = img.width / img.height;
      const arCan = cw / ch;
      let dw, dh, dx, dy;
      if (arImg > arCan) { dh = ch; dw = ch * arImg; dx = -(dw - cw) / 2; dy = 0; }
      else { dw = cw; dh = cw / arImg; dx = 0; dy = -(dh - ch) / 2; }
      ctx.drawImage(img, dx, dy, dw, dh);
    }

    function loop(t) {
      if (paused) { raf = requestAnimationFrame(loop); return; }
      const ring = ringRef.current;
      if (!ring.length) { raf = requestAnimationFrame(loop); return; }

      if (!tRef.current.start) tRef.current.start = t;
      const alpha = Math.min(1, (t - tRef.current.start) / DURATION_MS);

      const i1 = idxRef.current % ring.length;
      const i2 = (idxRef.current + 1) % ring.length;

      ctxB.clearRect(0, 0, cB.width, cB.height);
      ctxA.clearRect(0, 0, cA.width, cA.height);
      drawCover(ctxB, ring[i1].img, cB);
      ctxA.globalAlpha = alpha;
      drawCover(ctxA, ring[i2].img, cA);
      ctxA.globalAlpha = 1;

      if (alpha >= 1) {
        idxRef.current = (idxRef.current + 1) % ring.length;
        tRef.current.start = t;
        setCaption(ring[i2].caption || "");
      }
      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  const handleSave = () => {
    const data = canvasA.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = data;
    a.download = "frame_capture.png";
    a.click();
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === "Space") { e.preventDefault(); setPaused(p => !p); }
      if (e.key === "s" || e.key === "S") handleSave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={{ position:"relative", width:"100%", height:"100vh", background:"#0E2148", color:"#E3D095" }}>
      <canvas ref={canvasB} width={1024} height={768} style={{ position:"absolute", inset:0, width:"100%", height:"100%" }} />
      <canvas ref={canvasA} width={1024} height={768} style={{ position:"absolute", inset:0, width:"100%", height:"100%" }} />

      <div style={{ position:"absolute", right:16, bottom:16, display:"flex", gap:8 }}>
        <button onClick={handleSave} style={btnStyle}>Save</button>
        <button onClick={() => setPaused(p=>!p)} style={btnStyle}>{paused ? "Play" : "Pause"}</button>
      </div>

      <div style={{ position:"absolute", right:0, top:0, width:320, height:"100%", background:"rgba(10,10,10,0.6)", padding:12, boxSizing:"border-box" }}>
        <h3 style={{ marginTop:0 }}>Info</h3>
        <div>Buffer: {bufferSize} frames</div>
        <div style={{ marginTop:12 }}><strong>Caption</strong><p>{caption}</p></div>
        <div style={{ marginTop:12 }}><em>Shortcuts:</em><div>Space = Pause, S = Save</div></div>
      </div>
    </div>
  );
}

const btnStyle = {
  background:"#7965C1", border:"none", color:"#fff",
  padding:"8px 12px", borderRadius:8, cursor:"pointer",
  fontWeight:"600", boxShadow:"0 4px 12px rgba(0,0,0,0.4)"
};
