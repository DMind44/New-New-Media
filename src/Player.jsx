// electron-app/renderer/src/Player.jsx
import React, { useEffect, useRef, useState } from "react";

export default function Player() {
  const canvasA = useRef(null);
  const canvasB = useRef(null);
  const wsRef = useRef(null);
  const ringRef = useRef([]);
  const [paused, setPaused] = useState(false);
  const [caption, setCaption] = useState("");
  const [bufferSize, setBufferSize] = useState(0);
  const idxRef = useRef(0);
  const tRef = useRef({ start: null });

  useEffect(() => {
    // Connect to the mock generator (base64 frames)
    const ws = new WebSocket("ws://127.0.0.1:8765");
    wsRef.current = ws;
    ws.onopen = () => console.log("WS connected");
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "new_frame") {
          const img = new Image();
          // Prefer base64 data URL sent by the generator
          if (msg.data) {
            img.src = msg.data; // e.g., "data:image/jpeg;base64,..."
          } else if (msg.path) {
            // Fallback for older server versions that send file paths
            const toFileURL = (p) => {
              let u = (p || "").replace(/\\/g, "/");
              if (!u.startsWith("file://")) {
                if (/^[A-Za-z]:/.test(u)) u = "file:///" + u; // Windows drive letter
                else u = "file://" + u;
              }
              return u;
            };
            img.src = toFileURL(msg.path);
          }
          img.onload = () => {
            ringRef.current.push(img);
            if (ringRef.current.length > 300) ringRef.current.shift();
            setBufferSize(ringRef.current.length);
          };
        } else if (msg.type === "explain_result") {
          setCaption(msg.caption || "");
        }
      } catch (e) {
        console.warn("WS message parse failed", e);
      }
    };
    ws.onclose = () => console.log("WS closed");
    return () => ws.close();
  }, []);

  useEffect(() => {
    const cA = canvasA.current;
    const cB = canvasB.current;
    if (!cA || !cB) return;
    const ctxA = cA.getContext("2d");
    const ctxB = cB.getContext("2d");
    const duration = 2000; // 2s crossfade
    let raf;

    function render(t) {
      if (paused) {
        raf = requestAnimationFrame(render);
        return;
      }
      if (!tRef.current.start) tRef.current.start = t;
      const elapsed = t - tRef.current.start;
      const alpha = Math.min(1, elapsed / duration);
      const buf = ringRef.current;

      if (buf.length > 0) {
        const i1 = idxRef.current % buf.length;
        const i2 = (idxRef.current + 1) % buf.length;

        // clear and draw base & overlay
        ctxB.clearRect(0, 0, cB.width, cB.height);
        ctxA.clearRect(0, 0, cA.width, cA.height);
        drawCover(ctxB, buf[i1], cB);
        ctxA.globalAlpha = alpha;
        drawCover(ctxA, buf[i2], cA);
        ctxA.globalAlpha = 1;

        // advance frame when crossfade completes
        if (alpha >= 1) {
          idxRef.current = (idxRef.current + 1) % buf.length;
          tRef.current.start = t;
        }
      }
      raf = requestAnimationFrame(render);
    }

    function drawCover(ctx, img, canvas) {
      const cw = canvas.width, ch = canvas.height;
      const arImg = img.width / img.height;
      const arCan = cw / ch;
      let drawW, drawH, dx, dy;
      if (arImg > arCan) {
        drawH = ch;
        drawW = ch * arImg;
        dx = -(drawW - cw) / 2;
        dy = 0;
      } else {
        drawW = cw;
        drawH = cw / arImg;
        dx = 0;
        dy = -(drawH - ch) / 2;
      }
      ctx.drawImage(img, dx, dy, drawW, drawH);
    }

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, [paused]);

  const handlePause = () => setPaused((p) => !p);

  const handleExplain = () => {
    const buf = ringRef.current;
    if (!wsRef.current || buf.length === 0) return;
    const i = idxRef.current % buf.length;
    const img = buf[i];
    // For explain, we still send the original path if provided by the server
    // Fallback: no path needed; server can ignore or return generic text
    try {
      wsRef.current.send(
        JSON.stringify({
          cmd: "explain",
          // In base64 mode, generator also sent an original path alongside data URL
          path: img.__srcPath || "" // we optionally stash it if needed
        })
      );
    } catch (e) {
      console.warn("Explain send failed", e);
    }
  };

  const handleSave = () => {
    const cA = canvasA.current;
    if (!cA) return;
    const data = cA.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = data;
    a.download = "frame_capture.png";
    a.click();
  };

  // (Optional) Stash original path onto the Image object when we load via file path
  // If you want to use this, modify the onmessage path branch above:
  //   img.__srcPath = msg.path;

  useEffect(() => {
    function onKey(e) {
      if (e.code === "Space") {
        e.preventDefault();
        handlePause();
      }
      if (e.key === "e" || e.key === "E") {
        handleExplain();
      }
      if (e.key === "s" || e.key === "S") {
        handleSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
      <canvas
        ref={canvasB}
        width={1024}
        height={768}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <canvas
        ref={canvasA}
        width={1024}
        height={768}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      {/* Controls */}
      <div style={{ position: "absolute", right: 16, bottom: 16, display: "flex", gap: 8 }}>
        <button onClick={handleSave} title="Save current frame" style={btnStyle}>
          Save
        </button>
        <button onClick={handleExplain} title="Explain image" style={btnStyle}>
          Explain
        </button>
        <button onClick={handlePause} title="Pause/Resume" style={btnStyle}>
          {paused ? "Play" : "Pause"}
        </button>
      </div>
      {/* Sidebar */}
      <div
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: 320,
          height: "100%",
          background: "rgba(10,10,10,0.6)",
          color: "#E3D095",
          padding: 12,
          boxSizing: "border-box",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Info</h3>
        <div>Buffer: {bufferSize} frames</div>
        <div style={{ marginTop: 12 }}>
          <strong>Caption</strong>
          <p>{caption}</p>
        </div>
        <div style={{ marginTop: 12 }}>
          <em>Shortcuts:</em>
          <div>Space = Pause, E = Explain, S = Save</div>
        </div>
      </div>
    </div>
  );
}

const btnStyle = {
  background: "#7965C1",
  border: "none",
  color: "#fff",
  padding: "8px 12px",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: "600",
  boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
};

