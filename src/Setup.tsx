// src/Setup.tsx
import { useEffect, useMemo, useState } from "react";

type StartResult =
  | { ok: true; redirect?: string }
  | { ok: false; reason?: string; error?: string; tag?: string };

export default function Setup() {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const tag = (params.get("tag") || "").trim();
  const char = (params.get("char") || "").trim();
  const [status, setStatus] = useState<"idle" | "working" | "error" | "done">(
    "idle"
  );
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    // ページを開いた直後に「開始ログ」を軽く送っておく（失敗しても無視）
    // サーバ側で不要なら削ってOK
    fetch("/api/setup/start", {
      method: "OPTIONS",
      cache: "no-store",
    }).catch(() => {});
  }, []);

  const disabled = !tag || !char || status === "working";

  const start = async () => {
    if (disabled) return;

    setStatus("working");
    setMsg("");

    try {
      const res = await fetch("/api/setup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Cookie（sid）を受け取るため
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          tag,
          char,
          // キャッシュ無効化用の適当な値（SWやCDN対策）
          v: Date.now(),
        }),
      });

      // HTML が返ると JSON パースに失敗するので先に型を見る
      const text = await res.text();
      let data: StartResult;
      try {
        data = JSON.parse(text);
      } catch {
        setStatus("error");
        setMsg(`サーバーから想定外の応答です（${res.status}）`);
        return;
      }

      if (!res.ok || !("ok" in data) || data.ok === false) {
        setStatus("error");
        // サーバ側で reason を "expired" などにして返している想定
        if ("reason" in data && data.reason === "expired") {
          setMsg("有効時間が過ぎました。NFCタグをもう一度タッチしてやり直してください。");
        } else {
          setMsg(
            data && "error" in data && data.error
              ? `エラー：${data.error}`
              : "開始に失敗しました。しばらくしてから再度お試しください。"
          );
        }
        return;
      }

      // ここまで来ればサーバーが HttpOnly Cookie(sid) を発行済み
      setStatus("done");

      const next =
        (data.redirect && typeof data.redirect === "string" && data.redirect) ||
        `/frame?char=${encodeURIComponent(char)}&from=setup&fresh=1`;

      // 画面遷移
      location.assign(next);
    } catch (e) {
      setStatus("error");
      setMsg("ネットワークエラーが発生しました。通信環境をご確認ください。");
    }
  };

  return (
    <div className="p-5 max-w-md mx-auto text-slate-200">
      <h1 className="text-2xl font-bold mb-4">初期設定（1回だけ）</h1>

      <div className="bg-slate-800/70 rounded-xl p-4 mb-4">
        <ol className="list-decimal list-inside space-y-1 text-sm leading-6">
          <li>ブラウザでこのページを開く（NFCタッチで遷移）</li>
          <li>下の「キャラフレーム起動」を押す</li>
        </ol>
      </div>

      <button
        onClick={start}
        disabled={disabled}
        className={`px-4 py-3 rounded-lg font-semibold transition
          ${disabled ? "bg-slate-600 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-500"}
        `}
      >
        {status === "working" ? "確認中…" : "キャラフレーム起動"}
      </button>

      <div className="mt-4 text-xs text-slate-400">
        状態：{status} / タグ: {tag || "(なし)"} / キャラ: {char || "(なし)"}
      </div>

      {msg && (
        <div className="mt-3 text-amber-300 text-sm whitespace-pre-wrap">{msg}</div>
      )}
    </div>
  );
}
