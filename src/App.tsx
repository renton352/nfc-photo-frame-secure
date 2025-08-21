import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

type Snapshot = { url: string; ts: number; blob?: Blob };

const frames = [
  { id: "sparkle", name: "キラキラ・フレーム" },
  { id: "ribbon",  name: "リボン・フレーム"   },
  { id: "neon",    name: "ネオン・フレーム"   },
];

const SETTINGS_KEY = "oshi.camera.settings.v1";

// ===== 音源（Vite解決） =====
const VOICE_PRE_URL     = new URL("./assets/voice/voice_pre.mp3",     import.meta.url).href;
const VOICE_POST_URL    = new URL("./assets/voice/voice_post.mp3",    import.meta.url).href;
const VOICE_SHUTTER_URL = new URL("./assets/voice/voice_shutter.mp3", import.meta.url).href; // シャッターSFX兼フォールバック

// ===== PNGフレームのマッピング（src/assets/frames/） =====
const FRAME_SRC: Record<string, Record<"3:4"|"1:1"|"16:9", string>> = {
  sparkle: {
    "3:4":  new URL("./assets/frames/sparkle_3x4.png",  import.meta.url).href,
    "1:1":  new URL("./assets/frames/sparkle_1x1.png",  import.meta.url).href,
    "16:9": new URL("./assets/frames/sparkle_16x9.png", import.meta.url).href,
  },
  ribbon: {
    "3:4":  new URL("./assets/frames/ribbon_3x4.png",   import.meta.url).href,
    "1:1":  new URL("./assets/frames/ribbon_1x1.png",   import.meta.url).href,
    "16:9": new URL("./assets/frames/ribbon_16x9.png",  import.meta.url).href,
  },
  neon: {
    "3:4":  new URL("./assets/frames/neon_3x4.png",     import.meta.url).href,
    "1:1":  new URL("./assets/frames/neon_1x1.png",     import.meta.url).href,
    "16:9": new URL("./assets/frames/neon_16x9.png",    import.meta.url).href,
  },
};
const getOverlaySrc = (frameId: string, aspect: "3:4"|"1:1"|"16:9") =>
  FRAME_SRC[frameId]?.[aspect];

// ===== キャラ画像のマッピング（src/assets/characters/） =====
const CHAR_SRC: Record<"star"|"cat"|"robot", string> = {
  star:  new URL("./assets/characters/chara_star.png",  import.meta.url).href,
  cat:   new URL("./assets/characters/chara_cat.png",   import.meta.url).href,
  robot: new URL("./assets/characters/chara_robot.png", import.meta.url).href,
};

type Settings = {
  activeFrame: string;
  aspect: "3:4" | "1:1" | "16:9";
  facing: "user" | "environment";
  guideOn: boolean;
  shutterSoundOn: boolean;
  timerSec: 0 | 3 | 5;

  // ▼ キャラ設定（保存対象）
  activeChar?: "none"|"star"|"cat"|"robot";
  charX?: number;        // 位置X (0–100 %)
  charY?: number;        // 位置Y (0–100 %)
  charScale?: number;    // スケール（画面幅比）
  charAngle?: number;    // 角度（deg, -180〜180）
};

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null); // プレビュー領域
  const voicePreRef = useRef<HTMLAudioElement | null>(null);
  const voicePostRef = useRef<HTMLAudioElement | null>(null);
  const voiceShutterRef = useRef<HTMLAudioElement | null>(null); // シャッターSFX
  const params = useMemo(() => new URLSearchParams(location.search), []);

  // URLパラメータ or 保存値 or 既定
  const saved: Partial<Settings> = useMemo(() => {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
    catch { return {}; }
  }, []);

  const initialFrame = (params.get("frame") || saved.activeFrame || frames[0].id) as string;
  const initialAspect = (params.get("aspect") || saved.aspect || "3:4") as Settings["aspect"];
  const initialFacing = (saved.facing || "user") as Settings["facing"];
  const initialTimer = (Number(params.get("timer")) || saved.timerSec || 3) as Settings["timerSec"];

  // ==== 既存のUI状態 ====
  const [ready, setReady] = useState(false);
  const [usingPlaceholder, setUsingPlaceholder] = useState(false);
  const [activeFrame, setActiveFrame] = useState(initialFrame);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [countdown, setCountdown] = useState(0);
  const [aspect, setAspect] = useState<Settings["aspect"]>(initialAspect);
  const [facing, setFacing] = useState<Settings["facing"]>(initialFacing);
  const [guideOn, setGuideOn] = useState<boolean>(saved.guideOn ?? false);
  const [shutterSoundOn, setShutterSoundOn] = useState<boolean>(saved.shutterSoundOn ?? true);
  const [timerSec, setTimerSec] = useState<Settings["timerSec"]>(initialTimer);
  const [flashOn, setFlashOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const isMirror = facing === "user";

  // ==== キャラ編集状態（常時編集モード） ====
  const [activeChar, setActiveChar]   = useState<"none"|"star"|"cat"|"robot">(saved.activeChar ?? "star");
  const [charX, setCharX]             = useState<number>(saved.charX ?? 50);      // %
  const [charY, setCharY]             = useState<number>(saved.charY ?? 74);      // %
  const [charScale, setCharScale]     = useState<number>(saved.charScale ?? 0.42); // 画面幅の比
  const [charAngle, setCharAngle]     = useState<number>(saved.charAngle ?? 0);   // deg

  // 編集ジェスチャー用の一時値
  const pointersRef = useRef<Map<number, {x:number,y:number}>>(new Map());
  const dragStartRef = useRef<{x:number,y:number,charX:number,charY:number} | null>(null);
  const pinchStartRef = useRef<{
    dist:number, angle:number, mid:{x:number,y:number},
    scale:number, rotation:number
  } | null>(null);

  // ---- 設定保存 ----
  useEffect(() => {
    const s: Settings = {
      activeFrame, aspect, facing, guideOn, shutterSoundOn, timerSec,
      activeChar, charX, charY, charScale, charAngle,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  }, [activeFrame, aspect, facing, guideOn, shutterSoundOn, timerSec, activeChar, charX, charY, charScale, charAngle]);

  // ---- カメラ制御 ----
  const stopStream = () => {
    const v = videoRef.current as any;
    const stream: MediaStream | undefined = v?.srcObject;
    stream?.getTracks?.().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    setTorchOn(false);
    setTorchSupported(false);
  };

  const startStream = async (to: "user" | "environment") => {
    try {
      stopStream();
      setReady(false);
      setUsingPlaceholder(false);

      const candidates: MediaStreamConstraints[] =
        to === "environment"
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
      for (const c of candidates) {
        try { stream = await navigator.mediaDevices.getUserMedia(c); break; }
        catch {}
      }
      if (!stream) throw new Error("no stream");

      if (videoRef.current) {
        (videoRef.current as any).srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);

      const track = stream.getVideoTracks?.()[0];
      const caps = (track?.getCapabilities?.() as any) || {};
      if (caps && "torch" in caps) setTorchSupported(true);
    } catch {
      setUsingPlaceholder(true);
      setReady(true);
    }
  };

  useEffect(() => {
    startStream(facing);
    return () => stopStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  const applyTorch = async (on: boolean) => {
    try {
      const stream: MediaStream | undefined = (videoRef.current as any)?.srcObject;
      const track = stream?.getVideoTracks?.()[0];
      const caps = (track?.getCapabilities?.() as any) || {};
      if (!track || !("torch" in caps)) return;
      await track.applyConstraints({ advanced: [{ torch: on }] as any });
      setTorchOn(on);
    } catch {}
  };

  // ====== 再生ヘルパー群 ======
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // iOS対策：ユーザー操作直後に“無音ワンプレイ”して解錠
  const primeAudio = async (el: HTMLAudioElement | null) => {
    if (!el) return;
    try {
      el.muted = true;
      el.currentTime = 0;
      await el.play();
      await sleep(50);
      el.pause();
      el.currentTime = 0;
    } catch {} finally {
      el.muted = false;
    }
  };

  /** 音声再生（必要なら終了まで/または上限msまで待つ） */
  const playVoice = async (
    el: HTMLAudioElement | null,
    opts: { waitEnd?: boolean; maxWaitMs?: number } = {}
  ) => {
    if (!el) return false;

    try { el.pause(); } catch {}
    el.currentTime = 0;
    el.volume = 1.0;

    const NO_SOURCE = 3 as number;
    if ((el as any).error || el.networkState === NO_SOURCE) {
      try { el.src = VOICE_SHUTTER_URL; el.load(); } catch {}
    }

    if (!Number.isFinite(el.duration) || el.duration <= 0) {
      await new Promise<void>((res) => {
        let done = false;
        const finish = () => { if (!done) { done = true; res(); } };
        el.addEventListener("loadedmetadata", finish, { once: true });
        el.addEventListener("canplaythrough", finish, { once: true });
        setTimeout(finish, 700);
      });
    }

    try {
      await el.play();

      if (opts.waitEnd) {
        const remainMs = Number.isFinite(el.duration)
          ? Math.max(0, (el.duration - el.currentTime) * 1000)
          : 900;

        const waitMs = opts.maxWaitMs
          ? Math.min(remainMs + 120, opts.maxWaitMs)
          : (remainMs + 120);

        let ended = false;
        const endedP = new Promise<void>((res) =>
          el.addEventListener("ended", () => { ended = true; res(); }, { once: true })
        );

        await Promise.race([endedP, sleep(waitMs)]);

        if (!ended && opts.maxWaitMs) {
          try { el.pause(); } catch {}
        }
      }
      return true;
    } catch {
      try {
        if (el.src !== VOICE_SHUTTER_URL) {
          el.src = VOICE_SHUTTER_URL; el.load(); await el.play();
          if (opts.waitEnd) {
            const ms = Number.isFinite(el.duration)
              ? Math.max(0, (el.duration - el.currentTime) * 1000) + 120
              : 900;
            const waitMs = opts.maxWaitMs ? Math.min(ms, opts.maxWaitMs) : ms;

            let ended = false;
            const endedP = new Promise<void>((res) =>
              el.addEventListener("ended", () => { ended = true; res(); }, { once: true })
            );
            await Promise.race([endedP, sleep(waitMs)]);
            if (!ended && opts.maxWaitMs) { try { el.pause(); } catch {} }
          }
          return true;
        }
      } catch {}

      // 最後の手段：短いビープ
      try {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        const ctx = new AC();
        if (ctx.state !== "running") await ctx.resume();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square"; o.frequency.value = 1100;
        g.gain.value = 0.12; o.connect(g); g.connect(ctx.destination);
        o.start();
        const BEEP_MS = 180;
        const limit = opts.maxWaitMs ?? BEEP_MS;
        await sleep(Math.min(BEEP_MS, limit));
        setTimeout(() => { o.stop(); ctx.close(); }, BEEP_MS);
      } catch {}
      return false;
    }
  };

  // ====== 便利関数 ======
  const clamp = (v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
  const normAngle = (deg:number) => {
    let d = deg;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  };

  // ====== Canvas 保存 ======
  const drawAndSave = async (): Promise<Snapshot> => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const [w, h] = aspect === "1:1" ? [900, 900] : aspect === "16:9" ? [1280, 720] : [900, 1200];
    canvas.width = w; canvas.height = h;

    if (!usingPlaceholder && videoRef.current && (videoRef.current as any).videoWidth) {
      const vw = (videoRef.current as any).videoWidth;
      const vh = (videoRef.current as any).videoHeight;
      const scale = Math.max(w / vw, h / vh);
      const dw = vw * scale; const dh = vh * scale;
      const dx = (w - dw) / 2; const dy = (h - dh) / 2;

      if (isMirror) {
        ctx.save(); ctx.translate(w, 0); ctx.scale(-1, 1);
        ctx.drawImage(videoRef.current!, w - dx - dw, dy, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(videoRef.current!, dx, dy, dw, dh);
      }
    } else {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, "#6ee7b7"); grad.addColorStop(1, "#93c5fd");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.font = "bold 48px system-ui"; ctx.textAlign = "center";
      ctx.fillText("(Camera preview placeholder)", w / 2, h / 2);
    }

    // ① キャラ合成（フレームより下）
    try {
      if (activeChar !== "none") {
        const src = CHAR_SRC[activeChar];
        if (src) {
          const ch = new Image();
          ch.src = src;
          await new Promise<void>((ok) => { ch.onload = () => ok(); ch.onerror = () => ok(); });
          const drawW = w * charScale;
          const drawH = drawW * (ch.height / ch.width);
          const cx = (charX / 100) * w;
          const cy = (charY / 100) * h;
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((charAngle * Math.PI) / 180);
          ctx.drawImage(ch, -drawW/2, -drawH/2, drawW, drawH);
          ctx.restore();
        }
      }
    } catch {}

    // ② PNGフレーム合成（最前面）
    try {
      const src = getOverlaySrc(activeFrame, aspect);
      if (src) {
        const overlay = new Image();
        overlay.src = src;
        await new Promise<void>((ok) => {
          overlay.onload = () => ok();
          overlay.onerror = () => ok();
        });
        ctx.drawImage(overlay, 0, 0, w, h);
      }
    } catch {}

    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), "image/png")
    );
    const url = URL.createObjectURL(blob);
    const shot: Snapshot = { url, ts: Date.now(), blob };
    setSnapshots((prev) => [shot, ...prev].slice(0, 12));
    return shot;
  };

  // —— シーケンス —— 前セリフ → カウントダウン → フラッシュ＆保存(＋同時シャッター) → 後セリフ
  const doCapture = async () => {
    await primeAudio(voiceShutterRef.current);
    await primeAudio(voicePostRef.current);

    await playVoice(voicePreRef.current, { waitEnd: true, maxWaitMs: 3000 });

    if (timerSec > 0) {
      for (let i = timerSec; i >= 1; i--) {
        setCountdown(i);
        await new Promise((r) => setTimeout(r, 1000));
      }
      setCountdown(0);
    }

    setFlashOn(true);
    const shutterP = playVoice(voiceShutterRef.current, { waitEnd: true, maxWaitMs: 1200 });
    setTimeout(() => setFlashOn(false), 350);
    await drawAndSave();

    try { await shutterP; } catch {}
    await playVoice(voicePostRef.current);
  };

  // ===== 共有/コピー =====
  const shareLast = async () => {
    const shot = snapshots[0];
    if (!shot?.blob) return;
    try {
      const file = new File([shot.blob], `oshi_${shot.ts}.png`, { type: "image/png" });
      if ((navigator as any).canShare?.({ files: [file] })) {
        await (navigator as any).share({
          files: [file],
          title: "Oshi Camera",
          text: "その場でフォトフレーム📸",
        });
      } else {
        const a = document.createElement("a");
        a.href = shot.url; a.download = `oshi_${shot.ts}.png`; a.click();
      }
    } catch {}
  };

  const copyLastToClipboard = async () => {
    const shot = snapshots[0];
    if (!shot?.blob) return;
    try {
      await (navigator.clipboard as any).write([
        new (window as any).ClipboardItem({ "image/png": shot.blob }),
      ]);
      alert("クリップボードにコピーしました");
    } catch {
      alert("コピーに対応していない環境です");
    }
  };

  // ===== キャラ編集ジェスチャー（常時有効）=====
  const getStageRect = () => stageRef.current?.getBoundingClientRect();
  const dist = (a:{x:number,y:number}, b:{x:number,y:number}) => Math.hypot(a.x-b.x, a.y-b.y);
  const angleDeg = (a:{x:number,y:number}, b:{x:number,y:number}) => (Math.atan2(b.y-a.y, b.x-a.x) * 180) / Math.PI;
  const mid = (a:{x:number,y:number}, b:{x:number,y:number}) => ({ x:(a.x+b.x)/2, y:(a.y+b.y)/2 });

  const onPointerDownStage: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (activeChar === "none") return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = { x: e.clientX, y: e.clientY };
    pointersRef.current.set(e.pointerId, p);

    if (pointersRef.current.size === 1) {
      // 1本指 → ドラッグ開始
      dragStartRef.current = { x: p.x, y: p.y, charX, charY };
      pinchStartRef.current = null;
    } else if (pointersRef.current.size === 2) {
      // 2本指 → ピンチ/回転
      const [p1, p2] = Array.from(pointersRef.current.values());
      const r = getStageRect(); if (!r) return;
      pinchStartRef.current = {
        dist: dist(p1, p2),
        angle: angleDeg(p1, p2),
        mid: mid(p1, p2),
        scale: charScale,
        rotation: charAngle,
      };
      dragStartRef.current = null;
    }
  };

  const onPointerMoveStage: React.PointerEventHandler<HTMLDivElement> = (e) => {
    if (activeChar === "none") return;
    if (!pointersRef.current.has(e.pointerId)) return;
    e.preventDefault();
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const r = getStageRect(); if (!r) return;

    if (pointersRef.current.size === 1 && dragStartRef.current) {
      // ドラッグ：位置更新
      const p0 = dragStartRef.current;
      const dx = e.clientX - p0.x;
      const dy = e.clientY - p0.y;
      const nx = clamp(p0.charX + (dx / r.width) * 100, 0, 100);
      const ny = clamp(p0.charY + (dy / r.height) * 100, 0, 100);
      setCharX(nx); setCharY(ny);
    } else if (pointersRef.current.size >= 2 && pinchStartRef.current) {
      // ピンチ/回転：スケールと角度、位置を更新
      const [a, b] = Array.from(pointersRef.current.values());
      const ps = pinchStartRef.current;
      const curDist = dist(a, b);
      const curAng  = angleDeg(a, b);
      const scaleFactor = curDist / Math.max(1, ps.dist);
      setCharScale(clamp(ps.scale * scaleFactor, 0.1, 1.6));
      const deltaAng = curAng - ps.angle;
      setCharAngle(normAngle(ps.rotation + deltaAng));

      // 中点に追従（自然な操作感）
      const m = mid(a, b);
      const nx = clamp(((m.x - r.left) / r.width) * 100, 0, 100);
      const ny = clamp(((m.y - r.top) / r.height) * 100, 0, 100);
      setCharX(nx); setCharY(ny);
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      dragStartRef.current = null;
      pinchStartRef.current = null;
    } else if (pointersRef.current.size === 1) {
      // 2→1本になったら、残った1本でドラッグ継続できるよう初期化
      const p = Array.from(pointersRef.current.values())[0];
      dragStartRef.current = { x: p.x, y: p.y, charX, charY };
      pinchStartRef.current = null;
    }
  };

  // ===== UI =====
  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-white p-4 sm:p-8">
      <div className="mx-auto max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <motion.div
          className="lg:col-span-1 bg-slate-800/60 rounded-2xl p-5 sm:p-6 shadow-xl border border-white/10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">
            NFC×Web その場でフォトフレーム
          </h1>
          <p className="text-slate-300 mb-4">
            NFCタグでWebアプリを起動し、その場でカメラ撮影→フレーム合成→保存/共有まで行う体験のサンプルです。
          </p>

          <div className="space-y-3">
            <Section title="フレーム / アスペクト / カメラ">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={activeFrame}
                  onChange={(e) => setActiveFrame(e.target.value)}
                  className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2"
                >
                  {frames.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>

                <select
                  value={aspect}
                  onChange={(e) => setAspect(e.target.value as Settings["aspect"])}
                  className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2"
                >
                  <option value="3:4">3:4（スマホ向け）</option>
                  <option value="1:1">1:1（SNS向け）</option>
                  <option value="16:9">16:9（横長）</option>
                </select>

                <button
                  onClick={() => setFacing((prev) => (prev === "user" ? "environment" : "user"))}
                  className="rounded-2xl px-3 py-2 bg-slate-700 hover:bg-slate-600"
                >
                  カメラ切替（今：{facing === "user" ? "自撮り" : "背面"}）
                </button>

                <select
                  value={String(timerSec)}
                  onChange={(e) => setTimerSec(Number(e.target.value) as 0 | 3 | 5)}
                  className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2"
                  title="カウントダウン秒数"
                >
                  <option value="0">タイマーなし</option>
                  <option value="3">3秒</option>
                  <option value="5">5秒</option>
                </select>

                <button
                  onClick={() => setGuideOn((v) => !v)}
                  className={`rounded-2xl px-3 py-2 ${guideOn ? "bg-emerald-600" : "bg-slate-700 hover:bg-slate-600"}`}
                  title="ルールオブサードのガイド表示"
                >
                  ガイド{guideOn ? "ON" : "OFF"}
                </button>

                {torchSupported && facing === "environment" && (
                  <button
                    onClick={() => applyTorch(!torchOn)}
                    className={`rounded-2xl px-3 py-2 ${torchOn ? "bg-amber-600" : "bg-slate-700 hover:bg-slate-600"}`}
                    title="背面ライト"
                  >
                    ライト{torchOn ? "ON" : "OFF"}
                  </button>
                )}
              </div>
            </Section>

            <Section title="キャラクター">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={activeChar}
                  onChange={(e)=>setActiveChar(e.target.value as any)}
                  className="rounded-xl bg-slate-700/70 border border-white/10 px-3 py-2"
                >
                  <option value="none">キャラなし</option>
                  <option value="star">⭐ Star</option>
                  <option value="cat">🐱 Cat</option>
                  <option value="robot">🤖 Robot</option>
                </select>

                <button
                  onClick={()=>{
                    setCharX(50); setCharY(74); setCharScale(0.42); setCharAngle(0);
                  }}
                  className="rounded-2xl px-3 py-2 bg-slate-700 hover:bg-slate-600"
                >
                  位置リセット
                </button>

                <span className="text-slate-400 text-sm">
                  ※ 画面上でドラッグ移動・2本指で拡大回転できます
                </span>
              </div>
            </Section>

            <Section title="サウンド / 撮影">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setShutterSoundOn((v) => !v)}
                  className={`rounded-2xl px-3 py-2 ${shutterSoundOn ? "bg-emerald-600" : "bg-slate-700 hover:bg-slate-600"}`}
                >
                  セリフ/効果音{shutterSoundOn ? "ON" : "OFF"}
                </button>
                <button
                  onClick={doCapture}
                  className="rounded-2xl px-4 py-2 bg-emerald-500 hover:bg-emerald-400 font-semibold shadow"
                >
                  撮影する
                </button>
                <span className="text-slate-300 text-sm">
                  {usingPlaceholder ? "※プレビューはダミー背景です" : ready ? "カメラ準備OK" : "準備中…"}
                </span>
              </div>
            </Section>
          </div>
        </motion.div>

        <motion.div
          className="lg:col-span-2 bg-slate-800/60 rounded-2xl p-4 sm:p-6 shadow-xl border border-white/10"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {/* === プレビュー領域（常時編集可） === */}
          <div
            ref={stageRef}
            className="relative aspect-[3/4] w-full overflow-hidden rounded-3xl bg-black touch-none select-none"
            style={{ aspectRatio: (aspect as any).replace(":", "/") }}
            onPointerDown={onPointerDownStage}
            onPointerMove={onPointerMoveStage}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
          >
            {!usingPlaceholder ? (
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 h-full w-full object-cover"
                style={{ transform: isMirror ? "scaleX(-1)" : "none" }}
              />
            ) : (
              <div className="absolute inset-0 h-full w-full bg-gradient-to-br from-emerald-300 to-sky-300 grid place-items-center">
                <div className="text-black/70 font-semibold text-lg">
                  (カメラ権限なしのためダミー表示)
                </div>
              </div>
            )}

            {/* ガイド */}
            {guideOn && (
              <div className="pointer-events-none absolute inset-0">
                <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
                <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
                <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
                <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
              </div>
            )}

            {/* キャラ（プレビュー） */}
            {activeChar!=="none" && (
              <img
                src={CHAR_SRC[activeChar]}
                alt=""
                className="absolute"
                style={{
                  left: `${charX}%`,
                  top: `${charY}%`,
                  width: `${charScale*100}%`,
                  transform: `translate(-50%, -50%) rotate(${charAngle}deg)`,
                  pointerEvents: "none",
                }}
              />
            )}

            {/* PNGフレーム（最前面） */}
            {(() => {
              const src = getOverlaySrc(activeFrame, aspect);
              return src ? (
                <img
                  src={src}
                  alt=""
                  className="pointer-events-none absolute inset-0 w-full h-full object-cover"
                />
              ) : null;
            })()}

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

            {/* フラッシュ */}
            {flashOn && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 0.35, ease: "easeOut", times: [0, 0.2, 1] }}
                className="absolute inset-0 bg-white"
              />
            )}
          </div>

          {/* 共有/コピー */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={shareLast}
              disabled={!snapshots.length}
              className="rounded-xl px-3 py-2 bg-sky-600 disabled:bg-slate-700 disabled:opacity-60"
              title="直近の1枚を共有"
            >
              共有
            </button>
            <button
              onClick={copyLastToClipboard}
              disabled={!snapshots.length}
              className="rounded-xl px-3 py-2 bg-slate-600 disabled:bg-slate-700 disabled:opacity-60"
              title="直近の1枚をクリップボードへ"
            >
              コピー
            </button>
          </div>

          {/* サムネ一覧 */}
          {snapshots.length > 0 && (
            <div className="mt-5">
              <h3 className="font-semibold mb-2">保存候補（直近12件）</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {snapshots.map((s, i) => (
                  <a
                    key={s.ts + i}
                    href={s.url}
                    download={`oshi_photo_${s.ts}.png`}
                    className="group block"
                  >
                    <img
                      src={s.url}
                      alt="snapshot"
                      className="w-full h-40 object-cover rounded-xl border border-white/10 group-hover:opacity-90"
                    />
                    <div className="text-xs text-slate-300 mt-1">tapで保存</div>
                  </a>
                ))}
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
          {/* 音源たち */}
          <audio ref={voicePreRef}     src={VOICE_PRE_URL}     preload="auto" playsInline />
          <audio ref={voiceShutterRef} src={VOICE_SHUTTER_URL} preload="auto" playsInline />
          <audio ref={voicePostRef}    src={VOICE_POST_URL}    preload="auto" playsInline />
        </motion.div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm uppercase tracking-wide text-slate-400 mb-1">
        {title}
      </div>
      <div className="bg-slate-900/40 rounded-xl p-3 border border-white/5">
        {children}
      </div>
    </div>
  );
}
