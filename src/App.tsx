import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * App.tsx（manifest不要・命名規則だけで差し替え）— 撮影シーケンス調整版
 * - 入口URLは固定: https://nfc-photo-frame-secure.vercel.app/
 * - NFCの引数: ?ip=<IP名>&cara=<キャラID>
 * - 探すパス（存在すれば自動採用／無ければ内蔵にフォールバック）
 *   Character: /packs/<ip>/characters/<cara>.(png|webp|jpg|jpeg)
 *   Frame PNG: /packs/<ip>/frames/<frameId>_<aspect>.(png|webp)  ← 任意
 *   Voices   : /packs/<ip>/voice/{pre|shutter|post}.(mp3|ogg|wav) ← 任意
 *
 * 撮影手順（要求どおり）：
 * pre 再生 → 終了後カウントダウン → フラッシュ＆撮影＆shutter同時開始 →
 * shutter終了後 post 再生
 */

type Aspect = "3:4" | "1:1" | "16:9";
type FrameKind = "sparkle" | "ribbon" | "neon";

const ASPECTS: Aspect[] = ["3:4", "1:1", "16:9"];
const PROGRAM_FRAMES: { id: FrameKind; name: string }[] = [
  { id: "sparkle", name: "キラキラ・フレーム" },
  { id: "ribbon",  name: "リボン・フレーム"   },
  { id: "neon",    name: "ネオン・フレーム"   },
];

// 内蔵素材（src/assets）
const builtinCharacters = import.meta.glob("./assets/characters/*.{png,webp}", { eager: true, as: "url" }) as Record<string, string>;
const builtinVoices     = import.meta.glob("./assets/voice/*.{mp3,ogg,wav}",   { eager: true, as: "url" }) as Record<string, string>;
const builtinFramePNGs  = import.meta.glob("./assets/frames/*.{png,webp}",     { eager: true, as: "url" }) as Record<string, string>;

export default function App() {
  const params = new URLSearchParams(location.search);
  const ip   = params.get("ip")   ?? "default";
  const cara = params.get("cara") ?? ""; // 例: alice, bob, clear

  // 画面/カメラの初期設定（任意の追加クエリも可）
  const urlCamera = params.get("camera") === "back" ? "environment" : "user";
  const urlAspect = (params.get("aspect") as Aspect | null) ?? "3:4";
  const urlCd     = Number(params.get("cd") ?? 3);
  const urlGuide  = params.get("guide") === "1";

  // キャラURL（規則で探す → なければ内蔵）
  const [charUrl, setCharUrl] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cand = await pickExisting([
        `/packs/${ip}/characters/${cara}.png`,
        `/packs/${ip}/characters/${cara}.webp`,
        `/packs/${ip}/characters/${cara}.jpg`,
        `/packs/${ip}/characters/${cara}.jpeg`,
      ], "image");
      if (!cancelled && cand) { setCharUrl(cand); return; }
      // フォールバック（内蔵の最初）
      const firstBuiltin = Object.values(builtinCharacters)[0] ?? "";
      if (!cancelled) setCharUrl(firstBuiltin);
    })();
    return () => { cancelled = true; };
  }, [ip, cara]);

  // フレーム（プログラム描画3種）
  const [activeFrame, setActiveFrame] = useState<FrameKind>(PROGRAM_FRAMES[0].id);

  // その他UI状態
  const [aspect, setAspect] = useState<Aspect>(urlAspect);
  const [countdownSec, setCountdownSec] = useState(Math.max(0, isFinite(urlCd) ? urlCd : 3));
  const [showGuide, setShowGuide] = useState(urlGuide);
  const [sfxOn, setSfxOn] = useState(true);

  // 撮影状態/フラッシュ
  const [shooting, setShooting] = useState(false);
  const [flash, setFlash] = useState(false);

  // カメラ
  const [facing, setFacing] = useState<"user" | "environment">(urlCamera as any);
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef  = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [usingPlaceholder, setUsingPlaceholder] = useState(false);

  const stopStream = () => {
    const v = videoRef.current as any;
    const s: MediaStream | undefined = v?.srcObject;
    s?.getTracks?.().forEach(t => t.stop());
    if (v) v.srcObject = null;
  };

  const startStream = async (to: "user" | "environment") => {
    try {
      stopStream(); setReady(false); setUsingPlaceholder(false);
      const candidates: MediaStreamConstraints[] = to === "environment"
        ? [
            { video: { facingMode: { exact: "environment" } }, audio: false },
            { video: { facingMode: "environment" }, audio: false },
            { video: true, audio: false },
          ]
        : [
            { video: { facingMode: { exact: "user" } }, audio: false },
            { video: { facingMode: "user" }, audio: false },
            { video: true, audio: false },
          ];
      let stream: MediaStream | null = null;
      for (const c of candidates) { try { stream = await navigator.mediaDevices.getUserMedia(c); break; } catch {} }
      if (!stream) throw 0;
      if (videoRef.current) { (videoRef.current as any).srcObject = stream; await videoRef.current.play(); }
      setReady(true);
    } catch {
      setUsingPlaceholder(true);
      setReady(true);
    }
  };

  useEffect(() => { startStream(facing); return () => stopStream(); }, [facing]);

  // ステージサイズ
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const el = stageRef.current; if (!el) return;
      setStageSize({ w: el.clientWidth, h: el.clientHeight });
    });
    if (stageRef.current) ro.observe(stageRef.current);
    return () => ro.disconnect();
  }, []);

  // キャラの変形（ドラッグ/ピンチ）
  const [cx, setCx] = useState(0);
  const [cy, setCy] = useState(0);
  const [scale, setScale] = useState(1);
  const [rot, setRot] = useState(0);
  const baseWidthRatio = 0.5;
  const [isGesturing, setIsGesturing] = useState(false);
  const pointers = useRef<Map<number, {x:number;y:number}>>(new Map());
  const gestureStart = useRef<{ d:number;a:number;scale:number;rot:number;cx:number;cy:number }|null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if (pointers.current.size === 2) {
      const ps = Array.from(pointers.current.values());
      gestureStart.current = { d: dist(ps[0], ps[1]), a: angle(ps[0], ps[1]), scale, rot, cx, cy };
      setIsGesturing(true);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;

    // 1) 前回座標（prev）を先に読む
    const prev = pointers.current.get(e.pointerId)!;
    const curr = { x: e.clientX, y: e.clientY };

    // 2) 現在の全ポインタ配列（動いている指だけ curr に置き換えて計算）
    const entries = Array.from(pointers.current.entries());
    const ps = entries.map(([id, pos]) => (id === e.pointerId ? curr : pos));

    if (ps.length === 2 && gestureStart.current) {
      const d = dist(ps[0], ps[1]);
      const a = angle(ps[0], ps[1]);
      const g0 = gestureStart.current;

      setScale(clamp(g0.scale * (d / g0.d), 0.3, 4));
      let delta = a - g0.a; delta = ((delta + 180) % 360) - 180;
      setRot(g0.rot + delta);

      const midNow   = midpoint(ps[0], ps[1]);
      const midStart = { x: g0.cx, y: g0.cy };
      setCx(g0.cx + (midNow.x - midStart.x));
      setCy(g0.cy + (midNow.y - midStart.y));
    } else if (pointers.current.size === 1 && !isGesturing) {
      // 単指ドラッグ
      setCx(v => v + (curr.x - prev.x));
      setCy(v => v + (curr.y - prev.y));
    }

    // 3) 最後に現在座標で保存
    pointers.current.set(e.pointerId, curr);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) {
      gestureStart.current = null;
      setIsGesturing(false);
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      setScale(s => clamp(s * (e.deltaY < 0 ? 1.06 : 0.94), 0.3, 4));
    } else if (e.shiftKey) {
      e.preventDefault();
      setRot(r => r + (e.deltaY < 0 ? 2 : -2));
    }
  };

  const resetChar = () => { setCx(0); setCy(0); setScale(1); setRot(0); };

  // ==== 音声ユーティリティ ====
  const playBeep = async () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = "triangle"; o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.2);
    } catch {}
  };

  // 終了(onended)まで待つ版
  const playAndWait = async (url?: string) => {
    if (!url) return;
    await new Promise<void>((resolve) => {
      try {
        const a = new Audio(url);
        a.onended = () => resolve();
        a.onerror = () => resolve();
        a.play().catch(() => resolve());
      } catch {
        resolve();
      }
    });
  };

  const playBeepAndWait = async () => {
    await new Promise<void>((resolve) => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = "triangle"; o.frequency.setValueAtTime(880, ctx.currentTime);
        g.gain.setValueAtTime(0.001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
        o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.2);
        setTimeout(resolve, 210);
      } catch { resolve(); }
    });
  };

  const pickVoice = async (name: "pre" | "shutter" | "post") => {
    const cand = await pickExisting([
      `/packs/${ip}/voice/${name}.mp3`,
      `/packs/${ip}/voice/${name}.ogg`,
      `/packs/${ip}/voice/${name}.wav`,
    ], "audio");
    if (cand) return cand;
    // 内蔵から類推
    const re = name === "pre" ? /pre/i : name === "post" ? /post|after|yay/i : /shutter|shot|camera/i;
    return Object.values(builtinVoices).find(u => re.test(u));
  };

  // 撮影
  const [shots, setShots] = useState<{ url: string; ts: number }[]>([]);
  const [countdown, setCountdown] = useState(0);

  const doCapture = async () => {
    if (shooting) return;
    setShooting(true);
    try {
      // (1) pre を先に再生し、終わるまで待機
      let preUrl: string | undefined;
      let shutterUrl: string | undefined;
      let postUrl: string | undefined;
      if (sfxOn) {
        preUrl     = await pickVoice("pre");
        shutterUrl = await pickVoice("shutter");
        postUrl    = await pickVoice("post");
        if (preUrl) await playAndWait(preUrl);
      }

      // (2) カウントダウン（1秒刻み）
      for (let i = countdownSec; i >= 1; i--) {
        setCountdown(i);
	  await playBeepAndWait();   // ← 追加（0.2秒ビープ）
	  await wait(800);           // 合計ほぼ1秒になるよう調整
      }
      setCountdown(0);

      // (3) フラッシュ & 撮影 & shutter を同時にスタート
      setFlash(true);
	navigator.vibrate?.(60);     // ← 追加（対応端末なら振動）
      setTimeout(() => setFlash(false), 120);

      // shutterは同時に再生開始し、後で終了待機
      const shutterPromise = sfxOn
        ? (shutterUrl ? playAndWait(shutterUrl) : playBeepAndWait())
        : Promise.resolve();

      // ---- 撮影処理 ----
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const [w, h] = aspect === "1:1" ? [1000, 1000] : aspect === "16:9" ? [1280, 720] : [900, 1200];
      canvas.width = w; canvas.height = h;

      if (!usingPlaceholder && videoRef.current && (videoRef.current as any).videoWidth) {
        const vw = (videoRef.current as any).videoWidth;
        const vh = (videoRef.current as any).videoHeight;
        const s  = Math.max(w / vw, h / vh);
        const dw = vw * s, dh = vh * s;
        const dx = (w - dw) / 2, dy = (h - dh) / 2;
        const mirror = facing === "user";
        if (mirror) {
          ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1);
          ctx.drawImage(videoRef.current!, w - dx - dw, dy, dw, dh);
          ctx.restore();
        } else {
          ctx.drawImage(videoRef.current!, dx, dy, dw, dh);
        }
      } else {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, "#6ee7b7"); g.addColorStop(1, "#93c5fd");
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      }

      // キャラ
      if (charUrl && stageRef.current) {
        const stageW = stageSize.w, stageH = stageSize.h;
        const ratio  = stageW && stageH ? w / stageW : 1;
        const baseW  = Math.min(stageW * 0.5, 380);
        const drawW  = baseW * scale * ratio;
        const img    = await loadImage(charUrl);
        const drawH  = (img.naturalHeight / img.naturalWidth) * drawW;
        const centerX = (stageW / 2 + cx) * ratio;
        const centerY = (stageH / 2 + cy) * ratio;
        ctx.save(); ctx.translate(centerX, centerY); ctx.rotate((rot * Math.PI) / 180);
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH); ctx.restore();
      }

      // フレーム
      const key = `${activeFrame}_${aspect.replace(":", "x")}`;
      const overlay = await pickExisting([
        `/packs/${ip}/frames/${key}.png`,
        `/packs/${ip}/frames/${key}.webp`,
      ], "image");
      if (overlay) {
        const img = await loadImage(overlay);
        ctx.drawImage(img, 0, 0, w, h);
      } else {
        const builtin = Object.entries(builtinFramePNGs).find(([p]) => fileBase(p) === key)?.[1];
        if (builtin) {
          const img = await loadImage(builtin);
          ctx.drawImage(img, 0, 0, w, h);
        } else {
          drawProgramFrame(ctx, activeFrame, w, h);
        }
      }

      const dataUrl = canvas.toDataURL("image/png");
      setShots(prev => [{ url: dataUrl, ts: Date.now() }, ...prev].slice(0, 12));
      // ---- 撮影ここまで ----

      // (4) shutterの終了待ち
      await shutterPromise;

      // (5) shutterが終わってから post を再生
      if (sfxOn && postUrl) {
        await playAndWait(postUrl);
      }
    } finally {
      setShooting(false);
    }
  };

  // プレビュー用フレーム（非同期でロード）
  const [previewOverlay, setPreviewOverlay] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = `${activeFrame}_${aspect.replace(":", "x")}`;
      const cand = await pickExisting([
        `/packs/${ip}/frames/${key}.png`,
        `/packs/${ip}/frames/${key}.webp`,
      ], "image");
      if (!cancelled) {
        if (cand) setPreviewOverlay(cand);
        else {
          const builtin = Object.entries(builtinFramePNGs).find(([p]) => fileBase(p) === key)?.[1];
          setPreviewOverlay(builtin ?? null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [ip, activeFrame, aspect]);

  // UI
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white p-4 sm:p-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <motion.div className="bg-slate-800/60 rounded-2xl p-5 sm:p-6 shadow-xl border border-white/10" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">NFC×Web その場でフォトフレーム</h1>
          <p className="text-slate-300 mb-4">
            固定URL + <span className="font-mono">?ip</span>/<span className="font-mono">?cara</span> のみで素材を切替（manifest不要）<br/>
            例：<span className="font-mono">?ip=anime1&cara=alice</span>
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-3">
            <select value={activeFrame} onChange={(e)=>setActiveFrame(e.target.value as FrameKind)} className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2">
              {PROGRAM_FRAMES.map(f => (<option key={f.id} value={f.id}>{f.name}</option>))}
            </select>

            <select value={aspect} onChange={(e)=>setAspect(e.target.value as Aspect)} className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2">
              {ASPECTS.map(a => (<option key={a} value={a}>{a}（{a==="3:4"?"スマホ向け":a==="1:1"?"SNS向け":"横長"}）</option>))}
            </select>

            <button onClick={()=>setFacing(p=>p==="user"?"environment":"user")} className="rounded-2xl px-3 py-2 bg-slate-700 hover:bg-slate-600">
              カメラ切替（今：{facing==="user"?"自撮り":"背面"}）
            </button>

            <select value={countdownSec} onChange={(e)=>setCountdownSec(Number(e.target.value))} className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2">
              {[0,1,3,5].map(s => (<option key={s} value={s}>{s}秒</option>))}
            </select>

            <button onClick={()=>setShowGuide(v=>!v)} className="rounded-2xl px-3 py-2 bg-slate-700 hover:bg-slate-600">
              ガイド{showGuide?"ON":"OFF"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-3">
            <button onClick={resetChar} className="rounded-2xl px-3 py-2 bg-slate-700 hover:bg-slate-600">位置リセット</button>
            <button onClick={()=>setSfxOn(v=>!v)} className={"rounded-2xl px-3 py-2 font-semibold "+(sfxOn?"bg-emerald-500 hover:bg-emerald-400":"bg-slate-700 hover:bg-slate-600")}>
              セリフ/効果音{ sfxOn ? "ON" : "OFF"}
            </button>
            <button
              disabled={shooting}
              onClick={doCapture}
              className={"rounded-2xl px-4 py-2 font-semibold shadow " + (shooting ? "bg-slate-600 cursor-not-allowed" : "bg-emerald-500 hover:bg-emerald-400")}
            >
              {shooting ? "撮影中…" : "撮影する"}
            </button>
            <span className="text-slate-300 text-sm">{usingPlaceholder ? "※プレビューはダミー背景です" : ready ? "カメラ準備OK" : "準備中…"}</span>
          </div>
        </motion.div>

        <motion.div className="bg-slate-800/60 rounded-2xl p-4 sm:p-6 shadow-xl border border-white/10" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}>
          <div ref={stageRef} className="relative w-full overflow-hidden rounded-3xl bg-black select-none" style={{ aspectRatio: aspect.replace(":", "/") }}>
            {!usingPlaceholder ? (
              <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" style={{ transform: facing==="user" ? "scaleX(-1)" : "none" }} />
            ) : (
              <div className="absolute inset-0 h-full w-full bg-gradient-to-br from-emerald-300 to-sky-300 grid place-items-center">
                <div className="text-black/70 font-semibold text-lg">(カメラ権限なしのためダミー表示)</div>
              </div>
            )}

            {/* キャラクター（ドラッグ/ピンチ回転/拡大縮小） */}
            {charUrl && (
              <img
                src={charUrl}
                alt="character"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onWheel={onWheel}
                className="absolute top-1/2 left-1/2"
                style={{
                  touchAction: "none",
                  userSelect: "none",
                  width: `min(${baseWidthRatio * 100}%, 380px)`,
                  transform: `translate(calc(-50% + ${cx}px), calc(-50% + ${cy}px)) rotate(${rot}deg) scale(${scale})`,
                }}
                draggable={false}
              />
            )}

            {/* フレーム（プレビュー） */}
            {previewOverlay ? (
              <img src={previewOverlay} alt="frame" className="pointer-events-none absolute inset-0 w-full h-full object-contain" />
            ) : (
              <ProgramFrameOverlay active={activeFrame} />
            )}

            {/* ガイド */}
            {showGuide && (
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                {Array.from({ length: 9 }).map((_, i) => (<div key={i} className="border border-white/20" />))}
                <div className="absolute inset-0 border-2 border-white/30 rounded-xl" />
              </div>
            )}

            {/* 撮影音に合わせたフラッシュ */}
            {flash && (
              <motion.div
                key="flash"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.12 }}
                className="absolute inset-0 bg-white/80 pointer-events-none"
              />
            )}

            {/* カウントダウン */}
            {countdown > 0 && (
              <div className="absolute inset-0 grid place-items-center">
                <motion.div
                  key={countdown}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1.2, opacity: 1 }}
                  className="bg-black/40 rounded-full w-28 h-28 grid place-items-center border border-white/30"
                >
                  <div className="text-5xl font-black">{countdown}</div>
                </motion.div>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {/* サムネイル */}
          {shots.length > 0 && (
            <div className="mt-5">
              <h3 className="font-semibold mb-2">保存候補（直近12件）</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {shots.map((s, i) => (
                  <a key={s.ts + i} href={s.url} download={`oshi_photo_${s.ts}.png`} className="group block">
                    <img src={s.url} alt="snapshot" className="w-full h-40 object-cover rounded-xl border border-white/10 group-hover:opacity-90" />
                    <div className="text-xs text-slate-300 mt-1">tapで保存</div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

/* -------- フレーム（プログラム描画） -------- */
function ProgramFrameOverlay({ active }: { active: FrameKind }) {
  if (active === "sparkle") {
    return (
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-2 rounded-2xl border-[6px] border-white/70 shadow-[0_0_40px_rgba(255,255,255,0.35)]" />
      </div>
    );
  }
  if (active === "ribbon") {
    return (
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-3 rounded-3xl border-8 border-pink-300/80" />
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-pink-400 text-white text-xs px-4 py-2 rounded-full shadow-lg">
          With ❤️ from Oshi
        </div>
      </div>
    );
  }
  if (active === "neon") {
    return (
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-4 rounded-2xl" style={{ boxShadow: "0 0 12px rgba(0,255,255,0.8), inset 0 0 24px rgba(0,255,255,0.35)" }} />
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-xl font-bold text-white" style={{ background: "linear-gradient(90deg, rgba(0,255,255,0.5), rgba(255,0,255,0.5))", textShadow: "0 2px 8px rgba(0,0,0,0.6)" }}>
          Oshi Camera
        </div>
      </div>
    );
  }
  return null;
}

function drawProgramFrame(ctx: CanvasRenderingContext2D, active: FrameKind, w: number, h: number) {
  switch (active) {
    case "sparkle":
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 18; ctx.strokeRect(16, 16, w - 32, h - 32); break;
    case "ribbon":
      ctx.strokeStyle = "rgba(244,114,182,0.9)"; ctx.lineWidth = 24; ctx.strokeRect(20, 20, w - 40, h - 40);
      ctx.fillStyle = "rgba(244,114,182,1)"; const rw = Math.min(300, w * 0.45); ctx.fillRect((w - rw) / 2, 8, rw, 56);
      ctx.fillStyle = "white"; ctx.font = "bold 28px system-ui"; ctx.textAlign = "center"; ctx.fillText("With ❤️ from Oshi", w / 2, 45); break;
    case "neon":
      ctx.strokeStyle = "rgba(0,255,255,0.8)"; (ctx as any).shadowColor = "rgba(0,255,255,0.6)"; (ctx as any).shadowBlur = 25;
      ctx.lineWidth = 16; ctx.strokeRect(26, 26, w - 52, h - 52); (ctx as any).shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.95)"; ctx.font = "bold 38px system-ui"; ctx.textAlign = "center"; ctx.fillText("Oshi Camera", w / 2, h - 32); break;
  }
}

/* -------- ヘルパ -------- */
function wait(ms:number){ return new Promise(r=>setTimeout(r,ms)); }
function clamp(v:number,min:number,max:number){ return Math.max(min, Math.min(max, v)); }
function dist(a:{x:number;y:number}, b:{x:number;y:number}){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }
function angle(a:{x:number;y:number}, b:{x:number;y:number}){ const rad=Math.atan2(b.y-a.y, b.x-a.x); return rad*180/Math.PI; }
function midpoint(a:{x:number;y:number}, b:{x:number;y:number}){ return {x:(a.x+b.x)/2, y:(a.y+b.y)/2}; }
function fileBase(path:string){ return path.split("/").pop()!.replace(/\.[^.]+$/,""); }

async function loadImage(url:string){
  return await new Promise<HTMLImageElement>((resolve,reject)=>{
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** 存在する最初のURLを返す。typeが'image'ならImageで確認、'audio'ならfetch HEAD。 */
async function pickExisting(candidates:string[], type:"image"|"audio"): Promise<string|undefined>{
  for (const url of candidates){
    try {
      if (type==="image"){ await loadImage(url); return url; }
      else {
        const res = await fetch(url, { method:"HEAD" });
        if (res.ok) return url;
      }
    } catch {}
  }
  return undefined;
}
